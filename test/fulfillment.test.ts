/**
 * Stripe → Lulu fulfillment tests. Stripe and Lulu are mocked (fetchMock);
 * nothing here can reach a real API, create a print job or charge a card.
 */
import { env, fetchMock, SELF } from "cloudflare:test";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { byKey, byPriceId, CATALOG } from "../src/fulfillment/catalog";
import { hmacSha256, toHex } from "../src/fulfillment/crypto";
import {
	handleLuluWebhook,
	handleStripeWebhook,
	health,
	retry,
} from "../src/fulfillment/service";
import { BACK_CROWN_FILE, MERCH, merchProduct, merchSelection, MUG_WRAP_FULL_FILE, ORNAMENT_SNOWGLOBE_FILE, SQUISH_SQUAD_FILE } from "../src/fulfillment/merch";
import { ebookDownloadPage } from "../src/fulfillment/ebooks";
import { cleanChildName, listSquadMembers, nextPoster, squadWelcomePage, type SquadMember } from "../src/fulfillment/squad";
import { reconcile } from "../src/fulfillment/service";
import * as store from "../src/fulfillment/store";
import { verifyStripeSignature } from "../src/fulfillment/stripe";
import type { CatalogEntry } from "../src/fulfillment/types";
import type { Env } from "../src/lib/types";

const BASE = "https://example.com";
const WHSEC = "whsec_test_secret";
const LULU_SECRET = "3395bde8-0d24-4d47-aa4c-c84c76248dbc";
// The $19.99 price (orders placed before 2026-11-01) and the current $14.99 one.
const BOOK1_PAPERBACK = "price_1UNmh49cRroVv8pkheBXH7ag";
const BOOK1_PAPERBACK_1499 = "price_1UWsRI9cRroVv8pkLtEYUWcc";
const PAPERBACKS_1499 = [
	BOOK1_PAPERBACK_1499,
	"price_1UWsRP9cRroVv8pkxNqvGXuY",
	"price_1UWsRS9cRroVv8pkYeeEC3si",
	"price_1UWsRY9cRroVv8pk9BaizMJv",
	"price_1UWsRb9cRroVv8pkqTpdDBDU",
];
const PAPERBACKS_1999 = [
	BOOK1_PAPERBACK,
	"price_1UNmqj9cRroVv8pkgo2woTcw",
	"price_1UNmqq9cRroVv8pkfwDTMRRw",
	"price_1UNmtD9cRroVv8pkoeigDyEI",
	"price_1UNmtL9cRroVv8pk1gYcbRUO",
];
const BOOK1_EBOOK = "price_1UNmnk9cRroVv8pkjzdKzEBB";
const BONUS1 = "price_1UNmtV9cRroVv8pkF4lqTqYY";
const PROD_ONLY_KEY = "aaaaaaaa-1111-2222-3333-444444444444";

// Test-only Lulu specs for Book 1 Paperback. The shipped catalog keeps it
// FULFILLMENT_MAPPING_REQUIRED until Travis confirms the real values.
const TEST_SPEC = { podPackageId: "0850X1100.FC.STD.PB.080CW444.GXX", pageCount: 32 };
const book1 = byKey("EN-PAPERBACK-1") as CatalogEntry;
const BOOK1_SHIPPED_MAPPING = book1.lulu;

function sandboxEnv(overrides: Partial<Env> = {}): Env {
	return {
		...env,
		FULFILLMENT_MODE: "sandbox",
		STRIPE_WEBHOOK_SECRET: WHSEC,
		STRIPE_SECRET_KEY: "rk_test_dummy",
		LULU_CLIENT_KEY: "f2c47f17-9c1f-4efe-b3c1-028a3ee4c3c7",
		LULU_CLIENT_SECRET: LULU_SECRET,
		LULU_PRINT_FILES: JSON.stringify({
			"EN-PAPERBACK-1": {
				cover: "https://files.example.com/book1-cover.pdf",
				interior: "https://files.example.com/book1-interior.pdf",
			},
		}),
		LULU_SHIPPING_LEVEL: "MAIL",
		PRINTFUL_API_TOKEN: "pf-test-token",
		FULFILLMENT_CONTACT_EMAIL: "orders@squishman.com",
		...overrides,
	};
}

// --- Mock Stripe + Lulu -----------------------------------------------------

type Session = Record<string, unknown>;
const sessions = new Map<string, Session>();
const lulu = {
	creates: 0,
	createStatus: 201,
	lastCreate: null as Record<string, unknown> | null,
	existingJobs: [] as Array<Record<string, unknown>>,
	costCalls: 0,
	validations: 0,
};
const printful = {
	orders: new Map<string, Record<string, unknown>>(),
	creates: 0,
	fileLookups: 0,
	lastCreate: null as Record<string, unknown> | null,
	lastConfirm: null as string | null,
};
const stripeCreates: URLSearchParams[] = [];

function session(
	id: string,
	{
		price = BOOK1_PAPERBACK,
		quantity = 1,
		paid = true,
		livemode = false,
		state = "TX",
		line1 = "100 Maple St",
		metadata = {},
	}: {
		price?: string;
		quantity?: number;
		paid?: boolean;
		livemode?: boolean;
		state?: string;
		line1?: string;
		metadata?: Record<string, string>;
	} = {},
): string {
	sessions.set(id, {
		id,
		object: "checkout.session",
		livemode,
		payment_status: paid ? "paid" : "unpaid",
		status: "complete",
		payment_intent: `pi_${id}`,
		customer_details: { email: "parent@example.com", name: "Pat Parent", phone: null },
		collected_information: {
			shipping_details: {
				name: "Pat Parent",
				address: {
					line1,
					line2: null,
					city: "Austin",
					state,
					postal_code: "78701",
					country: "US",
				},
			},
		},
		line_items: { data: [{ quantity, price: { id: price } }], has_more: false },
		metadata,
	});
	return id;
}

async function signed(event: Record<string, unknown>, secret = WHSEC, t = Math.floor(Date.now() / 1000)) {
	const body = JSON.stringify(event);
	const sig = toHex(await hmacSha256(secret, `${t}.${body}`));
	return { body, header: `t=${t},v1=${sig}` };
}

function paidEvent(sessionId: string, eventId = `evt_${sessionId}`, type = "checkout.session.completed") {
	return { id: eventId, type, livemode: false, data: { object: { id: sessionId, object: "checkout.session" } } };
}

beforeAll(() => {
	fetchMock.activate();
	fetchMock.disableNetConnect();
	fetchMock
		.get("https://api.stripe.com")
		.intercept({ path: (p) => p.startsWith("/v1/checkout/sessions/"), method: "GET" })
		.reply((opts) => {
			const id = decodeURIComponent(String(opts.path).split("/")[4].split("?")[0]);
			const s = sessions.get(id);
			return s ? { statusCode: 200, data: JSON.stringify(s) } : { statusCode: 404, data: "{}" };
		})
		.persist();
	fetchMock
		.get("https://api.printful.com")
		.intercept({ path: "/store/products?limit=1", method: "GET" })
		.reply(200, JSON.stringify({ code: 200, result: [], paging: { total: 0, offset: 0, limit: 1 } }))
		.persist();
	fetchMock
		.get("https://api.stripe.com")
		.intercept({ path: "/v1/checkout/sessions", method: "POST" })
		.reply((opts) => {
			stripeCreates.push(new URLSearchParams(String(opts.body)));
			return {
				statusCode: 200,
				data: JSON.stringify({ id: "cs_test_new", url: "https://checkout.stripe.com/c/pay/cs_test_new" }),
			};
		})
		.persist();
	const pf = fetchMock.get("https://api.printful.com");
	pf.intercept({ path: (p) => p.startsWith("/files/"), method: "GET" })
		.reply((opts) => {
			printful.fileLookups++;
			return {
				statusCode: 200,
				data: JSON.stringify({ code: 200, result: { id: Number(String(opts.path).split("/")[2]), status: "ok" } }),
			};
		})
		.persist();
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
			const order = {
				id: 7000 + printful.creates,
				external_id: ext,
				status: printful.lastConfirm === "true" ? "pending" : "draft",
				costs: { subtotal: "17.87", shipping: "5.35", total: "25.08" },
			};
			printful.orders.set(ext, order);
			return { statusCode: 200, data: JSON.stringify({ code: 200, result: order }) };
		})
		.persist();
	fetchMock
		.get("https://api.stripe.com")
		.intercept({ path: "/v1/checkout/sessions?limit=1", method: "GET" })
		.reply(200, JSON.stringify({ object: "list", data: [] }))
		.persist();
	const sandbox = fetchMock.get("https://api.sandbox.lulu.com");
	sandbox
		.intercept({ path: "/auth/realms/glasstree/protocol/openid-connect/token", method: "POST" })
		.reply((opts) =>
			// Keys made for production are rejected by the sandbox.
			JSON.stringify(opts.headers).includes(btoa(`${PROD_ONLY_KEY}:${PROD_ONLY_KEY}`))
				? { statusCode: 401, data: JSON.stringify({ error: "invalid_client" }) }
				: { statusCode: 200, data: JSON.stringify({ access_token: "tok", expires_in: 3600 }) },
		)
		.persist();
	sandbox
		.intercept({ path: "/print-job-cost-calculations/", method: "POST" })
		.reply(() => {
			lulu.costCalls++;
			return {
				statusCode: 201,
				data: JSON.stringify({
					currency: "USD",
					total_cost_incl_tax: "9.87",
					shipping_cost: { total_cost_incl_tax: "4.99" },
				}),
			};
		})
		.persist();
	sandbox
		.intercept({ path: "/validate-interior/", method: "POST" })
		.reply(() => {
			lulu.validations++;
			return { statusCode: 201, data: JSON.stringify({ id: 11, status: "VALIDATING" }) };
		})
		.persist();
	sandbox
		.intercept({ path: "/validate-cover/", method: "POST" })
		.reply(() => {
			lulu.validations++;
			return { statusCode: 201, data: JSON.stringify({ id: 22, status: "NORMALIZING" }) };
		})
		.persist();
	sandbox
		.intercept({ path: "/validate-interior/11/", method: "GET" })
		.reply(200, JSON.stringify({ id: 11, status: "VALIDATED", page_count: 32, errors: null }))
		.persist();
	sandbox
		.intercept({ path: "/validate-cover/22/", method: "GET" })
		.reply(200, JSON.stringify({ id: 22, status: "NORMALIZED", errors: null }))
		.persist();
	sandbox
		.intercept({ path: "/cover-dimensions/", method: "POST" })
		.reply(200, JSON.stringify({ width: "17.38", height: "11.25", unit: "inch" }))
		.persist();
	sandbox
		.intercept({ path: (p) => p.startsWith("/print-jobs/?search="), method: "GET" })
		.reply(() => ({ statusCode: 200, data: JSON.stringify({ results: lulu.existingJobs }) }))
		.persist();
	sandbox
		.intercept({ path: "/print-jobs/", method: "POST" })
		.reply((opts) => {
			lulu.creates++;
			lulu.lastCreate = JSON.parse(String(opts.body));
			if (lulu.createStatus >= 400) {
				return { statusCode: lulu.createStatus, data: JSON.stringify({ shipping_address: ["invalid"] }) };
			}
			const body = lulu.lastCreate as { external_id: string };
			return {
				statusCode: 201,
				data: JSON.stringify({ id: 9000 + lulu.creates, external_id: body.external_id, status: { name: "CREATED" } }),
			};
		})
		.persist();
});

afterAll(() => {
	(book1 as { lulu: unknown }).lulu = BOOK1_SHIPPED_MAPPING;
});

beforeEach(() => {
	lulu.creates = 0;
	lulu.costCalls = 0;
	lulu.validations = 0;
	lulu.createStatus = 201;
	lulu.lastCreate = null;
	lulu.existingJobs = [];
	printful.orders.clear();
	printful.creates = 0;
	printful.fileLookups = 0;
	printful.lastCreate = null;
	printful.lastConfirm = null;
	stripeCreates.length = 0;
	(book1 as { lulu: unknown }).lulu = { ...TEST_SPEC };
});

async function deliver(e: Env, event: Record<string, unknown>) {
	const { body, header } = await signed(event);
	const r = await handleStripeWebhook(e, body, header);
	await r.background;
	return r;
}

// --- Tests ------------------------------------------------------------------

