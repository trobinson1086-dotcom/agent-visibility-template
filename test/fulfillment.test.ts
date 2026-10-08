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
		LULU_SHIPPING_LEVEL: "GROUND",
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
};

function session(
	id: string,
	{
		price = BOOK1_PAPERBACK,
		quantity = 1,
		paid = true,
		livemode = false,
		state = "TX",
		line1 = "100 Maple St",
	}: { price?: string; quantity?: number; paid?: boolean; livemode?: boolean; state?: string; line1?: string } = {},
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
		.get("https://api.stripe.com")
		.intercept({ path: "/v1/checkout/sessions?limit=1", method: "GET" })
		.reply(200, JSON.stringify({ object: "list", data: [] }))
		.persist();
	const sandbox = fetchMock.get("https://api.sandbox.lulu.com");
	sandbox
		.intercept({ path: "/auth/realms/glasstree/protocol/openid-connect/token", method: "POST" })
		.reply(200, JSON.stringify({ access_token: "tok", expires_in: 3600 }))
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
	lulu.createStatus = 201;
	lulu.lastCreate = null;
	lulu.existingJobs = [];
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
			shipping_level: "GROUND",
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
			luluClientKey: "looks right",
			luluClientSecret: "looks right",
			lulu: "ok",
			luluEnvironment: "sandbox",
		});
		expect(JSON.stringify(result)).not.toMatch(/rk_test_dummy|whsec_test|f2c47f17|3395bde8/);
	});

	it("describes a mis-pasted Lulu key without revealing it", async () => {
		const result = await health(
			sandboxEnv({
				FULFILLMENT_MODE: "off",
				LULU_CLIENT_KEY: " f2c47f17-9c1f-4efe-b3c1-028a3ee4c3c7\n",
				LULU_CLIENT_SECRET: btoa("f2c47f17-9c1f-4efe-b3c1-028a3ee4c3c7:3395bde8-0d24-4d47-aa4c-c84c76248dbc"),
			}),
		);
		expect(result.luluClientKey).toBe("looks right (had extra spaces, trimmed)");
		expect(result.luluClientSecret).toBe("looks like the Base64 string, not the key");
	});

	it("is served publicly and flags missing keys", async () => {
		const res = await SELF.fetch(`${BASE}/api/fulfillment/health`);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			mode: "off",
			ordersDb: "ok",
			stripeSecretKey: "missing",
			stripeWebhookSecret: "missing",
			luluClientKey: "missing",
			lulu: "missing",
		});
	});
});
