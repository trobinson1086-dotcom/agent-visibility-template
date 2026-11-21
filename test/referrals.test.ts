/**
 * Buyer referral program tests. Stripe and Resend are mocked (fetchMock):
 * nothing here creates a real promotion code, sends an email or charges a card.
 */
import { env, fetchMock, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createBundleCheckout } from "../src/fulfillment/bundles";
import { hmacSha256, toHex } from "../src/fulfillment/crypto";
import {
	CODE_RE,
	checkCode,
	getCode,
	makeCode,
	normalizeEmail,
	rewardPage,
} from "../src/fulfillment/referrals";
import { handleStripeWebhook } from "../src/fulfillment/service";
import type { Env } from "../src/lib/types";

const WHSEC = "whsec_test_secret";
const BOOK1_EBOOK = "price_1UNmnk9cRroVv8pkjzdKzEBB";

function testEnv(overrides: Partial<Env> = {}): Env {
	return {
		...env,
		FULFILLMENT_MODE: "sandbox",
		STRIPE_WEBHOOK_SECRET: WHSEC,
		STRIPE_SECRET_KEY: "rk_test_dummy",
		RESEND_API_KEY: "re_test_dummy",
		REFERRALS: "on",
		REFERRAL_COUPON_ID: "coupon_friend15",
		...overrides,
	};
}

function headerOf(headers: unknown, name: string): string {
	return new Headers(headers as HeadersInit).get(name) ?? "";
}

const sessions = new Map<string, Record<string, unknown>>();
const emails: Array<Record<string, unknown> & { idempotency: string }> = [];
const promos: Array<{ body: URLSearchParams; version: string }> = [];
const checkouts: URLSearchParams[] = [];
/** Earlier paid sessions by email, for the "new buyer" check. */
const history = new Map<string, Array<Record<string, unknown>>>();

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
		.intercept({ path: (p) => p.startsWith("/v1/checkout/sessions?"), method: "GET" })
		.reply((opts) => {
			const q = new URL(`https://x${String(opts.path)}`).searchParams;
			const email = (q.get("customer_details[email]") ?? "").toLowerCase();
			return { statusCode: 200, data: JSON.stringify({ object: "list", data: history.get(email) ?? [], has_more: false }) };
		})
		.persist();
	stripe
		.intercept({ path: "/v1/promotion_codes", method: "POST" })
		.reply((opts) => {
			const body = new URLSearchParams(String(opts.body));
			promos.push({ body, version: headerOf(opts.headers, "stripe-version") });
			return { statusCode: 200, data: JSON.stringify({ id: `promo_${promos.length}`, code: body.get("code") }) };
		})
		.persist();
	stripe
		.intercept({ path: "/v1/checkout/sessions", method: "POST" })
		.reply((opts) => {
			checkouts.push(new URLSearchParams(String(opts.body)));
			return { statusCode: 200, data: JSON.stringify({ id: "cs_test_new", url: "https://checkout.stripe.com/c/pay/cs_test_new" }) };
		})
		.persist();
	fetchMock
		.get("https://api.resend.com")
		.intercept({ path: "/emails", method: "POST" })
		.reply((opts) => {
			emails.push({ ...JSON.parse(String(opts.body)), idempotency: headerOf(opts.headers, "idempotency-key") });
			return { statusCode: 200, data: JSON.stringify({ id: `email_${emails.length}` }) };
		})
		.persist();
});

beforeEach(() => {
	emails.length = 0;
	promos.length = 0;
	checkouts.length = 0;
	history.clear();
});

