/**
 * The enriched-resource store, backed by Workers KV.
 *
 * Stale-while-revalidate: visitors are never made to wait on Workers AI.
 *
 * - The enriched `Resource[]` is kept in KV with no expiry, so there is
 *   always a last-known-good copy to serve.
 * - A separate "fresh" marker key carries the TTL. When it has expired the
 *   cached copy is still served immediately and a refresh is started in the
 *   background (`waitUntil`).
 * - On a completely cold cache, deterministic fallback content is served
 *   immediately while the first enrichment runs in the background.
 * - A refresh never replaces a good AI-enriched record with a fallback one,
 *   so a Workers AI outage or exhausted quota can't degrade the surfaces.
 */
import { enrichAll, enrichResource, fallbackEnrichment } from "../enrichment";
import { SAMPLE_RESOURCES } from "./content";
import type { Env, RawResource, Resource, SiteConfig } from "./types";

/** KV key holding the enriched `Resource[]`. Exported so tests can seed it. */
export const ENRICHED_KEY = "resources:enriched";
/** KV key holding the configured raw resources. */
export const RAW_KEY = "resources:raw";
/** KV key whose presence means the enriched store is still fresh. */
export const FRESH_KEY = "resources:fresh";
/** KV key used as a best-effort lock so only one refresh runs at a time. */
export const REFRESH_LOCK_KEY = "resources:refreshing";

/** Schedules work to finish after the response (ExecutionContext.waitUntil). */
export type WaitUntil = (promise: Promise<unknown>) => void;

export function siteConfig(env: Env, origin: string): SiteConfig {
	return {
		name: env.SITE_NAME || "My Site",
		description: env.SITE_DESCRIPTION || "Content made visible to AI agents.",
		origin,
	};
}

function ttlSeconds(env: Env): number {
	const n = Number(env.ENRICHMENT_CACHE_TTL);
	return Number.isFinite(n) && n > 0 ? n : 86400;
}

/**
 * How long to wait before retrying when a refresh came back degraded (e.g.
 * Workers AI quota exhausted). Last-known-good content is served meanwhile.
 */
const DEGRADED_RETRY_TTL = 15 * 60;

/** Lock lifetime; KV's minimum TTL is 60s. Covers the ~30s waitUntil budget. */
const REFRESH_LOCK_TTL = 120;

function isFallback(r: Resource): boolean {
	return r.model.endsWith("(fallback)");
}

/** True when any resource fell back to deterministic enrichment. */
function isDegraded(resources: Resource[]): boolean {
	return resources.some(isFallback);
}

function freshTtl(env: Env, resources: Resource[]): number {
	return isDegraded(resources) ? DEGRADED_RETRY_TTL : ttlSeconds(env);
}

/** Raw resources the site owner has configured (defaults to the samples). */
async function getRawResources(env: Env): Promise<RawResource[]> {
	const stored = await env.VISIBILITY_CACHE.get(RAW_KEY, "json");
	if (Array.isArray(stored) && stored.length) {
		return stored as RawResource[];
	}
	return SAMPLE_RESOURCES;
}

async function readEnriched(env: Env): Promise<Resource[] | null> {
	const cached = await env.VISIBILITY_CACHE.get(ENRICHED_KEY, "json");
	return Array.isArray(cached) && cached.length ? (cached as Resource[]) : null;
}

/** Persist the store (no expiry) and mark it fresh for its TTL. */
async function writeEnriched(env: Env, resources: Resource[]): Promise<void> {
	await env.VISIBILITY_CACHE.put(ENRICHED_KEY, JSON.stringify(resources));
	await env.VISIBILITY_CACHE.put(FRESH_KEY, new Date().toISOString(), {
		expirationTtl: freshTtl(env, resources),
	});
}

/**
 * Keep the previous AI-enriched record for any slug whose new enrichment fell
 * back, so a failed refresh never downgrades what agents see.
 */