describe("catalog", () => {
	it("covers every current Squish Man price and marks only books as physical", () => {
		expect(CATALOG).toHaveLength(55);
		const digital = CATALOG.filter((e) => e.format === "ebook" || e.format === "audiobook");
		expect(digital).toHaveLength(10);
		expect(digital.every((e) => !e.physical && e.lulu === null)).toBe(true);
		expect(CATALOG.filter((e) => e.physical)).toHaveLength(45);
		expect(new Set(CATALOG.map((e) => e.stripePriceId)).size).toBe(55);
	});

	it("maps the five story paperbacks and enables them for production", async () => {
		(book1 as { lulu: unknown }).lulu = BOOK1_SHIPPED_MAPPING;
		const res = await SELF.fetch(`${BASE}/api/admin/fulfillment/catalog`, {
			headers: { authorization: "Bearer test-token" },
		});
		const json = (await res.json()) as { mode: string; products: Array<{ key: string; lulu: unknown; productionEnabled: boolean }> };
		expect(json.mode).toBe("production");
		expect(json.products.find((p) => p.key === "EN-PAPERBACK-1")?.lulu).toEqual({
			podPackageId: "0850X1100.FC.STD.PB.080CW444.GXX",
			pageCount: 32,
		});
		const square = { podPackageId: "0850X0850.FC.STD.PB.080CW444.GXX", pageCount: 32 };
		const letter = { podPackageId: "0850X1100.FC.STD.PB.080CW444.GXX", pageCount: 32 };
		const lulu = (k: string) => json.products.find((p) => p.key === k)?.lulu;
		expect(lulu("EN-PAPERBACK-2")).toEqual(square);
		for (const k of ["EN-PAPERBACK-3", "EN-PAPERBACK-4", "EN-PAPERBACK-5"]) expect(lulu(k)).toEqual(letter);
		const unmapped = json.products.filter((p) => !/^EN-PAPERBACK-[1-5]$/.test(p.key) && p.lulu !== "NOT_PHYSICAL");
		expect(unmapped).toHaveLength(40);
		expect(unmapped.every((p) => p.lulu === "FULFILLMENT_MAPPING_REQUIRED")).toBe(true);
		expect(json.products.find((p) => p.key === "EN-EBOOK-1")?.lulu).toBe("NOT_PHYSICAL");
		expect(json.products.filter((p) => p.productionEnabled).map((p) => p.key)).toEqual(["EN-PAPERBACK-1", "EN-PAPERBACK-2", "EN-PAPERBACK-3", "EN-PAPERBACK-4", "EN-PAPERBACK-5"]);
	});
});

describe("paperback reprice ($19.99 → $14.99, English and Spanish)", () => {
	it("maps both the new and the old paperback prices to the same Lulu item", () => {
		for (const [i, id] of PAPERBACKS_1499.entries()) {
			const entry = byPriceId(id);
			expect(entry?.key).toBe(`EN-PAPERBACK-${i + 1}`);
			expect(entry?.stripePriceId).toBe(id);
			expect(entry?.productionEnabled).toBe(true);
			expect(byPriceId(PAPERBACKS_1999[i])).toBe(entry);
			expect(entry?.previousPriceIds).toEqual([PAPERBACKS_1999[i]]);
		}
		const es = [
			["price_1UWtJt9cRroVv8pkr2Rtlglc", "price_1UNmuW9cRroVv8pkBwzsPYnQ"],
			["price_1UWtJz9cRroVv8pkYKpvt8pX", "price_1UNmuY9cRroVv8pkmcY7tfEn"],
			["price_1UWtK29cRroVv8pkpk0hTnTu", "price_1UNmua9cRroVv8pk4G5ZdnzR"],
			["price_1UWtK49cRroVv8pkcna8bo0a", "price_1UNmuc9cRroVv8pk1Q8rZ1CC"],
			["price_1UWtK69cRroVv8pkhvzdM68F", "price_1UNmul9cRroVv8pkuoNZ04si"],
		];
		for (const [i, [now, before]] of es.entries()) {
			const entry = byPriceId(now);
			expect(entry?.key).toBe(`ES-PAPERBACK-${i + 1}`);
			expect(byPriceId(before)).toBe(entry);
		}
		const hardcovers = [
			["price_1UWuMb9cRroVv8pkim1yQttb", "price_1UNmzu9cRroVv8pk8E0TH2Vs"],
			["price_1UWuMd9cRroVv8pk8Lfo7Hn0", "price_1UNmzw9cRroVv8pkD0Lfhcmb"],
			["price_1UWuMf9cRroVv8pkgMvyDw0n", "price_1UNmzx9cRroVv8pkeBzktmPK"],
			["price_1UWuMh9cRroVv8pkQeHFeNNh", "price_1UNmzz9cRroVv8pkGCec8X3p"],
			["price_1UWuMj9cRroVv8pkX4gDmTYF", "price_1UNn019cRroVv8pk3ChVJfoo"],
			["price_1UWuMo9cRroVv8pkWNNrhG00", "price_1UNo9i9cRroVv8pkbsat8KQI"],
			["price_1UWuMq9cRroVv8pk6Ueo5doo", "price_1UNo9k9cRroVv8pkiTU0MxHX"],
			["price_1UWuMs9cRroVv8pk7lirQ7eJ", "price_1UNo9m9cRroVv8pkb3ephesi"],
			["price_1UWuMu9cRroVv8pkH4Ofxc5z", "price_1UNo9o9cRroVv8pk30XbQmoa"],
			["price_1UWuMx9cRroVv8pkBwXJWO71", "price_1UNo9q9cRroVv8pkL1ZUH47r"],
		];
		for (const [i, [now, before]] of hardcovers.entries()) {
			const entry = byPriceId(now);
			expect(entry?.key).toBe(`${i < 5 ? "EN" : "ES"}-HARDCOVER-${(i % 5) + 1}`);
			expect(byPriceId(before)).toBe(entry);
		}
		const bonus = [
			["price_1UWudG9cRroVv8pkwJ9hCTnB", "price_1UNmtV9cRroVv8pkF4lqTqYY"],
			["price_1UWudP9cRroVv8pkUBBE4VV3", "price_1UNmtX9cRroVv8pk6lI280Pe"],
			["price_1UWudZ9cRroVv8pkZ2QThvbH", "price_1UNmtZ9cRroVv8pkVe8vnABA"],
			["price_1UWudc9cRroVv8pkYo2xqAx3", "price_1UNmtb9cRroVv8pkBfOAQmmn"],
			["price_1UWude9cRroVv8pkn6S0F61v", "price_1UNmuA9cRroVv8pk0EoGl1dA"],
			["price_1UWudg9cRroVv8pkBXEwIvhj", "price_1UNmuo9cRroVv8pkuscTDjLh"],
			["price_1UWudi9cRroVv8pkPBe4mI0o", "price_1UNmwr9cRroVv8pkzJAqBCj1"],
			["price_1UWudj9cRroVv8pkk0DqRT1Y", "price_1UNmy99cRroVv8pkmrTPobHc"],
			["price_1UWudl9cRroVv8pkwoP7aepZ", "price_1UNmyv9cRroVv8pk9Pmgzjc5"],
			["price_1UWudn9cRroVv8pkBnXHSAJk", "price_1UNmyx9cRroVv8pkvyQbXrGS"],
		];
		for (const [i, [now, before]] of bonus.entries()) {
			const entry = byPriceId(now);
			expect(entry?.key).toBe(`${i < 5 ? "EN" : "ES"}-BONUS-${(i % 5) + 1}`);
			expect(byPriceId(before)).toBe(entry);
		}
		const learning = [
			["price_1UWuv39cRroVv8pkgSMSw4FZ", "price_1UNmuC9cRroVv8pkXDdP6hjD"],
			["price_1UWuv49cRroVv8pkKCQPJgyb", "price_1UNmuJ9cRroVv8pkfvZCswf2"],
			["price_1UWuv59cRroVv8pk1HnTYYzY", "price_1UNmuL9cRroVv8pkWt7L5zls"],
			["price_1UWuv79cRroVv8pksxP3eKEp", "price_1UNmuN9cRroVv8pkFJFyU1LU"],
			["price_1UWuv89cRroVv8pkokciPeVM", "price_1UNmuP9cRroVv8pkcNgYsPTx"],
			["price_1UWuv99cRroVv8pkCG74YPOr", "price_1UNmyz9cRroVv8pk2e1Jyo0p"],
			["price_1UWuvC9cRroVv8pkXgf2KLMb", "price_1UNmz19cRroVv8pkzMoHtMuv"],
			["price_1UWuvD9cRroVv8pkgr5Kzqmd", "price_1UNmz79cRroVv8pkbKA5zF4g"],
			["price_1UWuvF9cRroVv8pkhDzCEZRf", "price_1UNmz99cRroVv8pk0poq7382"],
			["price_1UWuvG9cRroVv8pkXTlKRjRl", "price_1UNmzB9cRroVv8pkMVfVtL5m"],
		];
		for (const [i, [now, before]] of learning.entries()) {
			const entry = byPriceId(now);
			expect(entry?.key).toBe(`${i < 5 ? "EN" : "ES"}-LEARNING-${(i % 5) + 1}`);
			expect(byPriceId(before)).toBe(entry);
		}
		const coloring = [
			["price_1UWv3X9cRroVv8pkuHrvApoW", "price_1UNmzD9cRroVv8pka8mStaYS"],
			["price_1UWv3Y9cRroVv8pkpUxpDsil", "price_1UNmzF9cRroVv8pkqhpUZGqD"],
			["price_1UWv3a9cRroVv8pkz9V6SGhV", "price_1UNmzH9cRroVv8pkKxTrE8xZ"],
			["price_1UWv3b9cRroVv8pkm8ToHogg", "price_1UNmzl9cRroVv8pkltxySX5y"],
			["price_1UWv3d9cRroVv8pkV6kLQhY5", "price_1UNmzs9cRroVv8pkwQaDhNjQ"],
		];
		for (const [i, [now, before]] of coloring.entries()) {
			const entry = byPriceId(now);
			expect(entry?.key).toBe(`EN-COLORING-${i + 1}`);
			expect(byPriceId(before)).toBe(entry);
		}
		const all = CATALOG.flatMap((e) => [e.stripePriceId, ...(e.previousPriceIds ?? [])]);
		expect(new Set(all).size).toBe(all.length);
	});
});

describe("eBook delivery", () => {
	const EBOOK1_NEW = "price_1UWu6n9cRroVv8pkyFxtACvV";
	const EBOOK3_NEW = "price_1UWu6r9cRroVv8pkne0HuLVx";

	it("shows the Book 1 eBook links for a paid $4.99 eBook session", async () => {
		session("cs_test_ebookpaid", { price: EBOOK1_NEW });
		const r = await ebookDownloadPage(sandboxEnv(), "cs_test_ebookpaid");
		expect(r.status).toBe(200);
		expect(r.html).toContain("drive.google.com/file/d/11YNGwr_PZ0c2_RueXfMOlUBV4uvAsQFP/view");
		expect(r.html).toContain("uc?export=download&id=11YNGwr_PZ0c2_RueXfMOlUBV4uvAsQFP");
		expect(r.html).not.toContain("17cIZ5y2ZnS7KUaemw35szRXO3BApYAFW");
	});

	it("also works for an old $9.99 eBook price", async () => {
		session("cs_test_ebookold", { price: BOOK1_EBOOK });
		const r = await ebookDownloadPage(sandboxEnv(), "cs_test_ebookold");
		expect(r.status).toBe(200);
		expect(r.html).toContain("11YNGwr_PZ0c2_RueXfMOlUBV4uvAsQFP");
	});

	it("only shows the book that was bought", async () => {
		session("cs_test_ebookthree", { price: EBOOK3_NEW });
		const r = await ebookDownloadPage(sandboxEnv(), "cs_test_ebookthree");
		expect(r.html).toContain("17cIZ5y2ZnS7KUaemw35szRXO3BApYAFW");
		expect(r.html).not.toContain("11YNGwr_PZ0c2_RueXfMOlUBV4uvAsQFP");
	});

	it("never shows a download for an unpaid session", async () => {
		session("cs_test_ebookunpaid", { price: EBOOK1_NEW, paid: false });
		const r = await ebookDownloadPage(sandboxEnv(), "cs_test_ebookunpaid");
		expect(r.status).toBe(402);
		expect(r.html).not.toContain("drive.google.com");
	});

	it("never shows a download for a non-eBook purchase", async () => {
		session("cs_test_ebookpaperback");
		const r = await ebookDownloadPage(sandboxEnv(), "cs_test_ebookpaperback");
		expect(r.status).toBe(404);
		expect(r.html).not.toContain("drive.google.com");
	});

	it("rejects missing, malformed and unknown session ids", async () => {
		expect((await ebookDownloadPage(sandboxEnv(), undefined)).status).toBe(400);
		expect((await ebookDownloadPage(sandboxEnv(), "cs_test_<script>")).status).toBe(400);
		const unknown = await ebookDownloadPage(sandboxEnv(), "cs_test_doesnotexist");
		expect(unknown.status).toBe(404);
		expect(unknown.html).not.toContain("drive.google.com");
	});

	it("is served by the worker at /api/ebook-download", async () => {
		const res = await SELF.fetch(`${BASE}/api/ebook-download`);
		expect(res.status).toBe(400);
		expect(res.headers.get("content-type")).toContain("text/html");
	});
});

