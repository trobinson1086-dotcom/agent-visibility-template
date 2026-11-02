// Squish Squad Membership in three tiers, each a monthly or yearly Stripe
// subscription sold through a Payment Link:
//
//   Pal $4.99/mo or $49/yr · Hero $9.99/mo or $99/yr · Platinum Crown $19.99/mo or $199/yr
//
// The links collect the child's first name (twice, to catch typos), birthday
// month and a US shipping address for mailed gifts, then redirect to
// /api/squad/welcome?session_id=... . Perks by tier live in squad-perks.ts.
//
// The Stripe webhook records each new member in KV (`squad:member:<session>`)
// so birthday posters can be scheduled; /api/admin/squad/members lists them
// with the poster each one is due.
import { EBOOK_FILES, driveDownloadUrl, driveViewUrl } from "./ebooks";
import { fetchCheckoutSession, fetchSubscription, type StripeCheckoutSession } from "./stripe";
import type { Env } from "../lib/types";

export type SquadPlan = "monthly" | "yearly";
export type SquadTier = "pal" | "hero" | "platinum";

export const TIER_NAMES: Readonly<Record<SquadTier, string>> = {
	pal: "Squish Squad Pal",
	hero: "Squish Squad Hero",
	platinum: "Platinum Crown",
};

/**
 * Stripe recurring prices: Pal (prod_VYAPqBiyvkZhBT, the original membership),
 * Hero (prod_VYM54gTY7DODed) and Platinum Crown (prod_VYM5ij3gUcugRI).
 */
export const SQUAD_PRICES: Readonly<Record<string, { tier: SquadTier; plan: SquadPlan }>> = {
	price_1UX44w9cRroVv8pkpabnr9HH: { tier: "pal", plan: "monthly" },
	price_1UX44y9cRroVv8pkGOan5njh: { tier: "pal", plan: "yearly" },
	price_1UXFN49cRroVv8pkKQjymk1H: { tier: "hero", plan: "monthly" },
	price_1UXFN69cRroVv8pkP2HM68jr: { tier: "hero", plan: "yearly" },
	price_1UXFN99cRroVv8pkMqNzyQ2s: { tier: "platinum", plan: "monthly" },
	price_1UXFNB9cRroVv8pkaYk5FW1R: { tier: "platinum", plan: "yearly" },
};

export const SQUAD_JOIN_LINKS: Readonly<Record<SquadTier, Record<SquadPlan, string>>> = {
	pal: {
		monthly: "https://buy.stripe.com/5kQ8wJ3B7eCP2hv6RL1Jm41",
		yearly: "https://buy.stripe.com/28E6oBc7DbqD3lza3X1Jm42",
	},
	hero: {
		monthly: "https://buy.stripe.com/aFa14h9ZvfGT6xL8ZT1Jm43",
		yearly: "https://buy.stripe.com/6oU00d9Zv3Yb4pD5NH1Jm44",
	},
	platinum: {
		monthly: "https://buy.stripe.com/cNifZbdbH52f4pD7VP1Jm45",
		yearly: "https://buy.stripe.com/eVqdR34Fb0LZ7BPfoh1Jm46",
	},
};

/**
 * Pal members who joined before the tiers launched were promised the printed
 * birthday poster, so they keep it; later Pal members get the digital kit.
 */
export const TIERS_LAUNCHED_AT = "2026-11-03T00:00:00.000Z";

/** Kids' tee sizes for the Platinum birthday box (Printful Bella + Canvas 3001Y). */
export const SHIRT_SIZES = ["Youth S", "Youth M", "Youth L", "Youth XL"] as const;

/** Monthly members earn the birthday poster after this many paid months. */
export const MONTHLY_POSTER_AFTER_MONTHS = 3;
/** Posters are ordered this many days before the 1st of the birthday month. */
export const POSTER_LEAD_DAYS = 14;

const MONTHS = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

