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
	booksCheck as fulfillmentBooks,
	health as fulfillmentHealth,
	luluCredentials,
	mode as fulfillmentMode,
	present,
	reconcile,
	refresh,
	retry,
} from "../fulfillment/service";
import { type CheckoutRequest, createMerchCheckout, merchCatalog } from "../fulfillment/merch-service";
import { ebookDownloadPage } from "../fulfillment/ebooks";
import { confirmChildName, getSquadMember, listSquadMembers, nextPoster, squadWelcomePage } from "../fulfillment/squad";
import {
	getPack,
	isPackMonth,
	listPacks,
	listPosters,
	listShippingRefunds,
	parsePack,
	posterArt,
	processPoster,
	refundMemberShipping,
	runSquadDaily,
	savePack,
	testSendPack,
} from "../fulfillment/squad-perks";
import { cleanChildName as cleanName } from "../fulfillment/squad";
import { renderPosterPng } from "../fulfillment/squad-poster";
import { fetchCheckoutSession } from "../fulfillment/stripe";
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

/** eBook delivery: Stripe redirects paid eBook checkouts here (see fulfillment/ebooks.ts). */
app.get("/api/ebook-download", async (c) => {
	const { status, html } = await ebookDownloadPage(c.env, c.req.query("session_id"));
	return c.html(html, status as 200, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
});

/**
 * Rendered birthday poster art for Printful to download. The token is a
 * random 144-bit id stored only in the poster record, so it can't be guessed.
 */
app.get("/api/squad/poster-art/:file", async (c) => {
	const token = c.req.param("file").replace(/\.png$/, "");
	const png = await posterArt(c.env, token);
	if (!png) return c.json({ error: "Not found" }, 404);
	return c.body(png, 200, {
		"Content-Type": "image/png",
		"Cache-Control": "private, max-age=3600",
		"X-Robots-Tag": "noindex",
	});
});

/** Squish Squad Membership: welcome page after a membership checkout (see fulfillment/squad.ts). */
app.get("/api/squad/welcome", async (c) => {
	const { status, html } = await squadWelcomePage(c.env, c.req.query("session_id"));
	return c.html(html, status as 200, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
});

/** Squish Squad Shop: checkout state, prices, sizes and colors for the shop page. */
app.get("/api/merch", (c) => {
	return c.json(merchCatalog(c.env), 200, { "Cache-Control": "no-store" });
});

/** Squish Squad Shop: create a Stripe Checkout Session for one merch item. */
app.post("/api/merch/checkout", async (c) => {
	let body: CheckoutRequest = {};
	try {
		body = (await c.req.json()) as CheckoutRequest;
	} catch {
		// Validated below.
	}
	const origin = new URL(c.req.url).origin;
	const result = await createMerchCheckout(c.env, body ?? {}, origin);
	return c.json(result.body, result.status as 200, { "Cache-Control": "no-store" });
});

/** Which fulfillment pieces are configured and working; never shows values. */
app.get("/api/fulfillment/health", async (c) => {
	return c.json(await fulfillmentHealth(c.env), 200, { "Cache-Control": "no-store" });
});

/** Lulu's read-only file and price checks for each story paperback. */
app.get("/api/fulfillment/books", async (c) => {
	return c.json(await fulfillmentBooks(c.env), 200, { "Cache-Control": "no-store" });
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
			previousPriceIds: e.previousPriceIds ?? [],
			physical: e.physical,
			lulu: e.physical ? (luluMapping(e) ?? "FULFILLMENT_MAPPING_REQUIRED") : "NOT_PHYSICAL",
			productionEnabled: e.productionEnabled,
		})),
	});
});

/** Squish Squad members and the birthday poster each one is due (admin only). */
app.get("/api/admin/squad/members", async (c) => {
	const today = new Date();
	const members = (await listSquadMembers(c.env))
		.map((m) => ({ ...m, poster: nextPoster(m, today) }))
		.sort((a, b) => (a.poster?.orderOn ?? "9999").localeCompare(b.poster?.orderOn ?? "9999"));
	return c.json({ count: members.length, members }, 200, { "Cache-Control": "no-store" });
});

/** Confirm (or correct) a child's name so their birthday poster can be printed. */
app.post("/api/admin/squad/members/:id/confirm-name", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as { childName?: string };
	const m = await confirmChildName(c.env, c.req.param("id"), body.childName);
	return m ? c.json(m) : c.json({ error: "Unknown member or empty name" }, 404);
});

