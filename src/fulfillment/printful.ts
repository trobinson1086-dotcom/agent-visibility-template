/**
 * Minimal Printful API client for merch orders (v1 Orders API).
 * Orders are looked up by our external id first, so a retry never creates a
 * second order for the same Stripe checkout.
 */
import { toHex } from "./crypto";

const API = "https://api.printful.com";
const TIMEOUT_MS = 15_000;

export class PrintfulError extends Error {
	constructor(
		readonly status: number,
		readonly detail: string,
	) {
		super(`Printful API error ${status}`);
	}
}

export interface PrintfulShipment {
	carrier?: string | null;
	service?: string | null;
	tracking_number?: string | null;
	tracking_url?: string | null;
}

export interface PrintfulOrder {
	id: number;
	external_id?: string | null;
	status: string;
	shipments?: PrintfulShipment[];
	costs?: Record<string, unknown>;
}

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`${API}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			...(body ? { "Content-Type": "application/json" } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	const text = await res.text();
	if (!res.ok) throw new PrintfulError(res.status, text.slice(0, 1000));
	return (JSON.parse(text) as { result: T }).result;
}

/**
 * Printful external ids are limited to 32 characters, so Stripe session ids
 * (~66 characters) are hashed to a stable 32-character id.
 */
export async function externalId(sessionId: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionId));
	return toHex(new Uint8Array(digest)).slice(0, 32);
}

/** The order with our external id, or null if Printful has none. */
export async function getOrder(token: string, extId: string): Promise<PrintfulOrder | null> {
	try {
		return await call<PrintfulOrder>(token, "GET", `/orders/@${encodeURIComponent(extId)}`);
	} catch (err) {
		if (err instanceof PrintfulError && err.status === 404) return null;
		throw err;
	}
}

export interface PrintfulRecipient {
	name: string;
	address1: string;
	address2?: string;
	city: string;
	state_code: string;
	country_code: string;
	zip: string;
	phone?: string;
	email: string;
}

export interface PrintfulOrderItem {
	variant_id: number;
	quantity: number;
	name: string;
	retail_price: string;
	files: Array<{ type: string; id: number; position?: Record<string, number> }>;
	options?: Array<{ id: string; value: unknown }>;
}

/**
 * Create an order. `confirm: false` makes a draft: nothing is charged or
 * printed until it is confirmed in the Printful dashboard.
 */
export async function createOrder(
	token: string,
	order: { external_id: string; recipient: PrintfulRecipient; items: PrintfulOrderItem[] },
	confirm: boolean,
): Promise<PrintfulOrder> {
	return call<PrintfulOrder>(token, "POST", `/orders?confirm=${confirm ? "true" : "false"}`, order);
}

export async function getFile(token: string, id: number): Promise<{ id: number; status: string }> {
	return call(token, "GET", `/files/${id}`);
}

/** Carrier and tracking from the first shipment that has them. */
export function trackingOfOrder(order: PrintfulOrder): {
	carrier: string | null;
	trackingId: string | null;
	trackingUrls: string[];
} {
	const s = order.shipments?.find((x) => x.tracking_number || x.tracking_url);
	return {
		carrier: s?.carrier ?? null,
		trackingId: s?.tracking_number ?? null,
		trackingUrls: (order.shipments ?? []).map((x) => x.tracking_url).filter((u): u is string => !!u),
	};
}
