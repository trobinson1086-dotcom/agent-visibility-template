/**
 * Minimal Stripe access for fulfillment: webhook signature verification and a
 * server-side re-read of the Checkout Session (the webhook body is never
 * trusted for payment state, items or address).
 */
import { hmacSha256, safeEqual, toHex } from "./crypto";
import type { ShippingInfo } from "./types";

const STRIPE_API = "https://api.stripe.com/v1";
const TIMEOUT_MS = 10_000;

/** Verify a `Stripe-Signature` header (scheme v1, 5-minute tolerance). */
export async function verifyStripeSignature(
	payload: string,
	header: string | null | undefined,
	secret: string,
	nowSeconds = Math.floor(Date.now() / 1000),
	toleranceSeconds = 300,
): Promise<boolean> {
	if (!header) return false;
	let t: number | undefined;
	const v1: string[] = [];
	for (const part of header.split(",")) {
		const [k, v] = part.split("=", 2);
		if (k?.trim() === "t") t = Number(v);
		else if (k?.trim() === "v1" && v) v1.push(v.trim());
	}
	if (!t || !Number.isFinite(t) || v1.length === 0) return false;
	if (Math.abs(nowSeconds - t) > toleranceSeconds) return false;
	const expected = toHex(await hmacSha256(secret, `${t}.${payload}`));
	return v1.some((sig) => safeEqual(sig, expected));
}

export interface StripeLineItem {
	quantity: number | null;
	price: { id: string } | null;
}

interface StripeAddress {
	line1?: string | null;
	line2?: string | null;
	city?: string | null;
	state?: string | null;
	postal_code?: string | null;
	country?: string | null;
}

export interface StripeCheckoutSession {
	id: string;
	object: "checkout.session";
	livemode: boolean;
	payment_status: "paid" | "unpaid" | "no_payment_required";
	status: string | null;
	payment_intent: string | null;
	customer_details: {
		email?: string | null;
		name?: string | null;
		phone?: string | null;
	} | null;
	shipping_details?: { name?: string | null; address?: StripeAddress | null } | null;
	collected_information?: {
		shipping_details?: { name?: string | null; address?: StripeAddress | null } | null;
	} | null;
	line_items?: { data: StripeLineItem[]; has_more: boolean };
}

/** Fetch the Checkout Session (with line items) straight from Stripe. */
export async function fetchCheckoutSession(
	secretKey: string,
	sessionId: string,
): Promise<StripeCheckoutSession> {
	const url = `${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items`;
	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${secretKey}` },
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (!res.ok) {
		throw new Error(`Stripe session lookup failed (HTTP ${res.status})`);
	}
	return (await res.json()) as StripeCheckoutSession;
}

/**
 * Map a session's shipping/contact details to the fields Lulu needs. Returns
 * the list of missing fields alongside so the caller can hold the order.
 */
export function shippingFromSession(
	s: StripeCheckoutSession,
): { shipping: ShippingInfo; missing: string[] } {
	const ship = s.collected_information?.shipping_details ?? s.shipping_details;
	const a = ship?.address ?? {};
	const shipping: ShippingInfo = {
		name: (ship?.name ?? s.customer_details?.name ?? "").trim(),
		street1: (a.line1 ?? "").trim(),
		street2: a.line2?.trim() || undefined,
		city: (a.city ?? "").trim(),
		state_code: (a.state ?? "").trim(),
		postcode: (a.postal_code ?? "").trim(),
		country_code: (a.country ?? "").trim().toUpperCase(),
		phone_number: s.customer_details?.phone?.trim() || undefined,
		email: (s.customer_details?.email ?? "").trim(),
	};
	return { shipping, missing: missingShippingFields(shipping) };
}

/** Fields Lulu needs that are absent, malformed or over Lulu's length limits. */
export function missingShippingFields(shipping: ShippingInfo): string[] {
	const missing: string[] = [];
	for (const f of ["name", "street1", "city", "postcode", "country_code", "email"] as const) {
		if (!shipping[f]) missing.push(f);
	}
	// Lulu requires a valid state code for US (and several other) addresses.
	if (shipping.country_code === "US" && !/^[A-Z]{2}$/.test(shipping.state_code)) {
		missing.push("state_code");
	}
	if (shipping.country_code && !/^[A-Z]{2}$/.test(shipping.country_code)) {
		missing.push("country_code");
	}
	// Lulu's limits; an over-long field is held for a human rather than truncated.
	for (const [f, max] of [["name", 35], ["street1", 30], ["street2", 30], ["city", 30]] as const) {
		if ((shipping[f]?.length ?? 0) > max) missing.push(`${f}_too_long`);
	}
	return missing;
}
