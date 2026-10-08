/**
 * Agent Visibility Worker
 *
 * Serves one enriched content store through every agent-discovery surface:
 *
 *   GET /llms.txt                          — llms.txt index (Markdown)
 *   GET /llms-full.txt                     — full content inlined (Markdown)
 *   GET /index.json                        — typed JSON index
 *   GET /:slug.md                          — per-page Markdown (groundable)
 *   GET /:slug.jsonld                      — per-page schema.org JSON-LD
 *   GET /jsonld                            — site-level schema.org JSON-LD
 *   GET /robots.txt                        — explicit AI-bot directives
 *
 * A cron trigger (see `triggers` in wrangler.jsonc) rebuilds the enriched
 * cache hourly so surfaces stay current and never wait on a cold cache.
 *
 * Plus a small JSON API the bundled UI uses, and an OPTIONAL Web Bot Auth
 * identity surface (disabled unless ENABLE_WEB_BOT_AUTH=true).
 *
 * Every text surface sends a `Content-Signal` header declaring how agents may
 * use the content (see https://contentsignals.org / the Content-Signals
 * proposal). The React SPA at `/` is served from static assets.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
	renderIndexJson,
	renderLlmsFullTxt,
	renderLlmsTxt,
	renderResourceJsonLd,
	renderResourceMd,
	renderRobotsTxt,
	renderWebsiteJsonLd,
} from "../enrichment/surfaces";
import {
	clearCache,
	getResources,
	rebuildCache,
	siteConfig,
	upsertResource,
} from "../lib/store";
import type { Env, RawResource } from "../lib/types";
import { CATALOG, byKey, luluMapping } from "../fulfillment/catalog";
import {
	calculateCost,
	checkAuth,
	SHIPPING_LEVELS,
	type ShippingLevel,
} from "../fulfillment/lulu";
import {
	handleLuluWebhook,
	handleStripeWebhook,
	health as fulfillmentHealth,
	luluCredentials,
	mode as fulfillmentMode,
	present,
	reconcile,
	refresh,
	retry,
} from "../fulfillment/service";
import * as orders from "../fulfillment/store";
import {
	directoryDocument,
	SAMPLE_AGENT_KEYS,
	verifyAgentIdentity,
} from "../lib/web-bot-auth";

const app = new Hono<{ Bindings: Env }>();

app.onError((err, c) => {
	console.error(`[Error] ${c.req.method} ${c.req.path}: ${err.message}`);
	// Match the response type to the surface: text surfaces shouldn't get a
	// JSON error body.
	if (/\.(md|txt)$/.test(c.req.path)) {
		return c.text("Internal server error", 500);
	}
	return c.json({ error: "Internal server error" }, 500);
});

function originOf(url: string): string {
	return new URL(url).origin;
}

// --- Validation limits for user-supplied content ---------------------------
const MAX_BODY_BYTES = 100_000; // raw content we'll persist per resource
const MAX_RESOURCES = 100; // cap total resources to bound KV growth
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;

/** Constant-time-ish bearer check for the mutating routes. */
function isAuthorized(c: {
	env: Env;
	req: { header: (k: string) => string | undefined };
}): boolean {
	const configured = c.env.ADMIN_TOKEN;
	if (!configured) return false;
	const header = c.req.header("authorization") ?? "";
	const token = header.replace(/^Bearer\s+/i, "");
	return token.length > 0 && token === configured;
}

/** Apply the Content-Signal header declaring agent usage intent. */
function contentSignal(c: { env: Env }): Record<string, string> {
	return {
		"Content-Signal":
			c.env.CONTENT_SIGNAL || "ai-input=yes, search=yes, ai-train=no",
	};
}

// CORS so agents can fetch the machine-readable surfaces from anywhere.
app.use("/llms.txt", cors());
app.use("/llms-full.txt", cors());
app.use("/index.json", cors());
app.use("/jsonld", cors());
// NB: Hono's "*" wildcard does not match a literal ".md"/".jsonld" suffix, so
// the per-page surfaces need the same regex matcher their routes use.
app.use("/:file{.+\\.md}", cors());
app.use("/:file{.+\\.jsonld}", cors());

