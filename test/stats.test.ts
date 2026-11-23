import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { classifySource, cleanPath, parseUa } from "../src/stats/classify";
import { isDataCenter } from "../src/stats";

const BASE = "https://squishman.com";
const IPHONE_SAFARI =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IG_APP =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 356.0.0.24.92 (iPhone15,2; iOS 18_1; en_US)";
const WIN_CHROME =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function beacon(body: Record<string, unknown>, ua = IPHONE_SAFARI, origin = BASE, ip = "203.0.113.7") {
	return SELF.fetch(`${BASE}/api/mh`, {
		method: "POST",
		headers: { "content-type": "text/plain", origin, "user-agent": ua, "cf-connecting-ip": ip },
		body: JSON.stringify(body),
	});
}

describe("stats: classify", () => {
	it("reads browser, system and device", () => {
		expect(parseUa(IPHONE_SAFARI)).toMatchObject({ browser: "Safari", os: "iPhone (iOS)", device: "Phone", bot: false });
		expect(parseUa(WIN_CHROME)).toMatchObject({ browser: "Chrome", os: "Windows", device: "Desktop" });
		expect(parseUa(IG_APP)).toMatchObject({ browser: "Instagram app", app: "Instagram", device: "Phone" });
		expect(parseUa("Googlebot/2.1 (+http://www.google.com/bot.html)").bot).toBe(true);
		const ipadAsMac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
		expect(parseUa(ipadAsMac, true)).toMatchObject({ os: "iPad (iPadOS)", device: "Tablet" });
	});

	it("names where a visit came from", () => {
		const base = { refHost: "", utmSource: "", utmMedium: "", clickIds: [] as string[], app: null, siteHost: "squishman.com" };
		expect(classifySource({ ...base, refHost: "www.google.com" })).toBe("Google");
		expect(classifySource({ ...base, refHost: "l.instagram.com" })).toBe("Instagram");
		expect(classifySource({ ...base, refHost: "m.youtube.com" })).toBe("YouTube");
		expect(classifySource({ ...base, utmSource: "tiktok" })).toBe("TikTok");
		expect(classifySource({ ...base, app: "Instagram" })).toBe("Instagram");
		expect(classifySource({ ...base, clickIds: ["fbclid"] })).toBe("Facebook");
		expect(classifySource({ ...base, refHost: "squishman.com" })).toBe("Direct (typed or bookmarked)");
		expect(classifySource(base)).toBe("Direct (typed or bookmarked)");
		expect(classifySource({ ...base, refHost: "someblog.example" })).toBe("someblog.example");
	});

	it("tells cloud servers from people's internet", () => {
		expect(isDataCenter(16509, "AMAZON-02")).toBe(true);
		expect(isDataCenter(8075, "Microsoft Corporation")).toBe(true);
		expect(isDataCenter(99999, "DigitalOcean, LLC")).toBe(true);
		expect(isDataCenter(7922, "Comcast Cable Communications, LLC")).toBe(false);
		expect(isDataCenter(21928, "T-Mobile USA, Inc.")).toBe(false);
		expect(isDataCenter(6167, "Verizon Business")).toBe(false);
		expect(isDataCenter(undefined, undefined)).toBe(false);
	});

	it("keeps paths short", () => {
		expect(cleanPath("/product.html?book=book-1&utm_source=x&email=a@b.c")).toBe("/product?book=book-1");
		expect(cleanPath("/index.html")).toBe("/");
		expect(cleanPath("javascript:alert(1)")).toBe("/");
	});
});

