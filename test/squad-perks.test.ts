/**
 * Squish Squad phase 2 tests: order emails (with the eBook link), members'
 * shipping refunds, automatic birthday posters and monthly packs. Stripe,
 * Printful and Resend are mocked (fetchMock); nothing real is sent or charged.
 */
import { env, fetchMock, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hmacSha256, toHex } from "../src/fulfillment/crypto";
import { handleStripeWebhook } from "../src/fulfillment/service";
import { recordSquadMember, type SquadMember } from "../src/fulfillment/squad";
import {
	listPosters,
	listShippingRefunds,
	orderAmounts,
	parsePack,
	posterKey,
	runSquadDaily,
	savePack,
} from "../src/fulfillment/squad-perks";
import { nameFontSize, posterSvg } from "../src/fulfillment/squad-poster";
import type { Env } from "../src/lib/types";

const BASE = "https://example.com";
const WHSEC = "whsec_test_secret";
const BOOK1_PAPERBACK = "price_1UWsRI9cRroVv8pkLtEYUWcc";
const BOOK1_EBOOK = "price_1UNmnk9cRroVv8pkjzdKzEBB";

function testEnv(overrides: Partial<Env> = {}): Env {
	return {
		...env,
		FULFILLMENT_MODE: "sandbox",
		STRIPE_WEBHOOK_SECRET: WHSEC,
		STRIPE_SECRET_KEY: "rk_test_dummy",
		PRINTFUL_API_TOKEN: "pf-test-token",
		RESEND_API_KEY: "re_test_dummy",
		SQUAD_POSTERS: "on",
		SQUAD_SHIPPING_REFUNDS: "on",
		...overrides,
	};
}

// --- Mocks --------------------------------------------------------------------

function headerOf(headers: unknown, name: string): string {
	const h = new Headers(headers as HeadersInit);
	return h.get(name) ?? "";
}

const sessions = new Map<string, Record<string, unknown>>();
const subscriptions = new Map<string, string>();
const emails: Array<Record<string, unknown> & { idempotency: string }> = [];
const refunds: Array<{ body: URLSearchParams; key: string }> = [];
const printful = { creates: 0, lastCreate: null as Record<string, unknown> | null, lastConfirm: "", orders: new Map<string, unknown>() };

beforeAll(() => {
	fetchMock.activate();
	fetchMock.disableNetConnect();
	const stripe = fetchMock.get("https://api.stripe.com");
	stripe
		.intercept({ path: (p) => p.startsWith("/v1/checkout/sessions/"), method: "GET" })
		.reply((opts) => {
			const id = decodeURIComponent(String(opts.path).split("/")[4].split("?")[0]);
			const s = sessions.get(id);
			return s ? { statusCode: 200, data: JSON.stringify(s) } : { statusCode: 404, data: "{}" };
		})
		.persist();
	stripe
		.intercept({ path: (p) => p.startsWith("/v1/subscriptions/"), method: "GET" })
		.reply((opts) => {
			const id = String(opts.path).split("/")[3];
			const status = subscriptions.get(id);
			return status
				? { statusCode: 200, data: JSON.stringify({ id, object: "subscription", status }) }
				: { statusCode: 404, data: "{}" };
		})
		.persist();
	stripe
		.intercept({ path: "/v1/refunds", method: "POST" })
		.reply((opts) => {
			const body = new URLSearchParams(String(opts.body));
			const key = headerOf(opts.headers, "idempotency-key");
			refunds.push({ body, key });
			return { statusCode: 200, data: JSON.stringify({ id: `re_${refunds.length}`, status: "succeeded", amount: Number(body.get("amount")) }) };
		})
		.persist();
	fetchMock
		.get("https://api.resend.com")
		.intercept({ path: "/emails", method: "POST" })
		.reply((opts) => {
			const key = headerOf(opts.headers, "idempotency-key");
			emails.push({ ...JSON.parse(String(opts.body)), idempotency: key });
			return { statusCode: 200, data: JSON.stringify({ id: `email_${emails.length}` }) };
		})
		.persist();
	const pf = fetchMock.get("https://api.printful.com");
	pf.intercept({ path: (p) => p.startsWith("/orders/@"), method: "GET" })
		.reply((opts) => {
			const ext = decodeURIComponent(String(opts.path).slice("/orders/@".length));
			const o = printful.orders.get(ext);
			return o
				? { statusCode: 200, data: JSON.stringify({ code: 200, result: o }) }
				: { statusCode: 404, data: JSON.stringify({ code: 404, result: "Not found" }) };
		})
		.persist();
	pf.intercept({ path: (p) => p.startsWith("/orders?confirm="), method: "POST" })
		.reply((opts) => {
			printful.creates++;
			printful.lastConfirm = String(opts.path).split("=")[1];
			printful.lastCreate = JSON.parse(String(opts.body));
			const ext = (printful.lastCreate as { external_id: string }).external_id;
			const order = { id: 9000 + printful.creates, external_id: ext, status: printful.lastConfirm === "true" ? "pending" : "draft" };
			printful.orders.set(ext, order);
			return { statusCode: 200, data: JSON.stringify({ code: 200, result: order }) };
		})
		.persist();
});

