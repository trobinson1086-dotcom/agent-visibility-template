/**
 * Email from squishman.com through Resend (https://resend.com/docs/api-reference).
 *
 * Every send carries an idempotency key, and a KV marker (`email:sent:<key>`)
 * remembers it for good, so webhook redeliveries and cron re-runs never email
 * a family twice. Without RESEND_API_KEY nothing is sent (logged as skipped).
 */
import type { Env } from "../lib/types";
import { driveDownloadUrl, driveViewUrl, type EbookFile } from "./ebooks";

const RESEND_API = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;
const SENT_PREFIX = "email:sent:";

export const DEFAULT_FROM = "Squish Man <orders@squishman.com>";
export const DEFAULT_SQUAD_FROM = "Squish Squad <squad@squishman.com>";
export const REPLY_TO = "orders@squishman.com";

export interface Email {
	to: string;
	subject: string;
	html: string;
	text: string;
	from?: string;
	headers?: Record<string, string>;
	tags?: Array<{ name: string; value: string }>;
}

export type SendResult =
	| { status: "sent"; id: string }
	| { status: "duplicate" }
	| { status: "skipped"; reason: string };

export class EmailError extends Error {
	constructor(
		readonly status: number,
		readonly detail: string,
	) {
		super(`Resend API error ${status}`);
	}
}

const log = (event: string, data: Record<string, unknown>) =>
	console.log(JSON.stringify({ at: "email", event, ...data }));

export function baseUrl(env: Env): string {
	return (env.PUBLIC_BASE_URL ?? "https://squishman.com").replace(/\/+$/, "");
}

const looksLikeEmail = (s: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s);

/**
 * Send one email at most once per `key` (e.g. "order:cs_live_…").
 * Throws EmailError when Resend rejects it, so callers can retry later.
 */
export async function sendOnce(env: Env, key: string, email: Email): Promise<SendResult> {
	if (!env.RESEND_API_KEY) {
		log("skipped", { key, reason: "RESEND_NOT_CONFIGURED" });
		return { status: "skipped", reason: "RESEND_NOT_CONFIGURED" };
	}
	if (!looksLikeEmail(email.to)) {
		log("skipped", { key, reason: "NO_RECIPIENT" });
		return { status: "skipped", reason: "NO_RECIPIENT" };
	}
	if (await env.VISIBILITY_CACHE.get(SENT_PREFIX + key)) return { status: "duplicate" };
	const res = await fetch(RESEND_API, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			"Content-Type": "application/json",
			// Resend keeps idempotency keys for 24 hours; the KV marker covers the rest.
			"Idempotency-Key": key.slice(0, 256),
		},
		body: JSON.stringify({
			from: email.from ?? env.EMAIL_FROM ?? DEFAULT_FROM,
			to: [email.to],
			reply_to: REPLY_TO,
			subject: email.subject,
			html: email.html,
			text: email.text,
			...(email.headers ? { headers: email.headers } : {}),
			...(email.tags ? { tags: email.tags } : {}),
		}),
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	const body = await res.text();
	if (!res.ok) {
		log("failed", { key, status: res.status });
		throw new EmailError(res.status, body.slice(0, 500));
	}
	const id = (JSON.parse(body) as { id?: string }).id ?? "";
	await env.VISIBILITY_CACHE.put(SENT_PREFIX + key, JSON.stringify({ id, at: new Date().toISOString() }));
	log("sent", { key, id });
	return { status: "sent", id };
}

// --- Templates --------------------------------------------------------------

export const esc = (s: string) =>
	s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function button(href: string, label: string, alt = false): string {
	const bg = alt ? "#0758bd" : "#ffd632";
	const fg = alt ? "#ffffff" : "#07347d";
	return `<a href="${esc(href)}" style="display:inline-block;margin:4px 8px 4px 0;padding:12px 18px;border-radius:12px;background:${bg};color:${fg};font-weight:800;text-decoration:none">${esc(label)}</a>`;
}

