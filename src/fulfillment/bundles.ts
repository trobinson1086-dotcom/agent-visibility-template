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
import { SIGNED_BUNDLE_KEY, SIGNED_EDITION, signedCheckoutAllowance } from "./signed-edition";
import { createCheckoutSession } from "./stripe";

export interface Bundle {
	key: string;
	name: string;
	unitCents: number;
	/** Catalog keys of the books inside, one copy each. */
	books: readonly string[];
	/** An optional sale price that applies only between startsAt (inclusive) and endsAt. */
	sale?: { unitCents: number; startsAt: string; endsAt: string; label: string };
	/** The Signed Holiday Edition (signed-edition.ts): sold only while it's switched on, in its window, and not sold out. */
	signed?: true;
}

/**
 * Black Friday through Cyber Monday 2026, Eastern time: Fri Nov 27 00:00 until
 * Tue Dec 1 00:00. The site's holiday bar and the Story Collection page use the
 * same two times, so the banner, the page and the checkout always agree.
 */
export const HOLIDAY_SALE = { startsAt: "2026-11-27T00:00:00-05:00", endsAt: "2026-12-01T00:00:00-05:00" } as const;

const EN = ["EN-LEARNING-1", "EN-LEARNING-2", "EN-LEARNING-3", "EN-LEARNING-4", "EN-LEARNING-5"] as const;
const STORY = ["EN-PAPERBACK-1", "EN-PAPERBACK-2", "EN-PAPERBACK-3", "EN-PAPERBACK-4", "EN-PAPERBACK-5"] as const;
const ES = ["ES-LEARNING-1", "ES-LEARNING-2", "ES-LEARNING-3", "ES-LEARNING-4", "ES-LEARNING-5"] as const;

export const BUNDLES: readonly Bundle[] = [
	// The five English story paperbacks together: $64.99 every day with free
	// shipping (Travis's pick, 2026-11-19), $61.99 Black Friday to Cyber Monday.
	// Singles are $14.99 each, $74.95 together. These paperbacks are mapped to Lulu, so the
	// order prints like any story book.
	{
		key: "EN-STORY-SET",
		name: "Squish Man Story Collection (Books 1–5 Paperbacks)",
		unitCents: 6499,
		books: STORY,
		sale: { unitCents: 6199, ...HOLIDAY_SALE, label: "Black Friday price" },
	},
	// The same five paperbacks plus a bookplate Travis signs, numbers and mails himself.
	// $69.99, 50 sets, Nov 27 to Cyber Monday (Travis's yes, 2026-11-21); price and limit live in SIGNED_EDITION.
	{ key: SIGNED_BUNDLE_KEY, name: SIGNED_EDITION.name, unitCents: SIGNED_EDITION.unitCents, books: STORY, signed: true },
	{ key: "EN-LEARNING-SET", name: "Squish Man English Learning Set (Learning & Activity Books 1–5)", unitCents: 6599, books: EN },
	{ key: "ES-LEARNING-SET", name: "Squish Man Colección en Español (Aprendizaje y Actividades 1–5)", unitCents: 6599, books: ES },
	{ key: "BILINGUAL-BUNDLE", name: "Squish Man Bilingual Mega Bundle (10 Learning & Activity Books)", unitCents: 12999, books: [...EN, ...ES] },
];

/** The price a bundle sells for at `now`: its sale price inside the sale window, else its usual price. */
export function bundlePrice(bundle: Bundle, now: Date = new Date()): { unitCents: number; onSale: boolean; label?: string } {
	const sale = bundle.sale;
	if (sale) {
		const t = now.getTime();
		if (t >= Date.parse(sale.startsAt) && t < Date.parse(sale.endsAt)) return { unitCents: sale.unitCents, onSale: true, label: sale.label };
	}
	return { unitCents: bundle.unitCents, onSale: false };
}

/** Pages a buyer may come back to after leaving a bundle checkout; anything else goes home. */
const RETURN_PAGES: Record<string, string> = { "story-collection": "/story-collection.html", "signed-edition": "/story-collection.html" };

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
	from?: string | null,
	now: Date = new Date(),
): Promise<{ status: number; url?: string; error?: string }> {
	const bundle = bundleByKey(key);
	if (!bundle) return { status: 404, error: "UNKNOWN_BUNDLE" };
	let maxQty = 10;
	let signedFields: Record<string, string> = {};
	if (bundle.signed) {
		const allow = await signedCheckoutAllowance(env, now.getTime());
		if (!allow.ok) return { status: allow.reason === "OFF" || allow.reason === "NOT_STARTED" ? 404 : 410, error: `SIGNED_${allow.reason}` };
		maxQty = allow.max;
		signedFields = {
			"custom_fields[0][key]": "signto",
			"custom_fields[0][label][type]": "custom",
			"custom_fields[0][label][custom]": "Name to sign the bookplate to",
			"custom_fields[0][type]": "text",
			"custom_fields[0][optional]": "true",
			"custom_fields[0][text][maximum_length]": "40",
			"custom_text[submit][message]": `Travis signs and numbers your bookplate and mails it ${SIGNED_EDITION.mailBy}. Your 5 books print and ship free on their own.`,
			"metadata[signed]": SIGNED_EDITION.id,
		};
	}
	const price = bundlePrice(bundle, now);
	const back = (from && RETURN_PAGES[from]) || "/";
	if (!env.STRIPE_SECRET_KEY) return { status: 503, error: "CHECKOUT_NOT_CONFIGURED" };
	try {
		const s = await createCheckoutSession(env.STRIPE_SECRET_KEY, {
			...signedFields,
			mode: "payment",
			"line_items[0][quantity]": "1",
			"line_items[0][adjustable_quantity][enabled]": "true",
			"line_items[0][adjustable_quantity][minimum]": "1",
			"line_items[0][adjustable_quantity][maximum]": String(maxQty),
			"line_items[0][price_data][currency]": "usd",
			"line_items[0][price_data][unit_amount]": String(price.unitCents),
			"line_items[0][price_data][product_data][name]": price.onSale ? `${bundle.name} · ${price.label}` : bundle.name,
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
			"metadata[price]": price.onSale ? "sale" : "regular",
			success_url: back === "/" ? `${origin}/?order=thanks#collections` : `${origin}${back}?order=thanks${bundle.signed ? "&signed=1" : ""}`,
			cancel_url: back === "/" ? `${origin}/#collections` : `${origin}${back}`,
		});
		log("checkout_created", { bundle: bundle.key, sale: price.onSale });
		return { status: 303, url: s.url };
	} catch (err) {
		log("checkout_failed", { bundle: bundle.key, error: String(err).slice(0, 120) });
		return { status: 502, error: "CHECKOUT_UNAVAILABLE" };
	}
}
