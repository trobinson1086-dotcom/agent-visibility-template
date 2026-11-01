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
	const refundHtml = o.shippingRefundCents
		? `<p style="background:#fff3cd;border-radius:12px;padding:12px">🐾 <b>Squish Squad perk:</b> we refunded your ${dollars(o.shippingRefundCents)} shipping to your card. It can take 5–10 days to show on your statement.</p>`
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
		...(o.shippingRefundCents
			? ["", `Squish Squad perk: we refunded your ${dollars(o.shippingRefundCents)} shipping to your card.`]
			: []),
		"",
		`Questions? Reply to this email or write to ${REPLY_TO}.`,
	].join("\n");
	const subject = o.ebooks.length ? "Your Squish Man eBook is ready 🐾" : "Your Squish Man order is confirmed 🐾";
	return { subject, html, text };
}

/** Sent when a Squish Squad membership starts: link back to the welcome page. */
export function squadWelcomeEmail(
	env: Env,
	m: { sessionId: string; childName: string; plan: "monthly" | "yearly" },
): Pick<Email, "subject" | "html" | "text"> {
	const url = `${baseUrl(env)}/api/squad/welcome?session_id=${encodeURIComponent(m.sessionId)}`;
	const name = m.childName || "your Squish Squad member";
	const html = layout(
		env,
		"Welcome to the Squish Squad",
		`<h1 style="font-size:24px;color:#07347d;margin:0 0 12px">Welcome to the Squish Squad, ${esc(name)}! 🐾</h1>
<p>Thank you for joining (${m.plan} membership). Your welcome gifts are waiting:</p>
<ul><li>🎁 A free Squish Man eBook</li><li>🪪 A printable member card</li></ul>
<p>${button(url, "Open your welcome gifts")}</p>
<p>Every month we'll email a new <b>Squish Squad Pack</b> of coloring and activity pages, and book orders of $25 or more placed with this email get their shipping refunded.</p>`,
	);
	const text = `Welcome to the Squish Squad, ${name}!\n\nYour welcome gifts (free eBook and printable member card): ${url}\n\nEvery month we'll email a new Squish Squad Pack, and book orders of $25 or more placed with this email get their shipping refunded.\n\nQuestions? Reply to this email or write to ${REPLY_TO}.`;
	return { subject: "Welcome to the Squish Squad! 🐾", html, text };
}

/** Sent when the birthday poster order goes to the printer. */
export function posterEmail(
	env: Env,
	m: { childName: string; birthday: string },
): Pick<Email, "subject" | "html" | "text"> {
	const html = layout(
		env,
		"A birthday surprise is on its way",
		`<h1 style="font-size:24px;color:#07347d;margin:0 0 12px">A birthday surprise is on its way! 🎂</h1>
<p>Squish Man and Pudy are getting ready for ${esc(m.childName)}'s birthday in ${esc(m.birthday.split(" ")[0])}. A personalized Squish Squad birthday poster is being printed now and will arrive by mail before the big day.</p>
<p>Thank you for being part of the Squish Squad!</p>`,
	);
	const text = `A birthday surprise is on its way!\n\nSquish Man and Pudy are getting ready for ${m.childName}'s birthday in ${m.birthday.split(" ")[0]}. A personalized Squish Squad birthday poster is being printed now and will arrive by mail before the big day.\n\nThank you for being part of the Squish Squad!`;
	return { subject: `${m.childName}'s Squish Squad birthday poster is on its way 🎂`, html, text };
}

export interface SquadPack {
	/** "YYYY-MM". */
	month: string;
	subject: string;
	heading: string;
	intro: string;
	items: Array<{ title: string; description?: string; url: string }>;
	/** Optional picture at the top of the email. */
	heroImage?: string;
	/** Only published packs are sent to members (drafts can be test-sent). */
	published: boolean;
	updatedAt?: string;
}

/** The monthly Squish Squad Pack email. */
export function packEmail(env: Env, pack: SquadPack, childName: string): Pick<Email, "subject" | "html" | "text"> {
	const name = childName || "Squish Squad member";
	// Site paths ("/assets/…") become full squishman.com links.
	const abs = (u: string) => (u.startsWith("/") ? `${baseUrl(env)}${u}` : u);
	const items = pack.items
		.map(
			(i) =>
				`<tr><td style="padding:10px 0;border-top:1px solid #eef2fa"><b>${esc(i.title)}</b>${i.description ? `<br><span style="font-size:14px;color:#4b5a7c">${esc(i.description)}</span>` : ""}<br>${button(abs(i.url), /\.pdf$/i.test(i.url) ? "Open & print" : "Open", true)}</td></tr>`,
		)
		.join("");
	const hero = pack.heroImage
		? `<p style="text-align:center;margin:0 0 12px"><img src="${esc(abs(pack.heroImage))}" alt="Squish Man and Pudy in Maple Hollow" width="280" style="max-width:100%;height:auto;border-radius:14px"></p>`
		: "";
	const html = layout(
		env,
		pack.subject,
		`${hero}<div style="font-size:12px;font-weight:900;letter-spacing:1.5px;color:#0758bd">SQUISH SQUAD PACK</div>
<h1 style="font-size:24px;color:#07347d;margin:4px 0 12px">${esc(pack.heading)}</h1>
<p>Hi ${esc(name)}! ${esc(pack.intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>`,
		`You get this email because your family is a Squish Squad member. To stop pack emails, reply "unsubscribe".<br>`,
	);
	const text = [
		pack.heading,
		"",
		`Hi ${name}! ${pack.intro}`,
		"",
		...pack.items.map((i) => `- ${i.title}${i.description ? ` (${i.description})` : ""}: ${abs(i.url)}`),
		"",
		`You get this email because your family is a Squish Squad member. To stop pack emails, reply "unsubscribe".`,
	].join("\n");
	return { subject: pack.subject, html, text };
}
