/**
 * Stripe → Lulu fulfillment.
 *
 *   Stripe webhook (signed) → re-read the session from Stripe → paid?
 *   → physical, mapped items only → claim one D1 row per session (idempotent)
 *   → Lulu cost quote → Lulu print job → store job id → status/tracking updates
 *     via the Lulu webhook and the hourly reconcile.
 *
 * FULFILLMENT_MODE gates everything: "off" records paid orders but never calls
 * Lulu; "sandbox" sends only Stripe *test-mode* orders to Lulu's sandbox;
 * "production" sends only live orders, and only for products with
 * `productionEnabled`.
 */
import type { Env } from "../lib/types";
import { byKey, byPriceId, luluMapping, printFiles } from "./catalog";
import {
	calculateCost,
	checkAuth,
	coverDimensions,
	createPrintJob,
	findPrintJobs,
	getPrintJob,
	type LuluCredentials,
	LuluError,
	type LuluPrintJob,
	SHIPPING_LEVELS,
	type ShippingLevel,
	trackingOf,
	verifyLuluSignature,
} from "./lulu";
import * as store from "./store";
import {
	fetchCheckoutSession,
	missingShippingFields,
	shippingFromSession,
	verifyStripeSignature,
} from "./stripe";
import type {
	FulfillmentMode,
	FulfillmentRecord,
	OrderItem,
	ShippingInfo,
} from "./types";

export const PAID_EVENTS = new Set([
	"checkout.session.completed",
	"checkout.session.async_payment_succeeded",
]);

// SHIPPED is not final: carriers that report it move on to DELIVERED.
const FINAL_LULU = new Set(["DELIVERED", "CANCELED", "REJECTED"]);
const TERMINAL_LULU = new Set(["SHIPPED", ...FINAL_LULU]);

export function mode(env: Env): FulfillmentMode {
	const m = (env.FULFILLMENT_MODE ?? "off").trim().toLowerCase();
	return m === "sandbox" || m === "production" ? m : "off";
}

function shippingLevel(env: Env): ShippingLevel {
	const l = (env.LULU_SHIPPING_LEVEL ?? "").trim().toUpperCase() as ShippingLevel;
	return SHIPPING_LEVELS.includes(l) ? l : "MAIL";
}

/**
 * Lulu credentials for the current mode. `checksOnly` (auth checks and quotes,
 * which never create orders) falls back to the sandbox while fulfillment is off.
 */