// ---------------------------------------------------------------------------
// Machine-readable surfaces
// ---------------------------------------------------------------------------

app.get("/llms.txt", async (c) => {
	const site = siteConfig(c.env, originOf(c.req.url));
	const resources = await getResources(c.env);
	return c.text(renderLlmsTxt({ site, resources }), 200, {
		"Content-Type": "text/plain; charset=utf-8",
		...contentSignal(c),
	});
});

app.get("/llms-full.txt", async (c) => {
	const site = siteConfig(c.env, originOf(c.req.url));
	const resources = await getResources(c.env);
	return c.text(renderLlmsFullTxt({ site, resources }), 200, {
		"Content-Type": "text/plain; charset=utf-8",
		...contentSignal(c),
	});
});

app.get("/index.json", async (c) => {
	const site = siteConfig(c.env, originOf(c.req.url));
	const resources = await getResources(c.env);
	c.header("Content-Signal", contentSignal(c)["Content-Signal"]);
	return c.json(renderIndexJson({ site, resources }));
});

app.get("/robots.txt", async (c) => {
	const site = siteConfig(c.env, originOf(c.req.url));
	const resources = await getResources(c.env);
	return c.text(
		renderRobotsTxt({
			site,
			resources,
			contentSignal: contentSignal(c)["Content-Signal"],
		}),
		200,
		{
			"Content-Type": "text/plain; charset=utf-8",
			...contentSignal(c),
		},
	);
});

app.get("/jsonld", async (c) => {
	const site = siteConfig(c.env, originOf(c.req.url));
	const resources = await getResources(c.env);
	return c.json(renderWebsiteJsonLd({ site, resources }), 200, {
		"Content-Type": "application/ld+json; charset=utf-8",
		...contentSignal(c),
	});
});

// Per-page Markdown: /:slug.md
app.get("/:file{.+\\.md}", async (c) => {
	const slug = c.req.param("file").replace(/\.md$/, "");
	const site = siteConfig(c.env, originOf(c.req.url));
	const resources = await getResources(c.env);
	const resource = resources.find((r) => r.slug === slug);
	if (!resource) return c.notFound();
	return c.text(renderResourceMd({ resource, site }), 200, {
		"Content-Type": "text/markdown; charset=utf-8",
		...contentSignal(c),
	});
});

// Per-page JSON-LD: /:slug.jsonld
app.get("/:file{.+\\.jsonld}", async (c) => {
	const slug = c.req.param("file").replace(/\.jsonld$/, "");
	const site = siteConfig(c.env, originOf(c.req.url));
	const resources = await getResources(c.env);
	const resource = resources.find((r) => r.slug === slug);
	if (!resource) return c.notFound();
	return c.json(renderResourceJsonLd({ resource, site }), 200, {
		"Content-Type": "application/ld+json; charset=utf-8",
		...contentSignal(c),
	});
});

// ---------------------------------------------------------------------------
// JSON API for the bundled UI
// ---------------------------------------------------------------------------

app.get("/api/site", async (c) => {
	const site = siteConfig(c.env, originOf(c.req.url));
	return c.json({
		site,
		webBotAuthEnabled: c.env.ENABLE_WEB_BOT_AUTH === "true",
		surfaces: [
			{ id: "llms-txt", label: "llms.txt", path: "/llms.txt", kind: "text" },
			{
				id: "llms-full",
				label: "llms-full.txt",
				path: "/llms-full.txt",
				kind: "text",
			},
			{
				id: "index-json",
				label: "index.json",
				path: "/index.json",
				kind: "json",
			},
			{ id: "robots", label: "robots.txt", path: "/robots.txt", kind: "text" },
			{ id: "jsonld", label: "JSON-LD", path: "/jsonld", kind: "json" },
		],
	});
});

app.get("/api/resources", async (c) => {
	const resources = await getResources(c.env);
	return c.json({ count: resources.length, resources });
});

