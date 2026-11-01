/**
 * Squish Squad Membership, phase 2: the perks that run on their own.
 *
 *  - Shipping refunds: a book order of $25+ (after discounts, before shipping
 *    and tax) paid with a member's email gets up to $5.99 of its shipping
 *    refunded, once per order (`squad:refund:<session>`).
 *  - Birthday posters: once a day the cron finds members whose poster is due
 *    (two weeks before the 1st of the birthday month; yearly always, monthly
 *    after 3 months), renders "Happy Birthday, <name>!" art and orders an 8×10
 *    poster from Printful, once per member per birthday
 *    (`squad:poster:<session>:<year>`).
 *  - Squish Squad Packs: the pack published for the month
 *    (`squad:pack:<YYYY-MM>`, set via the admin API) is emailed once to every
 *    active member (`squad:pack-sent:<YYYY-MM>:<session>`).
 *
 * Perks only go to members whose Stripe subscription is active or trialing.
 */
import type { Env } from "../lib/types";
import { baseUrl, type SquadPack, packEmail, posterEmail, sendOnce } from "./email";
import { createOrder, externalId, getOrder, PrintfulError } from "./printful";
import { listSquadMembers, membersByEmail, nextPoster, indexMemberEmail, type SquadMember } from "./squad";
import { POSTER_SIZE_LABEL, POSTER_VARIANT_ID, renderPosterPng } from "./squad-poster";
import { createRefund, fetchSubscription, StripeError, type StripeCheckoutSession } from "./stripe";
import type { FulfillmentMode } from "./types";

export const SHIPPING_REFUND_MIN_ORDER_CENTS = 2500;
export const SHIPPING_REFUND_MAX_CENTS = 599;
/** Failed posters are retried by the daily job this many times, then wait for an admin retry. */
const MAX_AUTO_ATTEMPTS = 3;
/** Rendered poster art is kept this long for Printful to download (and for reprints). */
const ART_TTL_SECONDS = 120 * 86_400;

const REFUND_PREFIX = "squad:refund:";
const POSTER_PREFIX = "squad:poster:";
const ART_PREFIX = "squad:poster-art:";
const PACK_PREFIX = "squad:pack:";
const PACK_SENT_PREFIX = "squad:pack-sent:";
const DAILY_PREFIX = "squad:daily:";

const log = (event: string, data: Record<string, unknown>) =>
	console.log(JSON.stringify({ at: "squad", event, ...data }));