export function luluCredentials(env: Env, checksOnly = false): LuluCredentials | null {
	const m = mode(env);
	const target = m === "off" ? (checksOnly ? "sandbox" : null) : m;
	// Trim: keys pasted on a phone often pick up a trailing space or newline.
	const clientKey = env.LULU_CLIENT_KEY?.trim();
	const clientSecret = env.LULU_CLIENT_SECRET?.trim();
	if (!target || !clientKey || !clientSecret) return null;
	return { clientKey, clientSecret, mode: target };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Describe a pasted Lulu key without revealing it: set or not, UUID-shaped
 * or not, and its length. Secret formats vary by account, so only the login
 * check below says whether a pair actually works.
 */
function luluKeyShape(raw: string | undefined): string {
	if (!raw) return "missing";
	const v = raw.trim();
	const note = v === raw ? "" : ", extra spaces trimmed";
	return `set (${UUID_RE.test(v) ? "id format" : `${v.length} characters`}${note})`;
}

const HEALTH_KEY = "fulfillment:health";
const HEALTH_TTL = 300;

/**
 * Configuration check that reveals no values: which pieces are set up and
 * whether the Stripe and Lulu credentials actually authenticate. Cached in KV
 * for 5 minutes so the public route can't be used to hammer either API.
 */
export async function health(env: Env): Promise<Record<string, unknown>> {
	const cached = await env.VISIBILITY_CACHE.get(HEALTH_KEY, "json");
	if (cached) return { ...(cached as Record<string, unknown>), cached: true };

	const result: Record<string, unknown> = { mode: mode(env) };

	try {
		await env.ORDERS_DB?.prepare("SELECT COUNT(*) AS n FROM fulfillments").first();
		result.ordersDb = env.ORDERS_DB ? "ok" : "missing";
	} catch {
		result.ordersDb = "error";
	}

	const sk = env.STRIPE_SECRET_KEY ?? "";
	result.stripeSecretKey = !sk
		? "missing"
		: /^(rk|sk)_test_/.test(sk)
			? "test"
			: /^(rk|sk)_live_/.test(sk)
				? "live"
				: "unrecognized";
	if (sk) {
		try {
			const res = await fetch("https://api.stripe.com/v1/checkout/sessions?limit=1", {
				headers: { Authorization: `Bearer ${sk}` },
				signal: AbortSignal.timeout(10_000),
			});
			result.stripeKeyCanReadCheckout = res.ok;
		} catch {
			result.stripeKeyCanReadCheckout = false;
		}
	}

	const wh = env.STRIPE_WEBHOOK_SECRET ?? "";
	result.stripeWebhookSecret = !wh ? "missing" : wh.startsWith("whsec_") ? "configured" : "unrecognized";

	result.luluClientKey = luluKeyShape(env.LULU_CLIENT_KEY);
	result.luluClientSecret = luluKeyShape(env.LULU_CLIENT_SECRET);
	if (env.LULU_CLIENT_KEY && env.LULU_CLIENT_KEY.trim() === env.LULU_CLIENT_SECRET?.trim()) {
		result.luluKeyAndSecretIdentical = true;
	}
	const creds = luluCredentials(env, true);
	if (!creds) {
		result.lulu = "missing";
	} else {
		result.luluEnvironment = creds.mode;
		try {
			await checkAuth(creds);
			result.lulu = "ok";
		} catch (err) {
			result.lulu = err instanceof LuluError ? `auth_failed (HTTP ${err.status})` : "unreachable";
			// Keys from developers.lulu.com only work against production. A login
			// alone creates nothing; it just tells Travis which site they came from.
			if (creds.mode === "sandbox" && err instanceof LuluError) {
				try {
					await checkAuth({ ...creds, mode: "production" });
					result.luluKeysAreFor = "production (developers.lulu.com), not the sandbox";
				} catch {
					result.luluKeysAreFor = "neither sandbox nor production";
				}
			}
		}
	}

	const checkEnv =
		result.lulu === "ok"
			? creds?.mode
			: typeof result.luluKeysAreFor === "string" && result.luluKeysAreFor.startsWith("production")
				? "production"
				: null;
	if (creds && checkEnv) {
		result.book1Paperback = await book1Check({ ...creds, mode: checkEnv });
	}

	await env.VISIBILITY_CACHE.put(HEALTH_KEY, JSON.stringify(result), { expirationTtl: HEALTH_TTL });
	return result;
}

/** A sample US destination for price checks (Lulu's own docs example address). */
const SAMPLE_US_ADDRESS = {
	street1: "101 Independence Ave SE",
	city: "Washington",
	state_code: "DC",
	postcode: "20540",
	country_code: "US",
	phone_number: "+1 206 555 0100",
};

/**
 * Read-only Lulu checks for Book 1 Paperback: exact cover size and the real
 * cost of one copy at each common shipping level. Creates nothing.
 */
async function book1Check(creds: LuluCredentials): Promise<Record<string, unknown>> {
	const entry = byKey("EN-PAPERBACK-1");
	const spec = entry && luluMapping(entry);
	if (!spec) return { status: "FULFILLMENT_MAPPING_REQUIRED" };
	const out: Record<string, unknown> = {
		luluEnvironment: creds.mode,
		podPackageId: spec.podPackageId,
		pages: spec.pageCount,
	};
	try {
		const d = await coverDimensions(creds, spec.podPackageId, spec.pageCount);
		out.coverSize = `${d.width} x ${d.height} ${d.unit}`;
	} catch (err) {
		out.coverSize = `error: ${errorDetail(err).slice(0, 200)}`;
	}
	const quotes: Record<string, unknown> = {};
	for (const level of ["MAIL", "PRIORITY_MAIL", "EXPEDITED"] as const) {
		try {
			const q = (await calculateCost(
				creds,
				[{ pod_package_id: spec.podPackageId, page_count: spec.pageCount, quantity: 1 }],
				SAMPLE_US_ADDRESS,
				level,
			)) as {
				currency?: string;
				line_item_costs?: Array<{ total_cost_incl_tax?: string }>;
				shipping_cost?: { total_cost_incl_tax?: string };
				fulfillment_cost?: { total_cost_incl_tax?: string };
				total_cost_incl_tax?: string;
			};
			quotes[level] = {
				print: q.line_item_costs?.[0]?.total_cost_incl_tax,
				shipping: q.shipping_cost?.total_cost_incl_tax,
				fulfillmentFee: q.fulfillment_cost?.total_cost_incl_tax,
				total: q.total_cost_incl_tax,
				currency: q.currency,
			};
		} catch (err) {
			quotes[level] = `error: ${errorDetail(err).slice(0, 200)}`;
		}
	}
	out.costForOneCopyToWashingtonDC = quotes;
	return out;
}

/** Safe operational log line: identifiers and states only, never addresses. */
function log(event: string, fields: Record<string, unknown>): void {
	console.log(JSON.stringify({ fulfillment: event, ...fields }));
}

export interface WebhookResult {
	status: number;
	body: Record<string, unknown>;
	/** Work to finish after responding (the Lulu submission). */
	background?: Promise<unknown>;
}

/** Handle one Stripe webhook delivery. */
export async function handleStripeWebhook(
	env: Env,
	rawBody: string,
	signature: string | null,
): Promise<WebhookResult> {
	if (!env.STRIPE_WEBHOOK_SECRET) {
		return { status: 503, body: { error: "Stripe webhook not configured" } };
	}
	if (!(await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET))) {
		return { status: 400, body: { error: "Invalid signature" } };
	}
	let event: { id?: string; type?: string; livemode?: boolean; data?: { object?: { id?: string } } };
	try {
		event = JSON.parse(rawBody);
	} catch {
		return { status: 400, body: { error: "Invalid JSON" } };
	}
	if (!event.type || !PAID_EVENTS.has(event.type)) {
		return { status: 200, body: { received: true, ignored: event.type ?? "unknown" } };
	}
	const sessionId = event.data?.object?.id;
	if (!event.id || !sessionId || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
		return { status: 400, body: { error: "Malformed checkout event" } };
	}
	const db = env.ORDERS_DB;
	if (!db || !env.STRIPE_SECRET_KEY) {
		// 5xx so Stripe keeps retrying until storage/keys are configured.
		return { status: 503, body: { error: "Fulfillment storage not configured" } };
	}

	// Fast path for redeliveries.
	if (await store.get(db, sessionId)) {
		log("duplicate", { session: sessionId, event: event.id });
		return { status: 200, body: { received: true, duplicate: true } };
	}

	// Never trust the webhook body: re-read payment state, items and address.
	const session = await fetchCheckoutSession(env.STRIPE_SECRET_KEY, sessionId);
	if (session.payment_status !== "paid") {
		log("awaiting_payment", { session: sessionId, payment_status: session.payment_status });
		return { status: 200, body: { received: true, awaiting_payment: true } };
	}

	const lineItems = session.line_items?.data ?? [];
	const items: OrderItem[] = [];
	const unknown: string[] = [];
	for (const li of lineItems) {
		const priceId = li.price?.id ?? "";
		const entry = byPriceId(priceId);
		if (!entry) {
			unknown.push(priceId || "(none)");
			continue;
		}
		if (!entry.physical) continue; // eBooks / audiobooks never go to Lulu
		const quantity = Math.trunc(li.quantity ?? 0);
		if (quantity < 1 || quantity > 100) {
			unknown.push(`${priceId}:qty`);
			continue;
		}
		items.push({ key: entry.key, stripePriceId: priceId, title: entry.title, quantity });
	}
	if (items.length === 0) {
		log("no_physical_items", { session: sessionId, unknown });
		return { status: 200, body: { received: true, fulfillment: "not_required" } };
	}

	const { shipping, missing } = shippingFromSession(session);
	const hold = holdReason(env, session.livemode, items, missing, session.line_items?.has_more);
	const claimed = await store.claim(db, {
		stripe_session_id: sessionId,
		stripe_event_id: event.id,
		stripe_payment_intent: session.payment_intent,
		livemode: session.livemode ? 1 : 0,
		status: hold ? "HELD" : "SUBMITTING",
		status_detail: hold,
		items_json: JSON.stringify(items),
		shipping_json: JSON.stringify(shipping),
		shipping_level: shippingLevel(env),
	});
	if (!claimed) {
		log("duplicate", { session: sessionId, event: event.id });
		return { status: 200, body: { received: true, duplicate: true } };
	}
	log("recorded", { session: sessionId, event: event.id, held: hold, items: items.map((i) => i.key) });
	if (hold) {
		return { status: 200, body: { received: true, fulfillment: "held", reason: hold } };
	}
	return {
		status: 200,
		body: { received: true, fulfillment: "submitting" },
		background: submit(env, sessionId),
	};
}

