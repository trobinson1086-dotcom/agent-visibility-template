/**
 * Stripe → Printful merch fulfillment.
 *
 *   POST /api/merch/checkout (MERCH_CHECKOUT=preview|on) → Stripe Checkout Session
 *   with the SKU in metadata → paid webhook (shared with books, see
 *   service.ts) → one D1 row per session (idempotent) → Printful order.
 *
 * FULFILLMENT_MODE gates orders exactly as for Lulu. Printful has no sandbox,
 * so test-mode orders ("sandbox") and live orders for products without
 * `productionEnabled` become Printful *drafts*: nothing is charged or printed
 * until Travis confirms the draft in the Printful dashboard.
 */
import type { Env } from "../lib/types";
import {
	MAX_MERCH_QUANTITY,
	MERCH,
	merchFromSku,
	type MerchSelection,
	merchSelection,
	shippingCents,
} from "./merch";
import {
	createOrder,
	externalId,
	getOrder,
	PrintfulError,
	type PrintfulOrder,
	trackingOfOrder,
} from "./printful";
import * as store from "./store";
import {
	createCheckoutSession,
	missingShippingFields,
	shippingFromSession,
	type StripeCheckoutSession,
} from "./stripe";
import type { FulfillmentMode, FulfillmentRecord, OrderItem, ShippingInfo } from "./types";

export const MERCH_SHIPPING_LEVEL = "PRINTFUL_STANDARD";
const SKU_PREFIX = "MERCH:";

function log(event: string, fields: Record<string, unknown>): void {
	console.log(JSON.stringify({ fulfillment: event, provider: "printful", ...fields }));
}

function errorDetail(err: unknown): string {
	if (err instanceof PrintfulError) return `HTTP ${err.status}: ${err.detail}`.slice(0, 1000);
	return (err instanceof Error ? err.message : String(err)).slice(0, 1000);
}

function token(env: Env): string | null {
	return env.PRINTFUL_API_TOKEN?.trim() || null;
}

// --- Checkout ---------------------------------------------------------------

export type CheckoutState = "off" | "preview" | "on";

/**
 * "off": closed. "preview": checkout works, but the shop page only shows it
 * at ?shop=preview (for Travis's test order). "on": open to everyone.
 */
export function checkoutState(env: Env): CheckoutState {
	const v = (env.MERCH_CHECKOUT ?? "").trim().toLowerCase();
	return v === "on" || v === "preview" ? v : "off";
}

/** What the shop page needs to render: state, prices, sizes and colors. */
export function merchCatalog(env: Env) {
	return {
		checkout: checkoutState(env),
		products: MERCH.map((p) => ({
			key: p.key,
			name: p.name,
			priceCents: p.priceCents,
			sizeUpchargeCents: p.sizeUpchargeCents,
			shipping: p.shipping,
			sizes: p.sizes,
			colors: p.colors.map((c) => ({ name: c.name, hex: c.hex, sizes: p.sizes.filter((s) => s in c.variants) })),
			maxQuantity: MAX_MERCH_QUANTITY,
		})),
	};
}

export interface CheckoutRequest {
	product?: unknown;
	color?: unknown;
	size?: unknown;
	quantity?: unknown;
}

/** Create a Stripe Checkout Session for one merch item (any quantity up to 10). */
export async function createMerchCheckout(
	env: Env,
	req: CheckoutRequest,
	origin: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
	if (checkoutState(env) === "off") {
		return { status: 404, body: { error: "The Squish Squad Shop is not open yet." } };
	}
	if (!env.STRIPE_SECRET_KEY) return { status: 503, body: { error: "Checkout is not configured." } };
	const quantity = Number(req.quantity ?? 1);
	const sel =
		typeof req.product === "string" && typeof req.color === "string" && typeof req.size === "string"
			? merchSelection(req.product, req.color, req.size)
			: null;
	if (!sel || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_MERCH_QUANTITY) {
		return { status: 400, body: { error: "Please choose a product, color, size and quantity." } };
	}
	const p = sel.product;
	try {
		const s = await createCheckoutSession(env.STRIPE_SECRET_KEY, {
			mode: "payment",
			"line_items[0][quantity]": String(quantity),
			"line_items[0][price_data][currency]": "usd",
			"line_items[0][price_data][unit_amount]": String(sel.unitCents),
			"line_items[0][price_data][product_data][name]": sel.title,
			"line_items[0][price_data][product_data][metadata][merch_sku]": sel.sku,
			"shipping_address_collection[allowed_countries][0]": "US",
			"shipping_options[0][shipping_rate_data][type]": "fixed_amount",
			"shipping_options[0][shipping_rate_data][display_name]": "Standard shipping",
			"shipping_options[0][shipping_rate_data][fixed_amount][amount]": String(shippingCents(p, quantity)),
			"shipping_options[0][shipping_rate_data][fixed_amount][currency]": "usd",
			"shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]": "business_day",
			"shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]": "5",
			"shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]": "business_day",
			"shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]": "12",
			"metadata[merch_sku]": sel.sku,
			success_url: `${origin}/?shop=thanks#merch`,
			cancel_url: `${origin}/#merch`,
		});
		log("checkout_created", { sku: sel.sku, quantity });
		return { status: 200, body: { url: s.url } };
	} catch (err) {
		log("checkout_failed", { sku: sel.sku, error: errorDetail(err).slice(0, 120) });
		return { status: 502, body: { error: "Checkout is unavailable right now. Please try again." } };
	}
}

