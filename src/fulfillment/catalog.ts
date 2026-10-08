import { CATALOG } from "./catalog.data";
import type { CatalogEntry, LuluMapping } from "./types";

export { CATALOG };

const BY_PRICE = new Map(CATALOG.map((e) => [e.stripePriceId, e]));
const BY_KEY = new Map(CATALOG.map((e) => [e.key, e]));

export function byPriceId(priceId: string): CatalogEntry | undefined {
	return BY_PRICE.get(priceId);
}

export function byKey(key: string): CatalogEntry | undefined {
	return BY_KEY.get(key);
}

/** The confirmed Lulu specs for an entry, or null if it is digital or unmapped. */
export function luluMapping(entry: CatalogEntry): LuluMapping | null {
	return entry.physical && entry.lulu && typeof entry.lulu === "object"
		? entry.lulu
		: null;
}

export interface PrintFiles {
	cover: string;
	interior: string;
}

/**
 * Cover/interior PDF URLs from the LULU_PRINT_FILES secret:
 * `{"EN-PAPERBACK-1": {"cover": "https://…", "interior": "https://…"}}`.
 */
export function printFiles(
	secret: string | undefined,
	key: string,
): PrintFiles | null {
	if (!secret) return null;
	try {
		const all = JSON.parse(secret) as Record<string, Partial<PrintFiles>>;
		const f = all[key];
		return f &&
			typeof f.cover === "string" &&
			typeof f.interior === "string" &&
			/^https:\/\//.test(f.cover) &&
			/^https:\/\//.test(f.interior)
			? { cover: f.cover, interior: f.interior }
			: null;
	} catch {
		return null;
	}
}