beforeEach(() => {
	emails.length = 0;
	refunds.length = 0;
	printful.creates = 0;
	printful.lastCreate = null;
});

function order(
	id: string,
	{
		items = [{ price: BOOK1_PAPERBACK, quantity: 2 }],
		email = "Parent@Example.com",
		subtotal = 2998,
		shipping = 599,
	}: { items?: Array<{ price: string; quantity: number }>; email?: string; subtotal?: number; shipping?: number } = {},
) {
	sessions.set(id, {
		id,
		object: "checkout.session",
		livemode: false,
		payment_status: "paid",
		status: "complete",
		payment_intent: `pi_${id}`,
		customer_details: { email, name: "Pat Parent", phone: null },
		collected_information: {
			shipping_details: {
				name: "Pat Parent",
				address: { line1: "100 Maple St", line2: null, city: "Austin", state: "TX", postal_code: "78701", country: "US" },
			},
		},
		line_items: { data: items.map((i) => ({ quantity: i.quantity, price: { id: i.price } })), has_more: false },
		amount_subtotal: subtotal,
		total_details: { amount_discount: 0, amount_shipping: shipping, amount_tax: 0 },
		shipping_cost: shipping ? { amount_total: shipping } : null,
		metadata: {},
	});
	return id;
}

async function deliver(e: Env, sessionId: string) {
	const body = JSON.stringify({
		id: `evt_${sessionId}`,
		type: "checkout.session.completed",
		livemode: false,
		data: { object: { id: sessionId, object: "checkout.session" } },
	});
	const t = Math.floor(Date.now() / 1000);
	const sig = toHex(await hmacSha256(WHSEC, `${t}.${body}`));
	const r = await handleStripeWebhook(e, body, `t=${t},v1=${sig}`);
	await r.background;
	return r;
}

function member(id: string, overrides: Partial<SquadMember> = {}): SquadMember {
	return {
		sessionId: id,
		subscriptionId: `sub_${id}`,
		plan: "yearly",
		childName: "Maya",
		nameConfirmed: true,
		birthMonth: 12,
		email: "parent@example.com",
		shipping: { name: "Pat Parent", line1: "100 Maple St", line2: null, city: "Austin", state: "TX", postalCode: "78701", country: "US" },
		joinedAt: "2026-11-01T12:00:00.000Z",
		livemode: false,
		...overrides,
	};
}

// --- Order email ------------------------------------------------------------------

describe("order email", () => {
	it("includes the eBook download link, and is sent once per order", async () => {
		const e = testEnv();
		order("cs_test_ebookmail", { items: [{ price: BOOK1_EBOOK, quantity: 1 }], email: "reader@example.com", shipping: 0, subtotal: 499 });
		await deliver(e, "cs_test_ebookmail");
		expect(emails).toHaveLength(1);
		const m = emails[0];
		expect(m.to).toEqual(["reader@example.com"]);
		expect(m.from).toBe("Squish Man <orders@squishman.com>");
		expect(m.subject).toBe("Your Squish Man eBook is ready 🐾");
		expect(m.html).toContain("https://squishman.com/api/ebook-download?session_id=cs_test_ebookmail");
		expect(m.text).toContain("https://squishman.com/api/ebook-download?session_id=cs_test_ebookmail");
		expect(m.html).toContain("The Missing Puppy Parade");
		expect(m.idempotency).toBe("order:cs_test_ebookmail");
		// Redelivery: no second email.
		await deliver(e, "cs_test_ebookmail");
		expect(emails).toHaveLength(1);
	});

	it("is skipped (not failed) without a Resend key", async () => {
		order("cs_test_nokey", { items: [{ price: BOOK1_EBOOK, quantity: 1 }], shipping: 0 });
		const r = await deliver(testEnv({ RESEND_API_KEY: undefined }), "cs_test_nokey");
		expect(r.status).toBe(200);
		expect(emails).toHaveLength(0);
	});
});

// --- Shipping refunds ---------------------------------------------------------

