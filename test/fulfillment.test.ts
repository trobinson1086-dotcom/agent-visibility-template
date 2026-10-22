/**
 * Stripe → Lulu fulfillment tests. Stripe and Lulu are mocked (fetchMock);
 * nothing here can reach a real API, create a print job or charge a card.
 */
import { env, fetchMock, SELF } from "cloudflare:test";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { byKey, CATALOG } from "../src/fulfillment/catalog";
import { hmacSha256, toHex } from "../src/fulfillment/crypto";
import {
	handleLuluWebhook,
	handleStripeWebhook,
	health,
	retry,
} from "../src/fulfillment/service";
import { MERCH, merchProduct, merchSelection } from "../src/fulfillment/merch";
import { reconcile } from "../src/fulfillment/service";
import * as store from "../src/fulfillment/store";
import { verifyStripeSignature } from "../src/fulfillment/stripe";
import type { CatalogEntry } from "../src/fulfillment/types";
import type { Env } from "../src/lib/types";

const BASE = "https://example.com";
const WHSEC = "whsec_test_secret";
const LULU_SECRET = "3395bde8-0d24-4d47-aa4c-c84c76248dbc";
const BOOK1_PAPERBACK = "price_1UNmh49cRroVv8pkheBXH7ag";
const BOOK1_EBOOK = "price_1UNmnk9cRroVv8pkjzdKzEBB";
const BOOK2_PAPERBACK = "price_1UNmqj9cRroVv8pkgo2woTcw";
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
		.reply((opts) => ({
			statusCode: 200,
			data: JSON.stringify({ code: 200, result: { id: Number(String(opts.path).split("/")[2]), status: "ok" } }),
		}))
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

	it("ships with only Book 1 Paperback mapped and production disabled everywhere", async () => {
		(book1 as { lulu: unknown }).lulu = BOOK1_SHIPPED_MAPPING;
		const res = await SELF.fetch(`${BASE}/api/admin/fulfillment/catalog`, {
			headers: { authorization: "Bearer test-token" },
		});
		const json = (await res.json()) as { mode: string; products: Array<{ key: string; lulu: unknown; productionEnabled: boolean }> };
		expect(json.mode).toBe("off");
		expect(json.products.find((p) => p.key === "EN-PAPERBACK-1")?.lulu).toEqual({
			podPackageId: "0850X1100.FC.STD.PB.080CW444.GXX",
			pageCount: 32,
		});
		const unmapped = json.products.filter((p) => p.key !== "EN-PAPERBACK-1" && p.lulu !== "NOT_PHYSICAL");
		expect(unmapped).toHaveLength(44);
		expect(unmapped.every((p) => p.lulu === "FULFILLMENT_MAPPING_REQUIRED")).toBe(true);
		expect(json.products.find((p) => p.key === "EN-EBOOK-1")?.lulu).toBe("NOT_PHYSICAL");
		expect(json.products.every((p) => !p.productionEnabled)).toBe(true);
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

	it("ignores prices outside the Squish Man catalog", async () => {
		session("cs_test_other", { price: "price_not_squish_man" });
		const r = await deliver(sandboxEnv(), paidEvent("cs_test_other"));
		expect(r.body).toMatchObject({ fulfillment: "not_required" });
		expect(lulu.creates).toBe(0);
	});

	it("holds an unmapped physical product (Book 2) instead of guessing", async () => {
		session("cs_test_book2", { price: BOOK2_PAPERBACK });
		const r = await deliver(sandboxEnv(), paidEvent("cs_test_book2"));
		expect(r.body).toMatchObject({ reason: "FULFILLMENT_MAPPING_REQUIRED:EN-PAPERBACK-2" });
		expect(lulu.creates).toBe(0);
	});

	it("never sends a live (real) order to the Lulu sandbox", async () => {
		session("cs_live_real", { livemode: true });
		const r = await deliver(sandboxEnv(), paidEvent("cs_live_real"));
		expect(r.body).toMatchObject({ reason: "LIVE_ORDER_IN_SANDBOX_MODE" });
		expect(lulu.creates).toBe(0);
	});

	it("holds production orders for products not yet enabled for production", async () => {
		session("cs_live_prod", { livemode: true });
		const r = await deliver(sandboxEnv({ FULFILLMENT_MODE: "production" }), paidEvent("cs_live_prod"));
		expect(r.body).toMatchObject({ reason: "PRODUCTION_NOT_ENABLED:EN-PAPERBACK-1" });
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
		expect(result).toEqual({
			mode: "off",
			ordersDb: "ok",
			stripeSecretKey: "test",
			stripeKeyCanReadCheckout: true,
			stripeWebhookSecret: "configured",
			printful: {
				status: "ok",
				storeProducts: 0,
				printFiles: {
					frontBanner: "ok",
					backCrown: "ok",
					mapleHollowLogo: "ok",
					mugWrapMapleCrown: "ok",
					mug_default: "missing",
					stickerMapleHollowPals: "ok",
					stickerMapleHollowHighFive: "ok",
					stickerMapleHollowWave: "ok",
					stickerMapleHollowTownSquare: "ok",
					stickerValuesSignpost: "ok",
					stickerRoyalSquishMan: "ok",
					stickerMapleHollowSign: "ok",
					stickerBestFriends: "ok",
					puzzleWelcome: "ok",
					puzzleRoyalHero: "ok",
					puzzlePawPrints: "ok",
					puzzleGardenGate: "ok",
					puzzleGoodnight: "ok",
					puzzleMoonlight: "ok",
					lumbarWelcome: "ok",
					lumbarRoyalHero: "ok",
					lumbarPawPrints: "ok",
					lumbarGardenGate: "ok",
					lumbarGoodnight: "ok",
					lumbarMoonlight: "ok",
					colorpillow_royal_blue: "ok",
					colorpillow_pink: "ok",
					colorpillow_sky_blue: "ok",
					colorpillow_sunshine_yellow: "ok",
					kidshoodie_white: "ok",
					kidshoodie_pink: "ok",
					kidshoodie_sky_blue: "ok",
					kidshoodie_sunshine_yellow: "ok",
					kidshoodie_kelly_green: "ok",
					kidshoodie_berry: "ok",
					kidshoodie_royal_blue: "ok",
					kidshoodie_lavender: "ok",
					kidshoodie_mint_green: "ok",
					hatCrownWordmark: "ok",
					hatPaw: "ok",
					hatRoyalSquishMan: "ok",
					hatBestFriends: "ok",
					hatCrown: "ok",
				},
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
			mode: "off",
			ordersDb: "ok",
			stripeSecretKey: "missing",
			stripeWebhookSecret: "missing",
			printful: "missing",
			luluClientKey: "missing",
			lulu: "missing",
		});
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
	it("sells the approved six colors in S–3XL, a mug, and nothing in production yet", () => {
		const tee = merchProduct("TEE")!;
		const hoodie = merchProduct("HOODIE")!;
		const longSleeve = merchProduct("LONGSLEEVE")!;
		for (const p of [tee, hoodie, longSleeve]) {
			expect(p.colors.map((c) => c.name)).toEqual(["Black", "White", "Royal Blue", "Pink", "Grey", "Red"]);
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
		expect(prices("TEE")).toEqual(five(2799, 2499));
		expect(prices("HOODIE")).toEqual(five(4499, 4199));
		expect(prices("LONGSLEEVE")).toEqual(five(3299, 2999));
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
		expect(MERCH.every((p) => !p.productionEnabled)).toBe(true);
		// Color pillows print the color into the art, so their colors share one blank.
		const ids = MERCH.filter((p) => p.key !== "COLORPILLOW" && p.key !== "KIDSHOODIE").flatMap((p) => p.colors.flatMap((c) => Object.values(c.variants)));
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
			["TEE", 2799, 2499, 2499, 2499, 2799],
			["HOODIE", 4499, 4199, 4199, 4199, 4499],
			["LONGSLEEVE", 3299, 2999, 2999, 2999, 3299],
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
			["KIDSTEE", 2699, 2399, 2399, 2399, 2699],
			["KIDSLONGSLEEVE", 2899, 2599, 2599, 2599, 2899],
			["KIDSHOODIE", 4999, 4999, 4999, 4999, 4999],
		]);
		expect(json.products[0].designs.map((d) => d.label)).toEqual([
			"Squish Man & Pudy front, crown logo back",
			"Squish Man & Pudy only (front)",
			"Crown logo only (front)",
			"Maple Hollow logo only (front)",
			"Maple Hollow logo front, crown logo back",
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

	it("holds full-design mugs until the wrap artwork is uploaded", async () => {
		merchSession("cs_test_mug", "MUG|White|11 oz");
		const r = await deliver(sandboxEnv(), paidEvent("cs_test_mug"));
		expect(r.body).toMatchObject({ fulfillment: "held", reason: "PRINT_FILES_MISSING:MUG" });
		expect(printful.creates).toBe(0);
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
				if (p.key === "HAT") {
					for (const v of Object.values(d.printfulOptions ?? {})) expect((v as string[]).length).toBeLessThanOrEqual(6);
				}
				if (["COLORPILLOW", "LUMBAR", "KIDSHOODIE"].includes(p.key)) {
					expect(d.printfulOptions?.stitch_color, `${p.key} ${d.key}`).toBe("white");
				}
			}
		}
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
		merchSession("cs_live_teedraft", TEE_SKU, { livemode: true });
		await deliver(prod, paidEvent("cs_live_teedraft"));
		expect(printful.lastConfirm).toBe("false");
		const tee = merchProduct("TEE")!;
		tee.productionEnabled = true;
		try {
			merchSession("cs_live_teego", TEE_SKU, { livemode: true });
			await deliver(prod, paidEvent("cs_live_teego"));
			expect(printful.lastConfirm).toBe("true");
		} finally {
			tee.productionEnabled = false;
		}
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