/** Why an order must not be sent to Lulu right now, or null if it may. */
function holdReason(
	env: Env,
	livemode: boolean,
	items: OrderItem[],
	missingAddress: string[],
	moreItems = false,
): string | null {
	const m = mode(env);
	if (m === "off") return "FULFILLMENT_OFF";
	if (m === "sandbox" && livemode) return "LIVE_ORDER_IN_SANDBOX_MODE";
	if (m === "production" && !livemode) return "TEST_ORDER_IN_PRODUCTION_MODE";
	if (moreItems) return "TOO_MANY_LINE_ITEMS";
	for (const item of items) {
		const entry = byKey(item.key);
		if (!entry || !luluMapping(entry)) return `FULFILLMENT_MAPPING_REQUIRED:${item.key}`;
		if (!printFiles(env.LULU_PRINT_FILES, item.key)) return `PRINT_FILES_MISSING:${item.key}`;
		if (m === "production" && !entry.productionEnabled) {
			return `PRODUCTION_NOT_ENABLED:${item.key}`;
		}
	}
	if (missingAddress.length) return `INVALID_ADDRESS:${missingAddress.join(",")}`;
	if (!luluCredentials(env)) return "LULU_NOT_CONFIGURED";
	if (!env.FULFILLMENT_CONTACT_EMAIL) return "CONTACT_EMAIL_NOT_CONFIGURED";
	return null;
}

