/**
 * Squish Squad Membership: the perks that run on their own, by tier
 * (Pal · Hero · Platinum Crown, see squad.ts).
 *
 *  - Order refunds (`squad:refund:<session>`), once per order paid with a
 *    member's email:
 *      Pal: up to $5.99 book shipping on book orders of $25+.
 *      Hero: book shipping on every book order, plus 10% back on books and merch.
 *      Platinum Crown: shipping on books and merch, plus 20% back on both.
 *  - Birthday gifts (`squad:poster:<session>:<year>`), two weeks before the
 *    1st of the birthday month: Pal gets a printable poster by email (Pal
 *    members from before the tiers keep the printed poster); Hero a printed
 *    8×10 poster; Platinum a box (poster + name tee + sticker) from Printful.
 *    Mailed gifts need yearly, or 3 months of a monthly membership.
 *  - Squish Mail (`squad:mail:<session>:<quarter>`): Platinum members get a
 *    Squish Man sticker in the mail every 3 months.
 *  - Squish Squad Packs: the pack published for the month is emailed once to
 *    every active member (`squad:pack-sent:<YYYY-MM>:<session>`).
 *
 * Perks only go to members whose Stripe subscription is active or trialing.
 */
import type { Env } from "../lib/types";
import {
	baseUrl,
	digitalBirthdayEmail,
	type PackItem,
	packBonus,
	packBonusEmail,
	packEmail,
	posterEmail,
	sendOnce,
	type SquadPack,
} from "./email";
import { BACK_CROWN_FILE, STICKER_FILES } from "./merch";
import { BUILT_IN_PACKS } from "./squad-packs";
import { createOrder, externalId, getOrder, PrintfulError, type PrintfulOrderItem } from "./printful";
import {
	birthdayGift,
	type BirthdayGift,
	listSquadMembers,
	membersByEmail,
	nextPoster,
	indexMemberEmail,
	type SquadMember,
	type SquadTier,
	tierOf,
} from "./squad";
import { POSTER_SIZE_LABEL, POSTER_VARIANT_ID, renderPosterPng, renderTeePng } from "./squad-poster";
import { createRefund, fetchSubscription, StripeError, type StripeCheckoutSession } from "./stripe";
import type { FulfillmentMode } from "./types";

export const SHIPPING_REFUND_MIN_ORDER_CENTS = 2500;
export const SHIPPING_REFUND_MAX_CENTS = 599;
/** Failed posters are retried by the daily job this many times, then wait for an admin retry. */
const MAX_AUTO_ATTEMPTS = 3;
/** Rendered poster art is kept this long for Printful to download (and for reprints). */
const ART_TTL_SECONDS = 120 * 86_400;

/** Hero / Platinum Crown cash back on books and merch. */
export const CASHBACK_RATE: Readonly<Record<SquadTier, number>> = { pal: 0, hero: 0.1, platinum: 0.2 };
const TIER_RANK: Readonly<Record<SquadTier, number>> = { pal: 1, hero: 2, platinum: 3 };

/** White kids' tee (Printful 3001Y) variant by size, for the Platinum birthday box. */
export const BOX_TEE_VARIANTS: Readonly<Record<string, number>> = {
	"Youth S": 9426,
	"Youth M": 9427,
	"Youth L": 9428,
	"Youth XL": 9429,
};
/** Printful 5.5″ kiss-cut sticker (Squish Mail and the birthday box). */
export const STICKER_VARIANT_ID = 10165;
const MAIL_STICKERS = Object.values(STICKER_FILES);
const YOUTH_AREA = { area_width: 1500, area_height: 1800 };

const REFUND_PREFIX = "squad:refund:";
const MAIL_PREFIX = "squad:mail:";
const POSTER_PREFIX = "squad:poster:";
const ART_PREFIX = "squad:poster-art:";
const PACK_PREFIX = "squad:pack:";
const PACK_SENT_PREFIX = "squad:pack-sent:";
const BONUS_SENT_PREFIX = "squad:pack-bonus-sent:";
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