function errorDetail(err: unknown): string {
	if (err instanceof StripeError) return `STRIPE_HTTP_${err.status}: ${err.detail}`.slice(0, 500);
	if (err instanceof PrintfulError) return `PRINTFUL_HTTP_${err.status}: ${err.detail}`.slice(0, 500);
	return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

async function getJson<T>(env: Env, key: string): Promise<T | null> {
	const v = await env.VISIBILITY_CACHE.get(key);
	return v ? (JSON.parse(v) as T) : null;
}

const putJson = (env: Env, key: string, value: unknown, ttl?: number) =>
	env.VISIBILITY_CACHE.put(key, JSON.stringify(value), ttl ? { expirationTtl: ttl } : undefined);

async function listJson<T>(env: Env, prefix: string): Promise<T[]> {
	const out: T[] = [];
	let cursor: string | undefined;
	do {
		const page = await env.VISIBILITY_CACHE.list({ prefix, cursor });
		for (const k of page.keys) {
			const v = await getJson<T>(env, k.name);
			if (v) out.push(v);
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
	return out;
}

/** Live members in production, test members in sandbox, nobody when fulfillment is off. */
export function memberInScope(mode: FulfillmentMode, livemode: boolean): boolean {
	return mode === "production" ? livemode : mode === "sandbox" ? !livemode : false;
}

/** Subscription status, cached for one job run. Throws when Stripe can't be read. */
export async function subscriptionStatus(
	env: Env,
	member: SquadMember,
	cache?: Map<string, string>,
): Promise<string> {
	if (!member.subscriptionId) return "no_subscription";
	const hit = cache?.get(member.subscriptionId);
	if (hit) return hit;
	if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_NOT_CONFIGURED");
	const { status } = await fetchSubscription(env.STRIPE_SECRET_KEY, member.subscriptionId);
	cache?.set(member.subscriptionId, status);
	return status;
}

const ACTIVE = new Set(["active", "trialing"]);
/** Statuses that will never become active again (a rejoin is a new membership). */
const ENDED = new Set(["canceled", "incomplete_expired", "no_subscription"]);

// --- Shipping refunds -------------------------------------------------------

export interface ShippingRefund {
	sessionId: string;
	status: "REFUNDED" | "FAILED" | "NOT_ELIGIBLE";
	detail: string | null;
	amountCents: number;
	refundId: string | null;
	memberSessionId: string | null;
	livemode: boolean;
	at: string;
	attempts: number;
}

/** Book subtotal after discounts (cents) and the shipping charged on a session. */
export function orderAmounts(session: StripeCheckoutSession): { booksCents: number; shippingCents: number } {
	const subtotal = session.amount_subtotal ?? 0;
	const discount = session.total_details?.amount_discount ?? 0;
	const shipping = session.shipping_cost?.amount_total ?? session.total_details?.amount_shipping ?? 0;
	return { booksCents: Math.max(0, subtotal - discount), shippingCents: Math.max(0, shipping) };
}

/**
 * Refund the shipping on a paid book order if a Squish Squad member placed it.
 * Idempotent per session. Returns the amount refunded (0 if none).
 */
export async function refundMemberShipping(
	env: Env,
	session: StripeCheckoutSession,
	{ force = false }: { force?: boolean } = {},
): Promise<ShippingRefund | null> {
	if ((env.SQUAD_SHIPPING_REFUNDS ?? "off").toLowerCase() !== "on") return null;
	const key = REFUND_PREFIX + session.id;
	const prev = await getJson<ShippingRefund>(env, key);
	if (prev && (prev.status === "REFUNDED" || (!force && prev.status === "NOT_ELIGIBLE"))) return prev;

	const { booksCents, shippingCents } = orderAmounts(session);
	const record: ShippingRefund = {
		sessionId: session.id,
		status: "NOT_ELIGIBLE",
		detail: null,
		amountCents: 0,
		refundId: null,
		memberSessionId: null,
		livemode: session.livemode,
		at: new Date().toISOString(),
		attempts: (prev?.attempts ?? 0) + 1,
	};
	const members = (await membersByEmail(env, session.customer_details?.email)).filter(
		(m) => m.livemode === session.livemode,
	);
	// Most non-members stop here without a record; only orders that could qualify are stored.
	if (members.length === 0) return null;
	if (shippingCents === 0) return null;
	if (booksCents < SHIPPING_REFUND_MIN_ORDER_CENTS) {
		record.detail = `ORDER_UNDER_MINIMUM:${booksCents}`;
		await putJson(env, key, record);
		return record;
	}
	try {
		let member: SquadMember | null = null;
		const statuses: string[] = [];
		for (const m of members) {
			const status = await subscriptionStatus(env, m);
			statuses.push(status);
			if (ACTIVE.has(status)) {
				member = m;
				break;
			}
		}
		if (!member) {
			record.detail = `MEMBERSHIP_NOT_ACTIVE:${statuses.join(",")}`;
			await putJson(env, key, record);
			return record;
		}
		if (!session.payment_intent) throw new Error("NO_PAYMENT_INTENT");
		const amount = Math.min(shippingCents, SHIPPING_REFUND_MAX_CENTS);
		const refund = await createRefund(
			env.STRIPE_SECRET_KEY!,
			session.payment_intent,
			amount,
			`squad-shipping-refund-${session.id}`,
			{ reason: "squish_squad_free_shipping", member_session: member.sessionId },
		);
		Object.assign(record, {
			status: "REFUNDED",
			amountCents: refund.amount,
			refundId: refund.id,
			memberSessionId: member.sessionId,
		});
		log("shipping_refunded", { session: session.id, amount: refund.amount, refund: refund.id });
	} catch (err) {
		record.status = "FAILED";
		record.detail = errorDetail(err);
		log("shipping_refund_failed", { session: session.id, error: record.detail.slice(0, 120) });
	}
	await putJson(env, key, record);
	return record;
}

export const listShippingRefunds = (env: Env) => listJson<ShippingRefund>(env, REFUND_PREFIX);

// --- Birthday posters -------------------------------------------------------

export interface PosterRecord {
	memberSessionId: string;
	/** Birthday year this poster is for. */
	year: number;
	birthday: string;
	childName: string;
	status: "HELD" | "ORDERED" | "FAILED" | "SKIPPED";
	detail: string | null;
	printfulOrderId: number | null;
	printfulStatus: string | null;
	/** Unguessable id of the rendered art (served at /api/squad/poster-art/<token>.png). */
	artToken: string | null;
	livemode: boolean;
	attempts: number;
	updatedAt: string;
}

export const posterKey = (sessionId: string, year: number) => `${POSTER_PREFIX}${sessionId}:${year}`;
export const listPosters = (env: Env) => listJson<PosterRecord>(env, POSTER_PREFIX);

export function postersMode(env: Env): "off" | "draft" | "on" {
	const v = (env.SQUAD_POSTERS ?? "off").trim().toLowerCase();
	return v === "on" || v === "draft" ? v : "off";
}

/** Why a due poster can't be ordered right now, or null if it can. */
function posterHold(env: Env, mode: FulfillmentMode, m: SquadMember): string | null {
	if (postersMode(env) === "off") return "POSTERS_OFF";
	if (!memberInScope(mode, m.livemode)) return m.livemode ? "LIVE_MEMBER_OUTSIDE_PRODUCTION" : "TEST_MEMBER_OUTSIDE_SANDBOX";
	if (!m.childName) return "NAME_MISSING";
	if (!m.nameConfirmed) return "NAME_UNCONFIRMED: confirm it with POST /api/admin/squad/members/<id>/confirm-name";
	const s = m.shipping;
	const missing = !s
		? ["address"]
		: (["name", "line1", "city", "state", "postalCode"] as const).filter((f) => !s[f]);
	if (missing.length) return `INVALID_ADDRESS:${missing.join(",")}`;
	if (s?.country !== "US") return "NON_US_ADDRESS";
	if (!env.PRINTFUL_API_TOKEN) return "PRINTFUL_NOT_CONFIGURED";
	if (!env.ASSETS) return "ASSETS_NOT_CONFIGURED";
	return null;
}

function randomToken(): string {
	const b = crypto.getRandomValues(new Uint8Array(18));
	return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** The rendered art for a poster token (PNG bytes), or null. */
export async function posterArt(env: Env, token: string): Promise<ArrayBuffer | null> {
	if (!/^[0-9a-f]{36}$/.test(token)) return null;
	return env.VISIBILITY_CACHE.get(ART_PREFIX + token, "arrayBuffer");
}

/**
 * Order one member's poster if it is due. Idempotent: an ORDERED or SKIPPED
 * poster is never touched again, and Printful is checked for our external id
 * before any order is created.
 */
export async function processPoster(
	env: Env,
	mode: FulfillmentMode,
	member: SquadMember,
	today: Date,
	{ force = false, subs }: { force?: boolean; subs?: Map<string, string> } = {},
): Promise<PosterRecord | null> {
	const due = nextPoster(member, today);
	if (!due || !due.eligible) return null;
	if (!force && today.toISOString().slice(0, 10) < due.orderOn) return null;
	const year = Number(due.birthday.slice(-4));
	const key = posterKey(member.sessionId, year);
	const prev = await getJson<PosterRecord>(env, key);
	if (prev && (prev.status === "ORDERED" || (prev.status === "SKIPPED" && !force))) return prev;
	if (prev?.status === "FAILED" && !force && prev.attempts >= MAX_AUTO_ATTEMPTS) return prev;

	const rec: PosterRecord = {
		memberSessionId: member.sessionId,
		year,
		birthday: due.birthday,
		childName: member.childName,
		status: "HELD",
		detail: null,
		printfulOrderId: prev?.printfulOrderId ?? null,
		printfulStatus: prev?.printfulStatus ?? null,
		artToken: prev?.artToken ?? null,
		livemode: member.livemode,
		attempts: prev?.attempts ?? 0,
		updatedAt: new Date().toISOString(),
	};
	const hold = posterHold(env, mode, member);
	if (hold) {
		rec.detail = hold;
		// Don't rewrite an identical hold every day.
		if (prev?.status !== "HELD" || prev.detail !== hold) await putJson(env, key, rec);
		return rec;
	}
	try {
		const status = await subscriptionStatus(env, member, subs);
		if (!ACTIVE.has(status)) {
			rec.status = ENDED.has(status) ? "SKIPPED" : "HELD";
			rec.detail = `MEMBERSHIP_${status.toUpperCase()}`;
			await putJson(env, key, rec);
			return rec;
		}
		rec.attempts++;
		const token = env.PRINTFUL_API_TOKEN!;
		const extId = await externalId(`squad-poster:${member.sessionId}:${year}`);
		let order = await getOrder(token, extId);
		if (!order) {
			if (!rec.artToken || !(await posterArt(env, rec.artToken))) {
				const png = await renderPosterPng(env.ASSETS!, member.childName);
				rec.artToken = randomToken();
				await env.VISIBILITY_CACHE.put(ART_PREFIX + rec.artToken, png, { expirationTtl: ART_TTL_SECONDS });
			}
			const s = member.shipping!;
			order = await createOrder(
				token,
				{
					external_id: extId,
					recipient: {
						name: s.name!.slice(0, 35),
						address1: s.line1!,
						...(s.line2 ? { address2: s.line2 } : {}),
						city: s.city!,
						state_code: s.state!,
						country_code: "US",
						zip: s.postalCode!,
						email: member.email ?? "orders@squishman.com",
					},
					items: [
						{
							variant_id: POSTER_VARIANT_ID,
							quantity: 1,
							name: `Squish Squad birthday poster (${POSTER_SIZE_LABEL}): ${member.childName}`,
							retail_price: "0.00",
							files: [{ type: "default", url: `${baseUrl(env)}/api/squad/poster-art/${rec.artToken}.png` }],
						},
					],
				},
				// "draft" mode, and test-mode members, leave the order for a human to confirm in Printful.
				postersMode(env) === "on" && mode === "production" && member.livemode,
			);
		}
		Object.assign(rec, {
			status: "ORDERED",
			detail: order.status === "draft" ? "PRINTFUL_DRAFT: confirm it in the Printful dashboard to print and ship" : null,
			printfulOrderId: order.id,
			printfulStatus: order.status,
		});
		log("poster_ordered", { member: member.sessionId, year, printful: order.id, printful_status: order.status });
	} catch (err) {
		rec.status = "FAILED";
		rec.detail = errorDetail(err);
		log("poster_failed", { member: member.sessionId, year, error: rec.detail.slice(0, 120) });
	}
	await putJson(env, key, rec);
	if (rec.status === "ORDERED" && member.email) {
		try {
			await sendOnce(env, `poster:${member.sessionId}:${year}`, {
				to: member.email,
				...posterEmail(env, { childName: member.childName, birthday: rec.birthday }),
				tags: [{ name: "type", value: "squad_poster" }],
			});
		} catch (err) {
			log("poster_email_failed", { member: member.sessionId, error: errorDetail(err).slice(0, 120) });
		}
	}
	return rec;
}

// --- Squish Squad Packs -----------------------------------------------------

export const packMonth = (d: Date) => d.toISOString().slice(0, 7);
export const isPackMonth = (s: string) => /^20\d\d-(0[1-9]|1[0-2])$/.test(s);

export async function getPack(env: Env, month: string): Promise<SquadPack | null> {
	return getJson<SquadPack>(env, PACK_PREFIX + month);
}

export const listPacks = (env: Env) => listJson<SquadPack>(env, PACK_PREFIX);

/** Validate admin input into a pack (throws with a readable message). */
export function parsePack(month: string, body: unknown): SquadPack {
	if (!isPackMonth(month)) throw new Error("Month must be YYYY-MM");
	const b = (body ?? {}) as Record<string, unknown>;
	const str = (k: string, max: number) => {
		const v = b[k];
		if (typeof v !== "string" || !v.trim()) throw new Error(`${k} is required`);
		return v.trim().slice(0, max);
	};
	const rawItems = Array.isArray(b.items) ? b.items : [];
	if (rawItems.length === 0 || rawItems.length > 20) throw new Error("items must list 1-20 pages");
	const items = rawItems.map((raw, i) => {
		const it = (raw ?? {}) as Record<string, unknown>;
		const title = typeof it.title === "string" ? it.title.trim().slice(0, 120) : "";
		const url = typeof it.url === "string" ? it.url.trim() : "";
		if (!title || !/^https:\/\/\S+$/.test(url)) throw new Error(`items[${i}] needs a title and an https url`);
		const description = typeof it.description === "string" && it.description.trim() ? it.description.trim().slice(0, 300) : undefined;
		return { title, url, ...(description ? { description } : {}) };
	});
	return {
		month,
		subject: str("subject", 150),
		heading: str("heading", 150),
		intro: str("intro", 1000),
		items,
		published: b.published === true,
		updatedAt: new Date().toISOString(),
	};
}

export async function savePack(env: Env, pack: SquadPack): Promise<void> {
	await putJson(env, PACK_PREFIX + pack.month, pack);
}

/** Send this month's published pack to one member (at most once). */
async function sendPack(
	env: Env,
	mode: FulfillmentMode,
	pack: SquadPack,
	member: SquadMember,
	subs: Map<string, string>,
): Promise<"sent" | "skipped" | "failed"> {
	if (!member.email || !memberInScope(mode, member.livemode)) return "skipped";
	const sentKey = `${PACK_SENT_PREFIX}${pack.month}:${member.sessionId}`;
	if (await env.VISIBILITY_CACHE.get(sentKey)) return "skipped";
	try {
		const status = await subscriptionStatus(env, member, subs);
		if (!ACTIVE.has(status)) return "skipped";
		const r = await sendOnce(env, `pack:${pack.month}:${member.sessionId}`, {
			from: env.SQUAD_EMAIL_FROM,
			to: member.email,
			...packEmail(env, pack, member.childName),
			headers: { "List-Unsubscribe": "<mailto:orders@squishman.com?subject=unsubscribe%20squad%20pack>" },
			tags: [{ name: "type", value: "squad_pack" }, { name: "month", value: pack.month.replace("-", "_") }],
		});
		if (r.status === "skipped") return "skipped";
		await env.VISIBILITY_CACHE.put(sentKey, new Date().toISOString());
		return "sent";
	} catch (err) {
		log("pack_failed", { member: member.sessionId, month: pack.month, error: errorDetail(err).slice(0, 120) });
		return "failed";
	}
}

/** Test-send a pack (published or not) to one address. */
export async function testSendPack(env: Env, pack: SquadPack, to: string) {
	return sendOnce(env, `pack-test:${pack.month}:${to}:${Date.now()}`, {
		from: env.SQUAD_EMAIL_FROM,
		to,
		...packEmail(env, pack, "Squish Squad member"),
		tags: [{ name: "type", value: "squad_pack_test" }],
	});
}

// --- Daily job --------------------------------------------------------------

export interface DailySummary {
	date: string;
	members: number;
	posters: Record<string, number>;
	pack: { month: string; published: boolean; sent: number; skipped: number; failed: number };
	ran: boolean;
}

/**
 * Run the daily Squish Squad work. The hourly cron calls this; it does its
 * work once per UTC day, at or after 14:00 UTC (morning in the US), so pack
 * emails arrive at a friendly hour. `force` runs it now regardless.
 */
export async function runSquadDaily(
	env: Env,
	mode: FulfillmentMode,
	now = new Date(),
	{ force = false }: { force?: boolean } = {},
): Promise<DailySummary> {
	const date = now.toISOString().slice(0, 10);
	const summary: DailySummary = {
		date,
		members: 0,
		posters: {},
		pack: { month: packMonth(now), published: false, sent: 0, skipped: 0, failed: 0 },
		ran: false,
	};
	if (!force && (now.getUTCHours() < 14 || (await env.VISIBILITY_CACHE.get(DAILY_PREFIX + date)))) return summary;
	summary.ran = true;
	const members = await listSquadMembers(env);
	summary.members = members.length;
	const subs = new Map<string, string>();
	const pack = await getPack(env, summary.pack.month);
	summary.pack.published = !!pack?.published;
	let failures = 0;
	for (const m of members) {
		// Members recorded before the email index existed.
		await indexMemberEmail(env, m);
		const poster = await processPoster(env, mode, m, now, { subs });
		if (poster) {
			summary.posters[poster.status] = (summary.posters[poster.status] ?? 0) + 1;
			if (poster.status === "FAILED" && poster.attempts < MAX_AUTO_ATTEMPTS) failures++;
		}
		if (pack?.published) {
			const r = await sendPack(env, mode, pack, m, subs);
			summary.pack[r]++;
			if (r === "failed") failures++;
		}
	}
	// Retry next hour when anything failed (each step is idempotent).
	if (failures === 0) await env.VISIBILITY_CACHE.put(DAILY_PREFIX + date, JSON.stringify(summary), { expirationTtl: 40 * 86_400 });
	log("daily", { ...summary });
	return summary;
}