/** The shared email layout: Squish Man header, white card, footer. */
export function layout(env: Env, title: string, inner: string, footer = ""): string {
	const base = baseUrl(env);
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#fffaf0;font-family:Arial,Helvetica,sans-serif;color:#13265c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffaf0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="background:#0758bd;border-radius:18px 18px 0 0;padding:18px;text-align:center">
<a href="${base}/" style="color:#ffd632;font-size:22px;font-weight:900;text-decoration:none">👑 Squish Man™</a>
<div style="color:#ffffff;font-size:12px;letter-spacing:1px;margin-top:4px">BIG HEART. TINY HERO. ENDLESS ADVENTURES!™</div></td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 18px 18px;padding:24px;line-height:1.55;font-size:16px">${inner}</td></tr>
<tr><td style="padding:16px;text-align:center;font-size:12px;color:#4b5a7c">${footer}Questions? Just reply, or email <a href="mailto:${REPLY_TO}" style="color:#0758bd">${REPLY_TO}</a>.<br>
<a href="${base}/" style="color:#0758bd">squishman.com</a> · The Amazing Adventures of Squish Man™</td></tr>
</table></td></tr></table></body></html>`;
}

export interface OrderLine {
	title: string;
	quantity: number;
}

/** Order confirmation for books and eBooks, with the eBook download link. */
export function orderEmail(
	env: Env,
	o: {
		sessionId: string;
		name: string | null;
		lines: OrderLine[];
		ebooks: EbookFile[];
		physical: boolean;
		shippingRefundCents: number;
		/** Hero/Platinum: percentage of the order refunded as a member perk. */
		cashbackCents?: number;
	},
): Pick<Email, "subject" | "html" | "text"> {
	const download = `${baseUrl(env)}/api/ebook-download?session_id=${encodeURIComponent(o.sessionId)}`;
	const hello = o.name ? `Hi ${esc(o.name.split(" ")[0])},` : "Hi there,";
	const list = o.lines.map((l) => `<li>${esc(l.title)}${l.quantity > 1 ? ` × ${l.quantity}` : ""}</li>`).join("");
	const ebookHtml = o.ebooks.length
		? `<h2 style="font-size:18px;color:#07347d;margin:20px 0 8px">📖 Your eBook${o.ebooks.length > 1 ? "s are" : " is"} ready</h2>
<p>${button(download, o.ebooks.length > 1 ? "Download your eBooks" : "Download your eBook")}</p>
${o.ebooks
	.map(
		(b) =>
			`<p style="margin:6px 0"><b>${esc(b.title)}</b><br><a href="${driveViewUrl(b.driveFileId)}" style="color:#0758bd">Read now</a> · <a href="${driveDownloadUrl(b.driveFileId)}" style="color:#0758bd">Download PDF</a></p>`,
	)
	.join("")}
<p style="font-size:14px;color:#4b5a7c">Keep this email: the download link works any time.</p>`
		: "";
	const physicalHtml = o.physical
		? `<p>📦 Printed books are made to order just for you. We'll ship them to the address you gave at checkout.</p>`
		: "";
	const perkText = perkRefundText(o.shippingRefundCents, o.cashbackCents ?? 0);
	const refundHtml = perkText
		? `<p style="background:#fff3cd;border-radius:12px;padding:12px">🐾 <b>Squish Squad perk:</b> ${esc(perkText)} It can take 5–10 days to show on your statement.</p>`
		: "";
	const html = layout(
		env,
		"Your Squish Man order",
		`<h1 style="font-size:24px;color:#07347d;margin:0 0 12px">Thank you for your order! 🐾</h1>
<p>${hello}</p><p>Your order is confirmed:</p><ul>${list}</ul>${ebookHtml}${physicalHtml}${refundHtml}`,
	);
	const text = [
		`${o.name ? `Hi ${o.name.split(" ")[0]},` : "Hi there,"}`,
		"",
		"Thank you for your order! Your order is confirmed:",
		...o.lines.map((l) => `- ${l.title}${l.quantity > 1 ? ` x ${l.quantity}` : ""}`),
		...(o.ebooks.length
			? ["", `Download your eBook${o.ebooks.length > 1 ? "s" : ""}: ${download}`, ...o.ebooks.map((b) => `- ${b.title}: ${driveDownloadUrl(b.driveFileId)}`)]
			: []),
		...(o.physical ? ["", "Printed books are made to order just for you. We'll ship them to the address you gave at checkout."] : []),
		...(perkText ? ["", `Squish Squad perk: ${perkText}`] : []),
		"",
		`Questions? Reply to this email or write to ${REPLY_TO}.`,
	].join("\n");
	const subject = o.ebooks.length ? "Your Squish Man eBook is ready 🐾" : "Your Squish Man order is confirmed 🐾";
	return { subject, html, text };
}