// --- Order refunds (shipping + cash back) ------------------------------------

export interface ShippingRefund {
	sessionId: string;
	status: "REFUNDED" | "FAILED" | "NOT_ELIGIBLE";
	detail: string | null;
	/** Total refunded: shipping + cash back. */
	amountCents: number;
	shippingCents?: number;
	cashbackCents?: number;
	tier?: SquadTier | null;
	kind?: "books" | "merch";
	refundId: string | null;
	memberSessionId: string | null;
	livemode: boolean;
	at: string;
	attempts: number;
}

/** Product subtotal after discounts (cents) and the shipping charged on a session. */
export function orderAmounts(session: StripeCheckoutSession): { booksCents: number; shippingCents: number } {
	const subtotal = session.amount_subtotal ?? 0;
	const discount = session.total_details?.amount_discount ?? 0;
	const shipping = session.shipping_cost?.amount_total ?? session.total_details?.amount_shipping ?? 0;
	return { booksCents: Math.max(0, subtotal - discount), shippingCents: Math.max(0, shipping) };
}

/** What a tier gets back on an order (cents), and why nothing when it's 0. */
export function perkAmounts(
	tier: SquadTier,
	kind: "books" | "merch",
	o: { booksCents: number; shippingCents: number },
): { shippingCents: number; cashbackCents: number; reason: string | null } {
	let shipping = 0;
	let reason: string | null = null;
	if (tier === "platinum" || (tier === "hero" && kind === "books")) shipping = o.shippingCents;
	else if (tier === "pal" && kind === "books") {
		if (o.booksCents >= SHIPPING_REFUND_MIN_ORDER_CENTS) shipping = Math.min(o.shippingCents, SHIPPING_REFUND_MAX_CENTS);
		else reason = `ORDER_UNDER_MINIMUM:${o.booksCents}`;
	} else reason = "NO_PERK_FOR_TIER";
	const cashback = Math.floor(o.booksCents * CASHBACK_RATE[tier]);
	return { shippingCents: shipping, cashbackCents: cashback, reason: shipping + cashback > 0 ? null : (reason ?? "NOTHING_TO_REFUND") };
}

/**
 * Refund a Squish Squad member's perks on a paid book or merch order: shipping
 * and cash back by tier (the best active membership on the order's email).
 * Idempotent per session.
 */