// --- Paid order → Printful ----------------------------------------------------

export interface MerchWebhookResult {
	status: number;
	body: Record<string, unknown>;
	background?: Promise<unknown>;
}

/** Record a paid merch checkout and, unless held, send it to Printful. */
export async function recordMerchOrder(
	env: Env,
	mode: FulfillmentMode,
	db: D1Database,
	eventId: string,
	session: StripeCheckoutSession,
): Promise<MerchWebhookResult> {
	const sku = session.metadata?.merch_sku ?? "";
	const sel = merchFromSku(sku);
	const lines = session.line_items?.data ?? [];
	const quantity = Math.trunc(lines[0]?.quantity ?? 0);
	const items: OrderItem[] = [
		{
			key: `${SKU_PREFIX}${sku}`,
			stripePriceId: lines[0]?.price?.id ?? "",
			title: sel?.title ?? sku,
			quantity,
		},
	];
	const { shipping } = shippingFromSession(session);
	const hold = holdReason(env, mode, session.livemode, sel, shipping, {
		oneLine: lines.length === 1 && !session.line_items?.has_more,
		quantity,
	});
	const claimed = await store.claim(db, {
		stripe_session_id: session.id,
		provider: "printful",
		stripe_event_id: eventId,
		stripe_payment_intent: session.payment_intent,
		livemode: session.livemode ? 1 : 0,
		status: hold ? "HELD" : "SUBMITTING",
		status_detail: hold,
		items_json: JSON.stringify(items),
		shipping_json: JSON.stringify(shipping),
		shipping_level: MERCH_SHIPPING_LEVEL,
	});
	if (!claimed) {
		log("duplicate", { session: session.id, event: eventId });
		return { status: 200, body: { received: true, duplicate: true } };
	}
	log("recorded", { session: session.id, event: eventId, held: hold, sku });
	if (hold) return { status: 200, body: { received: true, fulfillment: "held", reason: hold } };
	return {
		status: 200,
		body: { received: true, fulfillment: "submitting" },
		background: submitMerch(env, mode, session.id),
	};
}

/** Printful accepts longer lines than Lulu, so only missing fields hold an order. */
function missingForPrintful(shipping: ShippingInfo): string[] {
	return missingShippingFields(shipping).filter((f) => !f.endsWith("_too_long"));
}

function holdReason(
	env: Env,
	mode: FulfillmentMode,
	livemode: boolean,
	sel: MerchSelection | null,
	shipping: ShippingInfo,
	{ oneLine, quantity }: { oneLine: boolean; quantity: number },
): string | null {
	if (mode === "off") return "FULFILLMENT_OFF";
	if (mode === "sandbox" && livemode) return "LIVE_ORDER_IN_SANDBOX_MODE";
	if (mode === "production" && !livemode) return "TEST_ORDER_IN_PRODUCTION_MODE";
	if (!oneLine) return "TOO_MANY_LINE_ITEMS";
	if (!sel) return "UNKNOWN_MERCH_SKU";
	if (quantity < 1 || quantity > MAX_MERCH_QUANTITY) return "INVALID_QUANTITY";
	if (sel.product.files.some((f) => f.fileId === null)) return `PRINT_FILES_MISSING:${sel.product.key}`;
	const missing = missingForPrintful(shipping);
	if (missing.length) return `INVALID_ADDRESS:${missing.join(",")}`;
	if (!token(env)) return "PRINTFUL_NOT_CONFIGURED";
	return null;
}

