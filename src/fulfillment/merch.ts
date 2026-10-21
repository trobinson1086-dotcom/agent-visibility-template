/**
 * Squish Squad Shop merch fulfilled by Printful: the T-shirt, hoodie, long
 * sleeve and mug Travis approved (colors, prices and shipping as agreed on
 * 2026-10-21).
 *
 * Variant ids come from Printful's catalog (products 71, 146, 57 and 19). File ids
 * are the artwork in the Printful file library, uploaded from the "Squishman
 * Merch" Drive folder; positions match the approved mockups.
 */

export type MerchKey = "TEE" | "HOODIE" | "LONGSLEEVE" | "MUG";

export interface PrintfulPosition {
	area_width: number;
	area_height: number;
	width: number;
	height: number;
	top: number;
	left: number;
}

export interface MerchFile {
	/** Printful placement: "front", "back" or "default" (mug wrap). */
	type: string;
	/** Printful file-library id; null until the artwork is uploaded. */
	fileId: number | null;
	position?: PrintfulPosition;
}

export interface MerchColor {
	name: string;
	/** Swatch for the shop page. */
	hex: string;
	/** Printful catalog variant id by size (only the sizes this color comes in). */
	variants: Record<string, number>;
}

export interface MerchProduct {
	key: MerchKey;
	name: string;
	priceCents: number;
	/** Added to the price for sizes Printful charges more for. */
	sizeUpchargeCents: Record<string, number>;
	/** Flat shipping charged at checkout: first item, then each additional one. */
	shipping: { firstCents: number; additionalCents: number };
	sizes: string[];
	colors: MerchColor[];
	files: MerchFile[];
	/**
	 * Live orders are sent to Printful as drafts until this is switched on:
	 * Travis confirms each draft in the Printful dashboard (that is when
	 * Printful charges and prints).
	 */
	productionEnabled: boolean;
}

/** Banner (Squish Man & Pudy) and crown logo in the Printful file library. */
export const FRONT_BANNER_FILE = 1090848214;
export const BACK_CROWN_FILE = 1090848220;

const SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];
const UPCHARGE = { "2XL": 200, "3XL": 400 };

// Both artworks print at their native 150 DPI size, centered near the top.
const front = (areaWidth: number, areaHeight: number, top: number): MerchFile => ({
	type: "front",
	fileId: FRONT_BANNER_FILE,
	position: { area_width: areaWidth, area_height: areaHeight, width: 1226, height: 1283, top, left: (areaWidth - 1226) / 2 },
});
const back: MerchFile = {
	type: "back",
	fileId: BACK_CROWN_FILE,
	position: { area_width: 1800, area_height: 2400, width: 1366, height: 1152, top: 150, left: 217 },
};