/** "we refunded your $5.99 shipping and $2.99 (10% back) to your card." */
export function perkRefundText(shippingCents: number, cashbackCents: number): string {
	const parts = [
		...(shippingCents ? [`your ${dollars(shippingCents)} shipping`] : []),
		...(cashbackCents ? [`${dollars(cashbackCents)} member cash back`] : []),
	];
	return parts.length ? `we refunded ${parts.join(" and ")} to your card.` : "";
}

const TIER_LABEL = { pal: "Squish Squad Pal", hero: "Squish Squad Hero", platinum: "Platinum Crown" } as const;

/** Sent when a Squish Squad membership starts: link back to the welcome page. */
export function squadWelcomeEmail(
	env: Env,
	m: { sessionId: string; childName: string; plan: "monthly" | "yearly"; tier?: "pal" | "hero" | "platinum" },
): Pick<Email, "subject" | "html" | "text"> {
	const url = `${baseUrl(env)}/api/squad/welcome?session_id=${encodeURIComponent(m.sessionId)}`;
	const name = m.childName || "your Squish Squad member";
	const tier = m.tier ?? "pal";
	const gifts =
		tier === "platinum"
			? ["🎁 Every Squish Man eBook", "🪪 A printable member card", "👕 Choose your child's tee size for the birthday box"]
			: tier === "hero"
				? ["🎁 Free Squish Man eBooks", "🪪 A printable member card"]
				: ["🎁 A free Squish Man eBook", "🪪 A printable member card"];
	const perks =
		tier === "platinum"
			? "Every month we'll email a new <b>Squish Squad Pack</b>. Book and merch orders placed with this email get free shipping and 20% back, and Squish Mail stickers arrive every 3 months."
			: tier === "hero"
				? "Every month we'll email a new <b>Squish Squad Pack</b>. Book orders placed with this email get their shipping refunded, and books and merch get 10% back."
				: "Every month we'll email a new <b>Squish Squad Pack</b> of coloring and activity pages, and book orders of $25 or more placed with this email get their shipping refunded.";
	const html = layout(
		env,
		"Welcome to the Squish Squad",
		`<h1 style="font-size:24px;color:#07347d;margin:0 0 12px">Welcome to the Squish Squad, ${esc(name)}! 🐾</h1>
<p>Thank you for joining as a <b>${TIER_LABEL[tier]}</b> (${m.plan} membership). Your welcome gifts are waiting:</p>
<ul>${gifts.map((g) => `<li>${g}</li>`).join("")}</ul>
<p>${button(url, tier === "platinum" ? "Open your gifts & choose tee size" : "Open your welcome gifts")}</p>
<p>${perks}</p>`,
	);
	const text = `Welcome to the Squish Squad, ${name}!\n\nYou joined as a ${TIER_LABEL[tier]} (${m.plan}).\n\nYour welcome gifts: ${url}\n${gifts.map((g) => `- ${g.replace(/^\S+ /, "")}`).join("\n")}\n\n${perks.replace(/<[^>]+>/g, "")}\n\nQuestions? Reply to this email or write to ${REPLY_TO}.`;
	return { subject: "Welcome to the Squish Squad! 🐾", html, text };
}

