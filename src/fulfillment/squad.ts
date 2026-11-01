// Squish Squad Membership: $4.99/month or $49/year Stripe subscriptions sold
// through two Payment Links. The links collect the child's first name (twice,
// to catch typos), birthday month and a US shipping address for the birthday
// poster, then redirect to /api/squad/welcome?session_id=... .
//
// The Stripe webhook records each new member in KV (`squad:member:<session>`)
// so birthday posters can be scheduled; /api/admin/squad/members lists them
// with the poster each one is due.
import { EBOOK_FILES, driveDownloadUrl, driveViewUrl } from "./ebooks";
import { fetchCheckoutSession, type StripeCheckoutSession } from "./stripe";
import type { Env } from "../lib/types";

export type SquadPlan = "monthly" | "yearly";

/** Stripe recurring prices of the Squish Squad Membership product (prod_VYAPqBiyvkZhBT). */
export const SQUAD_PRICES: Readonly<Record<string, SquadPlan>> = {
	price_1UX44w9cRroVv8pkpabnr9HH: "monthly",
	price_1UX44y9cRroVv8pkGOan5njh: "yearly",
};

export const SQUAD_JOIN_LINKS: Readonly<Record<SquadPlan, string>> = {
	monthly: "https://buy.stripe.com/5kQ8wJ3B7eCP2hv6RL1Jm41",
	yearly: "https://buy.stripe.com/28E6oBc7DbqD3lza3X1Jm42",
};

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
}

/** The plan a Checkout Session bought, or null if it is not a Squish Squad membership. */
export function squadPlanOf(session: StripeCheckoutSession): SquadPlan | null {
	for (const item of session.line_items?.data ?? []) {
		const plan = item.price?.id ? SQUAD_PRICES[item.price.id] : undefined;
		if (plan) return plan;
	}
	return null;
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

export function memberFromSession(session: StripeCheckoutSession, plan: SquadPlan): SquadMember {
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
	};
}

const KEY_PREFIX = "squad:member:";

export async function recordSquadMember(env: Env, member: SquadMember): Promise<void> {
	await env.VISIBILITY_CACHE.put(KEY_PREFIX + member.sessionId, JSON.stringify(member));
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
 * The next birthday poster for a member, on or after `today`: the date to order
 * it (two weeks before the 1st of the birthday month) and whether the member is
 * eligible by then (yearly: always; monthly: after 3 months of membership).
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
		member.plan === "yearly"
			? new Date(member.joinedAt)
			: addMonths(new Date(member.joinedAt), MONTHLY_POSTER_AFTER_MONTHS);
	return {
		birthday: `${MONTHS[member.birthMonth - 1]} ${first.getUTCFullYear()}`,
		orderOn: orderOn.toISOString().slice(0, 10),
		eligible: eligibleFrom <= (orderOn > today ? orderOn : today),
	};
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
	const plan = squadPlanOf(session);
	if (!plan) {
		return fail(404, "We couldn't find your membership", "This order isn't a Squish Squad membership. If you think that's wrong, email us.");
	}
	if (session.payment_status !== "paid") {
		return fail(402, "Your payment is still processing", "Refresh this page in a minute. Your welcome gifts will appear as soon as the payment goes through.");
	}
	const m = memberFromSession(session, plan);
	const name = m.childName || "Squish Squad Member";
	const since = new Date(m.joinedAt);
	const sinceText = `${MONTHS[since.getUTCMonth()]} ${since.getUTCFullYear()}`;
	const book = EBOOK_FILES[0];
	const posterText =
		plan === "yearly"
			? `Your Squish Man birthday poster with <b>${esc(name)}</b>'s name ships before the birthday${m.birthMonth ? ` in <b>${MONTHS[m.birthMonth - 1]}</b>` : ""}.`
			: `After ${MONTHLY_POSTER_AFTER_MONTHS} months of membership, a Squish Man birthday poster with <b>${esc(name)}</b>'s name ships before the birthday${m.birthMonth ? ` in <b>${MONTHS[m.birthMonth - 1]}</b>` : ""}.`;
	const warn = m.nameConfirmed
		? ""
		: `<p class="warn">The two name spellings you typed didn't match. We'll email you to confirm the spelling before printing anything with your child's name.</p>`;
	const body = `
<div class="noprint">
<h1>Welcome to the Squish Squad, ${esc(name)}! 🐾</h1>
<p>Thank you for joining (${plan === "yearly" ? "yearly" : "monthly"} membership). Bookmark this page to come back to your gifts any time.</p>
${warn}
<div class="box"><h2>🎁 Your free eBook</h2><p>${esc(book.title)}</p>
<a class="btn alt" href="${driveViewUrl(book.driveFileId)}" target="_blank" rel="noopener">Read now</a><a class="btn" href="${driveDownloadUrl(book.driveFileId)}">Download PDF</a></div>
</div>
<div class="box"><h2 class="noprint">🪪 Your member card</h2>
<div class="card"><img src="/assets/squishman-maple-hollow-logo.webp" alt="Squish Man — Maple Hollow"><div class="tag">OFFICIAL SQUISH SQUAD MEMBER</div><div class="who">${esc(name)}</div><div>Member since ${sinceText}</div><div class="tag" style="margin-top:8px">BIG HEART. TINY HERO. ENDLESS ADVENTURES!™</div></div>
<p class="noprint"><button class="btn" onclick="window.print()">Print member card</button></p></div>
<div class="noprint">
<div class="box"><h2>🎂 Birthday poster</h2><p>${posterText}</p></div>
<div class="box"><h2>📦 Your member perks</h2><ul>
<li><b>Monthly Squish Squad Pack</b>: new coloring and activity pages by email${m.email ? ` to ${esc(m.email)}` : ""} each month.</li>
<li><b>Free shipping on book orders of $25+</b>: use the same email at checkout and we refund the shipping to your card.</li>
<li><b>Early access</b> to new Squish Man books.</li>
</ul><p class="small">Manage or cancel your membership any time by emailing orders@squishman.com.</p></div>
</div>`;
	return { status: 200, html: page("Welcome to the Squish Squad", body) };
}