let clock = 1_790_000_000;
function order(
	id: string,
	{
		email = "pat@example.com",
		name = "Pat Parent",
		line1 = "100 Maple St",
		zip = "78701",
		promo = null as string | null,
	} = {},
) {
	sessions.set(id, {
		id,
		object: "checkout.session",
		livemode: false,
		payment_status: "paid",
		status: "complete",
		payment_intent: `pi_${id}`,
		created: clock++,
		customer_details: { email, name, phone: null },
		collected_information: {
			shipping_details: { name, address: { line1, line2: null, city: "Austin", state: "TX", postal_code: zip, country: "US" } },
		},
		line_items: { data: [{ quantity: 1, price: { id: BOOK1_EBOOK } }], has_more: false },
		amount_subtotal: 1499,
		total_details: { amount_discount: promo ? 225 : 0, amount_shipping: 0, amount_tax: 0 },
		discounts: promo ? [{ coupon: null, promotion_code: promo }] : [],
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

const rewardMails = () => emails.filter((m) => String(m.idempotency).startsWith("referral-reward:"));

/** A buyer who already has a code: returns their code and its promotion code id. */
async function buyer(e: Env, id = "cs_test_refOwner", opts: Parameters<typeof order>[1] = {}) {
	order(id, opts);
	await deliver(e, id);
	const sent = promos.at(-1)!;
	return { code: sent.body.get("code")!, promoId: `promo_${promos.length}` };
}

describe("referral helpers", () => {
	it("makes readable codes from the first name", () => {
		const code = makeCode("Meghan O'Neil", new Uint8Array([0, 1, 2, 3]));
		expect(code).toBe("SQUISHMEGHANABCD");
		expect(CODE_RE.test(code)).toBe(true);
		expect(makeCode("José", new Uint8Array([4, 5, 6, 7]))).toBe("SQUISHJOSEEFGH");
		expect(CODE_RE.test(makeCode(null))).toBe(true);
		expect(CODE_RE.test(makeCode("Bartholomew-Alexander"))).toBe(true);
	});

	it("treats Gmail dots and +tags as the same person", () => {
		expect(normalizeEmail("Pat.Parent+books@GoogleMail.com")).toBe("patparent@gmail.com");
		expect(normalizeEmail("pat.parent+x@example.com")).toBe("pat.parent@example.com");
	});
});

describe("referrals switched off (the default)", () => {
	it("creates no codes and leaves the order email as it was", async () => {
		const e = testEnv({ REFERRALS: undefined });
		order("cs_test_refOff");
		await deliver(e, "cs_test_refOff");
		expect(promos).toHaveLength(0);
		expect(emails).toHaveLength(1);
		expect(String(emails[0].html)).not.toContain("SQUISH");
		expect(await checkCode(e, "SQUISHPATABCD")).toEqual({ on: false, valid: false });
	});

	it("stays off without a coupon even if switched on", async () => {
		const e = testEnv({ REFERRAL_COUPON_ID: undefined });
		order("cs_test_refNocoupon");
		await deliver(e, "cs_test_refNocoupon");
		expect(promos).toHaveLength(0);
	});

	it("the check endpoint reports off on the live config", async () => {
		const r = await SELF.fetch("https://example.com/api/referral/check?code=SQUISHPATABCD");
		expect(await r.json()).toEqual({ on: false, valid: false });
	});
});

describe("buyer codes", () => {
	it("gives each buyer one code, with Stripe-side limits, in the order email", async () => {
		const e = testEnv();
		const { code } = await buyer(e);
		expect(promos).toHaveLength(1);
		const p = promos[0];
		expect(p.version).toBe("2025-09-30.clover");
		expect(p.body.get("promotion[coupon]")).toBe("coupon_friend15");
		expect(p.body.get("restrictions[first_time_transaction]")).toBe("true");
		expect(p.body.get("restrictions[minimum_amount]")).toBe("1200");
		expect(p.body.get("max_redemptions")).toBe("25");
		expect(code).toMatch(/^SQUISHPAT[A-HJ-NP-Z2-9]{4}$/);
		expect(emails).toHaveLength(1);
		expect(String(emails[0].html)).toContain(code);
		expect(String(emails[0].text)).toContain(`https://squishman.com/?ref=${code}`);
		expect(await checkCode(e, code)).toEqual({ on: true, valid: true, percentOff: 15 });
		expect(await checkCode(e, "SQUISHNOPEABCD")).toEqual({ on: true, valid: false });

		// A second order from the same buyer (Gmail-style variant too) reuses the code.
		order("cs_test_refOwner2", { email: "PAT@example.com" });
		await deliver(e, "cs_test_refOwner2");
		expect(promos).toHaveLength(1);
		expect(String(emails.at(-1)!.html)).toContain(code);
	});
});

describe("rewards", () => {
	it("emails the referrer a free coloring book once when a new friend orders", async () => {
		const e = testEnv();
		const { code, promoId } = await buyer(e);
		order("cs_test_refFriend", { email: "sam@example.com", name: "Sam Friend", line1: "9 Oak Ave", zip: "10001", promo: promoId });
		await deliver(e, "cs_test_refFriend");
		const rewards = rewardMails();
		expect(rewards).toHaveLength(1);
		expect(rewards[0].to).toEqual(["pat@example.com"]);
		expect(rewards[0].subject).toContain("free coloring book");
		const link = String(rewards[0].text).match(/https:\/\/squishman\.com\/api\/referral\/reward\?t=([0-9a-f]+)/);
		expect(link).not.toBeNull();
		const page = await rewardPage(e, link![1]);
		expect(page.status).toBe(200);
		expect(page.html).toContain("1_xinkvvCCiWYvZgKG1kZMYTGShnLXSPN");
		expect((await getCode(e, code))!.rewards).toBe(1);
		// The friend gets a code of their own too.
		expect(promos).toHaveLength(2);

		// Webhook redelivery: no second reward.
		await deliver(e, "cs_test_refFriend");
		expect(rewardMails()).toHaveLength(1);
		expect((await getCode(e, code))!.rewards).toBe(1);
		expect((await rewardPage(e, "0".repeat(36))).status).toBe(404);
	});

	it("does not reward using your own code", async () => {
		const e = testEnv({ });
		const { promoId } = await buyer(e, "cs_test_refSelfOwner", { email: "pat.parent@gmail.com" });
		order("cs_test_refSelf", { email: "patparent+again@gmail.com", line1: "1 Elm St", zip: "90210", promo: promoId });
		await deliver(e, "cs_test_refSelf");
		expect(rewardMails()).toHaveLength(0);
	});

	it("does not reward a second email at the referrer's address", async () => {
		const e = testEnv();
		const { promoId } = await buyer(e);
		order("cs_test_refHouse", { email: "pat.other@example.com", line1: "100 MAPLE ST.", zip: "78701-1234", promo: promoId });
		await deliver(e, "cs_test_refHouse");
		expect(rewardMails()).toHaveLength(0);
	});

	it("does not reward when the friend has bought before", async () => {
		const e = testEnv();
		const { promoId } = await buyer(e);
		history.set("lee@example.com", [{ id: "cs_old", payment_status: "paid", created: 1 }]);
		order("cs_test_refRepeat", { email: "lee@example.com", line1: "5 Pine Rd", zip: "02139", promo: promoId });
		await deliver(e, "cs_test_refRepeat");
		expect(rewardMails()).toHaveLength(0);
	});

	it("stops rewarding at the per-buyer cap", async () => {
		const e = testEnv({ REFERRAL_MAX_REWARDS: "1" });
		const { code, promoId } = await buyer(e);
		order("cs_test_refCap1", { email: "a1@example.com", line1: "1 A St", zip: "11111", promo: promoId });
		order("cs_test_refCap2", { email: "a2@example.com", line1: "2 B St", zip: "22222", promo: promoId });
		await deliver(e, "cs_test_refCap1");
		await deliver(e, "cs_test_refCap2");
		expect(rewardMails()).toHaveLength(1);
		expect((await getCode(e, code))!.rewards).toBe(1);
	});

	it("lists a printed copy to mail when the reward includes print", async () => {
		const e = testEnv({ REFERRAL_REWARD: "digital+print" });
		const { promoId } = await buyer(e);
		order("cs_test_refPrint", { email: "kim@example.com", line1: "7 Birch Ln", zip: "60601", promo: promoId });
		await deliver(e, "cs_test_refPrint");
		expect(String(rewardMails()[0].text)).toContain("printed copy");
	});
});

describe("collection checkout with a referral code", () => {
	it("applies the friend's code instead of the promo-code box", async () => {
		const e = testEnv();
		await createBundleCheckout(e, "EN-STORY-SET", "https://squishman.com", null, new Date("2026-11-21T12:00:00Z"), "promo_9");
		expect(checkouts[0].get("discounts[0][promotion_code]")).toBe("promo_9");
		expect(checkouts[0].has("allow_promotion_codes")).toBe(false);
		await createBundleCheckout(e, "EN-STORY-SET", "https://squishman.com", null, new Date("2026-11-21T12:00:00Z"));
		expect(checkouts[1].get("allow_promotion_codes")).toBe("true");
		expect(checkouts[1].has("discounts[0][promotion_code]")).toBe(false);
	});
});