/** Pal birthday: the printable personalized poster, by email. */
export function digitalBirthdayEmail(
	env: Env,
	m: { childName: string; birthday: string; artUrl: string },
): Pick<Email, "subject" | "html" | "text"> {
	const month = m.birthday.split(" ")[0];
	const html = layout(
		env,
		`Happy birthday, ${m.childName}!`,
		`<h1 style="font-size:24px;color:#07347d;margin:0 0 12px">Happy birthday, ${esc(m.childName)}! 🎂</h1>
<p>Squish Man and Pudy heard there's a birthday in ${esc(month)}! They made ${esc(m.childName)} a personalized Squish Squad birthday poster to print and hang up.</p>
<p>${button(m.artUrl, "Open & print the birthday poster")}</p>
<p>"Big heart, tiny hero, endless adventures. Have the happiest birthday!" — Squish Man &amp; Pudy</p>
<p style="font-size:14px;color:#4b5a7c">Tip: print it on letter paper in landscape. The link works for 4 months.</p>`,
	);
	const text = `Happy birthday, ${m.childName}!\n\nSquish Man and Pudy heard there's a birthday in ${month}! They made ${m.childName} a personalized Squish Squad birthday poster to print and hang up:\n${m.artUrl}\n\n"Big heart, tiny hero, endless adventures. Have the happiest birthday!" — Squish Man & Pudy`;
	return { subject: `A birthday surprise for ${m.childName} from Squish Man 🎂`, html, text };
}

/** Sent when a mailed birthday gift (poster, or Platinum box) goes to the printer. */
export function posterEmail(
	env: Env,
	m: { childName: string; birthday: string; box?: boolean },
): Pick<Email, "subject" | "html" | "text"> {
	const what = m.box
		? "a Squish Squad birthday box: a personalized poster, a kids' tee with their name and Squish Man stickers"
		: "a personalized Squish Squad birthday poster";
	const body = `Squish Man and Pudy are getting ready for ${m.childName}'s birthday in ${m.birthday.split(" ")[0]}. We're making ${what} just for them, and it will arrive by mail before the big day.`;
	const html = layout(
		env,
		"A birthday surprise is on its way",
		`<h1 style="font-size:24px;color:#07347d;margin:0 0 12px">A birthday surprise is on its way! 🎂</h1>
<p>${esc(body)}</p>
<p>Thank you for being part of the Squish Squad!</p>`,
	);
	const text = `A birthday surprise is on its way!\n\n${body}\n\nThank you for being part of the Squish Squad!`;
	return {
		subject: `${m.childName}'s Squish Squad birthday ${m.box ? "box" : "poster"} is on its way 🎂`,
		html,
		text,
	};
}

export interface PackItem {
	title: string;
	description?: string;
	url: string;
}

export type PackTier = "pal" | "hero" | "platinum";

/** The bonus sections a tier gets from a pack (empty for Pal or when there are none). */
export function packBonus(pack: SquadPack, tier: PackTier): Array<{ label: string; items: PackItem[] }> {
	const out: Array<{ label: string; items: PackItem[] }> = [];
	if ((tier === "hero" || tier === "platinum") && pack.bonus?.hero?.length) {
		out.push({ label: "🦸 Hero Bonus", items: pack.bonus.hero });
	}
	if (tier === "platinum" && pack.bonus?.platinum?.length) {
		out.push({ label: "👑 Platinum Crown Bonus", items: pack.bonus.platinum });
	}
	return out;
}

export interface SquadPack {
	/** "YYYY-MM". */
	month: string;
	subject: string;
	heading: string;
	intro: string;
	/** The pack every member gets (the 7-page Pal pack and extras). */
	items: PackItem[];
	/**
	 * Tier bonus pages: Hero members also get `hero`; Platinum Crown members get
	 * `hero` and `platinum`. Added after the 1st, they go out in a follow-up email.
	 */
	bonus?: { hero?: PackItem[]; platinum?: PackItem[] };
	/** Optional picture at the top of the email. */
	heroImage?: string;
	/** Only published packs are sent to members (drafts can be test-sent). */
	published: boolean;
	updatedAt?: string;
}

function packRows(env: Env, items: PackItem[]): string {
	// Site paths ("/assets/…") become full squishman.com links.
	const abs = (u: string) => (u.startsWith("/") ? `${baseUrl(env)}${u}` : u);
	return items
		.map(
			(i) =>
				`<tr><td style="padding:10px 0;border-top:1px solid #eef2fa"><b>${esc(i.title)}</b>${i.description ? `<br><span style="font-size:14px;color:#4b5a7c">${esc(i.description)}</span>` : ""}<br>${button(abs(i.url), /\.pdf$/i.test(i.url) ? "Open & print" : "Open", true)}</td></tr>`,
		)
		.join("");
}

