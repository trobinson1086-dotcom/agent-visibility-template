import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import {
	GIVEAWAY,
	drawWinner,
	giveawayPage,
	giveawayPhase,
	giveawayRulesPage,
	handleGiveawayEntry,
	listEntries,
	type GiveawayCfg,
} from "../src/worker/giveaway";

const BASE = "https://example.com";
const ON: GiveawayCfg = { open: true, sponsorAddress: "Test Sponsor, 1 Main St, Town, CT 06000", startsAt: GIVEAWAY.startsAt, endsAt: GIVEAWAY.endsAt };
const DURING = Date.parse("2026-12-01T12:00:00-05:00");

describe("holiday giveaway", () => {
	it("ships switched off, with no sponsor address", () => {
		expect(GIVEAWAY.open).toBe(false);
		expect(giveawayPhase(DURING)).toBe("off");
	});

	it("stays hidden on the live routes while off", async () => {
		expect((await SELF.fetch(`${BASE}/giveaway`)).status).toBe(404);
		expect((await SELF.fetch(`${BASE}/giveaway-rules`)).status).toBe(404);
		const r = await SELF.fetch(`${BASE}/api/giveaway/enter`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "A", email: "a@example.com", state: "Connecticut", adult: "on" }),
		});
		expect(r.status).toBe(404);
	});

	it("needs both the go and a sponsor address to show", () => {
		expect(giveawayPhase(DURING, { ...ON, sponsorAddress: "" })).toBe("off");
		expect(giveawayPhase(DURING, { ...ON, open: false })).toBe("off");
		expect(giveawayPhase(Date.parse("2026-11-26T23:00:00-05:00"), ON)).toBe("soon");
		expect(giveawayPhase(DURING, ON)).toBe("open");
		expect(giveawayPhase(Date.parse("2026-12-14T00:00:01-05:00"), ON)).toBe("closed");
	});

	it("takes one entry per email from US adults and adds them to the fan list", async () => {
		const ok = await handleGiveawayEntry(env, { name: "Pat Parent", email: "Pat@Example.com", state: "Connecticut", adult: "on" }, "10.0.0.1", DURING, ON);
		expect(ok.status).toBe(200);
		const again = await handleGiveawayEntry(env, { name: "Pat Parent", email: "pat@example.com", state: "Connecticut", adult: "on" }, "10.0.0.2", DURING, ON);
		expect(again.status).toBe(200);
		const entries = (await listEntries(env)).filter((e) => e.email.toLowerCase() === "pat@example.com");
		expect(entries).toHaveLength(1);
		expect(await env.VISIBILITY_CACHE.get("fan:pat@example.com")).not.toBeNull();

		expect((await handleGiveawayEntry(env, { name: "X", email: "x@example.com", state: "Ontario", adult: "on" }, "10.0.0.3", DURING, ON)).body.error).toBe("US_ONLY");
		expect((await handleGiveawayEntry(env, { name: "X", email: "x@example.com", state: "Texas" }, "10.0.0.3", DURING, ON)).body.error).toBe("ADULTS_ONLY");
		expect((await handleGiveawayEntry(env, { name: "X", email: "x@example.com", state: "Texas", adult: "on" }, "10.0.0.3", Date.parse("2026-11-20T12:00:00Z"), ON)).body.error).toBe("NOT_OPEN_YET");
	});

	it("draws only after entries close, never the same person twice", async () => {
		await handleGiveawayEntry(env, { name: "Sam", email: "sam@example.com", state: "Ohio", adult: "on" }, "10.0.0.4", DURING, ON);
		await handleGiveawayEntry(env, { name: "Lee", email: "lee@example.com", state: "Iowa", adult: "on" }, "10.0.0.5", DURING, ON);
		expect((await drawWinner(env, DURING)).status).toBe(409);
		const after = Date.parse("2026-12-14T09:00:00-05:00");
		const first = (await drawWinner(env, after)).body as { draw: { email: string } };
		const second = (await drawWinner(env, after)).body as { draw: { email: string } };
		expect(first.draw.email).not.toBe(second.draw.email);
		expect((await drawWinner(env, after)).status).toBe(409);
	});

	it("pages carry the free-entry and platform lines", () => {
		const page = giveawayPage(DURING, ON);
		expect(page).toContain("No purchase necessary");
		expect(page).toContain("Entering adds you to Squish Squad emails");
		expect(page).toContain("in no way sponsored");
		expect(page).toContain("Missing Puppy Parade");
		expect(page).toContain("Coloring Book 1");
		expect(page).not.toContain("Story Collection</h1>");
		const rules = giveawayRulesPage(ON.sponsorAddress);
		expect(rules).toContain("NO PURCHASE NECESSARY");
		expect(rules).toContain(ON.sponsorAddress);
		expect(rules).toContain("18 or older");
	});
});