app.get("/api/resources/:slug", async (c) => {
	const resources = await getResources(c.env);
	const resource = resources.find((r) => r.slug === c.req.param("slug"));
	if (!resource) return c.json({ error: "Not found" }, 404);
	return c.json(resource);
});

app.post("/api/resources", async (c) => {
	if (!isAuthorized(c)) {
		return c.json({ error: "Unauthorized. Set the ADMIN_TOKEN secret." }, 401);
	}
	const body = await c.req.json<Partial<RawResource>>().catch(() => null);
	if (!body?.slug || !body?.body) {
		return c.json({ error: "Missing required fields: slug, body" }, 400);
	}

	const slug = String(body.slug);
	if (!SLUG_RE.test(slug)) {
		return c.json({ error: "Invalid slug: use 1–63 chars of [a-z0-9-]." }, 400);
	}

	const rawBody = String(body.body);
	if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
		return c.json(
			{ error: `Body too large (max ${MAX_BODY_BYTES} bytes).` },
			400,
		);
	}

	let url = `${originOf(c.req.url)}/${slug}`;
	if (body.url) {
		try {
			const parsed = new URL(String(body.url));
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				return c.json({ error: "url must be http(s)." }, 400);
			}
			url = parsed.toString();
		} catch {
			return c.json({ error: "url is not a valid URL." }, 400);
		}
	}

	const raw: RawResource = {
		slug,
		url,
		title: body.title ? String(body.title).slice(0, 200) : undefined,
		body: rawBody,
	};

	try {
		const enriched = await upsertResource(c.env, raw, MAX_RESOURCES);
		return c.json(enriched, 201);
	} catch (err) {
		if ((err as Error).message === "RESOURCE_LIMIT") {
			return c.json(
				{ error: `Resource limit reached (max ${MAX_RESOURCES}).` },
				409,
			);
		}
		throw err;
	}
});

app.post("/api/refresh", async (c) => {
	if (!isAuthorized(c)) {
		return c.json({ error: "Unauthorized. Set the ADMIN_TOKEN secret." }, 401);
	}
	await clearCache(c.env);
	return c.json({
		ok: true,
		message: "Cache cleared; surfaces will re-enrich.",
	});
});

// ---------------------------------------------------------------------------
// Lulu print-on-demand fulfillment (see src/fulfillment/service.ts)
// ---------------------------------------------------------------------------

app.post("/api/stripe/webhook", async (c) => {
	const result = await handleStripeWebhook(
		c.env,
		await c.req.text(),
		c.req.header("stripe-signature") ?? null,
	);
	if (result.background) c.executionCtx.waitUntil(result.background);
	return c.json(result.body, result.status as 200);
});

/** Which fulfillment pieces are configured and working; never shows values. */
app.get("/api/fulfillment/health", async (c) => {
	return c.json(await fulfillmentHealth(c.env), 200, { "Cache-Control": "no-store" });
});

app.post("/api/lulu/webhook", async (c) => {
	const result = await handleLuluWebhook(
		c.env,
		await c.req.text(),
		c.req.header("lulu-hmac-sha256") ?? null,
	);
	return c.json(result.body, result.status as 200);
});

app.use("/api/admin/*", async (c, next) => {
	if (!isAuthorized(c)) {
		return c.json({ error: "Unauthorized. Set the ADMIN_TOKEN secret." }, 401);
	}
	await next();
});

/** Product → Stripe → Lulu mapping and readiness, for review before rollout. */
app.get("/api/admin/fulfillment/catalog", (c) => {
	return c.json({
		mode: fulfillmentMode(c.env),
		products: CATALOG.map((e) => ({
			key: e.key,
			title: e.title,
			format: e.format,
			stripeProductId: e.stripeProductId,
			stripePriceId: e.stripePriceId,
			physical: e.physical,
			lulu: e.physical ? (luluMapping(e) ?? "FULFILLMENT_MAPPING_REQUIRED") : "NOT_PHYSICAL",
			productionEnabled: e.productionEnabled,
		})),
	});
});