describe("Squish Squad membership", () => {
	const MONTHLY = "price_1UX44w9cRroVv8pkpabnr9HH";
	const YEARLY = "price_1UX44y9cRroVv8pkGOan5njh";
	function squadSession(id: string, price: string, name: string, again: string, month: string, paid = true) {
		session(id, { price, paid });
		Object.assign(sessions.get(id)!, {
			mode: "subscription",
			subscription: `sub_${id}`,
			created: 1793560000,
			custom_fields: [
				{ key: "childname", type: "text", text: { value: name } },
				{ key: "childname2", type: "text", text: { value: again } },
				{ key: "birthmonth", type: "dropdown", dropdown: { value: month } },
			],
		});
	}

	it("tidies a child's name for printing", () => {
		expect(cleanChildName("  maya-rose   o'neil 3! ")).toBe("Maya-Rose O'neil");
		expect(cleanChildName("josé")).toBe("José");
		expect(cleanChildName(null)).toBe("");
	});

	it("records a new member from the webhook and never sends it to Lulu", async () => {
		squadSession("cs_test_squadyearly", YEARLY, "maya", "Maya", "12");
		const r = await deliver(sandboxEnv(), paidEvent("cs_test_squadyearly"));
		expect(r.body).toMatchObject({ squad: "member_recorded" });
		expect(lulu.creates).toBe(0);
		const m = (await listSquadMembers(sandboxEnv())).find((x) => x.sessionId === "cs_test_squadyearly");
		expect(m).toMatchObject({
			plan: "yearly",
			childName: "Maya",
			nameConfirmed: true,
			birthMonth: 12,
			email: "parent@example.com",
			subscriptionId: "sub_cs_test_squadyearly",
			shipping: { line1: "100 Maple St", city: "Austin", state: "TX", postalCode: "78701" },
		});
	});

	it("flags names that were typed two different ways", async () => {
		squadSession("cs_test_squadtypo", MONTHLY, "Mya", "Maya", "03");
		await deliver(sandboxEnv(), paidEvent("cs_test_squadtypo"));
		const m = (await listSquadMembers(sandboxEnv())).find((x) => x.sessionId === "cs_test_squadtypo");
		expect(m?.nameConfirmed).toBe(false);
		const page = await squadWelcomePage(sandboxEnv(), "cs_test_squadtypo");
		expect(page.html).toContain("didn't match");
	});

	it("shows the welcome page with the free eBook and member card", async () => {
		squadSession("cs_test_squadwelcome", MONTHLY, "leo", "Leo", "07");
		const r = await squadWelcomePage(sandboxEnv(), "cs_test_squadwelcome");
		expect(r.status).toBe(200);
		expect(r.html).toContain("Welcome to the Squish Squad, Leo!");
		expect(r.html).toContain("OFFICIAL SQUISH SQUAD MEMBER");
		expect(r.html).toContain("11YNGwr_PZ0c2_RueXfMOlUBV4uvAsQFP");
		expect(r.html).toContain("After 3 months of membership");
		expect(r.html).toContain("July");
	});

	it("never shows member gifts for unpaid, non-member or malformed sessions", async () => {
		squadSession("cs_test_squadunpaid", YEARLY, "Ava", "Ava", "01", false);
		expect((await squadWelcomePage(sandboxEnv(), "cs_test_squadunpaid")).status).toBe(402);
		session("cs_test_squadpaperback");
		const notMember = await squadWelcomePage(sandboxEnv(), "cs_test_squadpaperback");
		expect(notMember.status).toBe(404);
		expect(notMember.html).not.toContain("drive.google.com");
		expect((await squadWelcomePage(sandboxEnv(), "nope")).status).toBe(400);
	});

	it("schedules birthday posters: yearly right away, monthly after 3 months", () => {
		const base: SquadMember = {
			sessionId: "x", subscriptionId: null, plan: "yearly", childName: "Maya", nameConfirmed: true,
			birthMonth: 12, email: null, shipping: null, joinedAt: "2026-11-01T00:00:00.000Z", livemode: true,
		};
		const today = new Date("2026-11-01T12:00:00Z");
		expect(nextPoster(base, today)).toEqual({ birthday: "December 2026", orderOn: "2026-11-17", eligible: true });
		expect(nextPoster({ ...base, plan: "monthly" }, today)?.eligible).toBe(false);
		expect(nextPoster({ ...base, plan: "monthly", birthMonth: 3 }, today)).toEqual({ birthday: "March 2027", orderOn: "2027-02-15", eligible: true });
		// A birthday earlier in the year rolls to next year.
		expect(nextPoster({ ...base, birthMonth: 6 }, today)?.birthday).toBe("June 2027");
		expect(nextPoster({ ...base, birthMonth: null }, today)).toBeNull();
	});

	it("serves the welcome page and keeps the member list admin-only", async () => {
		const res = await SELF.fetch(`${BASE}/api/squad/welcome`);
		expect(res.status).toBe(400);
		expect((await SELF.fetch(`${BASE}/api/admin/squad/members`)).status).toBe(401);
		const ok = await SELF.fetch(`${BASE}/api/admin/squad/members`, { headers: { authorization: "Bearer test-token" } });
		expect(ok.status).toBe(200);
	});
});

describe("Stripe webhook security", () => {
	it("is disabled (503) until the webhook secret is configured", async () => {
		const res = await SELF.fetch(`${BASE}/api/stripe/webhook`, { method: "POST", body: "{}" });
		expect(res.status).toBe(503);
	});

	it("verifies Stripe signatures", async () => {
		const { body, header } = await signed(paidEvent("cs_test_sig"));
		expect(await verifyStripeSignature(body, header, WHSEC)).toBe(true);
		expect(await verifyStripeSignature(body, header, "whsec_other")).toBe(false);
		expect(await verifyStripeSignature(body.replace("cs_test_sig", "cs_test_xxx"), header, WHSEC)).toBe(false);
		expect(await verifyStripeSignature(body, null, WHSEC)).toBe(false);
		const old = await signed(paidEvent("cs_test_sig"), WHSEC, Math.floor(Date.now() / 1000) - 3600);
		expect(await verifyStripeSignature(old.body, old.header, WHSEC)).toBe(false);
	});

	it("rejects an unsigned or forged delivery without recording anything", async () => {
		session("cs_test_forged");
		const body = JSON.stringify(paidEvent("cs_test_forged"));
		const r = await handleStripeWebhook(sandboxEnv(), body, "t=1,v1=deadbeef");
		expect(r.status).toBe(400);
		expect(await store.get(env.ORDERS_DB!, "cs_test_forged")).toBeNull();
		expect(lulu.creates).toBe(0);
	});
});

describe("order trigger", () => {
	it("records paid physical orders but never calls Lulu while fulfillment is off", async () => {
		session("cs_test_off");
		const r = await deliver(sandboxEnv({ FULFILLMENT_MODE: "off" }), paidEvent("cs_test_off"));
		expect(r.body).toMatchObject({ fulfillment: "held", reason: "FULFILLMENT_OFF" });
		const rec = await store.get(env.ORDERS_DB!, "cs_test_off");
		expect(rec?.status).toBe("HELD");
		expect(lulu.creates + lulu.costCalls).toBe(0);
	});

	it("waits for payment: an unpaid session is not fulfilled", async () => {
		session("cs_test_unpaid", { paid: false });
		const r = await deliver(sandboxEnv(), paidEvent("cs_test_unpaid"));
		expect(r.body).toMatchObject({ awaiting_payment: true });
		expect(await store.get(env.ORDERS_DB!, "cs_test_unpaid")).toBeNull();
		expect(lulu.creates).toBe(0);
	});

	it("never sends digital products (eBook) to Lulu", async () => {
		session("cs_test_ebook", { price: BOOK1_EBOOK });
		const r = await deliver(sandboxEnv(), paidEvent("cs_test_ebook"));
		expect(r.body).toMatchObject({ fulfillment: "not_required" });
		expect(await store.get(env.ORDERS_DB!, "cs_test_ebook")).toBeNull();
		expect(lulu.creates).toBe(0);
	});

	it("never sends the new $7.99 audiobook price to Lulu", async () => {
		session("cs_test_audionew", { price: "price_1UWuBy9cRroVv8pkQaQzbgzm" });
		const r = await deliver(sandboxEnv(), paidEvent("cs_test_audionew"));
		expect(r.body).toMatchObject({ fulfillment: "not_required" });
		expect(await store.get(env.ORDERS_DB!, "cs_test_audionew")).toBeNull();
		expect(lulu.creates).toBe(0);
	});

	it("never sends the new $4.99 eBook price to Lulu either", async () => {
		session("cs_test_ebooknew", { price: "price_1UWu6n9cRroVv8pkyFxtACvV" });
		const r = await deliver(sandboxEnv(), paidEvent("cs_test_ebooknew"));
		expect(r.body).toMatchObject({ fulfillment: "not_required" });
		expect(await store.get(env.ORDERS_DB!, "cs_test_ebooknew")).toBeNull();
		expect(lulu.creates).toBe(0);
	});

	it("ignores prices outside the Squish Man catalog", async () => {
		session("cs_test_other", { price: "price_not_squish_man" });
		const r = await deliver(sandboxEnv(), paidEvent("cs_test_other"));
		expect(r.body).toMatchObject({ fulfillment: "not_required" });
		expect(lulu.creates).toBe(0);
	});

	it("holds an unmapped physical product (Bonus Edition 1) instead of guessing", async () => {
		session("cs_test_bonus1", { price: BONUS1 });
		const r = await deliver(sandboxEnv(), paidEvent("cs_test_bonus1"));
		expect(r.body).toMatchObject({ reason: "FULFILLMENT_MAPPING_REQUIRED:EN-BONUS-1" });
		expect(lulu.creates).toBe(0);
	});

	it("never sends a live (real) order to the Lulu sandbox", async () => {
		session("cs_live_real", { livemode: true });
		const r = await deliver(sandboxEnv(), paidEvent("cs_live_real"));
		expect(r.body).toMatchObject({ reason: "LIVE_ORDER_IN_SANDBOX_MODE" });
		expect(lulu.creates).toBe(0);
	});

	it("holds production orders for products not yet enabled for production", async () => {
		book1.productionEnabled = false;
		try {
			session("cs_live_prod", { livemode: true });
			const r = await deliver(sandboxEnv({ FULFILLMENT_MODE: "production" }), paidEvent("cs_live_prod"));
			expect(r.body).toMatchObject({ reason: "PRODUCTION_NOT_ENABLED:EN-PAPERBACK-1" });
		} finally {
			book1.productionEnabled = true;
		}
		expect(lulu.creates).toBe(0);
	});

	it("holds (never truncates) an address line longer than Lulu allows", async () => {
		session("cs_test_longaddr", { line1: "12345 Extraordinarily Long Maple Hollow Boulevard" });
		const r = await deliver(sandboxEnv(), paidEvent("cs_test_longaddr"));
		expect(r.body).toMatchObject({ reason: "INVALID_ADDRESS:street1_too_long" });
		expect(lulu.creates).toBe(0);
	});

	it("holds an order with an incomplete shipping address", async () => {
		session("cs_test_nostate", { state: "" });
		const r = await deliver(sandboxEnv(), paidEvent("cs_test_nostate"));
		expect(r.body).toMatchObject({ reason: "INVALID_ADDRESS:state_code" });
		expect(lulu.creates).toBe(0);
	});
});