function keepLastKnownGood(
	next: Resource[],
	previous: Resource[] | null,
): Resource[] {
	if (!previous) return next;
	const prevBySlug = new Map(previous.map((r) => [r.slug, r]));
	return next.map((r) => {
		const prev = prevBySlug.get(r.slug);
		return isFallback(r) && prev && !isFallback(prev) ? prev : r;
	});
}

/** Re-enrich every raw resource and store the result. */
export async function refreshResources(env: Env): Promise<Resource[]> {
	const [raws, previous] = await Promise.all([
		getRawResources(env),
		readEnriched(env),
	]);
	const enriched = await enrichAll(env.AI, env.AI_MODEL, raws);
	const merged = keepLastKnownGood(enriched, previous);
	await writeEnriched(env, merged);
	return merged;
}

/** Start a background refresh unless one is already running. */
async function refreshInBackground(env: Env): Promise<void> {
	try {
		if (await env.VISIBILITY_CACHE.get(REFRESH_LOCK_KEY)) return;
		await env.VISIBILITY_CACHE.put(REFRESH_LOCK_KEY, "1", {
			expirationTtl: REFRESH_LOCK_TTL,
		});
		try {
			await refreshResources(env);
		} finally {
			await env.VISIBILITY_CACHE.delete(REFRESH_LOCK_KEY);
		}
	} catch (err) {
		console.error(`[refresh] ${(err as Error).message}`);
	}
}

/**
 * Get the enriched resource store without ever blocking on Workers AI.
 *
 * Returns the cached store (or, on a cold cache, deterministic fallback
 * content) immediately; if the store is stale or cold, a refresh is handed to
 * `waitUntil` so it completes after the response is sent.
 */
export async function getResources(
	env: Env,
	waitUntil?: WaitUntil,
): Promise<Resource[]> {
	const [cached, fresh] = await Promise.all([
		readEnriched(env),
		env.VISIBILITY_CACHE.get(FRESH_KEY),
	]);

	if (cached && fresh) return cached;

	waitUntil?.(refreshInBackground(env));
	if (cached) return cached;

	const raws = await getRawResources(env);
	return raws.map((raw) => fallbackEnrichment(raw, env.AI_MODEL));
}

/**
 * Add (or replace) a single raw resource, enrich just that resource, and
 * update the store. Enforces `maxResources` to bound KV growth.
 *
 * Throws `Error("RESOURCE_LIMIT")` if adding a *new* slug would exceed the cap.
 */
export async function upsertResource(
	env: Env,
	raw: RawResource,
	maxResources = 100,
): Promise<Resource> {
	const raws = await getRawResources(env);
	const isNew = !raws.some((r) => r.slug === raw.slug);
	if (isNew && raws.length >= maxResources) {
		throw new Error("RESOURCE_LIMIT");
	}

	const nextRaws = [...raws.filter((r) => r.slug !== raw.slug), raw];
	await env.VISIBILITY_CACHE.put(RAW_KEY, JSON.stringify(nextRaws));

	// Enrich only the new/changed resource.
	const enriched = await enrichResource(env.AI, env.AI_MODEL, raw);

	// Reuse the enriched cache if present; on a cold cache use fallback content
	// for the others (and leave the store stale) rather than blocking this
	// request on enriching everything — the next read refreshes them.
	const cached = await readEnriched(env);
	const others = cached
		? cached.filter((r) => r.slug !== raw.slug)
		: nextRaws
				.filter((r) => r.slug !== raw.slug)
				.map((r) => fallbackEnrichment(r, env.AI_MODEL));

	await env.VISIBILITY_CACHE.put(
		ENRICHED_KEY,
		JSON.stringify([...others, enriched]),
	);
	// Anything degraded gets retried by the next read's background refresh.
	if (!cached || isFallback(enriched)) {
		await env.VISIBILITY_CACHE.delete(FRESH_KEY);
	}
	return enriched;
}

/**
 * Mark the enriched store stale so the next read re-enriches in the
 * background. Last-known-good content keeps being served meanwhile.
 */
export async function clearCache(env: Env): Promise<void> {
	await env.VISIBILITY_CACHE.delete(FRESH_KEY);
}