/** Send a SUBMITTING merch record to Printful; any error moves it to FAILED. */
export async function submitMerch(
	env: Env,
	mode: FulfillmentMode,
	sessionId: string,
): Promise<FulfillmentRecord | null> {
	const db = env.ORDERS_DB;
	const t = token(env);
	if (!db) return null;
	const rec = await store.get(db, sessionId);
	if (!rec || rec.status !== "SUBMITTING") return rec;
	if (!t) {
		await store.update(db, sessionId, { status: "HELD", status_detail: "PRINTFUL_NOT_CONFIGURED" });
		return store.get(db, sessionId);
	}
	await store.update(db, sessionId, { attempts: rec.attempts + 1 });
	try {
		const extId = await externalId(sessionId);
		// A previous attempt may have reached Printful before failing; never create a second order.
		const existing = await getOrder(t, extId);
		if (existing) {
			await applyOrder(db, sessionId, existing);
			log("submitted_existing", { session: sessionId, printful: existing.id });
			return store.get(db, sessionId);
		}
		const [item] = JSON.parse(rec.items_json) as OrderItem[];
		const sel = merchFromSku(item.key.slice(SKU_PREFIX.length));
		if (!sel) throw new Error(`UNKNOWN_MERCH_SKU:${item.key}`);
		const s = JSON.parse(rec.shipping_json ?? "{}") as ShippingInfo;
		const confirm = mode === "production" && rec.livemode === 1 && sel.product.productionEnabled;
		const order = await createOrder(
			t,
			{
				external_id: extId,
				recipient: {
					name: s.name,
					address1: s.street1,
					...(s.street2 ? { address2: s.street2 } : {}),
					city: s.city,
					state_code: s.state_code,
					country_code: s.country_code,
					zip: s.postcode,
					...(s.phone_number ? { phone: s.phone_number } : {}),
					email: s.email,
				},
				items: [
					{
						variant_id: sel.variantId,
						quantity: item.quantity,
						name: sel.title,
						retail_price: (sel.unitCents / 100).toFixed(2),
						files: sel.product.files.map((f) => ({
							type: f.type,
							id: f.fileId as number,
							...(f.position ? { position: { ...f.position } } : {}),
						})),
					},
				],
			},
			confirm,
		);
		await applyOrder(db, sessionId, order);
		log("submitted", { session: sessionId, printful: order.id, printful_status: order.status });
	} catch (err) {
		await store.update(db, sessionId, { status: "FAILED", status_detail: errorDetail(err) });
		log("failed", { session: sessionId, error: err instanceof PrintfulError ? err.status : "error" });
	}
	return store.get(db, sessionId);
}

/** Record a Printful order's id, status and tracking against our order. */
async function applyOrder(db: D1Database, sessionId: string, order: PrintfulOrder): Promise<void> {
	const t = trackingOfOrder(order);
	const status =
		order.status === "fulfilled"
			? "SHIPPED"
			: order.status === "canceled"
				? "CANCELED"
				: order.status === "failed"
					? "FAILED"
					: "SUBMITTED";
	await store.update(db, sessionId, {
		status,
		status_detail:
			order.status === "draft" ? "PRINTFUL_DRAFT: confirm it in the Printful dashboard to print and ship" : null,
		printful_order_id: String(order.id),
		printful_status: order.status,
		...(order.costs ? { printful_cost_json: JSON.stringify(order.costs) } : {}),
		carrier: t.carrier,
		tracking_id: t.trackingId,
		tracking_urls: t.trackingUrls.length ? JSON.stringify(t.trackingUrls) : null,
	});
}

/** Retry a HELD or FAILED merch order (re-checks every hold condition). */
export async function retryMerch(
	env: Env,
	mode: FulfillmentMode,
	rec: FulfillmentRecord,
): Promise<FulfillmentRecord | null> {
	const db = env.ORDERS_DB;
	if (!db) return null;
	const [item] = JSON.parse(rec.items_json) as OrderItem[];
	const sel = merchFromSku(item?.key.slice(SKU_PREFIX.length) ?? "");
	const shipping = JSON.parse(rec.shipping_json ?? "{}") as ShippingInfo;
	const oneLine = rec.status_detail !== "TOO_MANY_LINE_ITEMS";
	const hold = holdReason(env, mode, rec.livemode === 1, sel, shipping, { oneLine, quantity: item?.quantity ?? 0 });
	if (hold) {
		await store.update(db, rec.stripe_session_id, { status: "HELD", status_detail: hold });
		return store.get(db, rec.stripe_session_id);
	}
	if (!(await store.transition(db, rec.stripe_session_id, ["HELD", "FAILED"], "SUBMITTING", null))) {
		return store.get(db, rec.stripe_session_id);
	}
	return submitMerch(env, mode, rec.stripe_session_id);
}

/** Pull the latest Printful status and tracking for one order. */
export async function refreshMerch(env: Env, rec: FulfillmentRecord): Promise<FulfillmentRecord | null> {
	const db = env.ORDERS_DB;
	const t = token(env);
	if (!db || !t || !rec.printful_order_id) return rec;
	const order = await getOrder(t, await externalId(rec.stripe_session_id));
	if (order) await applyOrder(db, rec.stripe_session_id, order);
	return store.get(db, rec.stripe_session_id);
}

/** Hourly: refresh every Printful order that hasn't shipped yet. */
export async function reconcileMerch(env: Env): Promise<number> {
	const db = env.ORDERS_DB;
	if (!db || !token(env)) return 0;
	let n = 0;
	for (const rec of await store.openPrintful(db)) {
		try {
			await refreshMerch(env, rec);
			n++;
		} catch (err) {
			log("reconcile_error", { session: rec.stripe_session_id, error: errorDetail(err).slice(0, 120) });
		}
	}
	return n;
}
