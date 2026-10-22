/**
 * Squish Squad Shop merch fulfilled by Printful: the T-shirt, hoodie, long
 * sleeve and mug Travis approved (colors, prices and shipping as agreed on
 * 2026-10-21), each in five designs: the full design (Squish Man & Pudy on
 * the front, crown logo on the back), Squish Man & Pudy alone, the crown logo
 * alone, the Squish Man – Maple Hollow logo alone, or the Maple Hollow logo on
 * the front with the crown logo on the back.
 *
 * Variant ids come from Printful's catalog (products 71, 146, 57 and 19). File ids
 * are the artwork in the Printful file library, uploaded from the "Squishman
 * Merch" Drive folder; positions match the approved mockups.
 */

export type MerchKey = "TEE" | "HOODIE" | "LONGSLEEVE" | "TOTE" | "MUG" | "STICKER" | "POSTER" | "PUZZLE" | "BOTTLE" | "PILLOW" | "COLORPILLOW" | "LUMBAR" | "HAT" | "DADHAT" | "KIDSTEE" | "KIDSHOODIE";

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
	/** Per-size position, for products whose print area changes with size. */
	positionBySize?: Record<string, PrintfulPosition>;
	/** Per-color file ids, for products whose color is printed into the art. */
	fileIdByColor?: Record<string, number | null>;
}

export interface MerchColor {
	name: string;
	/** Swatch for the shop page. */
	hex: string;
	/** Printful catalog variant id by size (only the sizes this color comes in). */
	variants: Record<string, number>;
}

export type DesignKey =
	| "FULL"
	| "PUDY"
	| "LOGO"
	| "MAPLE"
	| "MAPLECROWN"
	// Sticker-only artwork (public/assets/merch/print/stickers/).
	| "MH_PALS"
	| "MH_HIGHFIVE"
	| "MH_WAVE"
	| "MH_SQUARE"
	| "SM_VALUES"
	| "SM_ROYAL"
	| "MH_SIGN"
	| "BEST_FRIENDS"
	// Hat-only embroidery designs.
	| "HAT_PAW"
	// Puzzle-only full-scene book art.
	| "PZ_WELCOME"
	| "PZ_ROYAL_HERO"
	| "PZ_PAW_PRINTS"
	| "PZ_GARDEN_GATE"
	| "PZ_GOODNIGHT"
	| "PZ_MOONLIGHT";

/** One artwork option for a product, with its own price and print files. */
export interface MerchDesign {
	key: DesignKey;
	/** Shown to customers, e.g. "Squish Man & Pudy (front + back)". */
	label: string;
	priceCents: number;
	files: MerchFile[];
	/** Printful item options sent with the order, e.g. embroidery thread colors. */
	printfulOptions?: Record<string, unknown>;
}