export interface SquadMember {
	sessionId: string;
	subscriptionId: string | null;
	plan: SquadPlan;
	childName: string;
	/** False when the two name fields did not match: confirm spelling before printing. */
	nameConfirmed: boolean;
	/** 1-12. */
	birthMonth: number | null;
	email: string | null;
	shipping: {
		name: string | null;
		line1: string | null;
		line2: string | null;
		city: string | null;
		state: string | null;
		postalCode: string | null;
		country: string | null;
	} | null;
	joinedAt: string;
	livemode: boolean;
	/** Absent on members recorded before the tiers existed: they are Pal. */
	tier?: SquadTier;
	/** Platinum only: the child's tee size, chosen on the welcome page. */
	shirtSize?: string | null;
}

export const tierOf = (m: Pick<SquadMember, "tier">): SquadTier => m.tier ?? "pal";

/** What a member gets for their birthday. */
export type BirthdayGift = "digital" | "poster" | "box";

export function birthdayGift(m: Pick<SquadMember, "tier" | "joinedAt">): BirthdayGift {
	const tier = tierOf(m);
	if (tier === "platinum") return "box";
	if (tier === "hero") return "poster";
	return m.joinedAt < TIERS_LAUNCHED_AT ? "poster" : "digital";
}

/** The tier and plan a Checkout Session bought, or null if it is not a membership. */
export function squadOf(session: StripeCheckoutSession): { tier: SquadTier; plan: SquadPlan } | null {
	for (const item of session.line_items?.data ?? []) {
		const hit = item.price?.id ? SQUAD_PRICES[item.price.id] : undefined;
		if (hit) return hit;
	}
	return null;
}

/** The plan a Checkout Session bought, or null if it is not a Squish Squad membership. */
export function squadPlanOf(session: StripeCheckoutSession): SquadPlan | null {
	return squadOf(session)?.plan ?? null;
}

