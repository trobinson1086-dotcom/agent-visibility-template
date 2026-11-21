/**
 * Buyer referral program ("Share the Squish").
 *
 * Every squishman.com book buyer gets a personal code (SQUISHMEGHAN7K2P). A
 * friend who uses it saves 15% on their first order, and the buyer earns a
 * free Squish Man coloring book. Switched by REFERRALS ("off" by default):
 * while it is off, nothing here creates codes, changes checkouts or sends email.
 *
 * How it fits together:
 *   - Codes are Stripe Promotion Codes on one 15%-off coupon (REFERRAL_COUPON_ID),
 *     with Stripe-side limits: first-time customers, a minimum order and a cap
 *     on uses per code. Stripe still accepts first-time codes from guest
 *     checkouts, so the worker does its own "new buyer" check before rewarding.
 *   - issueReferralCode runs after a paid book order and puts the code in the
 *     order email. One code per buyer email, reused on later orders.
 *   - rewardReferral runs on every paid order that used a referral code and
 *     decides whether the code's owner earns a coloring book (see REJECT reasons).
 *   - The reward is the digital Coloring Book 1 (a private reward page with the
 *     download), at no cost. REFERRAL_REWARD="digital+print" also lists a printed
 *     copy for the owner to mail by hand (coloring books are not on Lulu yet).
 *   - public/ref.js keeps ?ref=CODE from a share link and pre-fills it at
 *     checkout (Payment Links need "allow promotion codes" turned on for that).
 *
 * KV keys (VISIBILITY_CACHE):
 *   ref:code:<CODE>        ReferralCode record
 *   ref:promo:<promoId>    CODE
 *   ref:owner:<emailKey>   CODE (one code per buyer)
 *   ref:issued:<session>   CODE (idempotent issue per order)
 *   ref:friend:<emailKey>  FriendRecord (a friend counts once, ever)
 *   ref:reward:<token>     RewardRecord (the private reward page)
 */
import type { Env } from "../lib/types";
import { toHex } from "./crypto";
import { baseUrl, esc, layout, REPLY_TO, sendOnce } from "./email";
import { driveDownloadUrl, driveViewUrl } from "./ebooks";
import { shippingFromSession, type StripeCheckoutSession } from "./stripe";

const STRIPE_API = "https://api.stripe.com/v1";
/** Promotion Codes use `promotion[coupon]` from this API version on. */
const STRIPE_VERSION = "2025-09-30.clover";
const TIMEOUT_MS = 10_000;

/** Defaults; each can be changed with a REFERRAL_* var. */
export const REFERRAL_DEFAULTS = {
	percentOff: 15,
	/** Friends who can use one buyer's code (Stripe max_redemptions). */
	maxUsesPerCode: 25,
	/** Coloring books one buyer can earn. */
	maxRewardsPerReferrer: 5,
	/** Smallest order the friend's code works on, in cents (keeps $4.99 eBooks out). */
	minOrderCents: 1200,
} as const;

/** The reward: Squish Man Coloring Book 1 (8×10 interior, "anyone with the link" in Drive). */
export const REWARD_FILE = {
	title: "Squish Man Coloring Book 1",
	driveFileId: "1_xinkvvCCiWYvZgKG1kZMYTGShnLXSPN",
} as const;

export const CODE_RE = /^SQUISH[A-Z]{0,8}[A-HJ-NP-Z2-9]{4}$/;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TOKEN_RE = /^[0-9a-f]{36}$/;

export interface ReferralCode {
	code: string;
	promoId: string;
	ownerEmail: string;
	ownerEmailKey: string;
	ownerName: string | null;
	/** Hash of the owner's street + ZIP, to catch a second email at the same house. */
	ownerAddressKey: string | null;
	session: string;
	createdAt: string;
	rewards: number;
	livemode: boolean;
}

export interface FriendRecord {
	code: string;
	session: string;
	outcome: RewardOutcome;
	at: string;
}

export interface RewardRecord {
	code: string;
	friendSession: string;
	print: boolean;
	at: string;
}

export type RewardOutcome =
	| "rewarded"
	| "self_referral"
	| "same_address"
	| "friend_already_counted"
	| "not_new_buyer"
	| "cap_reached";

const log = (event: string, data: Record<string, unknown>) =>
	console.log(JSON.stringify({ at: "referrals", event, ...data }));

// --- Settings ---------------------------------------------------------------

export function referralsOn(env: Env): boolean {
	return (env.REFERRALS ?? "off").trim().toLowerCase() === "on" && Boolean(env.REFERRAL_COUPON_ID);
}