function packLines(env: Env, items: PackItem[]): string[] {
	const abs = (u: string) => (u.startsWith("/") ? `${baseUrl(env)}${u}` : u);
	return items.map((i) => `- ${i.title}${i.description ? ` (${i.description})` : ""}: ${abs(i.url)}`);
}

const PACK_FOOTER = `You get this email because your family is a Squish Squad member. To stop pack emails, reply "unsubscribe".`;

function bonusHtml(env: Env, sections: Array<{ label: string; items: PackItem[] }>): string {
	return sections
		.map(
			(b) =>
				`<div style="margin-top:18px;background:#fff8d6;border-radius:14px;padding:12px 14px"><div style="font-size:16px;font-weight:900;color:#07347d">${esc(b.label)} pages</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${packRows(env, b.items)}</table></div>`,
		)
		.join("");
}

/** The monthly Squish Squad Pack email, with the member's tier bonus pages. */
export function packEmail(
	env: Env,
	pack: SquadPack,
	childName: string,
	tier: PackTier = "pal",
): Pick<Email, "subject" | "html" | "text"> {
	const name = childName || "Squish Squad member";
	const abs = (u: string) => (u.startsWith("/") ? `${baseUrl(env)}${u}` : u);
	const bonus = packBonus(pack, tier);
	const hero = pack.heroImage
		? `<p style="text-align:center;margin:0 0 12px"><img src="${esc(abs(pack.heroImage))}" alt="Squish Man and Pudy in Maple Hollow" width="280" style="max-width:100%;height:auto;border-radius:14px"></p>`
		: "";
	const html = layout(
		env,
		pack.subject,
		`${hero}<div style="font-size:12px;font-weight:900;letter-spacing:1.5px;color:#0758bd">SQUISH SQUAD PACK</div>
<h1 style="font-size:24px;color:#07347d;margin:4px 0 12px">${esc(pack.heading)}</h1>
<p>Hi ${esc(name)}! ${esc(pack.intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${packRows(env, pack.items)}</table>${bonusHtml(env, bonus)}`,
		`${PACK_FOOTER}<br>`,
	);
	const text = [
		pack.heading,
		"",
		`Hi ${name}! ${pack.intro}`,
		"",
		...packLines(env, pack.items),
		...bonus.flatMap((b) => ["", `${b.label.replace(/^\S+ /, "")} pages:`, ...packLines(env, b.items)]),
		"",
		PACK_FOOTER,
	].join("\n");
	return { subject: pack.subject, html, text };
}

/** Follow-up when a month's tier bonus pages arrive after its pack was sent. */
export function packBonusEmail(
	env: Env,
	pack: SquadPack,
	childName: string,
	tier: PackTier,
): Pick<Email, "subject" | "html" | "text"> {
	const name = childName || "Squish Squad member";
	const bonus = packBonus(pack, tier);
	const what = tier === "platinum" ? "Platinum Crown" : "Hero";
	const monthName = new Date(`${pack.month}-15T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
	const html = layout(
		env,
		`Your ${what} bonus pages`,
		`<div style="font-size:12px;font-weight:900;letter-spacing:1.5px;color:#0758bd">SQUISH SQUAD PACK · ${esc(monthName.toUpperCase())} BONUS</div>
<h1 style="font-size:24px;color:#07347d;margin:4px 0 12px">Your ${what} bonus pages are here!</h1>
<p>Hi ${esc(name)}! Here are this month's extra pages, just for ${what} members.</p>${bonusHtml(env, bonus)}`,
		`${PACK_FOOTER}<br>`,
	);
	const text = [
		`Your ${what} bonus pages are here!`,
		"",
		`Hi ${name}! Here are this month's extra pages, just for ${what} members.`,
		...bonus.flatMap((b) => ["", `${b.label.replace(/^\S+ /, "")} pages:`, ...packLines(env, b.items)]),
		"",
		PACK_FOOTER,
	].join("\n");
	return { subject: `Your ${monthName} ${what} bonus pages are here 🎁`, html, text };
}
