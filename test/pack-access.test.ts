import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { packFileAllowed, packKey, signPack, signPackUrl } from "../src/fulfillment/pack-access";
import { BUILT_IN_PACKS } from "../src/fulfillment/squad-packs";
import type { Env } from "../src/lib/types";

const DEC_PDF = "/assets/squad-packs/2026-12/squish-squad-pack-december-2026.pdf";
const NOV_PDF = "/assets/squad-packs/2026-11/squish-squad-pack-november-2026.pdf";
const e = env as Env;

describe("Squish Squad Pack files are members-only", () => {
	it("refuses a December pack file without the key", async () => {
		const res = await SELF.fetch(`https://example.com${DEC_PDF}`);
		expect(res.status).toBe(403);
		expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
		expect(await res.text()).toContain("for members");
	});

	it("refuses a wrong key", async () => {
		const res = await SELF.fetch(`https://example.com${DEC_PDF}?k=not-the-key`);
		expect(res.status).toBe(403);
	});

	it("serves a December pack file with the month's key", async () => {
		const key = await packKey(e, "2026-12");
		const res = await SELF.fetch(`https://example.com${DEC_PDF}?k=${key}`);
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toContain("pdf");
		expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
	});

	it("does not let one month's key open another month", async () => {
		const key = await packKey(e, "2026-12");
		const res = await SELF.fetch(`https://example.com/assets/squad-packs/2027-01/squish-squad-pack-january-2027.pdf?k=${key}`);
		expect(res.status).toBe(403);
	});

	it("keeps November's already-emailed links working", async () => {
		const res = await SELF.fetch(`https://example.com${NOV_PDF}`);
		expect(res.status).toBe(200);
	});

	it("keys only this site's pack links", async () => {
		const key = await packKey(e, "2026-12");
		expect(await signPackUrl(e, DEC_PDF)).toBe(`${DEC_PDF}?k=${key}`);
		expect(await signPackUrl(e, `https://squishman.com${DEC_PDF}`)).toBe(`https://squishman.com${DEC_PDF}?k=${key}`);
		expect(await signPackUrl(e, NOV_PDF)).toBe(NOV_PDF);
		expect(await signPackUrl(e, "https://drive.google.com/file/d/abc/view")).toBe("https://drive.google.com/file/d/abc/view");
		expect(await packFileAllowed(e, "/assets/squad-packs/2026-12/../../index.html", key ?? "")).toBe(false);
	});

	it("keys every file of a built-in pack, header picture included", async () => {
		const signed = await signPack(e, BUILT_IN_PACKS["2027-01"]);
		const key = await packKey(e, "2027-01");
		for (const item of signed.items) expect(item.url).toContain(`?k=${key}`);
		expect(signed.heroImage).toContain(`?k=${key}`);
	});

	it("serves the files openly when no secret is set (local dev)", async () => {
		const bare = { ...e, SQUAD_PACK_SECRET: undefined, STRIPE_WEBHOOK_SECRET: undefined } as Env;
		expect(await packFileAllowed(bare, DEC_PDF, undefined)).toBe(true);
		expect(await signPackUrl(bare, DEC_PDF)).toBe(DEC_PDF);
	});
});