/** A child's first name, tidied for printing: letters, spaces, hyphens and apostrophes only. */
export function cleanChildName(raw: string | null | undefined): string {
	const kept = (raw ?? "")
		.normalize("NFC")
		.replace(/[^\p{L}\p{M}' -]/gu, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 20);
	return kept.replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

function field(session: StripeCheckoutSession, key: string): string | null {
	const f = session.custom_fields?.find((x) => x.key === key);
	return f?.text?.value ?? f?.dropdown?.value ?? null;
}

export function memberFromSession(
	session: StripeCheckoutSession,
	plan: SquadPlan,
	tier: SquadTier = "pal",
): SquadMember {
	const name = cleanChildName(field(session, "childname"));
	const again = cleanChildName(field(session, "childname2"));
	const month = Number.parseInt(field(session, "birthmonth") ?? "", 10);
	const ship = session.collected_information?.shipping_details ?? session.shipping_details ?? null;
	const addr = ship?.address ?? null;
	return {
		sessionId: session.id,
		subscriptionId: session.subscription ?? null,
		plan,
		childName: name,
		nameConfirmed: name.length > 0 && name.toLowerCase() === again.toLowerCase(),
		birthMonth: month >= 1 && month <= 12 ? month : null,
		email: session.customer_details?.email ?? null,
		shipping: ship
			? {
					name: ship.name ?? null,
					line1: addr?.line1 ?? null,
					line2: addr?.line2 ?? null,
					city: addr?.city ?? null,
					state: addr?.state ?? null,
					postalCode: addr?.postal_code ?? null,
					country: addr?.country ?? null,
				}
			: null,
		joinedAt: new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
		livemode: session.livemode,
		tier,
		shirtSize: null,
	};
}

const KEY_PREFIX = "squad:member:";
const EMAIL_PREFIX = "squad:email:";

export const emailKey = (email: string) => EMAIL_PREFIX + email.trim().toLowerCase();

export async function recordSquadMember(env: Env, member: SquadMember): Promise<void> {
	// A webhook redelivery must not wipe what the parent set since (shirt size, confirmed name).
	const prev = await getSquadMember(env, member.sessionId);
	const merged = prev
		? { ...member, shirtSize: prev.shirtSize ?? member.shirtSize ?? null, childName: prev.nameConfirmed ? prev.childName : member.childName, nameConfirmed: prev.nameConfirmed || member.nameConfirmed }
		: member;
	await env.VISIBILITY_CACHE.put(KEY_PREFIX + member.sessionId, JSON.stringify(merged));
	if (member.email) await indexMemberEmail(env, merged);
}

/** Platinum: save the child's tee size for the birthday box. */
export async function setShirtSize(env: Env, sessionId: string, size: string): Promise<SquadMember | null> {
	if (!(SHIRT_SIZES as readonly string[]).includes(size)) return null;
	const m = await getSquadMember(env, sessionId);
	if (!m || tierOf(m) !== "platinum") return null;
	const updated = { ...m, shirtSize: size };
	await env.VISIBILITY_CACHE.put(KEY_PREFIX + sessionId, JSON.stringify(updated));
	return updated;
}

/** Index a member by email (lowercased) so book orders can find their membership. */
export async function indexMemberEmail(env: Env, member: SquadMember): Promise<void> {
	if (!member.email) return;
	const key = emailKey(member.email);
	const ids = new Set<string>(JSON.parse((await env.VISIBILITY_CACHE.get(key)) ?? "[]") as string[]);
	if (ids.has(member.sessionId)) return;
	ids.add(member.sessionId);
	await env.VISIBILITY_CACHE.put(key, JSON.stringify([...ids]));
}

export async function getSquadMember(env: Env, sessionId: string): Promise<SquadMember | null> {
	const v = await env.VISIBILITY_CACHE.get(KEY_PREFIX + sessionId);
	return v ? (JSON.parse(v) as SquadMember) : null;
}

/** Memberships bought with this email (any status; check the subscription before granting perks). */
export async function membersByEmail(env: Env, email: string | null | undefined): Promise<SquadMember[]> {
	if (!email) return [];
	const ids = JSON.parse((await env.VISIBILITY_CACHE.get(emailKey(email))) ?? "[]") as string[];
	const out: SquadMember[] = [];
	for (const id of ids) {
		const m = await getSquadMember(env, id);
		if (m) out.push(m);
	}
	return out;
}

/**
 * Admin: confirm (or correct) the child's name before anything is printed with
 * it. Returns null if there is no such member or the name is empty once cleaned.
 */
export async function confirmChildName(
	env: Env,
	sessionId: string,
	childName?: string,
): Promise<SquadMember | null> {
	const m = await getSquadMember(env, sessionId);
	if (!m) return null;
	const name = childName === undefined ? m.childName : cleanChildName(childName);
	if (!name) return null;
	const updated = { ...m, childName: name, nameConfirmed: true };
	await env.VISIBILITY_CACHE.put(KEY_PREFIX + sessionId, JSON.stringify(updated));
	return updated;
}

export async function listSquadMembers(env: Env): Promise<SquadMember[]> {
	const out: SquadMember[] = [];
	let cursor: string | undefined;
	do {
		const page = await env.VISIBILITY_CACHE.list({ prefix: KEY_PREFIX, cursor });
		for (const k of page.keys) {
			const v = await env.VISIBILITY_CACHE.get(k.name);
			if (v) out.push(JSON.parse(v) as SquadMember);
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
	return out;
}

function addMonths(d: Date, n: number): Date {
	const x = new Date(d);
	x.setUTCMonth(x.getUTCMonth() + n);
	return x;
}

/**
 * The next birthday gift for a member, on or after `today`: the date to send
 * it (two weeks before the 1st of the birthday month) and whether the member is
 * eligible by then. The digital kit: always. Mailed gifts: yearly always,
 * monthly after 3 months of membership.
 */
export function nextPoster(
	member: SquadMember,
	today: Date,
): { birthday: string; orderOn: string; eligible: boolean } | null {
	if (!member.birthMonth) return null;
	const year = today.getUTCFullYear();
	let first = new Date(Date.UTC(year, member.birthMonth - 1, 1));
	// Still this year's poster until the end of the birthday month.
	if (addMonths(first, 1) <= today) first = new Date(Date.UTC(year + 1, member.birthMonth - 1, 1));
	const orderOn = new Date(first.getTime() - POSTER_LEAD_DAYS * 86_400_000);
	const eligibleFrom =
		member.plan === "yearly" || birthdayGift(member) === "digital"
			? new Date(member.joinedAt)
			: addMonths(new Date(member.joinedAt), MONTHLY_POSTER_AFTER_MONTHS);
	return {
		birthday: `${MONTHS[member.birthMonth - 1]} ${first.getUTCFullYear()}`,
		orderOn: orderOn.toISOString().slice(0, 10),
		eligible: eligibleFrom <= (orderOn > today ? orderOn : today),
	};
}

/**
 * eBooks unlocked by membership. Everyone gets Book 1 on joining; Hero adds 2
 * more every 6 months of membership; Platinum Crown gets all of them.
 */
export function memberEbooks(m: Pick<SquadMember, "tier" | "joinedAt">, today: Date): readonly (typeof EBOOK_FILES)[number][] {
	const tier = tierOf(m);
	if (tier === "platinum") return EBOOK_FILES;
	if (tier === "pal") return EBOOK_FILES.slice(0, 1);
	const joined = new Date(m.joinedAt);
	const months =
		(today.getUTCFullYear() - joined.getUTCFullYear()) * 12 + today.getUTCMonth() - joined.getUTCMonth() -
		(today.getUTCDate() < joined.getUTCDate() ? 1 : 0);
	const periods = Math.floor(Math.max(0, months) / 6) + 1;
	return EBOOK_FILES.slice(0, Math.min(EBOOK_FILES.length, 1 + 2 * periods));
}

const esc = (s: string) =>
	s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function page(title: string, body: string): string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Squish Man™</title><style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fffaf0;color:#13265c}
main{max-width:600px;margin:0 auto;padding:28px 16px}
h1{font-size:1.7rem;margin:0 0 8px;color:#07347d}
.box{background:#fff;border-radius:18px;padding:18px;margin:16px 0;box-shadow:0 4px 16px rgba(18,54,104,.12)}
.box h2{font-size:1.15rem;margin:0 0 10px;color:#07347d}
a.btn,button.btn{display:inline-block;margin:4px 8px 4px 0;padding:12px 18px;border:0;border-radius:12px;background:#ffd632;color:#07347d;font-weight:800;font-size:1rem;text-decoration:none;cursor:pointer;box-shadow:0 4px 0 #e2b800}
a.btn.alt{background:#0758bd;color:#fff;box-shadow:0 4px 0 #07347d}
.card{border:6px solid #ffd632;border-radius:22px;background:linear-gradient(135deg,#eaf5ff,#fff7cf);padding:22px;text-align:center}
.card img{max-width:220px;width:70%}
.card .who{font-size:2rem;font-weight:900;color:#ef4338;margin:8px 0}
.card .tag{font-weight:900;letter-spacing:1.5px;color:#07347d}
.warn{background:#fff3cd;border-radius:12px;padding:12px}
p.small{font-size:.9rem;color:#4b5a7c}
@media print{body{background:#fff}.noprint{display:none!important}main{padding:0}.card{break-inside:avoid}}
</style></head><body><main>${body}<p class="small noprint">Questions? Email <a href="mailto:orders@squishman.com">orders@squishman.com</a>. <a href="/">← Back to squishman.com</a></p></main></body></html>`;
}

function fail(status: number, heading: string, text: string) {
	return { status, html: page("Squish Squad", `<h1>${heading}</h1><p>${text}</p>`) };
}

/** Welcome page shown right after a membership checkout. */
export async function squadWelcomePage(
	env: Env,
	sessionId: string | undefined,
): Promise<{ status: number; html: string }> {
	if (!sessionId || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
		return fail(400, "We couldn't find your membership", "This link is missing its order number. Please use the link from your checkout, or email us.");
	}
	if (!env.STRIPE_SECRET_KEY) {
		return fail(503, "Welcome to the Squish Squad!", "Your welcome page is temporarily unavailable. Email us and we'll send your welcome gifts right away.");
	}
	let session: StripeCheckoutSession;
	try {
		session = await fetchCheckoutSession(env.STRIPE_SECRET_KEY, sessionId);
	} catch {
		return fail(404, "We couldn't find your membership", "Please try the link again in a minute. If it still doesn't work, email us.");
	}
	const squad = squadOf(session);
	if (!squad) {
		return fail(404, "We couldn't find your membership", "This order isn't a Squish Squad membership. If you think that's wrong, email us.");
	}
	if (session.payment_status !== "paid") {
		return fail(402, "Your payment is still processing", "Refresh this page in a minute. Your welcome gifts will appear as soon as the payment goes through.");
	}
	const { tier, plan } = squad;
	// The stored record has what the parent set since checkout (tee size, confirmed name).
	const m = (await getSquadMember(env, session.id)) ?? memberFromSession(session, plan, tier);
	const name = m.childName || "Squish Squad Member";
	const since = new Date(m.joinedAt);
	const sinceText = `${MONTHS[since.getUTCMonth()]} ${since.getUTCFullYear()}`;
	const month = m.birthMonth ? ` in <b>${MONTHS[m.birthMonth - 1]}</b>` : "";
	const after = plan === "monthly" ? `After ${MONTHLY_POSTER_AFTER_MONTHS} months of membership, ` : "";
	const gift = birthdayGift({ ...m, tier });
	const giftText =
		gift === "digital"
			? `Before the birthday${month}, we'll email a printable Squish Man birthday poster with <b>${esc(name)}</b>'s name and a birthday message from Squish Man and Pudy.`
			: gift === "poster"
				? `${after ? after : ""}${after ? "a" : "A"} printed Squish Man birthday poster with <b>${esc(name)}</b>'s name ships before the birthday${month}.`
				: `${after ? after : ""}${after ? "a" : "A"} birthday box ships before the birthday${month}: a printed poster and a kids' tee with <b>${esc(name)}</b>'s name, plus Squish Man stickers.`;

	// eBooks unlocked by the tier (only while the membership is active).
	let books: readonly (typeof EBOOK_FILES)[number][] = EBOOK_FILES.slice(0, 1);
	if (tier !== "pal" && session.subscription) {
		try {
			const sub = await fetchSubscription(env.STRIPE_SECRET_KEY, session.subscription);
			if (sub.status === "active" || sub.status === "trialing") books = memberEbooks({ ...m, tier }, new Date());
		} catch {
			// Can't check the subscription right now: show the welcome eBook only.
		}
	}
	const bookCards = books
		.map(
			(b) =>
				`<p style="margin:10px 0 2px"><b>${esc(b.title)}</b></p><a class="btn alt" href="${driveViewUrl(b.driveFileId)}" target="_blank" rel="noopener">Read now</a><a class="btn" href="${driveDownloadUrl(b.driveFileId)}">Download PDF</a>`,
		)
		.join("");
	const ebookNote =
		tier === "hero"
			? `<p class="small">As a Hero, you unlock 2 more eBooks every 6 months.</p>`
			: tier === "platinum"
				? `<p class="small">As a Platinum Crown member, every Squish Man eBook is yours.</p>`
				: "";

	const shirt =
		tier === "platinum"
			? `<div class="box"><h2>👕 ${esc(name)}'s tee size</h2>
<p>The birthday box includes a Squish Squad kids' tee with ${esc(name)}'s name. ${m.shirtSize ? `Saved size: <b>${esc(m.shirtSize)}</b>. You can change it any time before the birthday.` : "<b>Please choose a size</b> so we can make it."}</p>
<form method="post" action="/api/squad/shirt-size"><input type="hidden" name="session_id" value="${esc(session.id)}">
<select name="size" required style="font-size:1rem;padding:10px;border-radius:10px">${SHIRT_SIZES.map((sz) => `<option${m.shirtSize === sz ? " selected" : ""}>${sz}</option>`).join("")}</select>
<button class="btn" type="submit">Save size</button></form></div>`
			: "";

	const perks: Record<SquadTier, string[]> = {
		pal: [
			`<b>Monthly Squish Squad Pack</b>: 7 new coloring and activity pages by email${m.email ? ` to ${esc(m.email)}` : ""} each month.`,
			"<b>Shipping refunded on book orders of $25+</b>: use the same email at checkout and we refund the shipping to your card.",
			"<b>Early access</b> to new Squish Man books.",
		],
		hero: [
			`<b>Monthly Squish Squad Pack</b>: 7 new coloring and activity pages by email${m.email ? ` to ${esc(m.email)}` : ""} each month.`,
			"<b>Shipping refunded on every book order</b>: use the same email at checkout and we refund it to your card.",
			"<b>10% back</b> on Squish Man books and Squish Squad Shop merch, refunded to your card.",
			"<b>2 free eBooks every 6 months.</b>",
			"<b>Early access</b> to new Squish Man books.",
		],
		platinum: [
			`<b>Monthly Squish Squad Pack</b>: 7 new coloring and activity pages by email${m.email ? ` to ${esc(m.email)}` : ""} each month.`,
			"<b>Free shipping on everything</b>: book and merch shipping refunded to your card.",
			"<b>20% back</b> on Squish Man books and Squish Squad Shop merch, refunded to your card.",
			"<b>Squish Mail</b>: a Squish Man sticker in the mail every 3 months.",
			"<b>Every Squish Man eBook</b>, plus first copies of new releases.",
		],
	};
	const warn = m.nameConfirmed
		? ""
		: `<p class="warn">The two name spellings you typed didn't match. We'll email you to confirm the spelling before making anything with your child's name.</p>`;
	const body = `
<div class="noprint">
<h1>Welcome to the Squish Squad, ${esc(name)}! 🐾</h1>
<p>Thank you for joining as a <b>${TIER_NAMES[tier]}</b> (${plan} membership). Bookmark this page to come back to your gifts any time.</p>
${warn}
<div class="box"><h2>🎁 Your eBook${books.length > 1 ? "s" : ""}</h2>${bookCards}${ebookNote}</div>
${shirt}
</div>
<div class="box"><h2 class="noprint">🪪 Your member card</h2>
<div class="card"><img src="/assets/squishman-maple-hollow-logo.webp" alt="Squish Man — Maple Hollow"><div class="tag">OFFICIAL SQUISH SQUAD ${tier === "platinum" ? "PLATINUM CROWN" : tier === "hero" ? "HERO" : "MEMBER"}</div><div class="who">${esc(name)}</div><div>Member since ${sinceText}</div><div class="tag" style="margin-top:8px">BIG HEART. TINY HERO. ENDLESS ADVENTURES!™</div></div>
<p class="noprint"><button class="btn" onclick="window.print()">Print member card</button></p></div>
<div class="noprint">
<div class="box"><h2>🎂 Birthday surprise</h2><p>${giftText}</p></div>
<div class="box"><h2>📦 Your member perks</h2><ul>${perks[tier].map((p) => `<li>${p}</li>`).join("\n")}</ul>
<p class="small">Manage or cancel your membership any time by emailing orders@squishman.com.</p></div>
</div>`;
	return { status: 200, html: page("Welcome to the Squish Squad", body) };
}