app.get("/api/admin/fulfillments", async (c) => {
	if (!c.env.ORDERS_DB) return c.json({ error: "ORDERS_DB not configured" }, 503);
	const limit = Number(c.req.query("limit") ?? 50) || 50;
	return c.json({ orders: (await orders.list(c.env.ORDERS_DB, limit)).map(present) });
});

app.get("/api/admin/fulfillments/:id", async (c) => {
	if (!c.env.ORDERS_DB) return c.json({ error: "ORDERS_DB not configured" }, 503);
	const rec = await orders.get(c.env.ORDERS_DB, c.req.param("id"));
	return rec ? c.json(present(rec)) : c.json({ error: "Not found" }, 404);
});

app.post("/api/admin/fulfillments/:id/retry", async (c) => {
	const rec = await retry(c.env, c.req.param("id"));
	return rec ? c.json(present(rec)) : c.json({ error: "Not found" }, 404);
});

app.post("/api/admin/fulfillments/:id/refresh", async (c) => {
	const rec = await refresh(c.env, c.req.param("id"));
	return rec ? c.json(present(rec)) : c.json({ error: "Not found" }, 404);
});

/** Check that the Lulu credentials for the current mode authenticate. */
app.post("/api/admin/lulu/check", async (c) => {
	const creds = luluCredentials(c.env, true);
	if (!creds) return c.json({ ok: false, error: "Lulu keys are not configured" }, 400);
	try {
		await checkAuth(creds);
		return c.json({ ok: true, environment: creds.mode });
	} catch (err) {
		return c.json({ ok: false, error: (err as Error).message }, 502);
	}
});

/** Lulu print + shipping quote for a mapped product (no order is created). */
app.post("/api/admin/lulu/quote", async (c) => {
	const creds = luluCredentials(c.env, true);
	if (!creds) return c.json({ error: "Lulu keys are not configured" }, 400);
	const body = (await c.req.json().catch(() => ({}))) as {
		key?: string;
		quantity?: number;
		shippingLevel?: string;
		address?: Record<string, string>;
	};
	const entry = body.key ? byKey(body.key) : undefined;
	const spec = entry && luluMapping(entry);
	if (!entry || !spec) {
		return c.json({ error: "Unknown or unmapped product (FULFILLMENT_MAPPING_REQUIRED)" }, 400);
	}
	const level = (body.shippingLevel ?? "MAIL").toUpperCase() as ShippingLevel;
	if (!SHIPPING_LEVELS.includes(level)) return c.json({ error: "Invalid shipping level" }, 400);
	const a = body.address ?? {};
	try {
		const quote = await calculateCost(
			creds,
			[{ pod_package_id: spec.podPackageId, page_count: spec.pageCount, quantity: Math.max(1, Math.trunc(body.quantity ?? 1)) }],
			{
				street1: a.street1 ?? "",
				city: a.city ?? "",
				state_code: a.state_code ?? "",
				postcode: a.postcode ?? "",
				country_code: (a.country_code ?? "US").toUpperCase(),
				phone_number: a.phone_number,
			},
			level,
		);
		return c.json({ environment: creds.mode, shippingLevel: level, quote });
	} catch (err) {
		return c.json({ error: (err as Error).message }, 502);
	}
});

// ---------------------------------------------------------------------------
// OPTIONAL — Web Bot Auth identity surface (off by default)
// ---------------------------------------------------------------------------

app.get("/.well-known/web-bot-auth/directory", (c) => {
	if (c.env.ENABLE_WEB_BOT_AUTH !== "true") return c.notFound();
	return c.json(directoryDocument(SAMPLE_AGENT_KEYS));
});

app.all("/api/identity", async (c) => {
	if (c.env.ENABLE_WEB_BOT_AUTH !== "true") {
		return c.json({ error: "Web Bot Auth is disabled" }, 404);
	}
	const result = await verifyAgentIdentity(c.req.raw, SAMPLE_AGENT_KEYS);
	return c.json(result);
});

export default {
	fetch: app.fetch,
	async scheduled(_controller, env, ctx) {
		ctx.waitUntil(rebuildCache(env));
		ctx.waitUntil(reconcile(env));
	},
} satisfies ExportedHandler<Env>;
