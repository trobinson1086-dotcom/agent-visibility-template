/** Shared types for the Stripe → Lulu print-on-demand fulfillment flow. */

export type Format =
	| "paperback"
	| "hardcover"
	| "ebook"
	| "audiobook"
	| "coloring"
	| "learning"
	| "bonus";

/**
 * Lulu print specs for one product. The cover/interior PDF URLs are not kept
 * in source: they come from the LULU_PRINT_FILES secret, keyed by `key`.
 */
export interface LuluMapping {
	/** 27-character Lulu product code (trim, color, quality, binding, paper, finish). */
	podPackageId: string;
	/** Interior page count, used for cost/shipping quotes. */
	pageCount: number;
}

export interface CatalogEntry {
	/** Stable internal key, e.g. "EN-PAPERBACK-1". */
	key: string;
	title: string;
	language: "en" | "es";
	format: Format;
	stripeProductId: string;
	stripePriceId: string;
	/** Only physical items can ever be sent to Lulu. */
	physical: boolean;
	/** null for digital items; the sentinel until print specs are confirmed. */
	lulu: LuluMapping | "FULFILLMENT_MAPPING_REQUIRED" | null;
	/** Must be explicitly switched on per product before live orders go to Lulu. */
	productionEnabled: boolean;
}

export type FulfillmentMode = "off" | "sandbox" | "production";

/** Our fulfillment states. Lulu's own status is kept separately in `lulu_status`. */
export type FulfillmentStatus =
	| "HELD" // recorded, deliberately not sent (see status_detail)
	| "SUBMITTING" // claimed; Lulu submission in progress
	| "SUBMITTED" // Lulu print job created
	| "FAILED" // Lulu rejected or errored; needs a manual retry
	| "SHIPPED"
	| "CANCELED"
	| "REJECTED";

export interface ShippingInfo {
	name: string;
	street1: string;
	street2?: string;
	city: string;
	state_code: string;
	postcode: string;
	country_code: string;
	phone_number?: string;
	email: string;
}

export interface OrderItem {
	key: string;
	stripePriceId: string;
	title: string;
	quantity: number;
}

export interface FulfillmentRecord {
	stripe_session_id: string;
	stripe_event_id: string;
	stripe_payment_intent: string | null;
	livemode: number;
	status: FulfillmentStatus;
	status_detail: string | null;
	items_json: string;
	shipping_json: string | null;
	shipping_level: string;
	lulu_print_job_id: string | null;
	lulu_status: string | null;
	lulu_cost_json: string | null;
	carrier: string | null;
	tracking_id: string | null;
	tracking_urls: string | null;
	attempts: number;
	created_at: string;
	updated_at: string;
}