export interface MerchProduct {
	key: MerchKey;
	name: string;
	/**
	 * Five designs, default first: the full design, Squish Man & Pudy alone,
	 * the crown logo alone, the Maple Hollow logo alone, or the Maple Hollow
	 * logo with the crown logo on the back.
	 */
	designs: MerchDesign[];
	/** Added to the price for sizes Printful charges more for. */
	sizeUpchargeCents: Record<string, number>;
	/** Flat shipping charged at checkout: first item, then each additional one. */
	shipping: { firstCents: number; additionalCents: number };
	sizes: string[];
	colors: MerchColor[];
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
/** Squish Man – Maple Hollow logo (1774x887, public/assets/merch/print/). */
export const MAPLE_HOLLOW_FILE = 1090919465;
/** Mug wrap: Maple Hollow logo on one side, crown logo on the other (public/assets/merch/print/). */
export const MUG_WRAP_MAPLE_CROWN_FILE = 1090966931;
/** Squish Man & Pudy in Maple Hollow sticker art (public/assets/merch/print/stickers/). */
export const STICKER_FILES = {
	MH_PALS: 1091358905,
	MH_HIGHFIVE: 1091358914,
	MH_WAVE: 1091358916,
	MH_SQUARE: 1091358933,
	// Uploaded from the "Squishman Merch" Drive folder (files 08, 20, 24, 26).
	SM_VALUES: 1091547694,
	SM_ROYAL: 1091547742,
	MH_SIGN: 1091547777,
	BEST_FRIENDS: 1091547785,
} as const;

/**
 * Full-scene book art from the "Squish Man Puzzles" Drive folder, cropped to
 * the puzzle shape (public/assets/merch/print/scenes/). Printful rejects
 * negative crop offsets, so each scene is pre-cropped to fill the print area.
 */
export const PUZZLE_FILES = {
	PZ_WELCOME: 1092037835,
	PZ_ROYAL_HERO: 1092037885,
	PZ_PAW_PRINTS: 1092038035,
	PZ_GARDEN_GATE: 1092038104,
	PZ_GOODNIGHT: 1092038175,
	PZ_MOONLIGHT: 1092038213,
} as const;
/** The same scenes cropped to the 20x12 lumbar pillow (top-anchored where a crown is near the top). */
export const LUMBAR_FILES: Record<keyof typeof PUZZLE_FILES, number> = {
	PZ_WELCOME: 1092038261,
	PZ_ROYAL_HERO: 1092038311,
	PZ_PAW_PRINTS: 1092038368,
	PZ_GARDEN_GATE: 1092038433,
	PZ_GOODNIGHT: 1092038506,
	PZ_MOONLIGHT: 1092038644,
};

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
// Squish Man & Pudy alone, on the front (same placement as the full design).
const pudyFront = front;
// The crown logo alone, on the front.
const logoFront = (areaWidth: number, areaHeight: number, top: number): MerchFile => ({
	type: "front",
	fileId: BACK_CROWN_FILE,
	position: { area_width: areaWidth, area_height: areaHeight, width: 1366, height: 1152, top, left: (areaWidth - 1366) / 2 },
});

// The Maple Hollow logo alone, on the front, about 10.7 inches wide.
const mapleFront = (areaWidth: number, areaHeight: number, top: number): MerchFile => ({
	type: "front",
	fileId: MAPLE_HOLLOW_FILE,
	position: { area_width: areaWidth, area_height: areaHeight, width: 1600, height: 800, top, left: (areaWidth - 1600) / 2 },
});

// Tote placements inside its 1500x1500 print area.
const TOTE_AREA = { area_width: 1500, area_height: 1500 };
const toteBanner: MerchFile = {
	type: "front",
	fileId: FRONT_BANNER_FILE,
	position: { ...TOTE_AREA, width: 1226, height: 1283, top: 100, left: 137 },
};
const toteCrown = (type: "front" | "back"): MerchFile => ({
	type,
	fileId: BACK_CROWN_FILE,
	position: { ...TOTE_AREA, width: 1366, height: 1152, top: 174, left: 67 },
});
const toteMaple: MerchFile = {
	type: "front",
	fileId: MAPLE_HOLLOW_FILE,
	position: { ...TOTE_AREA, width: 1440, height: 720, top: 390, left: 30 },
};

// Front-only designs skip Printful's back-print charge, so they cost $3 less.
const designs = (
	fullCents: number,
	full: MerchFile[],
	pudy: MerchFile[],
	logo: MerchFile[],
	maple: MerchFile[],
	mapleCrown: MerchFile[],
): MerchDesign[] => [
	{ key: "FULL", label: "Squish Man & Pudy front, crown logo back", priceCents: fullCents, files: full },
	{ key: "PUDY", label: "Squish Man & Pudy only (front)", priceCents: fullCents - 300, files: pudy },
	{ key: "LOGO", label: "Crown logo only (front)", priceCents: fullCents - 300, files: logo },
	{ key: "MAPLE", label: "Maple Hollow logo only (front)", priceCents: fullCents - 300, files: maple },
	{ key: "MAPLECROWN", label: "Maple Hollow logo front, crown logo back", priceCents: fullCents, files: mapleCrown },
];

export const MERCH: MerchProduct[] = [
	{
		key: "TEE",
		name: "Squish Squad T-Shirt",
		designs: designs(
			2799,
			[front(1800, 2400, 150), back],
			[pudyFront(1800, 2400, 150)],
			[logoFront(1800, 2400, 150)],
			[mapleFront(1800, 2400, 150)],
			[mapleFront(1800, 2400, 150), back],
		),
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
		productionEnabled: false,
	},
	{
		key: "HOODIE",
		name: "Squish Squad Hoodie",
		designs: designs(
			4499,
			[front(2100, 2100, 100), back],
			[pudyFront(2100, 2100, 100)],
			[logoFront(2100, 2100, 100)],
			[mapleFront(2100, 2100, 100)],
			[mapleFront(2100, 2100, 100), back],
		),
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
		productionEnabled: false,
	},
	{
		key: "LONGSLEEVE",
		name: "Squish Squad Long Sleeve",
		designs: designs(
			3299,
			[front(1800, 2400, 150), back],
			[pudyFront(1800, 2400, 150)],
			[logoFront(1800, 2400, 150)],
			[mapleFront(1800, 2400, 150)],
			[mapleFront(1800, 2400, 150), back],
		),
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
		productionEnabled: false,
	},
	{
		// Econscious EC8000 organic cotton tote (Printful product 367): a
		// 1500x1500 (10 in) print area on each side.
		key: "TOTE",
		name: "Squish Squad Tote Bag",
		designs: designs(
			3299,
			[toteBanner, toteCrown("back")],
			[toteBanner],
			[toteCrown("front")],
			[toteMaple],
			[toteMaple, toteCrown("back")],
		),
		sizeUpchargeCents: {},
		shipping: { firstCents: 599, additionalCents: 249 },
		sizes: ["One size"],
		colors: [
			{ name: "Black", hex: "#111111", variants: { "One size": 10457 } },
			{ name: "Natural", hex: "#e9dcc3", variants: { "One size": 10458 } },
		],
		productionEnabled: false,
	},
	{
		key: "MUG",
		name: "Squish Squad Mug (11 oz)",
		// Full: one 2700x1050 wrap, banner on one side and crown logo on the
		// other (not uploaded yet, so those orders are held until it is).
		// Pudy / Logo: that artwork alone on one side.
		designs: [
			{ key: "FULL", label: "Squish Man & Pudy + crown logo", priceCents: 1599, files: [{ type: "default", fileId: null }] },
			{
				key: "PUDY",
				label: "Squish Man & Pudy only",
				priceCents: 1599,
				files: [
					{
						type: "default",
						fileId: FRONT_BANNER_FILE,
						position: { area_width: 2700, area_height: 1050, width: 908, height: 950, top: 50, left: 221 },
					},
				],
			},
			{
				key: "LOGO",
				label: "Crown logo only",
				priceCents: 1599,
				files: [
					{
						type: "default",
						fileId: BACK_CROWN_FILE,
						position: { area_width: 2700, area_height: 1050, width: 1100, height: 927, top: 61, left: 1475 },
					},
				],
			},
			{
				key: "MAPLE",
				label: "Maple Hollow logo only",
				priceCents: 1599,
				files: [
					{
						type: "default",
						fileId: MAPLE_HOLLOW_FILE,
						position: { area_width: 2700, area_height: 1050, width: 1250, height: 625, top: 212, left: 1400 },
					},
				],
			},
			{
				key: "MAPLECROWN",
				label: "Maple Hollow logo + crown logo",
				priceCents: 1599,
				files: [{ type: "default", fileId: MUG_WRAP_MAPLE_CROWN_FILE }],
			},
		],
		sizeUpchargeCents: {},
		shipping: { firstCents: 799, additionalCents: 399 },
		sizes: ["11 oz"],
		colors: [{ name: "White", hex: "#ffffff", variants: { "11 oz": 1320 } }],
		productionEnabled: false,
	},
];

// Kiss-cut stickers (Printful product 358) come in the three single-artwork
// designs. No position: Printful fits the artwork to each sticker size and
// cuts around its outline.
const sticker = (key: DesignKey, label: string, fileId: number): MerchDesign => ({
	key,
	label,
	priceCents: 499,
	files: [{ type: "default", fileId }],
});
MERCH.push({
	key: "STICKER",
	name: "Squish Squad Sticker",
	designs: [
		sticker("PUDY", "Squish Man & Pudy", FRONT_BANNER_FILE),
		sticker("LOGO", "Crown logo", BACK_CROWN_FILE),
		sticker("MAPLE", "Maple Hollow logo", MAPLE_HOLLOW_FILE),
		sticker("MH_PALS", "Squish Man & Pudy in Maple Hollow", STICKER_FILES.MH_PALS),
		sticker("MH_HIGHFIVE", "Squish Man & Pudy high five", STICKER_FILES.MH_HIGHFIVE),
		sticker("MH_WAVE", "Squish Man & Pudy waving", STICKER_FILES.MH_WAVE),
		sticker("MH_SQUARE", "Maple Hollow town square", STICKER_FILES.MH_SQUARE),
		sticker("SM_VALUES", "Squish Man values signpost", STICKER_FILES.SM_VALUES),
		sticker("SM_ROYAL", "Royal Squish Man", STICKER_FILES.SM_ROYAL),
		sticker("MH_SIGN", "Maple Hollow sign", STICKER_FILES.MH_SIGN),
		sticker("BEST_FRIENDS", "Best friends", STICKER_FILES.BEST_FRIENDS),
	],
	sizeUpchargeCents: { "4 in": 100, "5.5 in": 200 },
	// Printful ships any number of stickers for about the same price.
	shipping: { firstCents: 499, additionalCents: 25 },
	sizes: ["3 in", "4 in", "5.5 in"],
	colors: [{ name: "White", hex: "#ffffff", variants: { "3 in": 10163, "4 in": 10164, "5.5 in": 10165 } }],
	productionEnabled: false,
});

// Enhanced matte posters (Printful product 1): the art centered on white with
// a half-inch margin, sized to each poster's 300 DPI print area.
/** The art centered on each size's print area, inside a half-inch margin. */
function centeredBySize(
	areas: Record<string, [number, number]>,
	artWidth: number,
	artHeight: number,
): Record<string, PrintfulPosition> {
	return Object.fromEntries(
		Object.entries(areas).map(([size, [areaWidth, areaHeight]]) => {
			const scale = Math.min((areaWidth - 300) / artWidth, (areaHeight - 300) / artHeight);
			const width = Math.round(artWidth * scale);
			const height = Math.round(artHeight * scale);
			const position = {
				area_width: areaWidth,
				area_height: areaHeight,
				width,
				height,
				top: Math.floor((areaHeight - height) / 2),
				left: Math.floor((areaWidth - width) / 2),
			};
			return [size, position];
		}),
	);
}
const POSTER_AREAS: Record<string, [number, number]> = { "8×10 in": [3000, 2400], "10×10 in": [3000, 3000] };
const poster = (key: DesignKey, label: string, fileId: number, artWidth: number, artHeight: number): MerchDesign => ({
	key,
	label,
	priceCents: 1499,
	files: [{ type: "default", fileId, positionBySize: centeredBySize(POSTER_AREAS, artWidth, artHeight) }],
});
MERCH.push({
	key: "POSTER",
	name: "Squish Squad Poster",
	designs: [
		poster("MH_PALS", "Squish Man & Pudy in Maple Hollow", STICKER_FILES.MH_PALS, 1312, 1199),
		poster("MH_HIGHFIVE", "Squish Man & Pudy high five", STICKER_FILES.MH_HIGHFIVE, 1374, 1145),
		poster("MH_WAVE", "Squish Man & Pudy waving", STICKER_FILES.MH_WAVE, 1374, 1145),
		poster("MH_SQUARE", "Maple Hollow town square", STICKER_FILES.MH_SQUARE, 1536, 1024),
		poster("SM_VALUES", "Squish Man values signpost", STICKER_FILES.SM_VALUES, 1254, 1254),
		poster("BEST_FRIENDS", "Best friends", STICKER_FILES.BEST_FRIENDS, 1254, 1254),
		poster("SM_ROYAL", "Royal Squish Man", STICKER_FILES.SM_ROYAL, 1295, 1214),
		poster("MAPLE", "Maple Hollow logo", MAPLE_HOLLOW_FILE, 1774, 887),
	],
	sizeUpchargeCents: { "10×10 in": 200 },
	shipping: { firstCents: 599, additionalCents: 49 },
	sizes: ["8×10 in", "10×10 in"],
	colors: [{ name: "White", hex: "#ffffff", variants: { "8×10 in": 4463, "10×10 in": 6239 } }],
	productionEnabled: false,
});

// Jigsaw puzzles in a gift tin (Printful product 906): a book scene filling
// the whole puzzle. The 14x11 puzzle is a touch squarer, so its bottom edge
// loses about 1%.
const PUZZLE_FULL = { top: 0, left: 0 };
const puzzle = (key: keyof typeof PUZZLE_FILES, label: string): MerchDesign => ({
	key,
	label,
	priceCents: 2999,
	files: [
		{
			type: "front",
			fileId: PUZZLE_FILES[key],
			positionBySize: {
				"30 pcs": { area_width: 2953, area_height: 2350, width: 2953, height: 2350, ...PUZZLE_FULL },
				"110 pcs": { area_width: 2953, area_height: 2350, width: 2953, height: 2350, ...PUZZLE_FULL },
				"252 pcs": { area_width: 4200, area_height: 3300, width: 4200, height: 3342, ...PUZZLE_FULL },
			},
		},
	],
});
MERCH.push({
	key: "PUZZLE",
	name: "Maple Hollow Puzzle",
	designs: [
		puzzle("PZ_WELCOME", "Welcome to Maple Hollow"),
		puzzle("PZ_ROYAL_HERO", "The Little Royal Hero"),
		puzzle("PZ_PAW_PRINTS", "Follow the Paw Prints"),
		puzzle("PZ_GARDEN_GATE", "The Secret Garden Gate"),
		puzzle("PZ_GOODNIGHT", "Goodnight, Squish Man"),
		puzzle("PZ_MOONLIGHT", "Moonlight Over Maple Hollow"),
	],
	sizeUpchargeCents: { "252 pcs": 500 },
	shipping: { firstCents: 849, additionalCents: 249 },
	sizes: ["30 pcs", "110 pcs", "252 pcs"],
	colors: [{ name: "White", hex: "#ffffff", variants: { "30 pcs": 23246, "110 pcs": 23245, "252 pcs": 23247 } }],
	productionEnabled: false,
});

// Stainless steel water bottles (Printful product 382): one artwork on the
// front of the 2557x1582 wrap, kept 850 px wide so it stays on the side
// facing you instead of bending around the bottle.
const bottle = (key: DesignKey, label: string, fileId: number, artWidth: number, artHeight: number): MerchDesign => {
	const width = 850;
	const height = Math.round((artHeight * width) / artWidth);
	return {
		key,
		label,
		priceCents: 2999,
		files: [
			{
				type: "default",
				fileId,
				position: { area_width: 2557, area_height: 1582, width, height, top: Math.floor((1582 - height) / 2), left: 853 },
			},
		],
	};
};
MERCH.push({
	key: "BOTTLE",
	name: "Squish Squad Water Bottle",
	designs: [
		bottle("PUDY", "Squish Man & Pudy", FRONT_BANNER_FILE, 1226, 1283),
		bottle("LOGO", "Crown logo", BACK_CROWN_FILE, 1366, 1152),
		bottle("MAPLE", "Maple Hollow logo", MAPLE_HOLLOW_FILE, 1774, 887),
		bottle("MH_PALS", "Squish Man & Pudy in Maple Hollow", STICKER_FILES.MH_PALS, 1312, 1199),
		bottle("SM_ROYAL", "Royal Squish Man", STICKER_FILES.SM_ROYAL, 1295, 1214),
		bottle("BEST_FRIENDS", "Best friends", STICKER_FILES.BEST_FRIENDS, 1254, 1254),
	],
	sizeUpchargeCents: {},
	shipping: { firstCents: 1099, additionalCents: 449 },
	sizes: ["17 oz"],
	colors: [
		{ name: "White", hex: "#ffffff", variants: { "17 oz": 10798 } },
		{ name: "Black", hex: "#111111", variants: { "17 oz": 16030 } },
	],
	productionEnabled: false,
});

// Custom shaped pillows (Printful product 743): cut to the outline of the
// art, printed on the front with a white back. No position: Printful fits the
// artwork to each pillow size.
const pillow = (key: DesignKey, label: string, fileId: number): MerchDesign => ({
	key,
	label,
	priceCents: 2499,
	files: [{ type: "default", fileId }],
});
MERCH.push({
	key: "PILLOW",
	name: "Squish Squad Shaped Pillow",
	designs: [
		pillow("SM_ROYAL", "Royal Squish Man", STICKER_FILES.SM_ROYAL),
		pillow("BEST_FRIENDS", "Best friends", STICKER_FILES.BEST_FRIENDS),
		pillow("MH_PALS", "Squish Man & Pudy in Maple Hollow", STICKER_FILES.MH_PALS),
		pillow("MH_WAVE", "Squish Man & Pudy waving", STICKER_FILES.MH_WAVE),
		pillow("PUDY", "Squish Man & Pudy", FRONT_BANNER_FILE),
		pillow("SM_VALUES", "Squish Man values signpost", STICKER_FILES.SM_VALUES),
	],
	sizeUpchargeCents: { "16 in": 500 },
	shipping: { firstCents: 649, additionalCents: 159 },
	sizes: ["10 in", "16 in"],
	colors: [{ name: "White", hex: "#ffffff", variants: { "10 in": 19122, "16 in": 19123 } }],
	productionEnabled: false,
});

// Square color pillows (Printful product 83, all-over print): the art
// centered on a solid color on the front, the same color on the back. Each
// color has its own print files (public/assets/merch/print/pillows/).
const COLOR_PILLOW_FILES: Record<string, Partial<Record<DesignKey | "BACK", number>>> = {
	"Royal Blue": {
		SM_ROYAL: 1091680797,
		BEST_FRIENDS: 1091680805,
		MH_PALS: 1091680814,
		MH_WAVE: 1091680827,
		PUDY: 1091680847,
		SM_VALUES: 1091680855,
		BACK: 1091680863,
	},
	Pink: {
		SM_ROYAL: 1091705216,
		BEST_FRIENDS: 1091705234,
		MH_PALS: 1091705246,
		MH_WAVE: 1091705264,
		PUDY: 1091705275,
		SM_VALUES: 1091705282,
		BACK: 1091705289,
	},
	"Sky Blue": {
		SM_ROYAL: 1091714891,
		BEST_FRIENDS: 1091714896,
		MH_PALS: 1091714909,
		MH_WAVE: 1091714917,
		PUDY: 1091714921,
		SM_VALUES: 1091714932,
		BACK: 1091714937,
	},
	"Sunshine Yellow": {
		SM_ROYAL: 1091721980,
		BEST_FRIENDS: 1091721990,
		MH_PALS: 1091721999,
		MH_WAVE: 1091722002,
		PUDY: 1091722006,
		SM_VALUES: 1091722009,
		BACK: 1091722013,
	},
};
const colorPillow = (key: DesignKey, label: string): MerchDesign => ({
	key,
	label,
	priceCents: 2999,
	files: [
		{
			type: "front",
			fileId: null,
			fileIdByColor: Object.fromEntries(Object.entries(COLOR_PILLOW_FILES).map(([c, ids]) => [c, ids[key] ?? null])),
		},
		{
			type: "back",
			fileId: null,
			fileIdByColor: Object.fromEntries(Object.entries(COLOR_PILLOW_FILES).map(([c, ids]) => [c, ids.BACK ?? null])),
		},
	],
	// Printful requires a zipper and stitch color on its all-over pillows.
	printfulOptions: { stitch_color: "white" },
});
MERCH.push({
	key: "COLORPILLOW",
	name: "Squish Squad Color Pillow",
	designs: [
		colorPillow("SM_ROYAL", "Royal Squish Man"),
		colorPillow("BEST_FRIENDS", "Best friends"),
		colorPillow("MH_PALS", "Squish Man & Pudy in Maple Hollow"),
		colorPillow("MH_WAVE", "Squish Man & Pudy waving"),
		colorPillow("PUDY", "Squish Man & Pudy"),
		colorPillow("SM_VALUES", "Squish Man values signpost"),
	],
	sizeUpchargeCents: { "18 in": 500 },
	shipping: { firstCents: 1099, additionalCents: 449 },
	sizes: ["16 in", "18 in"],
	colors: [
		{ name: "Royal Blue", hex: "#1d4fa8", variants: { "16 in": 49854, "18 in": 4532 } },
		{ name: "Pink", hex: "#f4b6c7", variants: { "16 in": 49854, "18 in": 4532 } },
		{ name: "Sky Blue", hex: "#8fcbef", variants: { "16 in": 49854, "18 in": 4532 } },
		{ name: "Sunshine Yellow", hex: "#ffd54a", variants: { "16 in": 49854, "18 in": 4532 } },
	],
	productionEnabled: false,
});

// Storybook lumbar pillows (Printful product 83, 20x12): a scene, cropped to
// the pillow (LUMBAR_FILES), covering the front and back.
const LUMBAR_POSITION = { area_width: 3150, area_height: 1950, width: 3150, height: 1950, top: 0, left: 0 };
const lumbar = (key: keyof typeof PUZZLE_FILES, label: string): MerchDesign => ({
	key,
	label,
	priceCents: 3499,
	files: [
		{ type: "front", fileId: LUMBAR_FILES[key], position: LUMBAR_POSITION },
		{ type: "back", fileId: LUMBAR_FILES[key], position: LUMBAR_POSITION },
	],
	printfulOptions: { stitch_color: "white" },
});
MERCH.push({
	key: "LUMBAR",
	name: "Storybook Lumbar Pillow",
	designs: [
		lumbar("PZ_WELCOME", "Welcome to Maple Hollow"),
		lumbar("PZ_ROYAL_HERO", "The Little Royal Hero"),
		lumbar("PZ_PAW_PRINTS", "Follow the Paw Prints"),
		lumbar("PZ_GARDEN_GATE", "The Secret Garden Gate"),
		lumbar("PZ_GOODNIGHT", "Goodnight, Squish Man"),
		lumbar("PZ_MOONLIGHT", "Moonlight Over Maple Hollow"),
	],
	sizeUpchargeCents: {},
	shipping: { firstCents: 1099, additionalCents: 449 },
	sizes: ["20×12 in"],
	colors: [{ name: "White", hex: "#ffffff", variants: { "20×12 in": 9513 } }],
	productionEnabled: false,
});

// Embroidered youth caps (Printful product 429, Valucap VC300Y). Embroidery
// stitches flat thread colors, so each front is the picture simplified to at
// most six Printful threads (the youth cap's limit) (public/assets/merch/print/hats/), and every cap
// has the crown + SQUISHMAN logo embroidered on the back. Printful charges a
// one-time digitization fee the first time each design is ordered.
export const HAT_FILES = {
	CROWN_WORDMARK: 1091740166,
	PAW: 1091740758,
	SM_ROYAL: 1092034656,
	BEST_FRIENDS: 1092034703,
	MH_PALS: 1092034788,
	MH_HIGHFIVE: 1092034877,
};
const LOGO_THREADS = ["#FFCC00", "#A67843", "#005397", "#333366"];
const hatDesign = (
	key: DesignKey,
	label: string,
	fileId: number | null,
	width: number,
	height: number,
	threads: string[],
): MerchDesign => ({
	key,
	label,
	priceCents: 3099,
	files: [
		{
			type: "embroidery_front",
			fileId,
			position: {
				area_width: 1200,
				area_height: 525,
				width,
				height,
				top: Math.floor((525 - height) / 2),
				left: Math.floor((1200 - width) / 2),
			},
		},
		{
			type: "embroidery_back",
			fileId: HAT_FILES.CROWN_WORDMARK,
			position: { area_width: 600, area_height: 300, width: 589, height: 300, top: 0, left: 5 },
		},
	],
	printfulOptions: { thread_colors: threads, thread_colors_back: LOGO_THREADS },
});
const PICTURE_THREADS = ["#FFFFFF", "#FFCC00", "#005397", "#000000", "#660000", "#E25C27"];
MERCH.push({
	key: "HAT",
	name: "Squish Squad Youth Cap",
	designs: [
		hatDesign("SM_ROYAL", "Royal Squish Man", HAT_FILES.SM_ROYAL, 520, 525, [
			"#FFFFFF",
			"#96A1A8",
			"#FFCC00",
			"#005397",
			"#000000",
			"#E25C27",
		]),
		hatDesign("BEST_FRIENDS", "Best friends", HAT_FILES.BEST_FRIENDS, 552, 525, [
			"#FFFFFF",
			"#FFCC00",
			"#005397",
			"#000000",
			"#660000",
			"#A67843",
		]),
		hatDesign("MH_PALS", "Squish Man & Pudy in Maple Hollow", HAT_FILES.MH_PALS, 575, 525, PICTURE_THREADS),
		hatDesign("MH_HIGHFIVE", "Squish Man & Pudy high five", HAT_FILES.MH_HIGHFIVE, 639, 525, PICTURE_THREADS),
		hatDesign("HAT_PAW", "Paw print", HAT_FILES.PAW, 470, 450, ["#005397", "#333366"]),
	],
	sizeUpchargeCents: {},
	shipping: { firstCents: 499, additionalCents: 199 },
	sizes: ["Youth"],
	colors: [
		{ name: "White", hex: "#ffffff", variants: { Youth: 11457 } },
		{ name: "Black", hex: "#171717", variants: { Youth: 11456 } },
		{ name: "Light Pink", hex: "#ffdcdc", variants: { Youth: 11460 } },
		{ name: "Baby Blue", hex: "#96bbe5", variants: { Youth: 11459 } },
		{ name: "Khaki", hex: "#e3c7b1", variants: { Youth: 16509 } },
	],
	productionEnabled: false,
});

// Full-color dad hats (Printful product 206, Yupoong 6245CM, adjustable):
// the picture printed (DTF) on the front in full color. Printful can't mix
// printing and embroidery on one cap, so these have no back logo.
const dadHat = (key: DesignKey, label: string, fileId: number, width: number): MerchDesign => ({
	key,
	label,
	priceCents: 2499,
	files: [
		{
			type: "front_dtf_hat",
			fileId,
			position: { area_width: 1500, area_height: 600, width, height: 600, top: 0, left: Math.floor((1500 - width) / 2) },
		},
	],
});
MERCH.push({
	key: "DADHAT",
	name: "Squish Squad Full-Color Cap",
	designs: [
		dadHat("SM_ROYAL", "Royal Squish Man", STICKER_FILES.SM_ROYAL, 640),
		dadHat("BEST_FRIENDS", "Best friends", STICKER_FILES.BEST_FRIENDS, 600),
		dadHat("MH_PALS", "Squish Man & Pudy in Maple Hollow", STICKER_FILES.MH_PALS, 657),
		dadHat("MH_HIGHFIVE", "Squish Man & Pudy high five", STICKER_FILES.MH_HIGHFIVE, 720),
		dadHat("PUDY", "Squish Man & Pudy", FRONT_BANNER_FILE, 573),
	],
	sizeUpchargeCents: {},
	shipping: { firstCents: 499, additionalCents: 199 },
	sizes: ["Adult"],
	colors: [
		{ name: "White", hex: "#ffffff", variants: { Adult: 7853 } },
		{ name: "Black", hex: "#181717", variants: { Adult: 7854 } },
		{ name: "Pink", hex: "#fab2ba", variants: { Adult: 7858 } },
		{ name: "Light Blue", hex: "#b5cbda", variants: { Adult: 7856 } },
		{ name: "Khaki", hex: "#b49771", variants: { Adult: 7855 } },
	],
	productionEnabled: false,
});

// Kids' tees (Printful product 307, Bella + Canvas 3001Y, youth S-XL) in the
// same five designs as the adult tee, in lighter, brighter colors. The youth print area is
// 1500x1800, so the artwork sits at full size and the Maple Hollow logo is
// scaled to fit.
const YOUTH_AREA = { area_width: 1500, area_height: 1800 };
const youthBanner: MerchFile = {
	type: "front",
	fileId: FRONT_BANNER_FILE,
	position: { ...YOUTH_AREA, width: 1226, height: 1283, top: 100, left: 137 },
};
const youthCrown = (type: "front" | "back"): MerchFile => ({
	type,
	fileId: BACK_CROWN_FILE,
	position: { ...YOUTH_AREA, width: 1366, height: 1152, top: 100, left: 67 },
});
const youthMaple: MerchFile = {
	type: "front",
	fileId: MAPLE_HOLLOW_FILE,
	position: { ...YOUTH_AREA, width: 1400, height: 700, top: 100, left: 50 },
};
MERCH.push({
	key: "KIDSTEE",
	name: "Squish Squad Kids' T-Shirt",
	designs: designs(
		2699,
		[youthBanner, youthCrown("back")],
		[youthBanner],
		[youthCrown("front")],
		[youthMaple],
		[youthMaple, youthCrown("back")],
	),
	sizeUpchargeCents: {},
	shipping: { firstCents: 499, additionalCents: 199 },
	sizes: ["Youth S", "Youth M", "Youth L", "Youth XL"],
	// Lighter, brighter colors than the grown-up tee.
	colors: [
		{ name: "White", hex: "#ffffff", variants: { "Youth S": 9426, "Youth M": 9427, "Youth L": 9428, "Youth XL": 9429 } },
		{ name: "Pink", hex: "#ffcccf", variants: { "Youth S": 10616, "Youth M": 10617, "Youth L": 10618, "Youth XL": 10619 } },
		{ name: "Sky Blue", hex: "#6495ff", variants: { "Youth S": 10620, "Youth M": 10621, "Youth L": 10622, "Youth XL": 10623 } },
		{ name: "Sunshine Yellow", hex: "#e6a133", variants: { "Youth S": 17612, "Youth M": 17613, "Youth L": 17614, "Youth XL": 17615 } },
		{ name: "Kelly Green", hex: "#0e7b4e", variants: { "Youth S": 10628, "Youth M": 10629, "Youth L": 10630, "Youth XL": 10631 } },
		{ name: "Berry", hex: "#c02773", variants: { "Youth S": 11209, "Youth M": 11210, "Youth L": 11211, "Youth XL": 11212 } },
	],
	productionEnabled: false,
});

// Kids' hoodies (Printful product 1720, all-over print youth hoodie, sizes
// 8-20). The color is printed onto every panel, so they match the kids' tee
// colors exactly: each color has its own 4800x6000 panel files
// (public/assets/merch/print/kids-hoodie/) with the art on the chest or the
// crown logo on the back, and a solid file for the sleeves, pocket and hood.
type KidsHoodieArt = "solid" | "banner" | "crown" | "maple" | "back";
const KIDS_HOODIE_FILES: Record<string, Record<KidsHoodieArt, number>> = {
	"White": { solid: 1091797745, banner: 1091797751, crown: 1091797753, maple: 1091797755, back: 1091798398 },
	"Pink": { solid: 1091797760, banner: 1091797761, crown: 1091797766, maple: 1091797767, back: 1091798436 },
	"Sky Blue": { solid: 1091797770, banner: 1091797776, crown: 1091797778, maple: 1091797781, back: 1091798458 },
	"Sunshine Yellow": { solid: 1091797787, banner: 1091797791, crown: 1091797793, maple: 1091797795, back: 1091798502 },
	"Kelly Green": { solid: 1091797805, banner: 1091797808, crown: 1091797810, maple: 1091797813, back: 1091798545 },
	"Berry": { solid: 1091797821, banner: 1091797822, crown: 1091797824, maple: 1091797828, back: 1091798614 },
	"Royal Blue": { solid: 1091803547, banner: 1091803618, crown: 1091803693, maple: 1091803708, back: 1091803744 },
	"Lavender": { solid: 1091803785, banner: 1091803807, crown: 1091803855, maple: 1091803886, back: 1091803909 },
	"Mint Green": { solid: 1091803955, banner: 1091803996, crown: 1091804038, maple: 1091804091, back: 1091804122 },
};
const KIDS_HOODIE_SIZES = {
	"Youth 8": 54100,
	"Youth 10": 54101,
	"Youth 12": 54343,
	"Youth 14": 54102,
	"Youth 16": 54103,
	"Youth 18": 54104,
	"Youth 20": 54105,
};
const KIDS_HOODIE_PANEL = { area_width: 4800, area_height: 6000, width: 4800, height: 6000, top: 0, left: 0 };
const kidsHoodiePanel = (type: string, art: KidsHoodieArt): MerchFile => ({
	type,
	fileId: null,
	position: KIDS_HOODIE_PANEL,
	fileIdByColor: Object.fromEntries(Object.entries(KIDS_HOODIE_FILES).map(([color, files]) => [color, files[art]])),
});
const kidsHoodie = (key: DesignKey, label: string, front: KidsHoodieArt, back: boolean): MerchDesign => ({
	key,
	label,
	priceCents: 4999,
	files: [
		kidsHoodiePanel("front", front),
		kidsHoodiePanel("back", back ? "back" : "solid"),
		...["sleeve_right", "sleeve_left", "pocket", "hood", "label_panel"].map((type) => kidsHoodiePanel(type, "solid")),
	],
	// Printful requires a drawcord and stitch color on its all-over hoodies.
	printfulOptions: { stitch_color: "white" },
});
MERCH.push({
	key: "KIDSHOODIE",
	name: "Squish Squad Kids' Hoodie",
	designs: [
		kidsHoodie("FULL", "Squish Man & Pudy front, crown logo back", "banner", true),
		kidsHoodie("PUDY", "Squish Man & Pudy only (front)", "banner", false),
		kidsHoodie("LOGO", "Crown logo only (front)", "crown", false),
		kidsHoodie("MAPLE", "Maple Hollow logo only (front)", "maple", false),
		kidsHoodie("MAPLECROWN", "Maple Hollow logo front, crown logo back", "maple", true),
	],
	sizeUpchargeCents: {},
	shipping: { firstCents: 849, additionalCents: 259 },
	sizes: Object.keys(KIDS_HOODIE_SIZES),
	colors: [
		{ name: "White", hex: "#ffffff", variants: KIDS_HOODIE_SIZES },
		{ name: "Pink", hex: "#ffcccf", variants: KIDS_HOODIE_SIZES },
		{ name: "Sky Blue", hex: "#6495ff", variants: KIDS_HOODIE_SIZES },
		{ name: "Sunshine Yellow", hex: "#e6a133", variants: KIDS_HOODIE_SIZES },
		{ name: "Kelly Green", hex: "#0e7b4e", variants: KIDS_HOODIE_SIZES },
		{ name: "Berry", hex: "#c02773", variants: KIDS_HOODIE_SIZES },
		{ name: "Royal Blue", hex: "#1d4fa8", variants: KIDS_HOODIE_SIZES },
		{ name: "Lavender", hex: "#b9a3e3", variants: KIDS_HOODIE_SIZES },
		{ name: "Mint Green", hex: "#9fe3c9", variants: KIDS_HOODIE_SIZES },
	],
	productionEnabled: false,
});

const BY_KEY = new Map(MERCH.map((p) => [p.key, p]));

export function merchProduct(key: string): MerchProduct | undefined {
	return BY_KEY.get(key as MerchKey);
}

export interface MerchSelection {
	product: MerchProduct;
	design: MerchDesign;
	color: MerchColor;
	size: string;
	variantId: number;
	/** The design's print files, with per-color files resolved for this color. */
	files: MerchFile[];
	unitCents: number;
	/** "TEE|Black|M|LOGO": stored in Stripe metadata and our order record. */
	sku: string;
	title: string;
}

/** Resolve a product/color/size/design choice, or null if it isn't for sale. */
export function merchSelection(
	key: string,
	colorName: string,
	size: string,
	designKey = "FULL",
): MerchSelection | null {
	const product = merchProduct(key);
	const design = product?.designs.find((d) => d.key === designKey);
	const color = product?.colors.find((c) => c.name === colorName);
	const variantId = color?.variants[size];
	if (!product || !design || !color || !variantId || !product.sizes.includes(size)) return null;
	const name =
		design.key === "LOGO"
			? `${product.name}, Crown Logo`
			: design.key === "PUDY"
				? `${product.name}, Squish Man & Pudy`
				: design.key === "MAPLE"
					? `${product.name}, Maple Hollow Logo`
					: design.key === "MAPLECROWN"
						? `${product.name}, Maple Hollow + Crown`
						: design.key === "FULL"
							? product.name
							: `${product.name}, ${design.label}`;
	return {
		product,
		design,
		color,
		size,
		variantId,
		files: design.files.map((f) => (f.fileIdByColor ? { ...f, fileId: f.fileIdByColor[color.name] ?? null } : f)),
		unitCents: design.priceCents + (product.sizeUpchargeCents[size] ?? 0),
		sku: `${product.key}|${color.name}|${size}|${design.key}`,
		// Single-color products leave the color out of the title.
		title:
			product.colors.length > 1
				? `${name} — ${color.name}${product.sizes.length > 1 ? `, ${size}` : ""}`
				: product.sizes.length > 1
					? `${name} — ${size}`
					: name,
	};
}

/** SKUs from before designs existed ("TEE|Black|M") are the full design. */
export function merchFromSku(sku: string): MerchSelection | null {
	const [key, color, size, design = "FULL"] = sku.split("|");
	return key && color && size ? merchSelection(key, color, size, design) : null;
}

/** Shipping charged for `quantity` of one product. */
export function shippingCents(product: MerchProduct, quantity: number): number {
	return product.shipping.firstCents + product.shipping.additionalCents * Math.max(0, quantity - 1);
}

export const MAX_MERCH_QUANTITY = 10;
