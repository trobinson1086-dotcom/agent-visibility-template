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

export type MerchKey = "TEE" | "HOODIE" | "LONGSLEEVE" | "TOTE" | "MUG" | "STICKER" | "POSTER" | "PUZZLE" | "BOTTLE" | "PILLOW" | "COLORPILLOW";

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

/** Full-scene book art for puzzles, from the "Squish Man Puzzles" Drive folder. */
export const PUZZLE_FILES = {
	PZ_WELCOME: 1091600709,
	PZ_ROYAL_HERO: 1091600731,
	PZ_PAW_PRINTS: 1091600741,
	PZ_GARDEN_GATE: 1091600767,
	PZ_GOODNIGHT: 1091600776,
	PZ_MOONLIGHT: 1091600783,
} as const;

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
			2999,
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
			4999,
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
			{ key: "FULL", label: "Squish Man & Pudy + crown logo", priceCents: 1999, files: [{ type: "default", fileId: null }] },
			{
				key: "PUDY",
				label: "Squish Man & Pudy only",
				priceCents: 1799,
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
				priceCents: 1799,
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
				priceCents: 1799,
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
				priceCents: 1999,
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
/**
 * The art centered on each size's print area. "contain" fits it inside a
 * half-inch margin; "cover" fills the area edge to edge, cropping the overflow.
 */
function centeredBySize(
	areas: Record<string, [number, number]>,
	artWidth: number,
	artHeight: number,
	fit: "contain" | "cover",
): Record<string, PrintfulPosition> {
	return Object.fromEntries(
		Object.entries(areas).map(([size, [areaWidth, areaHeight]]) => {
			const scale =
				fit === "contain"
					? Math.min((areaWidth - 300) / artWidth, (areaHeight - 300) / artHeight)
					: Math.max(areaWidth / artWidth, areaHeight / artHeight);
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
	files: [{ type: "default", fileId, positionBySize: centeredBySize(POSTER_AREAS, artWidth, artHeight, "contain") }],
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

// Jigsaw puzzles in a gift tin (Printful product 906): full-scene book art
// filling the whole puzzle, cropped evenly on the long side.
const PUZZLE_AREAS: Record<string, [number, number]> = {
	"30 pcs": [2953, 2350],
	"110 pcs": [2953, 2350],
	"252 pcs": [4200, 3300],
};
const puzzle = (key: keyof typeof PUZZLE_FILES, label: string, artWidth: number, artHeight: number): MerchDesign => ({
	key,
	label,
	priceCents: 2999,
	files: [
		{ type: "front", fileId: PUZZLE_FILES[key], positionBySize: centeredBySize(PUZZLE_AREAS, artWidth, artHeight, "cover") },
	],
});
MERCH.push({
	key: "PUZZLE",
	name: "Maple Hollow Puzzle",
	designs: [
		puzzle("PZ_WELCOME", "Welcome to Maple Hollow", 1426, 1103),
		puzzle("PZ_ROYAL_HERO", "The Little Royal Hero", 1426, 1103),
		puzzle("PZ_PAW_PRINTS", "Follow the Paw Prints", 1536, 1024),
		puzzle("PZ_GARDEN_GATE", "The Secret Garden Gate", 1536, 1024),
		puzzle("PZ_GOODNIGHT", "Goodnight, Squish Man", 1402, 1122),
		puzzle("PZ_MOONLIGHT", "Moonlight Over Maple Hollow", 1402, 1122),
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
	colors: [{ name: "Royal Blue", hex: "#1d4fa8", variants: { "16 in": 49854, "18 in": 4532 } }],
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
						: product.name;
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
				? `${name} — ${color.name}, ${size}`
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