describe("member shipping refunds", () => {
	it("refunds $5.99 shipping on a member's $25+ book order (email matched case-insensitively)", async () => {
		const e = testEnv();
		await recordSquadMember(e, member("cs_test_refundmember"));
		subscriptions.set("sub_cs_test_refundmember", "active");
		order("cs_test_bookorder1");
		await deliver(e, "cs_test_bookorder1");
		expect(refunds).toHaveLength(1);
		expect(refunds[0].body.get("payment_intent")).toBe("pi_cs_test_bookorder1");
		expect(refunds[0].body.get("amount")).toBe("599");
		expect(refunds[0].key).toBe("squad-shipping-refund-cs_test_bookorder1");
		const rec = (await listShippingRefunds(e)).find((r) => r.sessionId === "cs_test_bookorder1");
		expect(rec).toMatchObject({ status: "REFUNDED", amountCents: 599, memberSessionId: "cs_test_refundmember" });
		// The order email mentions the perk.
		expect(emails[0].html).toContain("we refunded your $5.99 shipping");
	});

	it("never refunds more than $5.99, nor non-members, small orders or ended memberships", async () => {
		const e = testEnv();
		await recordSquadMember(e, member("cs_test_refundm2", { email: "fam@example.com" }));
		subscriptions.set("sub_cs_test_refundm2", "active");
		order("cs_test_bigship", { email: "fam@example.com", shipping: 899 });
		await deliver(e, "cs_test_bigship");
		expect(refunds.map((r) => r.body.get("amount"))).toEqual(["599"]);

		order("cs_test_small", { email: "fam@example.com", subtotal: 1499 });
		await deliver(e, "cs_test_small");
		order("cs_test_stranger", { email: "someone@example.com" });
		await deliver(e, "cs_test_stranger");
		await recordSquadMember(e, member("cs_test_refundm3", { email: "gone@example.com" }));
		subscriptions.set("sub_cs_test_refundm3", "canceled");
		order("cs_test_gone", { email: "gone@example.com" });
		await deliver(e, "cs_test_gone");
		expect(refunds).toHaveLength(1);
		const all = await listShippingRefunds(e);
		expect(all.find((r) => r.sessionId === "cs_test_small")?.detail).toBe("ORDER_UNDER_MINIMUM:1499");
		expect(all.find((r) => r.sessionId === "cs_test_gone")?.detail).toBe("MEMBERSHIP_NOT_ACTIVE:canceled");
		expect(all.find((r) => r.sessionId === "cs_test_stranger")).toBeUndefined();
	});

	it("does nothing when refunds are switched off", async () => {
		const e = testEnv({ SQUAD_SHIPPING_REFUNDS: "off" });
		await recordSquadMember(e, member("cs_test_refundoff", { email: "off@example.com" }));
		subscriptions.set("sub_cs_test_refundoff", "active");
		order("cs_test_offorder", { email: "off@example.com" });
		await deliver(e, "cs_test_offorder");
		expect(refunds).toHaveLength(0);
	});

	it("works out the book subtotal after discounts", () => {
		expect(
			orderAmounts({
				amount_subtotal: 3000,
				total_details: { amount_discount: 600 },
				shipping_cost: { amount_total: 599 },
			} as never),
		).toEqual({ booksCents: 2400, shippingCents: 599 });
	});
});

// --- Birthday posters ---------------------------------------------------------