function intVar(raw: string | undefined, fallback: number, min: number, max: number): number {
	const n = Number.parseInt(raw ?? "", 10);
	return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

export function referralSettings(env: Env) {
	return {
		percentOff: REFERRAL_DEFAULTS.percentOff,
		maxUsesPerCode: intVar(env.REFERRAL_MAX_USES, REFERRAL_DEFAULTS.maxUsesPerCode, 1, 1000),
		maxRewardsPerReferrer: intVar(env.REFERRAL_MAX_REWARDS, REFERRAL_DEFAULTS.maxRewardsPerReferrer, 0, 1000),
		minOrderCents: intVar(env.REFERRAL_MIN_ORDER_CENTS, REFERRAL_DEFAULTS.minOrderCents, 0, 100_000),
		print: (env.REFERRAL_REWARD ?? "digital").trim().toLowerCase() === "digital+print",
	};
}

// --- Identity helpers -------------------------------------------------------

/** Lowercase; drop "+tags"; Gmail ignores dots, so drop those too. */
export function normalizeEmail(email: string): string {
	const e = email.trim().toLowerCase();
	const at = e.lastIndexOf("@");
	if (at < 1) return e;
	let local = e.slice(0, at).split("+")[0];
	let domain = e.slice(at + 1);
	if (domain === "googlemail.com") domain = "gmail.com";
	if (domain === "gmail.com") local = local.replace(/\./g, "");
	return `${local}@${domain}`;
}

async function sha256(s: string): Promise<string> {
	return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
}

export async function emailKey(email: string): Promise<string> {
	return sha256(`email:${normalizeEmail(email)}`);
}

/** Street line 1 (letters and digits only) + 5-digit ZIP, hashed. Null if either is missing. */
export async function addressKey(session: StripeCheckoutSession): Promise<string | null> {
	const { shipping } = shippingFromSession(session);
	const street = shipping.street1.toLowerCase().replace(/[^a-z0-9]/g, "");
	const zip = shipping.postcode.replace(/[^0-9]/g, "").slice(0, 5);
	if (!street || zip.length < 5) return null;
	return sha256(`addr:${street}|${zip}`);
}

/** SQUISH + up to 8 letters of the first name + 4 random characters. */
export function makeCode(name: string | null | undefined, random: Uint8Array = crypto.getRandomValues(new Uint8Array(4))): string {
	const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
	const letters = first
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toUpperCase()
		.replace(/[^A-Z]/g, "")
		.slice(0, 8);
	const tail = Array.from(random.slice(0, 4), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
	return `SQUISH${letters}${tail}`;
}

export function shareUrl(env: Env, code: string): string {
	return `${baseUrl(env)}/?ref=${encodeURIComponent(code)}`;
}

// --- Stripe -----------------------------------------------------------------

async function stripe<T>(env: Env, method: "GET" | "POST", path: string, fields?: Record<string, string>): Promise<T> {
	const res = await fetch(`${STRIPE_API}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
			"Stripe-Version": STRIPE_VERSION,
			...(fields ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
		},
		body: fields ? new URLSearchParams(fields).toString() : undefined,
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`Stripe ${method} ${path.split("?")[0]} failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
	return JSON.parse(text) as T;
}

/** Promotion code IDs applied to a Checkout Session (handles both API shapes). */
export function promotionCodeIds(session: StripeCheckoutSession): string[] {
	const out: string[] = [];
	for (const d of session.discounts ?? []) {
		const p = d?.promotion_code;
		const id = typeof p === "string" ? p : p && typeof p === "object" ? p.id : null;
		if (id && !out.includes(id)) out.push(id);
	}
	return out;
}

/** Has this email paid for anything before this session? (Stripe is the source of truth.) */
async function boughtBefore(env: Env, email: string, session: StripeCheckoutSession): Promise<boolean> {
	const emails = new Set([email.trim(), email.trim().toLowerCase()]);
	for (const e of emails) {
		const params = new URLSearchParams({ "customer_details[email]": e, status: "complete", limit: "20" });
		const list = await stripe<{ data: StripeCheckoutSession[] }>(env, "GET", `/checkout/sessions?${params}`);
		for (const s of list.data) {
			if (s.id === session.id || s.payment_status !== "paid") continue;
			if (!session.created || !s.created || s.created < session.created) return true;
		}
	}
	return false;
}

// --- Codes ------------------------------------------------------------------

export async function getCode(env: Env, code: string): Promise<ReferralCode | null> {
	const c = code.trim().toUpperCase();
	if (!CODE_RE.test(c)) return null;
	return (await env.VISIBILITY_CACHE.get(`ref:code:${c}`, "json")) as ReferralCode | null;
}

async function putCode(env: Env, rec: ReferralCode): Promise<void> {
	await env.VISIBILITY_CACHE.put(`ref:code:${rec.code}`, JSON.stringify(rec));
}

/**
 * The buyer's personal code: an existing one for this email, or a new Stripe
 * Promotion Code. Null when the program is off or the order can't have one.
 */
export async function issueReferralCode(env: Env, session: StripeCheckoutSession): Promise<ReferralCode | null> {
	if (!referralsOn(env) || !env.STRIPE_SECRET_KEY) return null;
	if (session.payment_status !== "paid") return null;
	const email = session.customer_details?.email?.trim();
	if (!email) return null;
	const kv = env.VISIBILITY_CACHE;
	const issued = await kv.get(`ref:issued:${session.id}`);
	if (issued) return getCode(env, issued);
	const ownerEmailKey = await emailKey(email);
	const existing = await kv.get(`ref:owner:${ownerEmailKey}`);
	if (existing) {
		await kv.put(`ref:issued:${session.id}`, existing);
		return getCode(env, existing);
	}
	const s = referralSettings(env);
	const name = session.customer_details?.name ?? null;
	let promo: { id: string; code: string } | null = null;
	for (let attempt = 0; attempt < 3 && !promo; attempt++) {
		const code = makeCode(name);
		try {
			promo = await stripe<{ id: string; code: string }>(env, "POST", "/promotion_codes", {
				"promotion[type]": "coupon",
				"promotion[coupon]": env.REFERRAL_COUPON_ID!,
				code,
				max_redemptions: String(s.maxUsesPerCode),
				"restrictions[first_time_transaction]": "true",
				"restrictions[minimum_amount]": String(s.minOrderCents),
				"restrictions[minimum_amount_currency]": "usd",
				"metadata[program]": "referral",
				"metadata[referrer_session]": session.id,
			});
		} catch (err) {
			// A clash with an existing code is the only error worth another try.
			if (!/already exists|code_already_exists|resource_already_exists/i.test(String(err))) throw err;
			log("code_clash", { session: session.id });
		}
	}
	if (!promo) throw new Error("Could not create a unique referral code");
	const rec: ReferralCode = {
		code: promo.code.toUpperCase(),
		promoId: promo.id,
		ownerEmail: email,
		ownerEmailKey,
		ownerName: name,
		ownerAddressKey: await addressKey(session),
		session: session.id,
		createdAt: new Date().toISOString(),
		rewards: 0,
		livemode: session.livemode,
	};
	await putCode(env, rec);
	await Promise.all([
		kv.put(`ref:promo:${rec.promoId}`, rec.code),
		kv.put(`ref:owner:${ownerEmailKey}`, rec.code),
		kv.put(`ref:issued:${session.id}`, rec.code),
	]);
	log("code_issued", { session: session.id, code: rec.code });
	return rec;
}

// --- Rewards ----------------------------------------------------------------

/**
 * A paid order used a referral code: decide whether its owner earns the
 * coloring book, and if so send the reward email. A friend is counted once,
 * whatever the outcome, so the same person can't be counted again later.
 */
export async function rewardReferral(
	env: Env,
	session: StripeCheckoutSession,
): Promise<{ code: string; outcome: RewardOutcome } | null> {
	if (!referralsOn(env) || session.payment_status !== "paid") return null;
	const kv = env.VISIBILITY_CACHE;
	let rec: ReferralCode | null = null;
	for (const id of promotionCodeIds(session)) {
		const code = await kv.get(`ref:promo:${id}`);
		if (code) rec = await getCode(env, code);
		if (rec) break;
	}
	if (!rec) return null;
	const email = session.customer_details?.email?.trim();
	if (!email) return null;
	const friendKey = await emailKey(email);
	const friendMarker = `ref:friend:${friendKey}`;
	const prior = (await kv.get(friendMarker, "json")) as FriendRecord | null;
	if (prior?.session === session.id) return { code: prior.code, outcome: prior.outcome };

	let outcome: RewardOutcome;
	if (friendKey === rec.ownerEmailKey) outcome = "self_referral";
	else if (rec.ownerAddressKey && rec.ownerAddressKey === (await addressKey(session))) outcome = "same_address";
	else if (prior) outcome = "friend_already_counted";
	else if ((await kv.get(`ref:owner:${friendKey}`)) || (await boughtBefore(env, email, session))) outcome = "not_new_buyer";
	else if (rec.rewards >= referralSettings(env).maxRewardsPerReferrer) outcome = "cap_reached";
	else outcome = "rewarded";

	if (!prior) {
		await kv.put(friendMarker, JSON.stringify({ code: rec.code, session: session.id, outcome, at: new Date().toISOString() } satisfies FriendRecord));
	}
	log("referral", { session: session.id, code: rec.code, outcome });
	if (outcome !== "rewarded") return { code: rec.code, outcome };

	rec.rewards += 1;
	await putCode(env, rec);
	const token = toHex(crypto.getRandomValues(new Uint8Array(18)));
	const print = referralSettings(env).print;
	await kv.put(`ref:reward:${token}`, JSON.stringify({ code: rec.code, friendSession: session.id, print, at: new Date().toISOString() } satisfies RewardRecord));
	try {
		await sendOnce(env, `referral-reward:${session.id}`, {
			to: rec.ownerEmail,
			...rewardEmail(env, { name: rec.ownerName, code: rec.code, token, rewards: rec.rewards, print }),
			tags: [{ name: "type", value: "referral_reward" }],
		});
	} catch (err) {
		log("email_failed", { session: session.id, error: String(err).slice(0, 120) });
	}
	return { code: rec.code, outcome };
}

// --- Emails and pages -------------------------------------------------------

/** The block added to the order email: the buyer's own code and share link. */
export function referralEmailBlock(env: Env, code: string): { html: string; text: string[] } {
	const s = referralSettings(env);
	const link = shareUrl(env, code);
	const html = `<div style="background:#e8f1ff;border-radius:14px;padding:16px;margin:20px 0">
<h2 style="font-size:18px;color:#07347d;margin:0 0 8px">🎁 Share Squish Man, get a free coloring book</h2>
<p style="margin:0 0 8px">Your friends save <b>${s.percentOff}% on their first order</b> with your code:</p>
<p style="font-size:22px;font-weight:900;letter-spacing:2px;color:#07347d;margin:0 0 8px">${esc(code)}</p>
<p style="margin:0 0 8px">When a friend orders with it, we'll email you a <b>free Squish Man coloring book</b> to print at home${s.print ? ", and mail you a printed copy too" : ""}.</p>
<p style="margin:0"><a href="${esc(link)}" style="color:#0758bd;font-weight:700">Share your link: ${esc(link.replace(/^https?:\/\//, ""))}</a></p>
<p style="font-size:12px;color:#4b5a7c;margin:8px 0 0">For new customers, on orders of $${(s.minOrderCents / 100).toFixed(2)} or more. Up to ${s.maxRewardsPerReferrer} free coloring books per code.</p></div>`;
	const text = [
		"",
		`Share Squish Man, get a free coloring book: your friends save ${s.percentOff}% on their first order with your code ${code}.`,
		`When a friend orders with it, we'll email you a free Squish Man coloring book${s.print ? " and mail you a printed copy" : ""}.`,
		`Share your link: ${link}`,
	];
	return { html, text };
}

export function rewardEmail(
	env: Env,
	r: { name: string | null; code: string; token: string; rewards: number; print: boolean },
): { subject: string; html: string; text: string } {
	const link = `${baseUrl(env)}/api/referral/reward?t=${r.token}`;
	const hello = r.name ? `Hi ${esc(r.name.split(" ")[0])},` : "Hi there,";
	const html = layout(
		env,
		"Your free Squish Man coloring book",
		`<h1 style="font-size:24px;color:#07347d;margin:0 0 12px">A friend used your code! 🎉</h1>
<p>${hello}</p>
<p>Someone you shared Squish Man with just placed their first order with your code <b>${esc(r.code)}</b>. Thank you for spreading the word!</p>
<p>Here's your free <b>Squish Man Coloring Book</b>, ready to print at home:</p>
<p><a href="${esc(link)}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#ffd632;color:#07347d;font-weight:800;text-decoration:none">Get my coloring book</a></p>
${r.print ? `<p>📦 We'll also mail you a printed copy. Reply with your mailing address if it's different from your last order.</p>` : ""}
<p>Keep sharing: every new friend who orders with your code earns you another reward.</p>`,
	);
	const text = [
		r.name ? `Hi ${r.name.split(" ")[0]},` : "Hi there,",
		"",
		`A friend just placed their first order with your code ${r.code}. Thank you for spreading the word!`,
		"",
		`Here's your free Squish Man Coloring Book, ready to print at home: ${link}`,
		...(r.print ? ["", "We'll also mail you a printed copy. Reply with your mailing address if it's different from your last order."] : []),
		"",
		`Questions? Reply to this email or write to ${REPLY_TO}.`,
	].join("\n");
	return { subject: "A friend used your Squish Man code: your free coloring book 🎁", html, text };
}

function page(title: string, body: string): string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Squish Man™</title><style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fff8ec;color:#2b2140}
main{max-width:560px;margin:0 auto;padding:32px 16px;text-align:center}
h1{font-size:1.6rem;margin:0 0 8px}
a.btn{display:inline-block;margin:6px;padding:12px 18px;border-radius:999px;background:#e8452c;color:#fff;font-weight:700;text-decoration:none}
a.btn.alt{background:#2b2140}
p.small{font-size:.9rem;color:#5a4f6e}
</style></head><body><main>${body}<p class="small">Questions? Email <a href="mailto:orders@squishman.com">orders@squishman.com</a>.</p><p><a href="/">← Back to squishman.com</a></p></main></body></html>`;
}

/** GET /api/referral/reward?t=<token>: the private download page for an earned coloring book. */
export async function rewardPage(env: Env, token: string | undefined): Promise<{ status: number; html: string }> {
	const rec = token && TOKEN_RE.test(token) ? ((await env.VISIBILITY_CACHE.get(`ref:reward:${token}`, "json")) as RewardRecord | null) : null;
	if (!rec) {
		return { status: 404, html: page("Reward", `<h1>We couldn't find that reward</h1><p>Please use the button in your reward email, or email us and we'll send it again.</p>`) };
	}
	return {
		status: 200,
		html: page(
			"Your free coloring book",
			`<h1>🎨 Your free Squish Man Coloring Book</h1><p>Thank you for sharing Squish Man! Print as many pages as you like.</p>
<p><a class="btn" href="${driveDownloadUrl(REWARD_FILE.driveFileId)}">Download the PDF</a><a class="btn alt" href="${driveViewUrl(REWARD_FILE.driveFileId)}">Open it</a></p>
${rec.print ? `<p>📦 A printed copy is on its way to you too.</p>` : ""}
<p class="small">Share your code with more friends to earn more rewards.</p>`,
		),
	};
}

/** GET /api/referral/check?code=…: lets the site show the friend's discount. Reveals nothing about the owner. */
export async function checkCode(env: Env, code: string | undefined): Promise<{ on: boolean; valid: boolean; percentOff?: number }> {
	if (!referralsOn(env)) return { on: false, valid: false };
	const rec = code ? await getCode(env, code) : null;
	return rec ? { on: true, valid: true, percentOff: referralSettings(env).percentOff } : { on: true, valid: false };
}

/** The Stripe promotion code behind a referral code, for our own checkouts (bundles). */
export async function promoIdFor(env: Env, code: string | null | undefined): Promise<string | null> {
	if (!code || !referralsOn(env)) return null;
	return (await getCode(env, code))?.promoId ?? null;
}

/** Admin: every code with its reward count, newest first, plus pending printed rewards. */
export async function listReferrals(env: Env): Promise<{ codes: Array<Omit<ReferralCode, "ownerEmailKey" | "ownerAddressKey">>; printsToMail: Array<RewardRecord & { ownerEmail: string }> }> {
	const kv = env.VISIBILITY_CACHE;
	const codes: ReferralCode[] = [];
	let cursor: string | undefined;
	do {
		const batch: KVNamespaceListResult<unknown, string> = await kv.list({ prefix: "ref:code:", cursor });
		for (const k of batch.keys) {
			const rec = (await kv.get(k.name, "json")) as ReferralCode | null;
			if (rec) codes.push(rec);
		}
		cursor = batch.list_complete ? undefined : batch.cursor;
	} while (cursor);
	const byCode = new Map(codes.map((c) => [c.code, c]));
	const printsToMail: Array<RewardRecord & { ownerEmail: string }> = [];
	cursor = undefined;
	do {
		const batch: KVNamespaceListResult<unknown, string> = await kv.list({ prefix: "ref:reward:", cursor });
		for (const k of batch.keys) {
			const r = (await kv.get(k.name, "json")) as RewardRecord | null;
			if (r?.print) printsToMail.push({ ...r, ownerEmail: byCode.get(r.code)?.ownerEmail ?? "" });
		}
		cursor = batch.list_complete ? undefined : batch.cursor;
	} while (cursor);
	codes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return {
		codes: codes.map(({ ownerEmailKey: _e, ownerAddressKey: _a, ...rest }) => rest),
		printsToMail,
	};
}
