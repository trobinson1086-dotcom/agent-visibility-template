/**
 * Squish Squad Pack files are for paying members. They live in
 * public/assets/squad-packs/YYYY-MM/, but the Worker runs first for that path
 * (wrangler.jsonc `run_worker_first`) and only serves a file when the link
 * carries the month's key (`?k=…`), which only the pack emails contain.
 *
 * Packs up to OPEN_THROUGH stay open on plain links. Every pack from November
 * 2026 on needs its key (no pack email had gone out before the key existed).
 *
 * The key is an HMAC of the month, signed with SQUAD_PACK_SECRET (or, when that
 * secret isn't set, the Stripe webhook secret). With neither set (local dev and
 * tests without secrets) the files are served openly, as before.
 */
import type { Env } from "../lib/types";
import type { PackItem, SquadPack } from "./email";

export const PACK_DIR = "/assets/squad-packs/";
/** The last month whose pack files open without a key (none: November 2026 was the first pack). */
export const OPEN_THROUGH = "2026-10";

const PACK_FILE = /^\/assets\/squad-packs\/(20\d\d-(?:0[1-9]|1[0-2]))\/[A-Za-z0-9._-]+$/;

function secret(env: Env): string | undefined {
	return env.SQUAD_PACK_SECRET || env.STRIPE_WEBHOOK_SECRET || undefined;
}

/** The month of a pack file path, or null when the path isn't a pack file. */
export function packFileMonth(path: string): string | null {
	return PACK_FILE.exec(path)?.[1] ?? null;
}

/** The access key for one month's pack files (null when no secret is set). */
export async function packKey(env: Env, month: string): Promise<string | null> {
	const s = secret(env);
	if (!s) return null;
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`squad-pack:${month}`)));
	return btoa(String.fromCharCode(...sig.slice(0, 18)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
}

function sameString(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/** Whether a request for a pack file may be served. */
export async function packFileAllowed(env: Env, path: string, k: string | undefined): Promise<boolean> {
	const month = packFileMonth(path);
	if (!month) return false;
	if (month <= OPEN_THROUGH) return true;
	const key = await packKey(env, month);
	if (key === null) return true;
	return !!k && sameString(k, key);
}

/** A pack link with the month's key added (other links are returned as they are). */
export async function signPackUrl(env: Env, url: string): Promise<string> {
	// Built-in packs use site paths ("/assets/…"); packs saved through the admin
	// API use full links, which may point at this site too.
	const base = (env.PUBLIC_BASE_URL || "https://squishman.com").replace(/\/$/, "");
	const origin = url.startsWith(`${base}/`) ? base : "";
	const path = url.slice(origin.length).split(/[?#]/)[0];
	const month = packFileMonth(path);
	if (!month || month <= OPEN_THROUGH) return url;
	const key = await packKey(env, month);
	return key === null ? url : `${origin}${path}?k=${key}`;
}

/** The pack with every site file link (pages, bonus pages, header picture) keyed for its email. */
export async function signPack(env: Env, pack: SquadPack): Promise<SquadPack> {
	const items = (list: PackItem[]) => Promise.all(list.map(async (i) => ({ ...i, url: await signPackUrl(env, i.url) })));
	return {
		...pack,
		items: await items(pack.items),
		...(pack.bonus
			? {
					bonus: {
						...(pack.bonus.hero ? { hero: await items(pack.bonus.hero) } : {}),
						...(pack.bonus.platinum ? { platinum: await items(pack.bonus.platinum) } : {}),
					},
				}
			: {}),
		...(pack.heroImage ? { heroImage: await signPackUrl(env, pack.heroImage) } : {}),
	};
}