export async function refundMemberShipping(
	env: Env,
	session: StripeCheckoutSession,
	{ force = false, kind = "books" }: { force?: boolean; kind?: "books" | "merch" } = {},
): Promise<ShippingRefund | null> {
	if ((env.SQUAD_SHIPPING_REFUNDS ?? "off").toLowerCase() !== "on") return null;
	const key = REFUND_PREFIX + session.id;
	const prev = await getJson<ShippingRefund>(env, key);
	if (prev && (prev.status === "REFUNDED" || (!force && prev.status === "NOT_ELIGIBLE"))) return prev;

	const amounts = orderAmounts(session);
	const record: ShippingRefund = {
		sessionId: session.id,
		status: "NOT_ELIGIBLE",
		detail: null,
		amountCents: 0,
		shippingCents: 0,
		cashbackCents: 0,
		tier: null,
		kind,
		refundId: null,
		memberSessionId: null,
		livemode: session.livemode,
		at: new Date().toISOString(),
		attempts: (prev?.attempts ?? 0) + 1,
	};
	const members = (await membersByEmail(env, session.customer_details?.email)).filter(
		(m) => m.livemode === session.livemode,
	);
	// Non-members stop here without a record; only orders that could qualify are stored.
	if (members.length === 0) return null;
	if (amounts.booksCents === 0 && amounts.shippingCents === 0) return null;
	try {
		let member: SquadMember | null = null;
		const statuses: string[] = [];
		for (const m of members) {
			const status = await subscriptionStatus(env, m);
			statuses.push(status);
			if (ACTIVE.has(status) && (!member || TIER_RANK[tierOf(m)] > TIER_RANK[tierOf(member)])) member = m;
		}
		if (!member) {
			record.detail = `MEMBERSHIP_NOT_ACTIVE:${statuses.join(",")}`;
			await putJson(env, key, record);
			return record;
		}
		const tier = tierOf(member);
		const perk = perkAmounts(tier, kind, amounts);
		Object.assign(record, { tier, memberSessionId: member.sessionId });
		if (perk.reason) {
			record.detail = perk.reason;
			await putJson(env, key, record);
			return record;
		}
		if (!session.payment_intent) throw new Error("NO_PAYMENT_INTENT");
		const total = Math.min(perk.shippingCents + perk.cashbackCents, session.amount_total ?? Number.MAX_SAFE_INTEGER);
		const refund = await createRefund(
			env.STRIPE_SECRET_KEY!,
			session.payment_intent,
			total,
			`squad-shipping-refund-${session.id}`,
			{
				reason: perk.cashbackCents ? "squish_squad_member_perks" : "squish_squad_free_shipping",
				member_session: member.sessionId,
				squad_tier: tier,
				shipping_cents: String(perk.shippingCents),
				cashback_cents: String(perk.cashbackCents),
			},
		);
		Object.assign(record, {
			status: "REFUNDED",
			amountCents: refund.amount,
			shippingCents: perk.shippingCents,
			cashbackCents: Math.max(0, refund.amount - perk.shippingCents),
			refundId: refund.id,
		});
		log("perks_refunded", { session: session.id, tier, kind, amount: refund.amount, refund: refund.id });
	} catch (err) {
		record.status = "FAILED";
		record.detail = errorDetail(err);
		log("shipping_refund_failed", { session: session.id, error: record.detail.slice(0, 120) });
	}
	await putJson(env, key, record);
	return record;
}

export const listShippingRefunds = (env: Env) => listJson<ShippingRefund>(env, REFUND_PREFIX);

// --- Birthday gifts -----------------------------------------------------------