function errorDetail(err: unknown): string {
	if (err instanceof LuluError) return `HTTP ${err.status}: ${err.detail}`.slice(0, 1000);
	return (err instanceof Error ? err.message : String(err)).slice(0, 1000);
}

/**
 * Send a SUBMITTING record to Lulu. Never retries on its own: any error moves
 * the record to FAILED for a deliberate retry.
 */
export async function submit(env: Env, sessionId: string): Promise<FulfillmentRecord | null> {
	const db = env.ORDERS_DB;
	const creds = luluCredentials(env);
	if (!db) return null;
	const rec = await store.get(db, sessionId);
	if (!rec || rec.status !== "SUBMITTING") return rec;
	if (!creds) {
		await store.update(db, sessionId, { status: "HELD", status_detail: "LULU_NOT_CONFIGURED" });
		return store.get(db, sessionId);
	}
	await store.update(db, sessionId, { attempts: rec.attempts + 1 });
	try {
		// A previous attempt may have reached Lulu before failing; never create a second job.
		const existing = await findPrintJobs(creds, sessionId);
		if (existing.length) {
			await applyJob(db, sessionId, existing[0]);
			log("submitted_existing", { session: sessionId, lulu: existing[0].id });
			return store.get(db, sessionId);
		}

		const items = JSON.parse(rec.items_json) as OrderItem[];
		const shipping = JSON.parse(rec.shipping_json ?? "{}") as ShippingInfo;
		const level = rec.shipping_level as ShippingLevel;
		const lineItems = items.map((item) => {
			const entry = byKey(item.key);
			const spec = entry && luluMapping(entry);
			const files = printFiles(env.LULU_PRINT_FILES, item.key);
			if (!entry || !spec || !files) throw new Error(`FULFILLMENT_MAPPING_REQUIRED:${item.key}`);
			return { item, spec, files };
		});

		const { email: _e, ...address } = shipping;
		const cost = await calculateCost(
			creds,
			lineItems.map(({ item, spec }) => ({
				pod_package_id: spec.podPackageId,
				page_count: spec.pageCount,
				quantity: item.quantity,
			})),
			address,
			level,
		);
		await store.update(db, sessionId, { lulu_cost_json: JSON.stringify(cost) });

		const job = await createPrintJob(creds, {
			external_id: sessionId,
			contact_email: env.FULFILLMENT_CONTACT_EMAIL ?? "",
			shipping_level: level,
			shipping_address: shipping,
			line_items: lineItems.map(({ item, spec, files }) => ({
				external_id: item.key,
				title: item.title,
				quantity: item.quantity,
				printable_normalization: {
					pod_package_id: spec.podPackageId,
					cover: { source_url: files.cover },
					interior: { source_url: files.interior },
				},
			})),
		});
		await applyJob(db, sessionId, job);
		log("submitted", { session: sessionId, lulu: job.id, lulu_status: job.status?.name });
	} catch (err) {
		await store.update(db, sessionId, { status: "FAILED", status_detail: errorDetail(err) });
		log("failed", { session: sessionId, error: err instanceof LuluError ? err.status : "error" });
	}
	return store.get(db, sessionId);
}