describe("Book 1 Paperback → Lulu sandbox", () => {
	it("quotes, then creates exactly one print job with the mapped specs and address", async () => {
		session("cs_test_book1", { quantity: 2 });
		const r = await deliver(sandboxEnv(), paidEvent("cs_test_book1"));
		expect(r.body).toMatchObject({ fulfillment: "submitting" });
		expect(lulu.costCalls).toBe(1);
		expect(lulu.creates).toBe(1);
		expect(lulu.lastCreate).toEqual({
			external_id: "cs_test_book1",
			contact_email: "orders@squishman.com",
			shipping_level: "MAIL",
			shipping_address: {
				name: "Pat Parent",
				street1: "100 Maple St",
				city: "Austin",
				state_code: "TX",
				postcode: "78701",
				country_code: "US",
				email: "parent@example.com",
			},
			line_items: [
				{
					external_id: "EN-PAPERBACK-1",
					title: "The Amazing Adventures of Squish Man — Book 1 Paperback",
					quantity: 2,
					printable_normalization: {
						pod_package_id: TEST_SPEC.podPackageId,
						cover: { source_url: "https://files.example.com/book1-cover.pdf" },
						interior: { source_url: "https://files.example.com/book1-interior.pdf" },
					},
				},
			],
		});
		const rec = await store.get(env.ORDERS_DB!, "cs_test_book1");
		expect(rec).toMatchObject({ status: "SUBMITTED", lulu_print_job_id: "9001", lulu_status: "CREATED", attempts: 1 });
		expect(JSON.parse(rec!.lulu_cost_json!)).toMatchObject({ total_cost_incl_tax: "9.87" });
	});

	it("sends a paid order at the new $14.99 price to Lulu with the same print files", async () => {
		session("cs_test_book1new", { price: BOOK1_PAPERBACK_1499 });
		const r = await deliver(sandboxEnv(), paidEvent("cs_test_book1new"));
		expect(r.body).toMatchObject({ fulfillment: "submitting" });
		expect(lulu.creates).toBe(1);
		expect((lulu.lastCreate?.line_items as unknown[])[0]).toMatchObject({
			external_id: "EN-PAPERBACK-1",
			quantity: 1,
			printable_normalization: {
				pod_package_id: TEST_SPEC.podPackageId,
				cover: { source_url: "https://files.example.com/book1-cover.pdf" },
				interior: { source_url: "https://files.example.com/book1-interior.pdf" },
			},
		});
		const rec = await store.get(env.ORDERS_DB!, "cs_test_book1new");
		expect(rec).toMatchObject({ status: "SUBMITTED" });
	});

	it("DUPLICATE PROTECTION: redelivered webhooks never create a second print job", async () => {
		session("cs_test_dup");
		const first = await deliver(sandboxEnv(), paidEvent("cs_test_dup"));
		expect(first.body).toMatchObject({ fulfillment: "submitting" });
		expect(lulu.creates).toBe(1);

		// Stripe retries the same event…
		const second = await deliver(sandboxEnv(), paidEvent("cs_test_dup"));
		// …and a different event for the same session also arrives.
		const third = await deliver(
			sandboxEnv(),
			paidEvent("cs_test_dup", "evt_other", "checkout.session.async_payment_succeeded"),
		);
		// Concurrent redeliveries race on the database claim.
		await Promise.all([1, 2, 3].map(() => deliver(sandboxEnv(), paidEvent("cs_test_dup"))));

		expect(second.body).toMatchObject({ duplicate: true });
		expect(third.body).toMatchObject({ duplicate: true });
		expect(lulu.creates).toBe(1);
		const rows = await env.ORDERS_DB!.prepare(
			"SELECT COUNT(*) AS n FROM fulfillments WHERE stripe_session_id = ?",
		).bind("cs_test_dup").first<{ n: number }>();
		expect(rows?.n).toBe(1);
	});

	it("races of first deliveries still produce one print job", async () => {
		session("cs_test_race");
		const results = await Promise.all([1, 2, 3, 4].map(() => deliver(sandboxEnv(), paidEvent("cs_test_race"))));
		expect(results.filter((r) => r.body.fulfillment === "submitting")).toHaveLength(1);
		expect(lulu.creates).toBe(1);
	});
});

describe("errors and retries", () => {
	it("records a Lulu rejection once and does not resubmit on its own", async () => {
		lulu.createStatus = 400;
		session("cs_test_reject");
		await deliver(sandboxEnv(), paidEvent("cs_test_reject"));
		await deliver(sandboxEnv(), paidEvent("cs_test_reject"));
		expect(lulu.creates).toBe(1);
		const rec = await store.get(env.ORDERS_DB!, "cs_test_reject");
		expect(rec?.status).toBe("FAILED");
		expect(rec?.status_detail).toContain("HTTP 400");

		// A deliberate retry after the problem is fixed succeeds.
		lulu.createStatus = 201;
		const retried = await retry(sandboxEnv(), "cs_test_reject");
		expect(retried).toMatchObject({ status: "SUBMITTED", attempts: 2 });
		expect(lulu.creates).toBe(2);

		// Retrying a submitted order is a no-op.
		await retry(sandboxEnv(), "cs_test_reject");
		expect(lulu.creates).toBe(2);
	});

	it("a retry adopts a print job Lulu already has instead of creating another", async () => {
		lulu.createStatus = 500;
		session("cs_test_adopt");
		await deliver(sandboxEnv(), paidEvent("cs_test_adopt"));
		expect(lulu.creates).toBe(1);
		lulu.createStatus = 201;
		lulu.existingJobs = [{ id: 7777, external_id: "cs_test_adopt", status: { name: "UNPAID" } }];
		const rec = await retry(sandboxEnv(), "cs_test_adopt");
		expect(rec).toMatchObject({ status: "SUBMITTED", lulu_print_job_id: "7777", lulu_status: "UNPAID" });
		expect(lulu.creates).toBe(1);
	});

	it("an admin retry is required and authenticated", async () => {
		const res = await SELF.fetch(`${BASE}/api/admin/fulfillments/cs_test_reject/retry`, { method: "POST" });
		expect(res.status).toBe(401);
	});
});

describe("Lulu status and tracking", () => {
	it("rejects a Lulu webhook with a bad signature", async () => {
		const body = JSON.stringify({ topic: "PRINT_JOB_STATUS_CHANGED", data: { id: 9001 } });
		const r = await handleLuluWebhook(sandboxEnv(), body, "bad");
		expect(r.status).toBe(400);
	});

	it("stores SHIPPED status, carrier and tracking against the Stripe order", async () => {
		session("cs_test_track");
		await deliver(sandboxEnv(), paidEvent("cs_test_track"));
		const rec = await store.get(env.ORDERS_DB!, "cs_test_track");
		const body = JSON.stringify({
			topic: "PRINT_JOB_STATUS_CHANGED",
			data: {
				id: Number(rec!.lulu_print_job_id),
				external_id: "cs_test_track",
				status: { name: "SHIPPED", message: "All line-items were shipped" },
				line_items: [
					{
						status: {
							name: "SHIPPED",
							messages: {
								tracking_id: "1Z999",
								tracking_urls: ["https://track.example.com/1Z999"],
								carrier_name: "UPS",
							},
						},
					},
				],
			},
		});
		const sig = toHex(await hmacSha256(LULU_SECRET, body));
		const r = await handleLuluWebhook(sandboxEnv(), body, sig);
		expect(r.body).toMatchObject({ matched: true });
		const after = await store.get(env.ORDERS_DB!, "cs_test_track");
		expect(after).toMatchObject({ status: "SHIPPED", lulu_status: "SHIPPED", carrier: "UPS", tracking_id: "1Z999" });
		expect(JSON.parse(after!.tracking_urls!)).toEqual(["https://track.example.com/1Z999"]);

		// Lulu's later DELIVERED update is recorded too.
		const delivered = body.replaceAll('"SHIPPED"', '"DELIVERED"');
		await handleLuluWebhook(sandboxEnv(), delivered, toHex(await hmacSha256(LULU_SECRET, delivered)));
		expect(await store.get(env.ORDERS_DB!, "cs_test_track")).toMatchObject({ status: "DELIVERED", tracking_id: "1Z999" });

		// Travis's admin view: requires the admin token, shows tracking, no payment data.
		expect((await SELF.fetch(`${BASE}/api/admin/fulfillments`)).status).toBe(401);
		const res = await SELF.fetch(`${BASE}/api/admin/fulfillments`, {
			headers: { authorization: "Bearer test-token" },
	});

		const json = (await res.json()) as { orders: Array<Record<string, unknown>> };
		const track = json.orders.find((o) => o.stripeSessionId === "cs_test_track");
		expect(track).toMatchObject({ status: "DELIVERED", carrier: "UPS", trackingId: "1Z999", luluPrintJobId: expect.any(String) });
		expect(JSON.stringify(json)).not.toMatch(/card|cvc|whsec|rk_test|lulu-client-secret/i);
	});
});

describe("configuration health check", () => {
	it("reports what is configured and working while fulfillment is off, without values", async () => {
		const result = await health(sandboxEnv({ FULFILLMENT_MODE: "off" }));
		// Print files are looked up within a per-request budget; the rest are reported as not checked.
		const files = (result as { printful: { printFiles: Record<string, string> } }).printful.printFiles;
		expect(files).toMatchObject({ frontBanner: "ok", backCrown: "ok", mugWrapFull: "ok" });
		expect(new Set(Object.values(files))).toEqual(new Set(["ok", "not checked", "url"]));
		expect(Object.values(files).filter((v) => v === "ok").length).toBeLessThanOrEqual(30);
		expect(printful.fileLookups).toBeLessThanOrEqual(30);
		expect(result).toEqual({
			mode: "off",
			ordersDb: "ok",
			stripeSecretKey: "test",
			stripeKeyCanReadCheckout: true,
			stripeWebhookSecret: "configured",
			printful: {
				status: "ok",
				storeProducts: 0,
				printFiles: expect.any(Object),
			},
			merchCheckout: "off",
			luluClientKey: "set (id format)",
			luluClientSecret: "set (id format)",
			lulu: "ok",
			luluEnvironment: "sandbox",
			book1Paperback: {
				luluEnvironment: "sandbox",
				podPackageId: "0850X1100.FC.STD.PB.080CW444.GXX",
				pages: 32,
				coverSize: "17.38 x 11.25 inch",
				costForOneCopyToWashingtonDC: {
					MAIL: { total: "9.87", shipping: "4.99", currency: "USD" },
					PRIORITY_MAIL: { total: "9.87", shipping: "4.99", currency: "USD" },
					EXPEDITED: { total: "9.87", shipping: "4.99", currency: "USD" },
				},
				printFiles: {
					interior: { status: "VALIDATED", pageCount: 32, errors: null },
					cover: { status: "NORMALIZED", errors: null },
				},
			},
		});
		// File checks start once per set of files, then only their status is read.
		expect(lulu.validations).toBe(2);
		await env.VISIBILITY_CACHE.delete("fulfillment:health");
		await health(sandboxEnv({ FULFILLMENT_MODE: "off" }));
		expect(lulu.validations).toBe(2);
		expect(JSON.stringify(result)).not.toMatch(/rk_test_dummy|whsec_test|f2c47f17|3395bde8/);
	});

	it("describes pasted Lulu keys without revealing them", async () => {
		const result = await health(
			sandboxEnv({
				FULFILLMENT_MODE: "off",
				LULU_CLIENT_KEY: " f2c47f17-9c1f-4efe-b3c1-028a3ee4c3c7\n",
				LULU_CLIENT_SECRET: btoa("f2c47f17-9c1f-4efe-b3c1-028a3ee4c3c7:3395bde8-0d24-4d47-aa4c-c84c76248dbc"),
			}),
		);
		expect(result.luluClientKey).toBe("set (id format, extra spaces trimmed)");
		expect(result.luluClientSecret).toBe("set (100 characters)");
	});

	it("is served publicly and flags missing keys", async () => {
		const res = await SELF.fetch(`${BASE}/api/fulfillment/health`);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			mode: "production",
			ordersDb: "ok",
			stripeSecretKey: "missing",
			stripeWebhookSecret: "missing",
			printful: "missing",
			luluClientKey: "missing",
			lulu: "missing",
		});
	});
});

describe("story paperback checks", () => {
	it("is public and reports missing Lulu keys without calling Lulu", async () => {
		const res = await SELF.fetch(`${BASE}/api/fulfillment/books`);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ lulu: "missing" });
	});
});

describe("Lulu key diagnosis", () => {
	it("tells production keys apart from sandbox keys without creating anything", async () => {
		const prod = fetchMock.get("https://api.lulu.com");
		prod
			.intercept({ path: "/auth/realms/glasstree/protocol/openid-connect/token", method: "POST" })
			.reply(200, JSON.stringify({ access_token: "prod-tok", expires_in: 3600 }));
		const result = await health(
			sandboxEnv({
				FULFILLMENT_MODE: "off",
				LULU_CLIENT_KEY: PROD_ONLY_KEY,
				LULU_CLIENT_SECRET: PROD_ONLY_KEY,
			}),
		);
		expect(result).toMatchObject({
			luluKeyAndSecretIdentical: true,
			lulu: "auth_failed (HTTP 401)",
			luluKeysAreFor: "production (developers.lulu.com), not the sandbox",
		});
		expect(JSON.stringify(result)).not.toContain("aaaaaaaa");
	});
});


// --- Squish Squad Shop merch → Printful --------------------------------------

const TEE_SKU = "TEE|Black|M";

function merchSession(id: string, sku = TEE_SKU, opts: { quantity?: number; livemode?: boolean } = {}) {
	return session(id, { price: "price_adhoc_merch", metadata: { merch_sku: sku }, ...opts });
}