describe("birthday posters", () => {
	const NOW = new Date("2026-11-20T15:00:00Z"); // December posters are due from Nov 17.

	it("orders a personalized poster from Printful once, and emails the parent", async () => {
		const e = testEnv();
		await recordSquadMember(e, member("cs_test_posterdue"));
		subscriptions.set("sub_cs_test_posterdue", "active");
		const summary = await runSquadDaily(e, "sandbox", NOW, { force: true });
		expect(summary.posters.ORDERED).toBeGreaterThanOrEqual(1);
		expect(printful.creates).toBe(1);
		// Test-mode members are only ever Printful drafts.
		expect(printful.lastConfirm).toBe("false");
		const item = (printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0];
		expect(item.variant_id).toBe(4463);
		const url = (item.files as Array<{ type: string; url: string }>)[0].url;
		expect(url).toMatch(/^https:\/\/squishman\.com\/api\/squad\/poster-art\/[0-9a-f]{36}\.png$/);
		expect((printful.lastCreate as { recipient: Record<string, string> }).recipient).toMatchObject({
			name: "Pat Parent",
			state_code: "TX",
			country_code: "US",
		});

		const rec = (await listPosters(e)).find((p) => p.memberSessionId === "cs_test_posterdue");
		expect(rec).toMatchObject({ status: "ORDERED", year: 2026, childName: "Maya", printfulOrderId: 9001 });
		expect(emails.some((m) => String(m.subject).includes("Maya's Squish Squad birthday poster"))).toBe(true);

		// The art Printful downloads is a PNG served by the Worker.
		const res = await SELF.fetch(new URL(url).pathname.replace(/^/, BASE));
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/png");
		const bytes = new Uint8Array(await res.arrayBuffer());
		expect([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
		expect((await SELF.fetch(`${BASE}/api/squad/poster-art/${"0".repeat(36)}.png`)).status).toBe(404);

		// Re-running never orders a second poster.
		await runSquadDaily(e, "sandbox", NOW, { force: true });
		expect(printful.creates).toBe(1);
	});

	it("holds posters until the name is confirmed, and skips ineligible members", async () => {
		const e = testEnv();
		await recordSquadMember(e, member("cs_test_postertypo", { nameConfirmed: false, childName: "Mya" }));
		await recordSquadMember(e, member("cs_test_posternew", { plan: "monthly" }));
		await recordSquadMember(e, member("cs_test_posterlater", { birthMonth: 6 }));
		subscriptions.set("sub_cs_test_postertypo", "active");
		subscriptions.set("sub_cs_test_posternew", "active");
		subscriptions.set("sub_cs_test_posterlater", "active");
		await runSquadDaily(e, "sandbox", NOW, { force: true });
		expect(printful.creates).toBe(0);
		const typo = JSON.parse((await e.VISIBILITY_CACHE.get(posterKey("cs_test_postertypo", 2026))) ?? "{}");
		expect(typo.status).toBe("HELD");
		expect(typo.detail).toMatch(/^NAME_UNCONFIRMED/);
		// A monthly member 3 weeks in, and a June birthday: nothing yet.
		expect(await e.VISIBILITY_CACHE.get(posterKey("cs_test_posternew", 2026))).toBeNull();
		expect(await e.VISIBILITY_CACHE.get(posterKey("cs_test_posterlater", 2027))).toBeNull();
	});

	it("skips canceled memberships and live members outside production", async () => {
		const e = testEnv();
		await recordSquadMember(e, member("cs_test_postercancel"));
		subscriptions.set("sub_cs_test_postercancel", "canceled");
		await recordSquadMember(e, member("cs_live_posterlive", { livemode: true }));
		await runSquadDaily(e, "sandbox", NOW, { force: true });
		expect(printful.creates).toBe(0);
		expect(JSON.parse((await e.VISIBILITY_CACHE.get(posterKey("cs_test_postercancel", 2026))) ?? "{}")).toMatchObject({
			status: "SKIPPED",
			detail: "MEMBERSHIP_CANCELED",
		});
		expect(JSON.parse((await e.VISIBILITY_CACHE.get(posterKey("cs_live_posterlive", 2026))) ?? "{}").detail).toBe(
			"LIVE_MEMBER_OUTSIDE_PRODUCTION",
		);
	});

	it("only runs once a day, after 14:00 UTC, unless forced", async () => {
		const e = testEnv();
		expect((await runSquadDaily(e, "sandbox", new Date("2026-11-21T09:00:00Z"))).ran).toBe(false);
		expect((await runSquadDaily(e, "sandbox", new Date("2026-11-21T15:00:00Z"))).ran).toBe(true);
		expect((await runSquadDaily(e, "sandbox", new Date("2026-11-21T16:00:00Z"))).ran).toBe(false);
	});

	it("fits long names on the poster and escapes them", () => {
		expect(nameFontSize("Ava")).toBe(380);
		expect(nameFontSize("Maximiliana-Rose")).toBeLessThan(140 + 1 + 100);
		const svg = posterSvg("O'Brien", "data:image/png;base64,");
		expect(svg).toContain("O&apos;Brien!");
		expect(svg).toContain("Happy");
	});
});

// --- Monthly packs -----------------------------------------------------------

describe("Squish Squad packs", () => {
	const PACK = {
		subject: "Your November Squish Squad Pack 🍂",
		heading: "Autumn in Maple Hollow",
		intro: "Here are this month's coloring and activity pages.",
		items: [{ title: "Leaf-pile coloring page", url: "https://drive.google.com/file/d/abc/view" }],
		published: true,
	};

	it("validates packs", () => {
		expect(() => parsePack("2026-13", PACK)).toThrow("YYYY-MM");
		expect(() => parsePack("2026-11", { ...PACK, items: [] })).toThrow("items");
		expect(() => parsePack("2026-11", { ...PACK, items: [{ title: "x", url: "http://insecure" }] })).toThrow("https");
		expect(parsePack("2026-11", PACK)).toMatchObject({ month: "2026-11", published: true });
	});

	it("emails the published pack once to each active member", async () => {
		const e = testEnv();
		await recordSquadMember(e, member("cs_test_packa", { email: "a@example.com", childName: "Leo", birthMonth: 7 }));
		await recordSquadMember(e, member("cs_test_packb", { email: "b@example.com", birthMonth: 7 }));
		subscriptions.set("sub_cs_test_packa", "active");
		subscriptions.set("sub_cs_test_packb", "past_due");
		await savePack(e, parsePack("2026-12", PACK));
		await runSquadDaily(e, "sandbox", new Date("2026-12-01T15:00:00Z"), { force: true });
		const packs = emails.filter((m) => m.subject === PACK.subject);
		expect(packs.map((m) => m.to)).toEqual([["a@example.com"]]);
		expect(packs[0].from).toBe("Squish Squad <squad@squishman.com>");
		expect(packs[0].html).toContain("Hi Leo!");
		expect(packs[0].html).toContain("https://drive.google.com/file/d/abc/view");
		expect((packs[0].headers as Record<string, string>)["List-Unsubscribe"]).toContain("mailto:");
		await runSquadDaily(e, "sandbox", new Date("2026-12-02T15:00:00Z"), { force: true });
		expect(emails.filter((m) => m.subject === PACK.subject)).toHaveLength(1);
	});

	it("sends the built-in November pack with full squishman.com links", async () => {
		const e = testEnv();
		await recordSquadMember(e, member("cs_test_packnov", { email: "nov@example.com", childName: "Ava", birthMonth: 7 }));
		subscriptions.set("sub_cs_test_packnov", "active");
		await runSquadDaily(e, "sandbox", new Date("2026-11-03T15:00:00Z"), { force: true });
		const nov = emails.find((m) => (m.to as string[])[0] === "nov@example.com" && String(m.subject).includes("November"));
		expect(nov).toBeDefined();
		expect(nov!.html).toContain("Hi Ava!");
		expect(nov!.html).toContain("https://squishman.com/assets/squad-packs/2026-11/squish-squad-pack-november-2026.pdf");
		expect(nov!.html).toContain('src="https://squishman.com/assets/squad-packs/2026-11/email-hero.jpg"');
		expect(nov!.text).toContain("https://squishman.com/assets/squad-packs/2026-11/wallpaper-bridge-butterfly.jpg");
	});

	it("does not send drafts", async () => {
		const e = testEnv();
		await recordSquadMember(e, member("cs_test_packdraft", { email: "d@example.com", birthMonth: 7 }));
		subscriptions.set("sub_cs_test_packdraft", "active");
		await savePack(e, parsePack("2027-01", { ...PACK, subject: "Draft pack", published: false }));
		await runSquadDaily(e, "sandbox", new Date("2027-01-01T15:00:00Z"), { force: true });
		expect(emails.filter((m) => m.subject === "Draft pack")).toHaveLength(0);
	});
});

describe("admin routes", () => {
	it("require the admin token", async () => {
		for (const [method, path] of [
			["GET", "/api/admin/squad/posters"],
			["GET", "/api/admin/squad/refunds"],
			["GET", "/api/admin/squad/packs"],
			["PUT", "/api/admin/squad/packs/2026-11"],
			["POST", "/api/admin/squad/run"],
			["GET", "/api/admin/squad/poster-preview?name=Ava"],
		]) {
			expect((await SELF.fetch(`${BASE}${path}`, { method })).status).toBe(401);
		}
	});

	it("save a pack and confirm a child's name", async () => {
		const auth = { authorization: "Bearer test-token", "content-type": "application/json" };
		const put = await SELF.fetch(`${BASE}/api/admin/squad/packs/2026-11`, {
			method: "PUT",
			headers: auth,
			body: JSON.stringify({ subject: "s", heading: "h", intro: "i", items: [{ title: "t", url: "https://x.example/p.pdf" }] }),
		});
		expect(put.status).toBe(200);
		expect(await put.json()).toMatchObject({ month: "2026-11", published: false });
		const bad = await SELF.fetch(`${BASE}/api/admin/squad/packs/2026-11`, { method: "PUT", headers: auth, body: "{}" });
		expect(bad.status).toBe(400);

		await recordSquadMember(env, member("cs_test_confirm", { nameConfirmed: false, childName: "Mya" }));
		const ok = await SELF.fetch(`${BASE}/api/admin/squad/members/cs_test_confirm/confirm-name`, {
			method: "POST",
			headers: auth,
			body: JSON.stringify({ childName: "maya" }),
		});
		expect(await ok.json()).toMatchObject({ childName: "Maya", nameConfirmed: true });
	});
});