/** Record a Lulu job's id, status and tracking against our order. */
async function applyJob(db: D1Database, sessionId: string, job: LuluPrintJob): Promise<void> {
	const luluStatus = job.status?.name ?? null;
	const t = trackingOf(job);
	const status =
		luluStatus && TERMINAL_LULU.has(luluStatus)
			? (luluStatus as "SHIPPED" | "DELIVERED" | "CANCELED" | "REJECTED")
			: "SUBMITTED";
	await store.update(db, sessionId, {
		status,
		status_detail: job.status?.message?.slice(0, 1000) ?? null,
		lulu_print_job_id: String(job.id),
		lulu_status: luluStatus,
		carrier: t.carrier,
		tracking_id: t.trackingId,
		tracking_urls: t.trackingUrls.length ? JSON.stringify(t.trackingUrls) : null,
	});
}

/**
 * Manually retry a HELD or FAILED order (re-checks every hold condition).
 * Single-flight: only one caller can move it to SUBMITTING.
 */
export async function retry(env: Env, sessionId: string): Promise<FulfillmentRecord | null> {
	const db = env.ORDERS_DB;
	if (!db) return null;
	const rec = await store.get(db, sessionId);
	if (!rec) return null;
	if (rec.status !== "HELD" && rec.status !== "FAILED") return rec;
	const items = JSON.parse(rec.items_json) as OrderItem[];
	if (rec.status_detail === "TOO_MANY_LINE_ITEMS") return rec; // needs manual handling
	const missing = rec.shipping_json
		? missingShippingFields(JSON.parse(rec.shipping_json) as ShippingInfo)
		: ["shipping"];
	const hold = holdReason(env, rec.livemode === 1, items, missing);
	if (hold) {
		await store.update(db, sessionId, { status: "HELD", status_detail: hold });
		return store.get(db, sessionId);
	}
	if (!(await store.transition(db, sessionId, ["HELD", "FAILED"], "SUBMITTING", null))) {
		return store.get(db, sessionId);
	}
	return submit(env, sessionId);
}