async function checkout(body: unknown) {
	const res = await SELF.fetch(`${BASE}/api/merch/checkout`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	return res;
}

describe("merch catalog", () => {
	it("sells the approved six colors in S–3XL, a mug, all enabled for production", () => {
		const tee = merchProduct("TEE")!;
		const hoodie = merchProduct("HOODIE")!;
		const longSleeve = merchProduct("LONGSLEEVE")!;
		for (const p of [tee, hoodie, longSleeve]) {
			expect(p.colors.map((c) => c.name)).toEqual(["Royal Blue", "Pink", "Red", "Grey", "White", "Black"]);
			for (const c of p.colors) {
				const sizes = c.name === "Pink" && p === longSleeve ? ["S", "M", "L", "XL", "2XL"] : p.sizes;
				expect(Object.keys(c.variants)).toEqual(sizes);
			}
		}
		const prices = (key: string) => merchProduct(key)!.designs.map((d) => [d.key, d.priceCents]);
		const five = (full: number, one: number) => [
			["FULL", full],
			["PUDY", one],
			["LOGO", one],
			["MAPLE", one],
			["MAPLECROWN", full],
		];
		// The grown-up tee, long sleeve and sweatshirt also come with the Squish Squad logo.
		const squad = (full: number, one: number) => [...five(full, one), ["SQUAD", one], ["SQUADCROWN", full]];
		expect(prices("TEE")).toEqual(squad(2799, 2499));
		expect(prices("HOODIE")).toEqual(five(4499, 4199));
		expect(prices("LONGSLEEVE")).toEqual(squad(3299, 2999));
		expect(prices("SWEATSHIRT")).toEqual(squad(3999, 3699));
		expect(prices("TOTE")).toEqual(five(3299, 2999));
		expect(prices("MUG")).toEqual(five(1599, 1599));
		// The single-artwork designs print only that artwork, on the front.
		for (const p of [tee, hoodie, longSleeve]) {
			const files = (k: string) => p.designs.find((d) => d.key === k)!.files.map((f) => [f.type, f.fileId]);
			expect(files("PUDY")).toEqual([["front", 1090848214]]);
			expect(files("LOGO")).toEqual([["front", 1090848220]]);
			expect(files("MAPLE")).toEqual([["front", 1090919465]]);
			expect(files("MAPLECROWN")).toEqual([
				["front", 1090919465],
				["back", 1090848220],
			]);
		}
		expect(MERCH.every((p) => p.productionEnabled)).toBe(true);
		// Color pillows print the color into the art, so their colors share one blank.
		// The girls' tee deliberately reuses the white toddler and kids' tee blanks.
		const ids = MERCH.filter((p) => !["GIRLSTEE", "COLORPILLOW", "KIDSHOODIE", "BLANKET", "SOCKS", "BACKPACK", "DRAWSTRING", "NOTEBOOK", "LEGGINGS"].includes(p.key)).flatMap((p) => p.colors.flatMap((c) => Object.values(c.variants)));
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("merch checkout", () => {
	it("is closed (404) unless MERCH_CHECKOUT is on", async () => {
		const res = await checkout({ product: "TEE", color: "Black", size: "M" });
		expect(res.status).toBe(404);
		expect(stripeCreates).toHaveLength(0);
	});

	it("creates a Stripe Checkout Session with the price, shipping and SKU", async () => {
		const { createMerchCheckout } = await import("../src/fulfillment/merch-service");
		const r = await createMerchCheckout(
			sandboxEnv({ MERCH_CHECKOUT: "on" }),
			{ product: "HOODIE", color: "Pink", size: "2XL", quantity: 2 },
			"https://squishman.com",
		);
		expect(r).toEqual({ status: 200, body: { url: "https://checkout.stripe.com/c/pay/cs_test_new" } });
		const f = stripeCreates[0];
		expect(f.get("mode")).toBe("payment");
		expect(f.get("line_items[0][price_data][unit_amount]")).toBe("4699"); // $44.99 + $2 for 2XL
		expect(f.get("line_items[0][quantity]")).toBe("2");
		expect(f.get("line_items[0][price_data][product_data][name]")).toBe("Squish Squad Hoodie — Pink, 2XL");
		expect(f.get("shipping_options[0][shipping_rate_data][fixed_amount][amount]")).toBe("1298"); // $9.99 + $2.99
		expect(f.get("shipping_address_collection[allowed_countries][0]")).toBe("US");
		expect(f.get("metadata[merch_sku]")).toBe("HOODIE|Pink|2XL|FULL");
		expect(f.get("success_url")).toBe("https://squishman.com/?shop=thanks#merch");
	});

	it("serves the shop page its prices and colors, with checkout closed by default", async () => {
		const res = await SELF.fetch(`${BASE}/api/merch`);
		const json = (await res.json()) as {
			checkout: string;
			products: Array<{
				key: string;
				designs: Array<{ key: string; label: string; priceCents: number }>;
				colors: Array<{ name: string; sizes: string[] }>;
			}>;
		};
		expect(json.checkout).toBe("off");
		expect(json.products.map((p) => [p.key, ...p.designs.map((d) => d.priceCents)])).toEqual([
			["TEE", 2799, 2499, 2499, 2499, 2799, 2499, 2799],
			["HOODIE", 4499, 4199, 4199, 4199, 4499],
			["LONGSLEEVE", 3299, 2999, 2999, 2999, 3299, 2999, 3299],
			["TOTE", 3299, 2999, 2999, 2999, 3299],
			["MUG", 1599, 1599, 1599, 1599, 1599],
			["STICKER", 499, 499, 499, 499, 499, 499, 499, 499, 499, 499, 499],
			["POSTER", 1499, 1499, 1499, 1499, 1499, 1499, 1499, 1499],
			["PUZZLE", 2999, 2999, 2999, 2999, 2999, 2999],
			["BOTTLE", 2999, 2999, 2999, 2999, 2999, 2999],
			["PILLOW", 2499, 2499, 2499, 2499, 2499, 2499],
			["COLORPILLOW", 2999, 2999, 2999, 2999, 2999, 2999],
			["LUMBAR", 3499, 3499, 3499, 3499, 3499, 3499],
			["HAT", 3099, 3099, 3099, 3099, 3099],
			["DADHAT", 2499, 2499, 2499, 2499, 2499],
			["KIDSTEE", 2699, 2399, 2399, 2399, 2699, 2399, 2699],
			["KIDSLONGSLEEVE", 2899, 2599, 2599, 2599, 2899, 2599, 2899],
			["KIDSHOODIE", 4999, 4999, 4999, 4999, 4999],
			["BLANKET", 4999, 4999, 4999, 4999, 4999, 4999],
			["SOCKS", 1699, 1699, 1699],
			["BACKPACK", 4999],
			["DRAWSTRING", 2499],
			["NOTEBOOK", 1799],
			["LEGGINGS", 2999],
			["BABY", 2699, 2399, 2399, 2399, 2699],
			["BEANIE", 2499, 2499, 2499],
			["KIDSSWEATSHIRT", 3499, 3199, 3199, 3199, 3499, 3199, 3499],
			["TODDLERTEE", 2499, 2199, 2199, 2199, 2499],
			["SWEATSHIRT", 3999, 3699, 3699, 3699, 3999, 3699, 3999],
			["ORNAMENT", 1699],
			["GIRLSTEE", 2399, 2399, 2399, 2399, 2399, 2399, 2399],
		]);
		expect(json.products[0].designs.map((d) => d.label)).toEqual([
			"Squish Man & Pudy front, crown logo back",
			"Squish Man & Pudy only (front)",
			"Crown logo only (front)",
			"Maple Hollow logo only (front)",
			"Maple Hollow logo front, crown logo back",
			"Squish Squad logo only (front)",
			"Squish Squad logo front, crown logo back",
		]);
		expect(json.products[0].colors.map((c) => c.name)).toContain("Royal Blue");
		const pink = json.products[2].colors.find((c) => c.name === "Pink");
		expect(pink?.sizes).toEqual(["S", "M", "L", "XL", "2XL"]);
		expect(JSON.stringify(json)).not.toMatch(/variants|fileId|1090848214/);
	});

	it("opens checkout in preview mode (the page shows it only at ?shop=preview)", async () => {
		const { createMerchCheckout, merchCatalog } = await import("../src/fulfillment/merch-service");
		const e = sandboxEnv({ MERCH_CHECKOUT: "preview" });
		expect(merchCatalog(e).checkout).toBe("preview");
		const r = await createMerchCheckout(e, { product: "MUG", color: "White", size: "11 oz" }, "https://squishman.com");
		expect(r.status).toBe(200);
		expect(stripeCreates[0].get("line_items[0][price_data][unit_amount]")).toBe("1599");
	});

	it("sells the crown-logo design for $3 less", async () => {
		const { createMerchCheckout } = await import("../src/fulfillment/merch-service");
		const r = await createMerchCheckout(
			sandboxEnv({ MERCH_CHECKOUT: "on" }),
			{ product: "TEE", design: "LOGO", color: "Grey", size: "M" },
			"https://squishman.com",
		);
		expect(r.status).toBe(200);
		const f = stripeCreates[0];
		expect(f.get("line_items[0][price_data][unit_amount]")).toBe("2499");
		expect(f.get("line_items[0][price_data][product_data][name]")).toBe("Squish Squad T-Shirt, Crown Logo — Grey, M");
		expect(f.get("metadata[merch_sku]")).toBe("TEE|Grey|M|LOGO");
	});

	it("rejects anything that isn't for sale without calling Stripe", async () => {
		const { createMerchCheckout } = await import("../src/fulfillment/merch-service");
		const e = sandboxEnv({ MERCH_CHECKOUT: "on" });
		for (const bad of [
			{ product: "TEE", color: "Purple", size: "M" },
			{ product: "TEE", color: "Black", size: "5XL" },
			{ product: "LONGSLEEVE", color: "Pink", size: "3XL" },
			{ product: "TEE", design: "BACK", color: "Black", size: "M" },
			{ product: "PLUSH", color: "Black", size: "M" },
			{ product: "TEE", color: "Black", size: "M", quantity: 11 },
			{ product: "TEE", color: "Black", size: "M", quantity: 0 },
		]) {
			expect((await createMerchCheckout(e, bad, "https://squishman.com")).status).toBe(400);
		}
		expect(stripeCreates).toHaveLength(0);
	});
});

describe("merch orders → Printful", () => {
	it("records but never sends merch orders while fulfillment is off", async () => {
		merchSession("cs_test_moff");
		const r = await deliver(sandboxEnv({ FULFILLMENT_MODE: "off" }), paidEvent("cs_test_moff"));
		expect(r.body).toMatchObject({ fulfillment: "held", reason: "FULFILLMENT_OFF" });
		expect(await store.get(env.ORDERS_DB!, "cs_test_moff")).toMatchObject({ provider: "printful", status: "HELD" });
		expect(printful.creates + lulu.creates).toBe(0);
	});

	it("sends a test-mode order to Printful as a draft with the right item, artwork and address", async () => {
		merchSession("cs_test_tee", TEE_SKU, { quantity: 2 });
		const r = await deliver(sandboxEnv(), paidEvent("cs_test_tee"));
		expect(r.body).toMatchObject({ fulfillment: "submitting" });
		expect(printful.creates).toBe(1);
		expect(printful.lastConfirm).toBe("false");
		const order = printful.lastCreate as { external_id: string; recipient: unknown; items: unknown };
		expect(order.external_id).toMatch(/^[0-9a-f]{32}$/);
		expect(order.recipient).toEqual({
			name: "Pat Parent",
			address1: "100 Maple St",
			city: "Austin",
			state_code: "TX",
			country_code: "US",
			zip: "78701",
			email: "parent@example.com",
		});
		expect(order.items).toEqual([
			{
				variant_id: 4017,
				quantity: 2,
				name: "Squish Squad T-Shirt — Black, M",
				retail_price: "27.99",
				files: [
					{
						type: "front",
						id: 1090848214,
						position: { area_width: 1800, area_height: 2400, width: 1226, height: 1283, top: 150, left: 287 },
					},
					{
						type: "back",
						id: 1090848220,
						position: { area_width: 1800, area_height: 2400, width: 1366, height: 1152, top: 150, left: 217 },
					},
				],
			},
		]);
		const rec = await store.get(env.ORDERS_DB!, "cs_test_tee");
		expect(rec).toMatchObject({
			provider: "printful",
			status: "SUBMITTED",
			printful_order_id: "7001",
			printful_status: "draft",
			attempts: 1,
		});
		expect(rec?.status_detail).toMatch(/^PRINTFUL_DRAFT/);
		expect(lulu.creates).toBe(0);
	});

	it("DUPLICATE PROTECTION: redeliveries and retries never create a second Printful order", async () => {
		merchSession("cs_test_teedup");
		await deliver(sandboxEnv(), paidEvent("cs_test_teedup"));
		const again = await deliver(sandboxEnv(), paidEvent("cs_test_teedup", "evt_other"));
		expect(again.body).toMatchObject({ duplicate: true });
		await store.update(env.ORDERS_DB!, "cs_test_teedup", { status: "FAILED" });
		const rec = await retry(sandboxEnv(), "cs_test_teedup");
		expect(rec?.status).toBe("SUBMITTED");
		expect(printful.creates).toBe(1);
	});

	it("sends full-design mugs with the banner-and-crown wrap", async () => {
		merchSession("cs_test_mug", "MUG|White|11 oz");
		const r = await deliver(sandboxEnv(), paidEvent("cs_test_mug"));
		expect(r.body).toMatchObject({ fulfillment: "submitting" });
		expect((printful.lastCreate as { items: Array<{ files: unknown[] }> }).items[0].files).toEqual([
			{ type: "default", id: MUG_WRAP_FULL_FILE },
		]);
	});

	it("sends crown-logo orders with only the logo on the front", async () => {
		merchSession("cs_test_logotee", "HOODIE|Red|L|LOGO");
		await deliver(sandboxEnv(), paidEvent("cs_test_logotee"));
		const tee = (printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0];
		expect(tee).toMatchObject({ variant_id: 5540, name: "Squish Squad Hoodie, Crown Logo — Red, L", retail_price: "41.99" });
		expect(tee.files).toEqual([
			{
				type: "front",
				id: 1090848220,
				position: { area_width: 2100, area_height: 2100, width: 1366, height: 1152, top: 100, left: 367 },
			},
		]);
		merchSession("cs_test_logomug", "MUG|White|11 oz|LOGO");
		const mug = await deliver(sandboxEnv(), paidEvent("cs_test_logomug"));
		expect(mug.body).toMatchObject({ fulfillment: "submitting" });
		expect((printful.lastCreate as { items: Array<{ files: unknown[] }> }).items[0].files).toEqual([
			{
				type: "default",
				id: 1090848220,
				position: { area_width: 2700, area_height: 1050, width: 1100, height: 927, top: 61, left: 1475 },
			},
		]);
		expect(printful.creates).toBe(2);
	});

	it("sends Maple Hollow + crown orders with the logo front and the crown back", async () => {
		merchSession("cs_test_maplecrown", "HOODIE|Black|XL|MAPLECROWN");
		await deliver(sandboxEnv(), paidEvent("cs_test_maplecrown"));
		const item = (printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0];
		expect(item).toMatchObject({ variant_id: 5533, name: "Squish Squad Hoodie, Maple Hollow + Crown — Black, XL", retail_price: "44.99" });
		expect((item.files as Array<{ type: string; id: number }>).map((f) => [f.type, f.id])).toEqual([
			["front", 1090919465],
			["back", 1090848220],
		]);
		merchSession("cs_test_maplecrownmug", "MUG|White|11 oz|MAPLECROWN");
		const mug = await deliver(sandboxEnv(), paidEvent("cs_test_maplecrownmug"));
		expect(mug.body).toMatchObject({ fulfillment: "submitting" });
		expect((printful.lastCreate as { items: Array<{ files: unknown[] }> }).items[0].files).toEqual([
			{ type: "default", id: 1090966931 },
		]);
	});

	it("sends tote orders with the chosen artwork on the right sides", async () => {
		merchSession("cs_test_tote", "TOTE|Natural|One size|MAPLECROWN");
		await deliver(sandboxEnv(), paidEvent("cs_test_tote"));
		const item = (printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0];
		expect(item).toMatchObject({ variant_id: 10458, name: "Squish Squad Tote Bag, Maple Hollow + Crown — Natural", retail_price: "32.99" });
		expect(item.files).toEqual([
			{
				type: "front",
				id: 1090919465,
				position: { area_width: 1500, area_height: 1500, width: 1440, height: 720, top: 390, left: 30 },
			},
			{
				type: "back",
				id: 1090848220,
				position: { area_width: 1500, area_height: 1500, width: 1366, height: 1152, top: 174, left: 67 },
			},
		]);
	});

	it("sells stickers in three designs and sizes, fitted by Printful", async () => {
		const { createMerchCheckout } = await import("../src/fulfillment/merch-service");
		const r = await createMerchCheckout(
			sandboxEnv({ MERCH_CHECKOUT: "on" }),
			{ product: "STICKER", design: "MAPLE", color: "White", size: "5.5 in", quantity: 4 },
			"https://squishman.com",
		);
		expect(r.status).toBe(200);
		const f = stripeCreates[0];
		expect(f.get("line_items[0][price_data][unit_amount]")).toBe("699");
		expect(f.get("line_items[0][price_data][product_data][name]")).toBe("Squish Squad Sticker, Maple Hollow Logo — 5.5 in");
		expect(f.get("shipping_options[0][shipping_rate_data][fixed_amount][amount]")).toBe("574"); // $4.99 + 3 x $0.25
		const scene = await createMerchCheckout(
			sandboxEnv({ MERCH_CHECKOUT: "on" }),
			{ product: "STICKER", design: "MH_HIGHFIVE", color: "White", size: "4 in" },
			"https://squishman.com",
		);
		expect(scene.status).toBe(200);
		expect(stripeCreates[1].get("metadata[merch_sku]")).toBe("STICKER|White|4 in|MH_HIGHFIVE");
		expect(merchProduct("STICKER")!.designs.find((d) => d.key === "MH_HIGHFIVE")!.files).toEqual([
			{ type: "default", fileId: 1091358914 },
		]);
		const full = await createMerchCheckout(
			sandboxEnv({ MERCH_CHECKOUT: "on" }),
			{ product: "STICKER", design: "FULL", color: "White", size: "3 in" },
			"https://squishman.com",
		);
		expect(full.status).toBe(400);

		merchSession("cs_test_sticker", "STICKER|White|3 in|LOGO", { quantity: 2 });
		await deliver(sandboxEnv(), paidEvent("cs_test_sticker"));
		expect((printful.lastCreate as { items: unknown[] }).items[0]).toEqual({
			variant_id: 10163,
			quantity: 2,
			name: "Squish Squad Sticker, Crown Logo — 3 in",
			retail_price: "4.99",
			files: [{ type: "default", id: 1090848220 }],
		});
	});

	it("sells posters in two sizes, with the art centered for each size", async () => {
		const { createMerchCheckout } = await import("../src/fulfillment/merch-service");
		const r = await createMerchCheckout(
			sandboxEnv({ MERCH_CHECKOUT: "on" }),
			{ product: "POSTER", design: "MH_PALS", color: "White", size: "10×10 in", quantity: 2 },
			"https://squishman.com",
		);
		expect(r.status).toBe(200);
		const f = stripeCreates[0];
		expect(f.get("line_items[0][price_data][unit_amount]")).toBe("1699");
		expect(f.get("metadata[merch_sku]")).toBe("POSTER|White|10×10 in|MH_PALS");
		expect(f.get("shipping_options[0][shipping_rate_data][fixed_amount][amount]")).toBe("648"); // $5.99 + $0.49
		const pudy = await createMerchCheckout(
			sandboxEnv({ MERCH_CHECKOUT: "on" }),
			{ product: "POSTER", design: "PUDY", color: "White", size: "8×10 in" },
			"https://squishman.com",
		);
		expect(pudy.status).toBe(400);

		merchSession("cs_test_poster", "POSTER|White|8×10 in|MH_PALS");
		await deliver(sandboxEnv(), paidEvent("cs_test_poster"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 4463,
			retail_price: "14.99",
			files: [
				{
					type: "default",
					id: 1091358905,
					position: { area_width: 3000, area_height: 2400, width: 2298, height: 2100, top: 150, left: 351 },
				},
			],
		});
		merchSession("cs_test_squareposter", "POSTER|White|10×10 in|MAPLE");
		await deliver(sandboxEnv(), paidEvent("cs_test_squareposter"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 6239,
			retail_price: "16.99",
			files: [
				{
					type: "default",
					id: 1090919465,
					position: { area_width: 3000, area_height: 3000, width: 2700, height: 1350, top: 825, left: 150 },
				},
			],
		});
	});

	it("sells puzzles in three sizes, with the art filling each puzzle", async () => {
		const { createMerchCheckout } = await import("../src/fulfillment/merch-service");
		const r = await createMerchCheckout(
			sandboxEnv({ MERCH_CHECKOUT: "on" }),
			{ product: "PUZZLE", design: "PZ_GOODNIGHT", color: "White", size: "252 pcs", quantity: 2 },
			"https://squishman.com",
		);
		expect(r.status).toBe(200);
		const f = stripeCreates[0];
		expect(f.get("line_items[0][price_data][unit_amount]")).toBe("3499");
		expect(f.get("metadata[merch_sku]")).toBe("PUZZLE|White|252 pcs|PZ_GOODNIGHT");
		expect(f.get("shipping_options[0][shipping_rate_data][fixed_amount][amount]")).toBe("1098"); // $8.49 + $2.49

		merchSession("cs_test_puzzle", "PUZZLE|White|30 pcs|PZ_WELCOME");
		await deliver(sandboxEnv(), paidEvent("cs_test_puzzle"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 23246,
			retail_price: "29.99",
			files: [
				{
					type: "front",
					id: 1092037835,
					position: { area_width: 2953, area_height: 2350, width: 2953, height: 2350, top: 0, left: 0 },
				},
			],
		});
		merchSession("cs_test_bigpuzzle", "PUZZLE|White|252 pcs|PZ_PAW_PRINTS");
		await deliver(sandboxEnv(), paidEvent("cs_test_bigpuzzle"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 23247,
			retail_price: "34.99",
			files: [
				{
					type: "front",
					id: 1092038035,
					position: { area_width: 4200, area_height: 3300, width: 4200, height: 3342, top: 0, left: 0 },
				},
			],
		});
	});

	it("sells the girls' tee in every girls' size, printing the art from its squishman.com URL", async () => {
		const girls = merchProduct("GIRLSTEE")!;
		expect(girls.sizes).toEqual(["2T", "3T", "4T", "5/6T", "Youth S", "Youth M", "Youth L", "Youth XL"]);
		expect(girls.designs.map((d) => d.key)).toEqual([
			"GIRLS_BEACH", "GIRLS_MAGIC", "GIRLS_MAGIC_KITTY", "GIRLS_LITTLE_MAGIC", "GIRLS_XMAS_WISHES", "GIRLS_XMAS_COOKIES", "GIRLS_XMAS_HELPERS",
		]);
		for (const c of girls.colors) expect(Object.keys(c.variants)).toEqual(girls.sizes);
		const { createMerchCheckout } = await import("../src/fulfillment/merch-service");
		const r = await createMerchCheckout(
			sandboxEnv({ MERCH_CHECKOUT: "on" }),
			{ product: "GIRLSTEE", design: "GIRLS_XMAS_HELPERS", color: "White", size: "4T", quantity: 1 },
			"https://squishman.com",
		);
		expect(r.status).toBe(200);
		expect(stripeCreates[0].get("line_items[0][price_data][unit_amount]")).toBe("2399");
		expect(stripeCreates[0].get("metadata[merch_sku]")).toBe("GIRLSTEE|White|4T|GIRLS_XMAS_HELPERS");

		merchSession("cs_test_girlstoddler", "GIRLSTEE|White|4T|GIRLS_BEACH");
		await deliver(sandboxEnv(), paidEvent("cs_test_girlstoddler"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 12632,
			files: [
				{
					type: "front",
					url: "https://squishman.com/assets/merch/print/girls/girls-beach-day.png",
					position: { area_width: 1050, area_height: 1200, width: 676, height: 676, top: 90, left: 187 },
				},
			],
		});
		merchSession("cs_test_girlsyouth", "GIRLSTEE|White|Youth L|GIRLS_LITTLE_MAGIC");
		await deliver(sandboxEnv(), paidEvent("cs_test_girlsyouth"));
		const item = (printful.lastCreate as { items: Array<{ variant_id: number; files: Array<Record<string, unknown>> }> }).items[0];
		expect(item.variant_id).toBe(9428);
		expect(item.files[0]).toMatchObject({
			url: "https://squishman.com/assets/merch/print/girls/girls-little-magic.png",
			position: { area_width: 1500, area_height: 1800, width: 940, height: 993, top: 150, left: 280 },
		});
		expect(item.files[0]).not.toHaveProperty("id");
	});

	it("sells water bottles in white or black with the art on the front", async () => {
		const { createMerchCheckout } = await import("../src/fulfillment/merch-service");
		const r = await createMerchCheckout(
			sandboxEnv({ MERCH_CHECKOUT: "on" }),
			{ product: "BOTTLE", design: "SM_ROYAL", color: "Black", size: "17 oz", quantity: 2 },
			"https://squishman.com",
		);
		expect(r.status).toBe(200);
		const f = stripeCreates[0];
		expect(f.get("line_items[0][price_data][unit_amount]")).toBe("2999");
		expect(f.get("metadata[merch_sku]")).toBe("BOTTLE|Black|17 oz|SM_ROYAL");
		expect(f.get("shipping_options[0][shipping_rate_data][fixed_amount][amount]")).toBe("1548"); // $10.99 + $4.49

		merchSession("cs_test_bottle", "BOTTLE|White|17 oz|PUDY");
		await deliver(sandboxEnv(), paidEvent("cs_test_bottle"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 10798,
			retail_price: "29.99",
			files: [
				{
					type: "default",
					id: 1090848214,
					position: { area_width: 2557, area_height: 1582, width: 850, height: 890, top: 346, left: 853 },
				},
			],
		});
	});

	it("sells shaped pillows in two sizes, fitted by Printful", async () => {
		const { createMerchCheckout } = await import("../src/fulfillment/merch-service");
		const r = await createMerchCheckout(
			sandboxEnv({ MERCH_CHECKOUT: "on" }),
			{ product: "PILLOW", design: "BEST_FRIENDS", color: "White", size: "16 in", quantity: 3 },
			"https://squishman.com",
		);
		expect(r.status).toBe(200);
		const f = stripeCreates[0];
		expect(f.get("line_items[0][price_data][unit_amount]")).toBe("2999");
		expect(f.get("metadata[merch_sku]")).toBe("PILLOW|White|16 in|BEST_FRIENDS");
		expect(f.get("shipping_options[0][shipping_rate_data][fixed_amount][amount]")).toBe("967"); // $6.49 + 2 x $1.59

		merchSession("cs_test_pillow", "PILLOW|White|10 in|SM_ROYAL");
		await deliver(sandboxEnv(), paidEvent("cs_test_pillow"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 19122,
			retail_price: "24.99",
			files: [{ type: "default", id: 1091547742 }],
		});
	});

	it("sends color pillows with that color's front and back files", async () => {
		const { createMerchCheckout } = await import("../src/fulfillment/merch-service");
		const r = await createMerchCheckout(
			sandboxEnv({ MERCH_CHECKOUT: "on" }),
			{ product: "COLORPILLOW", design: "PUDY", color: "Royal Blue", size: "18 in", quantity: 2 },
			"https://squishman.com",
		);
		expect(r.status).toBe(200);
		const f = stripeCreates[0];
		expect(f.get("line_items[0][price_data][unit_amount]")).toBe("3499");
		expect(f.get("metadata[merch_sku]")).toBe("COLORPILLOW|Royal Blue|18 in|PUDY");
		expect(f.get("shipping_options[0][shipping_rate_data][fixed_amount][amount]")).toBe("1548"); // $10.99 + $4.49

		const pink = merchSelection("COLORPILLOW", "Pink", "16 in", "SM_ROYAL")!;
		expect(pink.files.every((x) => typeof x.fileId === "number")).toBe(true);
		const sky = merchSelection("COLORPILLOW", "Sky Blue", "16 in", "SM_ROYAL")!;
		expect(sky.files.every((x) => typeof x.fileId === "number")).toBe(true);
		const yellow = merchSelection("COLORPILLOW", "Sunshine Yellow", "16 in", "SM_ROYAL")!;
		expect(yellow.files.every((x) => typeof x.fileId === "number")).toBe(true);
		const sel = merchSelection("COLORPILLOW", "Royal Blue", "16 in", "SM_ROYAL")!;
		expect(sel.files.map((x) => x.fileId)).not.toEqual(pink.files.map((x) => x.fileId));
		expect(sel.files.map((x) => x.type)).toEqual(["front", "back"]);
		expect(sel.files.every((x) => typeof x.fileId === "number")).toBe(true);
		merchSession("cs_test_colorpillow", "COLORPILLOW|Royal Blue|16 in|SM_ROYAL");
		await deliver(sandboxEnv(), paidEvent("cs_test_colorpillow"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 49854,
			retail_price: "29.99",
			files: sel.files.map((x) => ({ type: x.type, id: x.fileId })),
		});
	});

	it("sends storybook lumbar pillows with the scene covering front and back", async () => {
		merchSession("cs_test_lumbar", "LUMBAR|White|20×12 in|PZ_ROYAL_HERO");
		await deliver(sandboxEnv(), paidEvent("cs_test_lumbar"));
		const position = { area_width: 3150, area_height: 1950, width: 3150, height: 1950, top: 0, left: 0 };
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 9513,
			retail_price: "34.99",
			files: [
				{ type: "front", id: 1092038311, position },
				{ type: "back", id: 1092038311, position },
			],
			options: [{ id: "stitch_color", value: "white" }],
		});
	});

	it("sends embroidered caps with the picture on the front and the SQUISHMAN logo on the back", async () => {
		merchSession("cs_test_hat", "HAT|Light Pink|Youth|SM_ROYAL");
		await deliver(sandboxEnv(), paidEvent("cs_test_hat"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toEqual({
			variant_id: 11460,
			quantity: 1,
			name: "Squish Squad Youth Cap, Royal Squish Man — Light Pink",
			retail_price: "30.99",
			files: [
				{
					type: "embroidery_front",
					id: 1092034656,
					position: { area_width: 1200, area_height: 525, width: 520, height: 525, top: 0, left: 340 },
				},
				{
					type: "embroidery_back",
					id: 1091740166,
					position: { area_width: 600, area_height: 300, width: 589, height: 300, top: 0, left: 5 },
				},
			],
			options: [
				{
					id: "thread_colors",
					value: ["#FFFFFF", "#96A1A8", "#FFCC00", "#005397", "#000000", "#E25C27"],
				},
				{ id: "thread_colors_back", value: ["#FFCC00", "#A67843", "#005397", "#333366"] },
			],
		});
	});

	it("sends full-color caps as a front print with no thread options", async () => {
		merchSession("cs_test_dadhat", "DADHAT|Black|Adult|MH_PALS");
		await deliver(sandboxEnv(), paidEvent("cs_test_dadhat"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toEqual({
			variant_id: 7854,
			quantity: 1,
			name: "Squish Squad Full-Color Cap, Squish Man & Pudy in Maple Hollow — Black",
			retail_price: "24.99",
			files: [
				{
					type: "front_dtf_hat",
					id: 1091358905,
					position: { area_width: 1500, area_height: 600, width: 657, height: 600, top: 0, left: 421 },
				},
			],
		});
	});

	it("sends kids' tees with the adult designs sized for the youth print area", async () => {
		merchSession("cs_test_kidstee", "KIDSTEE|Sky Blue|Youth M|FULL");
		await deliver(sandboxEnv(), paidEvent("cs_test_kidstee"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 10621,
			name: "Squish Squad Kids' T-Shirt — Sky Blue, Youth M",
			retail_price: "26.99",
			files: [
				{
					type: "front",
					id: 1090848214,
					position: { area_width: 1500, area_height: 1800, width: 1226, height: 1283, top: 100, left: 137 },
				},
				{
					type: "back",
					id: 1090848220,
					position: { area_width: 1500, area_height: 1800, width: 1366, height: 1152, top: 100, left: 67 },
				},
			],
		});
		merchSession("cs_test_kidstee2", "KIDSTEE|Berry|Youth S|MAPLE");
		await deliver(sandboxEnv(), paidEvent("cs_test_kidstee2"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 11209,
			retail_price: "23.99",
			files: [
				{
					type: "front",
					id: 1090919465,
					position: { area_width: 1500, area_height: 1800, width: 1400, height: 700, top: 100, left: 50 },
				},
			],
		});
	});

	it("sends kids' hoodies with every panel printed in the chosen color", async () => {
		const files = (sku: string) => {
			const [key, color, size, design] = sku.split("|");
			return merchSelection(key, color, size, design)!.files;
		};
		const full = files("KIDSHOODIE|Berry|Youth 10|FULL");
		expect(full.map((f) => f.type)).toEqual([
			"front",
			"back",
			"sleeve_right",
			"sleeve_left",
			"pocket",
			"hood",
			"label_panel",
		]);
		// Front art, back logo, and one solid file for the other panels.
		expect(new Set(full.map((f) => f.fileId)).size).toBe(3);
		expect(files("KIDSHOODIE|Berry|Youth 10|PUDY")[1].fileId).toBe(full[2].fileId);
		expect(files("KIDSHOODIE|Kelly Green|Youth 10|FULL")[0].fileId).not.toBe(full[0].fileId);

		merchSession("cs_test_kidshoodie", "KIDSHOODIE|Berry|Youth 10|FULL");
		await deliver(sandboxEnv(), paidEvent("cs_test_kidshoodie"));
		const item = (printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0];
		expect(item).toMatchObject({ variant_id: 54101, retail_price: "49.99" });
		expect(item.files).toEqual(
			full.map((f) => ({
				type: f.type,
				id: f.fileId,
				position: { area_width: 4800, area_height: 6000, width: 4800, height: 6000, top: 0, left: 0 },
			})),
		);
	});

	it("only sends orders Printful accepts: no negative offsets, ≤6 cap threads, a stitch color on all-over prints", () => {
		for (const p of MERCH) {
			for (const d of p.designs) {
				for (const f of d.files) {
					for (const pos of [f.position, ...Object.values(f.positionBySize ?? {})].filter(Boolean)) {
						expect(pos!.top, `${p.key} ${d.key}`).toBeGreaterThanOrEqual(0);
						expect(pos!.left, `${p.key} ${d.key}`).toBeGreaterThanOrEqual(0);
					}
				}
				if (p.key === "HAT" || p.key === "BEANIE") {
					for (const v of Object.values(d.printfulOptions ?? {})) expect((v as string[]).length).toBeLessThanOrEqual(6);
				}
				if (["COLORPILLOW", "LUMBAR", "KIDSHOODIE", "BACKPACK", "DRAWSTRING", "LEGGINGS"].includes(p.key)) {
					expect(d.printfulOptions?.stitch_color, `${p.key} ${d.key}`).toMatch(/^(white|clear)$/);
				}
			}
		}
	});

	it("sends sherpa blankets with the file for that color and size", async () => {
		const file = (color: string, size: string) => merchSelection("BLANKET", color, size, "PUDY")!.files[0];
		const ids = ["Royal Blue", "Pink"].flatMap((c) => ["37×57 in", "60×80 in"].map((sz) => file(c, sz).fileId));
		expect(ids.every((id) => typeof id === "number")).toBe(true);
		expect(new Set(ids).size).toBe(4);

		merchSession("cs_test_blanket", "BLANKET|Pink|60×80 in|PUDY");
		await deliver(sandboxEnv(), paidEvent("cs_test_blanket"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 17449,
			retail_price: "79.99",
			files: [
				{
					type: "default",
					id: file("Pink", "60×80 in").fileId,
					position: { area_width: 12451, area_height: 9376, width: 12451, height: 9376, top: 0, left: 0 },
				},
			],
		});
	});

	it("sends socks with the art on the outside panels and the pattern on the back", async () => {
		const files = merchSelection("SOCKS", "Pink", "L", "SM_ROYAL")!.files;
		expect(files.map((f) => f.type)).toEqual(["leg_front_right", "leg_front_left", "leg_back_right", "leg_back_left"]);
		expect(files[0].fileId).toBe(files[1].fileId);
		expect(files[2].fileId).toBe(merchSelection("SOCKS", "Pink", "L", "SOCK_PATTERN")!.files[0].fileId);
		expect(files[0].fileId).not.toBe(files[2].fileId);

		merchSession("cs_test_socks", "SOCKS|Pink|L|SM_ROYAL");
		await deliver(sandboxEnv(), paidEvent("cs_test_socks"));
		const item = (printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0];
		expect(item).toMatchObject({ variant_id: 22788, retail_price: "16.99" });
		expect((item.files as Array<{ position: unknown }>)[0].position).toEqual({
			area_width: 1348,
			area_height: 5595,
			width: 1348,
			height: 5657,
			top: 0,
			left: 0,
		});
	});

	it("sends backpacks with each color's own front, pocket, top and bottom", async () => {
		const pink = merchSelection("BACKPACK", "Pink", "One size", "PUDY")!.files;
		const white = merchSelection("BACKPACK", "White", "One size", "PUDY")!.files;
		expect(pink.map((f) => f.type)).toEqual(["front", "pocket", "top", "bottom"]);
		expect(pink.every((f) => typeof f.fileId === "number")).toBe(true);
		expect(pink.map((f) => f.fileId)).not.toEqual(white.map((f) => f.fileId));
		expect(merchSelection("BACKPACK", "Sky Blue", "One size", "PUDY")).toBeNull();

		merchSession("cs_test_backpack", "BACKPACK|Pink|One size|PUDY");
		await deliver(sandboxEnv(), paidEvent("cs_test_backpack"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 9063,
			name: "Squish Squad Backpack, Squish Man & Pudy — Pink",
			retail_price: "49.99",
			options: [{ id: "stitch_color", value: "clear" }],
		});
	});

	it("sends drawstring bags with each color's own print file", async () => {
		const pink = merchSelection("DRAWSTRING", "Pink", "One size", "PUDY")!.files;
		expect(pink).toHaveLength(1);
		expect(pink[0].type).toBe("default");
		expect(pink[0].fileId).not.toBe(merchSelection("DRAWSTRING", "Black", "One size", "PUDY")!.files[0].fileId);

		merchSession("cs_test_drawstring", "DRAWSTRING|Black|One size|PUDY");
		await deliver(sandboxEnv(), paidEvent("cs_test_drawstring"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 8894,
			name: "Squish Squad Drawstring Bag, Squish Man & Pudy — Black",
			retail_price: "24.99",
			options: [{ id: "stitch_color", value: "clear" }],
		});
	});

	it("sends notebooks with each color's own front and back covers", async () => {
		const grey = merchSelection("NOTEBOOK", "Grey", "One size", "PUDY")!.files;
		expect(grey.map((f) => f.type)).toEqual(["front", "back"]);
		expect(grey[0].fileId).not.toBe(grey[1].fileId);
		expect(grey[0].fileId).not.toBe(merchSelection("NOTEBOOK", "Pink", "One size", "PUDY")!.files[0].fileId);

		merchSession("cs_test_notebook", "NOTEBOOK|Grey|One size|PUDY");
		await deliver(sandboxEnv(), paidEvent("cs_test_notebook"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 12141,
			name: "Squish Squad Notebook, Squish Man & Pudy — Grey",
			retail_price: "17.99",
		});
	});

	it("sends kids' and youth leggings with the right print file and area", async () => {
		expect(merchProduct("LEGGINGS")!.sizes).toEqual(["2T", "3T", "4T", "5T", "6", "6X", "7", "8", "10", "12", "14", "16", "18", "20"]);
		const kids = merchSelection("LEGGINGS", "Pink", "6X", "SOCK_PATTERN")!;
		const youth = merchSelection("LEGGINGS", "Pink", "8", "SOCK_PATTERN")!;
		expect(kids.variantId).toBe(9701);
		expect(youth.variantId).toBe(9703);
		expect(kids.files[0].fileId).not.toBe(youth.files[0].fileId);
		expect(kids.files[0].positionBySize!["6X"].area_height).toBe(4650);
		expect(youth.files[0].positionBySize!["8"].area_height).toBe(6000);

		merchSession("cs_test_leggings", "LEGGINGS|Pink|8|SOCK_PATTERN");
		await deliver(sandboxEnv(), paidEvent("cs_test_leggings"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 9703,
			name: "Squish Squad Kids’ Leggings, Stars & paw prints — Pink, 8",
			retail_price: "29.99",
			files: [{ type: "default", id: youth.files[0].fileId, position: { area_width: 6000, area_height: 6000 } }],
			options: [{ id: "stitch_color", value: "white" }],
		});
	});

	it("sends baby one-pieces with the kids' tee art scaled to the baby print area", async () => {
		const full = merchSelection("BABY", "Yellow", "6–12 months", "FULL")!;
		expect(full.variantId).toBe(10330);
		expect(full.files.map((f) => [f.type, f.position!.area_width, f.position!.area_height])).toEqual([
			["front", 1050, 1200],
			["back", 1050, 1200],
		]);

		merchSession("cs_test_baby", "BABY|Pink|3–6 months|LOGO");
		await deliver(sandboxEnv(), paidEvent("cs_test_baby"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 9442,
			name: "Squish Squad Baby One-Piece, Crown Logo — Pink, 3–6 months",
			retail_price: "23.99",
			files: [{ type: "front", id: BACK_CROWN_FILE }],
		});
	});

	it("sends beanies with one of three logos embroidered on the cuff", async () => {
		expect(merchProduct("BEANIE")!.designs.map((d) => d.key)).toEqual(["LOGO", "MAPLE", "HAT_PAW"]);
		expect(merchSelection("BEANIE", "Red", "One size", "LOGO")!.files[0].fileId).toBe(merchSelection("HAT", "White", "Youth", "LOGO")!.files[0].fileId);
		const sel = merchSelection("BEANIE", "Baby Pink", "One size", "MAPLE")!;
		expect(sel.files).toHaveLength(1);
		expect(sel.files[0]).toMatchObject({
			type: "embroidery_front",
			position: { area_width: 1500, area_height: 525, width: 1038, height: 505, top: 10, left: 231 },
		});

		merchSession("cs_test_beanie", "BEANIE|Baby Pink|One size|MAPLE");
		await deliver(sandboxEnv(), paidEvent("cs_test_beanie"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 17494,
			name: "Squish Squad Beanie, Maple Hollow Logo — Baby Pink",
			retail_price: "24.99",
			files: [{ type: "embroidery_front", id: sel.files[0].fileId }],
			options: [{ id: "thread_colors", value: ["#FFFFFF", "#FFCC00", "#005397", "#CC3333", "#A67843", "#660000"] }],
		});
	});

	it("sends kids' sweatshirts with the kids' tee placements", async () => {
		const tee = merchSelection("KIDSTEE", "White", "Youth M", "MAPLECROWN")!;
		const sweat = merchSelection("KIDSSWEATSHIRT", "Royal", "Youth XS", "MAPLECROWN")!;
		expect(sweat.variantId).toBe(16824);
		expect(sweat.files).toEqual(tee.files);

		merchSession("cs_test_sweatshirt", "KIDSSWEATSHIRT|Red|Youth L|FULL");
		await deliver(sandboxEnv(), paidEvent("cs_test_sweatshirt"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 16822,
			name: "Squish Squad Kids' Sweatshirt — Red, Youth L",
			retail_price: "34.99",
		});
	});

	it("sends toddler tees with the baby one-piece placements", async () => {
		const toddler = merchSelection("TODDLERTEE", "Hot Pink", "5/6T", "FULL")!;
		expect(toddler.variantId).toBe(12621);
		expect(toddler.files).toEqual(merchSelection("BABY", "White", "3–6 months", "FULL")!.files);

		merchSession("cs_test_toddler", "TODDLERTEE|Light Blue|2T|MAPLE");
		await deliver(sandboxEnv(), paidEvent("cs_test_toddler"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 12622,
			name: "Squish Squad Toddler T-Shirt, Maple Hollow Logo — Light Blue, 2T",
			retail_price: "21.99",
		});
	});

	it("sends grown-up sweatshirts with the tee placements and size upcharges", async () => {
		expect(merchSelection("SWEATSHIRT", "Light Pink", "M", "FULL")!.files).toEqual(merchSelection("TEE", "White", "M", "FULL")!.files);

		merchSession("cs_test_adultsweatshirt", "SWEATSHIRT|Royal Blue|3XL|LOGO");
		await deliver(sandboxEnv(), paidEvent("cs_test_adultsweatshirt"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 16875,
			name: "Squish Squad Sweatshirt, Crown Logo — Royal Blue, 3XL",
			retail_price: "40.99",
		});
	});

	it("sends Squish Squad logo orders with the logo front, and the crown logo back for the two-sided design", async () => {
		const one = merchSelection("LONGSLEEVE", "Grey", "L", "SQUAD")!;
		expect(one.files.map((f) => [f.type, f.fileId])).toEqual([["front", SQUISH_SQUAD_FILE]]);
		const two = merchSelection("SWEATSHIRT", "Red", "M", "SQUADCROWN")!;
		expect(two.files.map((f) => [f.type, f.fileId])).toEqual([
			["front", SQUISH_SQUAD_FILE],
			["back", BACK_CROWN_FILE],
		]);

		merchSession("cs_test_squadtee", "TEE|Pink|XL|SQUADCROWN");
		await deliver(sandboxEnv(), paidEvent("cs_test_squadtee"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 4139,
			name: "Squish Squad T-Shirt, Squish Squad Logo + Crown — Pink, XL",
			retail_price: "27.99",
		});
	});

	it("sends kids' Squish Squad logo orders inside the youth print area", async () => {
		const sel = merchSelection("KIDSLONGSLEEVE", "Red", "Youth M", "SQUADCROWN")!;
		expect(sel.files.map((f) => [f.type, f.fileId, f.position!.area_width, f.position!.left])).toEqual([
			["front", SQUISH_SQUAD_FILE, 1500, 160],
			["back", BACK_CROWN_FILE, 1500, 67],
		]);

		merchSession("cs_test_kidssquad", "KIDSTEE|Berry|Youth S|SQUAD");
		await deliver(sandboxEnv(), paidEvent("cs_test_kidssquad"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 11209,
			name: "Squish Squad Kids' T-Shirt, Squish Squad Logo — Berry, Youth S",
			retail_price: "23.99",
		});
	});

	it("sends the snow-globe ornament with one file for both sides", async () => {
		merchSession("cs_test_ornament", "ORNAMENT|Royal Blue|One size|MAPLE", { quantity: 3 });
		await deliver(sandboxEnv(), paidEvent("cs_test_ornament"));
		expect((printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0]).toMatchObject({
			variant_id: 23133,
			quantity: 3,
			name: "Squish Squad Snow Globe Ornament, Maple Hollow Logo",
			retail_price: "16.99",
			files: [{ type: "front", id: ORNAMENT_SNOWGLOBE_FILE }],
		});
	});

	it("sends Maple Hollow logo orders with just that logo on the front", async () => {
		merchSession("cs_test_mapletee", "TEE|Royal Blue|2XL|MAPLE");
		await deliver(sandboxEnv(), paidEvent("cs_test_mapletee"));
		const item = (printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0];
		expect(item).toMatchObject({
			variant_id: 4175,
			name: "Squish Squad T-Shirt, Maple Hollow Logo — Royal Blue, 2XL",
			retail_price: "26.99",
		});
		expect(item.files).toEqual([
			{
				type: "front",
				id: 1090919465,
				position: { area_width: 1800, area_height: 2400, width: 1600, height: 800, top: 150, left: 100 },
			},
		]);
	});

	it("sends Squish Man & Pudy-only orders with just the banner on the front", async () => {
		merchSession("cs_test_pudytee", "LONGSLEEVE|Pink|M|PUDY");
		await deliver(sandboxEnv(), paidEvent("cs_test_pudytee"));
		const item = (printful.lastCreate as { items: Array<Record<string, unknown>> }).items[0];
		expect(item).toMatchObject({
			variant_id: 3513,
			name: "Squish Squad Long Sleeve, Squish Man & Pudy — Pink, M",
			retail_price: "29.99",
		});
		expect(item.files).toEqual([
			{
				type: "front",
				id: 1090848214,
				position: { area_width: 1800, area_height: 2400, width: 1226, height: 1283, top: 150, left: 287 },
			},
		]);
		merchSession("cs_test_pudymug", "MUG|White|11 oz|PUDY");
		const mug = await deliver(sandboxEnv(), paidEvent("cs_test_pudymug"));
		expect(mug.body).toMatchObject({ fulfillment: "submitting" });
		expect((printful.lastCreate as { items: Array<{ files: unknown[] }> }).items[0].files).toEqual([
			{
				type: "default",
				id: 1090848214,
				position: { area_width: 2700, area_height: 1050, width: 908, height: 950, top: 50, left: 221 },
			},
		]);
	});

	it("never sends a live order in sandbox mode, and holds unknown SKUs", async () => {
		merchSession("cs_test_mlive", TEE_SKU, { livemode: true });
		const live = await deliver(sandboxEnv(), paidEvent("cs_test_mlive"));
		expect(live.body).toMatchObject({ reason: "LIVE_ORDER_IN_SANDBOX_MODE" });
		merchSession("cs_test_mbad", "TEE|Purple|M");
		const bad = await deliver(sandboxEnv(), paidEvent("cs_test_mbad"));
		expect(bad.body).toMatchObject({ reason: "UNKNOWN_MERCH_SKU" });
		expect(printful.creates).toBe(0);
	});

	it("in production, live orders stay drafts until the product is enabled, then are confirmed", async () => {
		const prod = sandboxEnv({ FULFILLMENT_MODE: "production" });
		const tee = merchProduct("TEE")!;
		tee.productionEnabled = false;
		try {
			merchSession("cs_live_teedraft", TEE_SKU, { livemode: true });
			await deliver(prod, paidEvent("cs_live_teedraft"));
			expect(printful.lastConfirm).toBe("false");
		} finally {
			tee.productionEnabled = true;
		}
		merchSession("cs_live_teego", TEE_SKU, { livemode: true });
		await deliver(prod, paidEvent("cs_live_teego"));
		expect(printful.lastConfirm).toBe("true");
		expect(printful.creates).toBe(2);
	});

	it("the hourly reconcile stores Printful shipping and tracking", async () => {
		merchSession("cs_test_teeship");
		await deliver(sandboxEnv(), paidEvent("cs_test_teeship"));
		const [order] = [...printful.orders.values()];
		Object.assign(order, {
			status: "fulfilled",
			shipments: [{ carrier: "USPS", tracking_number: "9400111", tracking_url: "https://track.example/9400111" }],
		});
		await reconcile(sandboxEnv());
		expect(await store.get(env.ORDERS_DB!, "cs_test_teeship")).toMatchObject({
			status: "SHIPPED",
			printful_status: "fulfilled",
			carrier: "USPS",
			tracking_id: "9400111",
			tracking_urls: JSON.stringify(["https://track.example/9400111"]),
		});
	});
});