export interface PosterRecord {
	memberSessionId: string;
	/** Birthday year this gift is for. */
	year: number;
	birthday: string;
	childName: string;
	/** What was sent: the Pal digital kit, a printed poster, or the Platinum box. */
	gift?: BirthdayGift;
	/** SENT: the digital kit was emailed. ORDERED: the Printful order exists. */
	status: "HELD" | "ORDERED" | "SENT" | "FAILED" | "SKIPPED";
	detail: string | null;
	printfulOrderId: number | null;
	printfulStatus: string | null;
	/** Unguessable id of the rendered art (served at /api/squad/poster-art/<token>.png). */
	artToken: string | null;
	/** Platinum: the name tee art. */
	teeArtToken?: string | null;
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

/** Why a mailed item can't be ordered for this member right now (address, keys, mode). */
function mailHold(env: Env, mode: FulfillmentMode, m: SquadMember): string | null {
	if (postersMode(env) === "off") return "POSTERS_OFF";
	if (!memberInScope(mode, m.livemode)) return m.livemode ? "LIVE_MEMBER_OUTSIDE_PRODUCTION" : "TEST_MEMBER_OUTSIDE_SANDBOX";
	const s = m.shipping;
	const missing = !s
		? ["address"]
		: (["name", "line1", "city", "state", "postalCode"] as const).filter((f) => !s[f]);
	if (missing.length) return `INVALID_ADDRESS:${missing.join(",")}`;
	if (s?.country !== "US") return "NON_US_ADDRESS";
	if (!env.PRINTFUL_API_TOKEN) return "PRINTFUL_NOT_CONFIGURED";
	return null;
}

/** Why a due birthday gift can't be sent right now, or null if it can. */
function giftHold(env: Env, mode: FulfillmentMode, m: SquadMember, gift: BirthdayGift): string | null {
	if (!m.childName) return "NAME_MISSING";
	if (!m.nameConfirmed) return "NAME_UNCONFIRMED: confirm it with POST /api/admin/squad/members/<id>/confirm-name";
	if (!env.ASSETS) return "ASSETS_NOT_CONFIGURED";
	if (gift === "digital") {
		if (!memberInScope(mode, m.livemode)) return m.livemode ? "LIVE_MEMBER_OUTSIDE_PRODUCTION" : "TEST_MEMBER_OUTSIDE_SANDBOX";
		if (!m.email) return "NO_EMAIL";
		return null;
	}
	const hold = mailHold(env, mode, m);
	if (hold) return hold;
	if (gift === "box" && !(m.shirtSize && BOX_TEE_VARIANTS[m.shirtSize])) {
		return "SHIRT_SIZE_NEEDED: the parent picks it on the welcome page";
	}
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

/** Store art under a new token unless `token` still has it. */
async function ensureArt(env: Env, token: string | null | undefined, make: () => Promise<Uint8Array>): Promise<string> {
	if (token && (await posterArt(env, token))) return token;
	const png = await make();
	const t = randomToken();
	await env.VISIBILITY_CACHE.put(ART_PREFIX + t, png, { expirationTtl: ART_TTL_SECONDS });
	return t;
}

const artUrl = (env: Env, token: string) => `${baseUrl(env)}/api/squad/poster-art/${token}.png`;

function recipient(member: SquadMember) {
	const s = member.shipping!;
	return {
		name: s.name!.slice(0, 35),
		address1: s.line1!,
		...(s.line2 ? { address2: s.line2 } : {}),
		city: s.city!,
		state_code: s.state!,
		country_code: "US",
		zip: s.postalCode!,
		email: member.email ?? "orders@squishman.com",
	};
}

/** "draft" mode, and test-mode members, leave orders for a human to confirm in Printful. */
const confirmOrders = (env: Env, mode: FulfillmentMode, member: SquadMember) =>
	postersMode(env) === "on" && mode === "production" && member.livemode;

/**
 * Send one member's birthday gift if it is due. Idempotent: a SENT, ORDERED or
 * SKIPPED gift is never touched again, and Printful is checked for our
 * external id before any order is created.
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
	const gift = birthdayGift(member);
	const year = Number(due.birthday.slice(-4));
	const key = posterKey(member.sessionId, year);
	const prev = await getJson<PosterRecord>(env, key);
	if (prev && (prev.status === "ORDERED" || prev.status === "SENT" || (prev.status === "SKIPPED" && !force))) return prev;
	if (prev?.status === "FAILED" && !force && prev.attempts >= MAX_AUTO_ATTEMPTS) return prev;

	const rec: PosterRecord = {
		memberSessionId: member.sessionId,
		year,
		birthday: due.birthday,
		childName: member.childName,
		gift,
		status: "HELD",
		detail: null,
		printfulOrderId: prev?.printfulOrderId ?? null,
		printfulStatus: prev?.printfulStatus ?? null,
		artToken: prev?.artToken ?? null,
		teeArtToken: prev?.teeArtToken ?? null,
		livemode: member.livemode,
		attempts: prev?.attempts ?? 0,
		updatedAt: new Date().toISOString(),
	};
	const hold = giftHold(env, mode, member, gift);
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
		rec.artToken = await ensureArt(env, rec.artToken, () => renderPosterPng(env.ASSETS!, member.childName));

		if (gift === "digital") {
			const r = await sendOnce(env, `birthday-kit:${member.sessionId}:${year}`, {
				to: member.email!,
				...digitalBirthdayEmail(env, { childName: member.childName, birthday: due.birthday, artUrl: artUrl(env, rec.artToken) }),
				tags: [{ name: "type", value: "squad_birthday_kit" }],
			});
			if (r.status === "skipped") {
				rec.status = "HELD";
				rec.detail = `EMAIL_${r.reason}`;
			} else {
				rec.status = "SENT";
				rec.detail = null;
				log("birthday_kit_sent", { member: member.sessionId, year });
			}
			await putJson(env, key, rec);
			return rec;
		}

		const token = env.PRINTFUL_API_TOKEN!;
		const extId = await externalId(`squad-poster:${member.sessionId}:${year}`);
		let order = await getOrder(token, extId);
		if (!order) {
			const items: PrintfulOrderItem[] = [
				{
					variant_id: POSTER_VARIANT_ID,
					quantity: 1,
					name: `Squish Squad birthday poster (${POSTER_SIZE_LABEL}): ${member.childName}`,
					retail_price: "0.00",
					files: [{ type: "default", url: artUrl(env, rec.artToken) }],
				},
			];
			if (gift === "box") {
				rec.teeArtToken = await ensureArt(env, rec.teeArtToken, () => renderTeePng(env.ASSETS!, member.childName));
				items.push(
					{
						variant_id: BOX_TEE_VARIANTS[member.shirtSize!],
						quantity: 1,
						name: `Squish Squad birthday tee (${member.shirtSize}): ${member.childName}`,
						retail_price: "0.00",
						files: [
							{ type: "front", url: artUrl(env, rec.teeArtToken) },
							{ type: "back", id: BACK_CROWN_FILE, position: { ...YOUTH_AREA, width: 1366, height: 1152, top: 100, left: 67 } },
						],
					},
					{
						variant_id: STICKER_VARIANT_ID,
						quantity: 1,
						name: "Squish Squad sticker",
						retail_price: "0.00",
						files: [{ type: "default", id: STICKER_FILES.MH_PALS }],
					},
				);
			}
			order = await createOrder(token, { external_id: extId, recipient: recipient(member), items }, confirmOrders(env, mode, member));
		}
		Object.assign(rec, {
			status: "ORDERED",
			detail: order.status === "draft" ? "PRINTFUL_DRAFT: confirm it in the Printful dashboard to print and ship" : null,
			printfulOrderId: order.id,
			printfulStatus: order.status,
		});
		log("poster_ordered", { member: member.sessionId, year, gift, printful: order.id, printful_status: order.status });
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
				...posterEmail(env, { childName: member.childName, birthday: rec.birthday, box: gift === "box" }),
				tags: [{ name: "type", value: "squad_poster" }],
			});
		} catch (err) {
			log("poster_email_failed", { member: member.sessionId, error: errorDetail(err).slice(0, 120) });
		}
	}
	return rec;
}

// --- Squish Mail (Platinum Crown) ------------------------------------------------

export interface SquishMailRecord {
	memberSessionId: string;
	/** 1 = after 3 months of membership, 2 = after 6, ... */
	quarter: number;
	status: "HELD" | "ORDERED" | "FAILED" | "SKIPPED";
	detail: string | null;
	stickerFileId: number;
	printfulOrderId: number | null;
	printfulStatus: string | null;
	livemode: boolean;
	attempts: number;
	updatedAt: string;
}

export const listSquishMail = (env: Env) => listJson<SquishMailRecord>(env, MAIL_PREFIX);

/** Whole months between two dates (counting a month once its day has come round). */
export function monthsBetween(from: Date, to: Date): number {
	const m = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
	return Math.max(0, m - (to.getUTCDate() < from.getUTCDate() ? 1 : 0));
}

/** Mail a Platinum member this quarter's Squish Man sticker, once. */
export async function processSquishMail(
	env: Env,
	mode: FulfillmentMode,
	member: SquadMember,
	today: Date,
	{ subs }: { subs?: Map<string, string> } = {},
): Promise<SquishMailRecord | null> {
	if (tierOf(member) !== "platinum") return null;
	const quarter = Math.floor(monthsBetween(new Date(member.joinedAt), today) / 3);
	if (quarter < 1) return null;
	const key = `${MAIL_PREFIX}${member.sessionId}:${quarter}`;
	const prev = await getJson<SquishMailRecord>(env, key);
	if (prev && (prev.status === "ORDERED" || prev.status === "SKIPPED")) return prev;
	if (prev?.status === "FAILED" && prev.attempts >= MAX_AUTO_ATTEMPTS) return prev;
	const rec: SquishMailRecord = {
		memberSessionId: member.sessionId,
		quarter,
		status: "HELD",
		detail: null,
		stickerFileId: MAIL_STICKERS[(quarter - 1) % MAIL_STICKERS.length],
		printfulOrderId: null,
		printfulStatus: null,
		livemode: member.livemode,
		attempts: prev?.attempts ?? 0,
		updatedAt: new Date().toISOString(),
	};
	const hold = mailHold(env, mode, member);
	if (hold) {
		rec.detail = hold;
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
		const extId = await externalId(`squad-mail:${member.sessionId}:${quarter}`);
		const order =
			(await getOrder(token, extId)) ??
			(await createOrder(
				token,
				{
					external_id: extId,
					recipient: recipient(member),
					items: [
						{
							variant_id: STICKER_VARIANT_ID,
							quantity: 1,
							name: "Squish Mail sticker",
							retail_price: "0.00",
							files: [{ type: "default", id: rec.stickerFileId }],
						},
					],
				},
				confirmOrders(env, mode, member),
			));
		Object.assign(rec, {
			status: "ORDERED",
			detail: order.status === "draft" ? "PRINTFUL_DRAFT: confirm it in the Printful dashboard to print and ship" : null,
			printfulOrderId: order.id,
			printfulStatus: order.status,
		});
		log("squish_mail_ordered", { member: member.sessionId, quarter, printful: order.id });
	} catch (err) {
		rec.status = "FAILED";
		rec.detail = errorDetail(err);
		log("squish_mail_failed", { member: member.sessionId, quarter, error: rec.detail.slice(0, 120) });
	}
	await putJson(env, key, rec);
	return rec;
}

// --- Squish Squad Packs -----------------------------------------------------

export const packMonth = (d: Date) => d.toISOString().slice(0, 7);
export const isPackMonth = (s: string) => /^20\d\d-(0[1-9]|1[0-2])$/.test(s);

/** The month's pack: one saved via the admin API, else the built-in one (squad-packs.ts). */
export async function getPack(env: Env, month: string): Promise<SquadPack | null> {
	return (await getJson<SquadPack>(env, PACK_PREFIX + month)) ?? BUILT_IN_PACKS[month] ?? null;
}

export async function listPacks(env: Env): Promise<SquadPack[]> {
	const saved = await listJson<SquadPack>(env, PACK_PREFIX);
	const months = new Set(saved.map((p) => p.month));
	return [...saved, ...Object.values(BUILT_IN_PACKS).filter((p) => !months.has(p.month))];
}

/** Validate admin input into a pack (throws with a readable message). */
export function parsePack(month: string, body: unknown): SquadPack {
	if (!isPackMonth(month)) throw new Error("Month must be YYYY-MM");
	const b = (body ?? {}) as Record<string, unknown>;
	const str = (k: string, max: number) => {
		const v = b[k];
		if (typeof v !== "string" || !v.trim()) throw new Error(`${k} is required`);
		return v.trim().slice(0, max);
	};
	const parseItems = (raw: unknown, where: string, min: number): PackItem[] => {
		const list = Array.isArray(raw) ? raw : [];
		if (list.length < min || list.length > 20) throw new Error(`${where} must list ${min}-20 pages`);
		return list.map((r, i) => {
			const it = (r ?? {}) as Record<string, unknown>;
			const title = typeof it.title === "string" ? it.title.trim().slice(0, 120) : "";
			const url = typeof it.url === "string" ? it.url.trim() : "";
			if (!title || !/^https:\/\/\S+$/.test(url)) throw new Error(`${where}[${i}] needs a title and an https url`);
			const description = typeof it.description === "string" && it.description.trim() ? it.description.trim().slice(0, 300) : undefined;
			return { title, url, ...(description ? { description } : {}) };
		});
	};
	const items = parseItems(b.items, "items", 1);
	const rawBonus = (b.bonus ?? {}) as Record<string, unknown>;
	const hero = rawBonus.hero === undefined ? [] : parseItems(rawBonus.hero, "bonus.hero", 0);
	const platinum = rawBonus.platinum === undefined ? [] : parseItems(rawBonus.platinum, "bonus.platinum", 0);
	const bonus = hero.length || platinum.length ? { ...(hero.length ? { hero } : {}), ...(platinum.length ? { platinum } : {}) } : undefined;
	return {
		month,
		subject: str("subject", 150),
		heading: str("heading", 150),
		intro: str("intro", 1000),
		items,
		...(bonus ? { bonus } : {}),
		published: b.published === true,
		updatedAt: new Date().toISOString(),
	};
}

export async function savePack(env: Env, pack: SquadPack): Promise<void> {
	await putJson(env, PACK_PREFIX + pack.month, pack);
}

/**
 * Send this month's published pack to one member (at most once), with their
 * tier's bonus pages. Bonus pages added after the pack went out are sent in a
 * follow-up email, also at most once.
 */
async function sendPack(
	env: Env,
	mode: FulfillmentMode,
	pack: SquadPack,
	member: SquadMember,
	subs: Map<string, string>,
): Promise<"sent" | "skipped" | "failed"> {
	if (!member.email || !memberInScope(mode, member.livemode)) return "skipped";
	const tier = tierOf(member);
	const hasBonus = packBonus(pack, tier).length > 0;
	const sentKey = `${PACK_SENT_PREFIX}${pack.month}:${member.sessionId}`;
	const bonusKey = `${BONUS_SENT_PREFIX}${pack.month}:${member.sessionId}`;
	const packSent = !!(await env.VISIBILITY_CACHE.get(sentKey));
	if (packSent && (!hasBonus || (await env.VISIBILITY_CACHE.get(bonusKey)))) return "skipped";
	try {
		const status = await subscriptionStatus(env, member, subs);
		if (!ACTIVE.has(status)) return "skipped";
		const common = {
			from: env.SQUAD_EMAIL_FROM,
			to: member.email,
			headers: { "List-Unsubscribe": "<mailto:orders@squishman.com?subject=unsubscribe%20squad%20pack>" },
		};
		const r = packSent
			? await sendOnce(env, `pack-bonus:${pack.month}:${member.sessionId}`, {
					...common,
					...packBonusEmail(env, pack, member.childName, tier),
					tags: [{ name: "type", value: "squad_pack_bonus" }, { name: "month", value: pack.month.replace("-", "_") }],
				})
			: await sendOnce(env, `pack:${pack.month}:${member.sessionId}`, {
					...common,
					...packEmail(env, pack, member.childName, tier),
					tags: [{ name: "type", value: "squad_pack" }, { name: "month", value: pack.month.replace("-", "_") }],
				});
		if (r.status === "skipped") return "skipped";
		const at = new Date().toISOString();
		if (!packSent) await env.VISIBILITY_CACHE.put(sentKey, at);
		if (hasBonus) await env.VISIBILITY_CACHE.put(bonusKey, at);
		return "sent";
	} catch (err) {
		log("pack_failed", { member: member.sessionId, month: pack.month, error: errorDetail(err).slice(0, 120) });
		return "failed";
	}
}

/** Test-send a pack (published or not) to one address, as a given tier would get it. */
export async function testSendPack(env: Env, pack: SquadPack, to: string, tier: SquadTier = "pal") {
	return sendOnce(env, `pack-test:${pack.month}:${tier}:${to}:${Date.now()}`, {
		from: env.SQUAD_EMAIL_FROM,
		to,
		...packEmail(env, pack, "Squish Squad member", tier),
		tags: [{ name: "type", value: "squad_pack_test" }],
	});
}

// --- Daily job --------------------------------------------------------------

export interface DailySummary {
	date: string;
	members: number;
	posters: Record<string, number>;
	squishMail: Record<string, number>;
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
		squishMail: {},
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
		const mail = await processSquishMail(env, mode, m, now, { subs });
		if (mail) {
			summary.squishMail[mail.status] = (summary.squishMail[mail.status] ?? 0) + 1;
			if (mail.status === "FAILED" && mail.attempts < MAX_AUTO_ATTEMPTS) failures++;
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