/** Pull the latest Lulu status for one order. */
export async function refresh(env: Env, sessionId: string): Promise<FulfillmentRecord | null> {
	const db = env.ORDERS_DB;
	const creds = luluCredentials(env);
	if (!db) return null;
	const rec = await store.get(db, sessionId);
	if (!rec?.lulu_print_job_id || !creds) return rec;
	await applyJob(db, sessionId, await getPrintJob(creds, rec.lulu_print_job_id));
	return store.get(db, sessionId);
}

/** Hourly: refresh every order whose Lulu job isn't final yet. */
export async function reconcile(env: Env): Promise<number> {
	const db = env.ORDERS_DB;
	if (!db || !luluCredentials(env)) return 0;
	let n = 0;
	for (const rec of await store.open(db)) {
		try {
			await refresh(env, rec.stripe_session_id);
			n++;
		} catch (err) {
			log("reconcile_error", { session: rec.stripe_session_id, error: errorDetail(err).slice(0, 120) });
		}
	}
	return n;
}

/** Handle a signed Lulu PRINT_JOB_STATUS_CHANGED webhook. */
export async function handleLuluWebhook(
	env: Env,
	rawBody: string,
	signature: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
	const db = env.ORDERS_DB;
	if (!db || !env.LULU_CLIENT_SECRET) {
		return { status: 503, body: { error: "Lulu webhook not configured" } };
	}
	if (!(await verifyLuluSignature(rawBody, signature, env.LULU_CLIENT_SECRET))) {
		return { status: 400, body: { error: "Invalid signature" } };
	}
	let payload: { topic?: string; data?: LuluPrintJob };
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return { status: 400, body: { error: "Invalid JSON" } };
	}
	if (payload.topic !== "PRINT_JOB_STATUS_CHANGED" || !payload.data?.id) {
		return { status: 200, body: { received: true, ignored: payload.topic ?? "unknown" } };
	}
	const job = payload.data;
	const rec =
		(await store.getByLuluJob(db, String(job.id))) ??
		(job.external_id ? await store.get(db, job.external_id) : null);
	if (!rec) {
		log("lulu_webhook_unknown_job", { lulu: job.id });
		return { status: 200, body: { received: true, matched: false } };
	}
	await applyJob(db, rec.stripe_session_id, job);
	log("lulu_status", { session: rec.stripe_session_id, lulu: job.id, lulu_status: job.status?.name });
	return { status: 200, body: { received: true, matched: true } };
}

/** Admin view of a record: everything Travis needs, nothing he doesn't. */
export function present(rec: FulfillmentRecord) {
	const shipping = rec.shipping_json ? (JSON.parse(rec.shipping_json) as ShippingInfo) : null;
	return {
		stripeSessionId: rec.stripe_session_id,
		stripePaymentIntent: rec.stripe_payment_intent,
		livemode: rec.livemode === 1,
		customer: shipping ? { name: shipping.name, email: shipping.email } : null,
		shipTo: shipping
			? [shipping.street1, shipping.street2, shipping.city, shipping.state_code, shipping.postcode, shipping.country_code]
					.filter(Boolean)
					.join(", ")
			: null,
		items: JSON.parse(rec.items_json) as OrderItem[],
		status: rec.status,
		statusDetail: rec.status_detail,
		shippingLevel: rec.shipping_level,
		luluPrintJobId: rec.lulu_print_job_id,
		luluStatus: rec.lulu_status,
		luluCost: rec.lulu_cost_json ? JSON.parse(rec.lulu_cost_json) : null,
		carrier: rec.carrier,
		trackingId: rec.tracking_id,
		trackingUrls: rec.tracking_urls ? (JSON.parse(rec.tracking_urls) as string[]) : [],
		attempts: rec.attempts,
		createdAt: rec.created_at,
		updatedAt: rec.updated_at,
	};
}
