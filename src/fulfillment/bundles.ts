/**
 * Book collections sold as one checkout: the Story Collection (English story
 * paperbacks 1–5), the English and Spanish Learning & Activity sets (Books
 * 1–5) and the Bilingual Mega Bundle (all ten).
 *
 * Prices and free shipping as Travis set them on 2026-11-17. Each checkout is
 * a Stripe Checkout Session with the price inline, so no Stripe product has to
 * exist first. The paid order is recorded as its component books (see
 * bundleItems), so it lands in the fulfillment table like any book order; the
 * Learning & Activity books are not mapped to Lulu yet, so these orders are held
 * for Travis to place by hand.
 */
import type { Env } from "../lib/types";
import { createCheckoutSession } from "./stripe";

export interface Bundle {
	key: string;
	name: string;
	unitCents: number;
	/** Catalog keys of the books inside, one copy each. */
	books: readonly string[];
}

const EN = ["EN-LEARNING-1", "EN-LEARNING-2", "EN-LEARNING-3", "EN-LEARNING-4", "EN-LEARNING-5"] as const;
const STORY = ["EN-PAPERBACK-1", "EN-PAPERBACK-2", "EN-PAPERBACK-3", "EN-PAPERBACK-4", "EN-PAPERBACK-5"] as const;
const ES = ["ES-LEARNING-1", "ES-LEARNING-2", "ES-LEARNING-3", "ES-LEARNING-4", "ES-LEARNING-5"] as const;

export const BUNDLES: readonly Bundle[] = [
	// Holiday push draft (2026-11-17): the five English story paperbacks together.
	// Price is a proposal for Travis to confirm (singles are $14.99 each, $74.95 together).
	// These paperbacks are mapped to Lulu, so the order prints like any story book.
	{ key: "EN-STORY-SET", name: "Squish Man Story Collection (Books 1–5 Paperbacks)", unitCents: 6499, books: STORY },
	{ key: "EN-LEARNING-SET", name: "Squish Man English Learning Set (Learning & Activity Books 1–5)", unitCents: 6599, books: EN },
	{ key: "ES-LEARNING-SET", name: "Squish Man Colección en Español (Aprendizaje y Actividades 1–5)", unitCents: 6599, books: ES },
	{ key: "BILINGUAL-BUNDLE", name: "Squish Man Bilingual Mega Bundle (10 Learning & Activity Books)", unitCents: 12999, books: [...EN, ...ES] },
];

export function bundleByKey(key: string | null | undefined): Bundle | undefined {
	return BUNDLES.find((b) => b.key === key);
}

const log = (event: string, data: Record<string, unknown>) =>
	console.log(JSON.stringify({ at: "bundles", event, ...data }));

/** A Checkout Session URL for one bundle, or an error status. */
export async function createBundleCheckout(
	env: Env,
	key: string | undefined,
	origin: string,
): Promise<{ status: number; url?: string; error?: string }> {
	const bundle = bundleByKey(key);
	if (!bundle) return { status: 404, error: "UNKNOWN_BUNDLE" };
	if (!env.STRIPE_SECRET_KEY) return { status: 503, error: "CHECKOUT_NOT_CONFIGURED" };
	try {
		const s = await createCheckoutSession(env.STRIPE_SECRET_KEY, {
			mode: "payment",
			"line_items[0][quantity]": "1",
			"line_items[0][adjustable_quantity][enabled]": "true",
			"line_items[0][adjustable_quantity][minimum]": "1",
			"line_items[0][adjustable_quantity][maximum]": "10",
			"line_items[0][price_data][currency]": "usd",
			"line_items[0][price_data][unit_amount]": String(bundle.unitCents),
			"line_items[0][price_data][product_data][name]": bundle.name,
			"line_items[0][price_data][product_data][metadata][bundle]": bundle.key,
			"shipping_address_collection[allowed_countries][0]": "US",
			"shipping_options[0][shipping_rate_data][type]": "fixed_amount",
			"shipping_options[0][shipping_rate_data][display_name]": "Free shipping",
			"shipping_options[0][shipping_rate_data][fixed_amount][amount]": "0",
			"shipping_options[0][shipping_rate_data][fixed_amount][currency]": "usd",
			"phone_number_collection[enabled]": "true",
			// Lets a holiday or customer promo code from Stripe apply at checkout.
			allow_promotion_codes: "true",
			"metadata[bundle]": bundle.key,
			success_url: `${origin}/?order=thanks#collections`,
			cancel_url: `${origin}/#collections`,
		});
		log("checkout_created", { bundle: bundle.key });
		return { status: 303, url: s.url };
	} catch (err) {
		log("checkout_failed", { bundle: bundle.key, error: String(err).slice(0, 120) });
		return { status: 502, error: "CHECKOUT_UNAVAILABLE" };
	}
}