export const MERCH: MerchProduct[] = [
	{
		key: "TEE",
		name: "Squish Squad T-Shirt",
		priceCents: 2999,
		sizeUpchargeCents: UPCHARGE,
		shipping: { firstCents: 599, additionalCents: 249 },
		sizes: SIZES,
		colors: [
			{ name: "Black", hex: "#111111", variants: { S: 4016, M: 4017, L: 4018, XL: 4019, "2XL": 4020, "3XL": 5295 } },
			{ name: "White", hex: "#ffffff", variants: { S: 4011, M: 4012, L: 4013, XL: 4014, "2XL": 4015, "3XL": 5294 } },
			{ name: "Royal Blue", hex: "#1d4fa8", variants: { S: 4171, M: 4172, L: 4173, XL: 4174, "2XL": 4175, "3XL": 5307 } },
			{ name: "Pink", hex: "#f4b6c7", variants: { S: 4136, M: 4137, L: 4138, XL: 4139, "2XL": 4140, "3XL": 5303 } },
			{ name: "Grey", hex: "#c9c9c9", variants: { S: 6948, M: 6949, L: 6950, XL: 6951, "2XL": 6952, "3XL": 6953 } },
			{ name: "Red", hex: "#c8102e", variants: { S: 4141, M: 4142, L: 4143, XL: 4144, "2XL": 4145, "3XL": 5304 } },
		],
		files: [front(1800, 2400, 150), back],
		productionEnabled: false,
	},
	{
		key: "HOODIE",
		name: "Squish Squad Hoodie",
		priceCents: 4999,
		sizeUpchargeCents: UPCHARGE,
		shipping: { firstCents: 999, additionalCents: 299 },
		sizes: SIZES,
		colors: [
			{ name: "Black", hex: "#111111", variants: { S: 5530, M: 5531, L: 5532, XL: 5533, "2XL": 5534, "3XL": 5535 } },
			{ name: "White", hex: "#ffffff", variants: { S: 5522, M: 5523, L: 5524, XL: 5525, "2XL": 5526, "3XL": 5527 } },
			{ name: "Royal Blue", hex: "#1d4fa8", variants: { S: 16850, M: 16851, L: 16852, XL: 16853, "2XL": 16854, "3XL": 16855 } },
			{ name: "Pink", hex: "#f4c6d4", variants: { S: 10849, M: 10850, L: 10851, XL: 10852, "2XL": 10853, "3XL": 10854 } },
			{ name: "Grey", hex: "#c9c9c9", variants: { S: 5610, M: 5611, L: 5612, XL: 5613, "2XL": 5614, "3XL": 5615 } },
			{ name: "Red", hex: "#c8102e", variants: { S: 5538, M: 5539, L: 5540, XL: 5541, "2XL": 5542, "3XL": 5543 } },
		],
		files: [front(2100, 2100, 100), back],
		productionEnabled: false,
	},
	{
		key: "LONGSLEEVE",
		name: "Squish Squad Long Sleeve",
		priceCents: 3299,
		sizeUpchargeCents: UPCHARGE,
		shipping: { firstCents: 599, additionalCents: 249 },
		sizes: SIZES,
		colors: [
			{ name: "Black", hex: "#111111", variants: { S: 3456, M: 3457, L: 3458, XL: 3459, "2XL": 3460, "3XL": 3461 } },
			{ name: "White", hex: "#ffffff", variants: { S: 3448, M: 3449, L: 3450, XL: 3451, "2XL": 3452, "3XL": 3453 } },
			{ name: "Royal Blue", hex: "#1d4fa8", variants: { S: 3576, M: 3577, L: 3578, XL: 3579, "2XL": 3580, "3XL": 3581 } },
			// Gildan's Light Pink stops at 2XL.
			{ name: "Pink", hex: "#f4c6d4", variants: { S: 3512, M: 3513, L: 3514, XL: 3515, "2XL": 3516 } },
			{ name: "Grey", hex: "#c9c9c9", variants: { S: 3600, M: 3601, L: 3602, XL: 3603, "2XL": 3604, "3XL": 3605 } },
			{ name: "Red", hex: "#c8102e", variants: { S: 3568, M: 3569, L: 3570, XL: 3571, "2XL": 3572, "3XL": 3573 } },
		],
		files: [front(1800, 2400, 150), back],
		productionEnabled: false,
	},
	{
		key: "MUG",
		name: "Squish Squad Mug (11 oz)",
		priceCents: 1999,
		sizeUpchargeCents: {},
		shipping: { firstCents: 799, additionalCents: 399 },
		sizes: ["11 oz"],
		colors: [{ name: "White", hex: "#ffffff", variants: { "11 oz": 1320 } }],
		// One 2700x1050 wrap: banner on one side, crown logo on the other.
		// Not uploaded yet, so mug orders are held until it is.
		files: [{ type: "default", fileId: null }],
		productionEnabled: false,
	},
];

const BY_KEY = new Map(MERCH.map((p) => [p.key, p]));

export function merchProduct(key: string): MerchProduct | undefined {
	return BY_KEY.get(key as MerchKey);
}

export interface MerchSelection {
	product: MerchProduct;
	color: MerchColor;
	size: string;
	variantId: number;
	unitCents: number;
	/** "TEE|Black|M": stored in Stripe metadata and our order record. */
	sku: string;
	title: string;
}

/** Resolve a product/color/size choice, or null if it isn't for sale. */
export function merchSelection(key: string, colorName: string, size: string): MerchSelection | null {
	const product = merchProduct(key);
	const color = product?.colors.find((c) => c.name === colorName);
	const variantId = color?.variants[size];
	if (!product || !color || !variantId || !product.sizes.includes(size)) return null;
	return {
		product,
		color,
		size,
		variantId,
		unitCents: product.priceCents + (product.sizeUpchargeCents[size] ?? 0),
		sku: `${product.key}|${color.name}|${size}`,
		title: product.key === "MUG" ? product.name : `${product.name} — ${color.name}, ${size}`,
	};
}

export function merchFromSku(sku: string): MerchSelection | null {
	const [key, color, size] = sku.split("|");
	return key && color && size ? merchSelection(key, color, size) : null;
}

/** Shipping charged for `quantity` of one product. */
export function shippingCents(product: MerchProduct, quantity: number): number {
	return product.shipping.firstCents + product.shipping.additionalCents * Math.max(0, quantity - 1);
}

export const MAX_MERCH_QUANTITY = 10;