/** Preview the birthday poster art for any name (PNG; nothing is ordered). */
app.get("/api/admin/squad/poster-preview", async (c) => {
	if (!c.env.ASSETS) return c.json({ error: "ASSETS binding not configured" }, 503);
	const name = cleanName(c.req.query("name") ?? "") || "Squish Squad";
	const png = await renderPosterPng(c.env.ASSETS, name);
	return c.body(png as Uint8Array<ArrayBuffer>, 200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
});

/** Birthday posters ordered, held or failed. */
app.get("/api/admin/squad/posters", async (c) => {
	const posters = (await listPosters(c.env)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return c.json({ count: posters.length, posters }, 200, { "Cache-Control": "no-store" });
});

/** Order (or retry) one member's next poster now, even before its order date. */
app.post("/api/admin/squad/posters/:id/order", async (c) => {
	const m = await getSquadMember(c.env, c.req.param("id"));
	if (!m) return c.json({ error: "Unknown member" }, 404);
	const rec = await processPoster(c.env, fulfillmentMode(c.env), m, new Date(), { force: true });
	return rec ? c.json(rec) : c.json({ error: "No poster is due: no birthday month, or not eligible yet" }, 409);
});

/** Members' shipping refunds. */
app.get("/api/admin/squad/refunds", async (c) => {
	const refunds = (await listShippingRefunds(c.env)).sort((a, b) => b.at.localeCompare(a.at));
	return c.json({ count: refunds.length, refunds }, 200, { "Cache-Control": "no-store" });
});

/** Re-check (and refund) one order's shipping, e.g. after a FAILED refund. */
app.post("/api/admin/squad/refunds/:id/retry", async (c) => {
	if (!c.env.STRIPE_SECRET_KEY) return c.json({ error: "Stripe not configured" }, 503);
	const session = await fetchCheckoutSession(c.env.STRIPE_SECRET_KEY, c.req.param("id"));
	if (session.payment_status !== "paid") return c.json({ error: "Order is not paid" }, 409);
	const rec = await refundMemberShipping(c.env, session, { force: true });
	return rec ? c.json(rec) : c.json({ error: "Not a member order with shipping (or refunds are off)" }, 409);
});

/** Squish Squad Packs by month. */
app.get("/api/admin/squad/packs", async (c) => {
	return c.json({ packs: (await listPacks(c.env)).sort((a, b) => b.month.localeCompare(a.month)) });
});

app.get("/api/admin/squad/packs/:month", async (c) => {
	const pack = isPackMonth(c.req.param("month")) ? await getPack(c.env, c.req.param("month")) : null;
	return pack ? c.json(pack) : c.json({ error: "Not found" }, 404);
});

/**
 * Create or replace a month's pack: {subject, heading, intro, items: [{title,
 * description?, url}], published}. Published packs are emailed to every
 * active member by the daily job (once each).
 */
app.put("/api/admin/squad/packs/:month", async (c) => {
	try {
		const pack = parsePack(c.req.param("month"), await c.req.json().catch(() => null));
		await savePack(c.env, pack);
		return c.json(pack);
	} catch (err) {
		return c.json({ error: (err as Error).message }, 400);
	}
});

/** Email a pack to one address to check it ({"to": "you@example.com"}). */
app.post("/api/admin/squad/packs/:month/test", async (c) => {
	const pack = isPackMonth(c.req.param("month")) ? await getPack(c.env, c.req.param("month")) : null;
	if (!pack) return c.json({ error: "Not found" }, 404);
	const { to } = (await c.req.json().catch(() => ({}))) as { to?: string };
	if (!to) return c.json({ error: "to is required" }, 400);
	try {
		return c.json(await testSendPack(c.env, pack, to));
	} catch (err) {
		return c.json({ error: (err as Error).message }, 502);
	}
});

/** Run today's Squish Squad job (posters due + this month's pack) now. */
app.post("/api/admin/squad/run", async (c) => {
	return c.json(await runSquadDaily(c.env, fulfillmentMode(c.env), new Date(), { force: true }));
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
		ctx.waitUntil(
			runSquadDaily(env, fulfillmentMode(env)).catch((err) =>
				console.error(JSON.stringify({ at: "squad", event: "daily_error", error: String(err).slice(0, 200) })),
			),
		);
	},
} satisfies ExportedHandler<Env>;