describe("stats: beacon and private page", () => {
	it("records views and clicks, ignores bots, other sites and test hits, and reports them", async () => {
		const src = { r: "l.instagram.com", us: "instagram", um: "social", uc: "book1-nov23", ut: "reel", c: [] };
		expect((await beacon({ k: "view", p: "/", s: src, e: 1, lg: "en-US" })).status).toBe(204);
		await beacon({ k: "view", p: "/product.html?book=book-1", s: src, lg: "en-US" });
		await beacon({ k: "time", p: "/", s: src, t: 42 });
		await beacon({ k: "buy", p: "/product?book=book-1", s: src, l: "Book 1 · Paperback" });
		await beacon({ k: "view", p: "/", s: { r: "www.google.com" }, e: 1, rv: 1, lg: "es-US" }, WIN_CHROME, BASE, "198.51.100.9");
		// Not counted: bot, another site's origin, unknown kind, test hit.
		await beacon({ k: "view", p: "/", s: {} }, "Googlebot/2.1 (+http://www.google.com/bot.html)");
		await beacon({ k: "view", p: "/", s: {} }, WIN_CHROME, "https://evil.example");
		await beacon({ k: "hack", p: "/", s: {} });
		await beacon({ k: "view", p: "/", s: {}, x: 1 });

		const rows = await env.ORDERS_DB!.prepare("SELECT kind, source, browser, device, visitor FROM site_hits ORDER BY id").all();
		expect(rows.results.length).toBe(6); // 5 real + 1 test row (test rows are hidden from reports)
		expect(JSON.stringify(rows.results)).not.toContain("203.0.113.7");

		// A link checker on a cloud server: stored, but left out of every number.
		const today = (await env.ORDERS_DB!.prepare("SELECT day, hour, weekday FROM site_hits LIMIT 1").first<{ day: string; hour: number; weekday: string }>())!;
		await env.ORDERS_DB!.prepare(
			`INSERT INTO site_hits (ts, day, hour, weekday, kind, path, entry, repeat_visitor, secs, source, browser, os, device, city, visitor, test, asn, as_org, dc)
			 VALUES (?, ?, ?, ?, 'view', '/product?book=book-1', 1, 0, 0, 'Direct', 'Chrome', 'Windows', 'Desktop', 'Des Moines', 'cloudcheck0000000000', 0, 8075, 'Microsoft Corporation', 1)`,
		)
			.bind(Date.now(), today.day, today.hour, today.weekday)
			.run();

		const r = await SELF.fetch(`${BASE}/api/stats?d=7`, { headers: { authorization: "Bearer test-token" } });
		expect(r.status).toBe(200);
		const report = (await r.json()) as {
			totals: { visitors: number; views: number; buyClicks: number; avgSecondsPerVisitor: number; visits: number };
			automatedLeftOut: number;
			sources: { name: string; visitors: number; buys: number }[];
			campaigns: { campaign: string }[];
			browsers: { name: string }[];
			buys: { name: string }[];
			pages: { name: string }[];
			languages: { name: string }[];
		};
		expect(report.totals).toMatchObject({ visitors: 2, views: 3, buyClicks: 1, visits: 2, avgSecondsPerVisitor: 21 });
		expect(report.automatedLeftOut).toBe(1);
		expect(JSON.stringify(report)).not.toContain("Des Moines");
		expect(report.sources.find((s) => s.name === "Instagram")).toMatchObject({ visitors: 1, buys: 1 });
		expect(report.sources.find((s) => s.name === "Google")).toMatchObject({ visitors: 1 });
		expect(report.campaigns[0].campaign).toBe("book1-nov23");
		expect(report.browsers.map((b) => b.name).sort()).toEqual(["Chrome", "Safari"]);
		expect(report.buys[0].name).toBe("Book 1 · Paperback");
		expect(report.pages.map((p) => p.name)).toContain("/product?book=book-1");
		expect(report.languages.map((l) => l.name)).toContain("es-US");
	});

	it("keeps the stats page private", async () => {
		const noKey = await SELF.fetch(`${BASE}/stats`);
		expect(noKey.status).toBe(404);
		const wrong = await SELF.fetch(`${BASE}/stats?k=not-the-right-key-123`);
		expect(wrong.status).toBe(404);
		expect((await SELF.fetch(`${BASE}/api/stats?k=not-the-right-key-123`)).status).toBe(404);
		const ok = await SELF.fetch(`${BASE}/stats?k=test-token&d=30`);
		expect(ok.status).toBe(200);
		expect(ok.headers.get("x-robots-tag")).toContain("noindex");
		const html = await ok.text();
		expect(html).toContain("Squish Man visitors");
		expect(html).toContain("Where visitors came from");
	});

	it("escapes labels sent by a page", async () => {
		await beacon({ k: "buy", p: "/", s: {}, l: "<img src=x onerror=alert(1)>" });
		const html = await (await SELF.fetch(`${BASE}/stats?k=test-token`)).text();
		expect(html).not.toContain("<img src=x");
	});
});
