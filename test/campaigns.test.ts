/** Holiday emails to the fan list: dry run, once-per-fan send, unsubscribe. Resend is mocked. */
import { env, fetchMock, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { Env } from "../src/lib/types";
import { CAMPAIGNS, SEND_WINDOW_MS, dueCampaigns, runCampaign, runDueCampaigns, unsubscribeUrl } from "../src/worker/campaigns";

const BASE = "https://example.com";
const sent: Array<{ to: string[]; subject: string; text: string; headers?: Record<string, string> }> = [];
const withEmail = (): Env => ({ ...env, RESEND_API_KEY: "re_test" }) as Env;

beforeAll(async () => {
	fetchMock.activate();
	fetchMock.disableNetConnect();
	fetchMock
		.get("https://api.resend.com")
		.intercept({ path: "/emails", method: "POST" })
		.reply((opts) => {
			sent.push(JSON.parse(String(opts.body)));
			return { statusCode: 200, data: JSON.stringify({ id: `em_${sent.length}` }) };
		})
		.persist();
	for (const [name, email] of [["Robin Lee", "robin@example.com"], ["Sam", "sam@example.com"], ["Kai", "kai@example.com"]]) {
		await env.VISIBILITY_CACHE.put(`fan:${email}`, JSON.stringify({ name, email, interest: "Everything", joinedAt: "2026-11-20T00:00:00Z", updatedAt: "2026-11-20T00:00:00Z" }));
	}
});

describe("holiday campaigns", () => {
	it("needs the admin token", async () => {
		const res = await SELF.fetch(`${BASE}/api/admin/squad/campaign?name=black-friday`, { method: "POST" });
		expect(res.status).toBe(401);
	});

	it("dry-runs by default: counts the list, shows a preview, sends nothing", async () => {
		const res = await SELF.fetch(`${BASE}/api/admin/squad/campaign?name=black-friday`, { method: "POST", headers: { Authorization: "Bearer test-token" } });
		const body = (await res.json()) as { mode: string; eligible: number; sent: number; preview: { subject: string; text: string } };
		expect(body.mode).toBe("dry-run");
		expect(body.eligible).toBe(3);
		expect(body.sent).toBe(0);
		expect(body.preview.text).toContain("/story-collection.html?utm_source=email&utm_campaign=black-friday");
		expect(body.preview.text).toContain("Unsubscribe:");
		expect(sent.length).toBe(0);
	});

	it("refuses an unknown campaign", async () => {
		const r = await runCampaign(withEmail(), "nope", {});
		expect(r.status).toBe(404);
	});

	it("sends each fan one copy with an unsubscribe header, and never twice", async () => {
		const first = await runCampaign(withEmail(), "black-friday", { send: true });
		expect(first.body).toMatchObject({ mode: "send", sent: 3, failed: 0 });
		const mine = sent.filter((m) => m.subject.includes("$61.99"));
		expect(mine.length).toBe(3);
		expect(mine[0].headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
		expect(mine.some((m) => m.text.startsWith("Hi Robin,"))).toBe(true);
		const again = await runCampaign(withEmail(), "black-friday", { send: true });
		expect(again.body).toMatchObject({ sent: 0, alreadySent: 3 });
	});

	it("sends no more than the limit per call, and the rest on the next call", async () => {
		const a = await runCampaign(withEmail(), "cyber-monday", { send: true, limit: 2 });
		expect(a.body).toMatchObject({ sent: 2, remaining: 1 });
		const b = await runCampaign(withEmail(), "cyber-monday", { send: true, limit: 2 });
		expect(b.body).toMatchObject({ sent: 1, alreadySent: 2, remaining: 0 });
	});

	it("unsubscribes with a valid link, skips that fan, and re-subscribes on a new sign-up", async () => {
		const url = (await unsubscribeUrl(env as Env, "sam@example.com"))!;
		const bad = await SELF.fetch(url.replace(/t=[0-9a-f]+/, "t=deadbeef").replace("https://squishman.com", BASE));
		expect(bad.status).toBe(400);
		const ok = await SELF.fetch(url.replace("https://squishman.com", BASE));
		expect(ok.status).toBe(200);
		expect(await ok.text()).toContain("unsubscribed. You won");
		const run = await runCampaign(withEmail(), "giving-tuesday", { send: true });
		expect(run.body).toMatchObject({ sent: 2, skippedUnsubscribed: 1 });
		await SELF.fetch(`${BASE}/api/squad/signup`, {
			method: "POST",
			headers: { "Content-Type": "application/json", "cf-connecting-ip": "192.0.2.44" },
			body: JSON.stringify({ name: "Sam", email: "sam@example.com", interest: "Everything" }),
		});
		expect(await env.VISIBILITY_CACHE.get("fan-unsub:sam@example.com")).toBeNull();
	});

	it("lists the campaigns with the list size", async () => {
		const res = await SELF.fetch(`${BASE}/api/admin/squad/campaigns`, { headers: { Authorization: "Bearer test-token" } });
		const body = (await res.json()) as { listSize: number; campaigns: Array<{ name: string }> };
		expect(body.listSize).toBe(3);
		expect(body.campaigns.map((c) => c.name)).toEqual(["black-friday", "small-business-saturday", "cyber-monday", "giving-tuesday"]);
	});

	it("schedules all four at their Eastern send times, each due only in its window", () => {
		expect(CAMPAIGNS.map((c) => [c.name, c.sendAtUtc])).toEqual([
			["black-friday", "2026-11-27T12:00:00Z"],
			["small-business-saturday", "2026-11-28T14:00:00Z"],
			["cyber-monday", "2026-11-30T23:00:00Z"],
			["giving-tuesday", "2026-12-01T15:00:00Z"],
		]);
		expect(dueCampaigns(new Date("2026-11-20T08:30:00Z"))).toEqual([]);
		expect(dueCampaigns(new Date("2026-11-27T11:59:59Z"))).toEqual([]);
		expect(dueCampaigns(new Date("2026-11-27T12:00:00Z")).map((c) => c.name)).toEqual(["black-friday"]);
		expect(dueCampaigns(new Date(Date.parse("2026-11-27T12:00:00Z") + SEND_WINDOW_MS - 1)).map((c) => c.name)).toEqual(["black-friday"]);
		expect(dueCampaigns(new Date(Date.parse("2026-11-27T12:00:00Z") + SEND_WINDOW_MS))).toEqual([]);
		// Cyber Monday's last call (6 PM) and Giving Tuesday (10 AM) never overlap.
		expect(dueCampaigns(new Date("2026-12-01T15:30:00Z")).map((c) => c.name)).toEqual(["giving-tuesday"]);
	});

	it("the cron sends a due campaign to the list once, and nothing outside its window", async () => {
		expect(await runDueCampaigns(withEmail(), new Date("2026-11-28T13:59:00Z"))).toEqual([]);
		const before = sent.length;
		const [first] = await runDueCampaigns(withEmail(), new Date("2026-11-28T14:05:00Z"));
		expect(first.campaign).toBe("small-business-saturday");
		expect(first.mode).toBe("send");
		expect(first.sent).toBe(first.eligible);
		expect(first.sent).toBeGreaterThan(0);
		expect(sent.length - before).toBe(first.sent);
		expect(sent.at(-1)?.subject).toBe("Shop small with Squish Man today 💛");
		const [again] = await runDueCampaigns(withEmail(), new Date("2026-11-28T14:10:00Z"));
		expect(again.sent).toBe(0);
		expect(again.alreadySent).toBe(first.sent);
	});
});
