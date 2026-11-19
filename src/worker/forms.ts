/**
 * The site's contact form and Squish Squad sign-up form.
 *
 * Both used to open the visitor's email app (mailto:). They now post here, and
 * each submission is emailed to the right squishman.com inbox through Resend,
 * with Reply-To set to the visitor so a reply from the inbox goes straight back.
 *
 * Without RESEND_API_KEY nothing can be delivered, so the endpoints answer 503
 * and the page falls back to opening the visitor's email app, as before.
 */
import type { Env } from "../lib/types";
import { DEFAULT_FROM, EmailError, baseUrl, esc, layout, sendOnce } from "../fulfillment/email";

export const CONTACT_INBOX = "contact@squishman.com";
export const SQUAD_INBOX = "squishfans@squishman.com";

export const CONTACT_REASONS = [
	"General Question",
	"Order Help",
	"School/Teacher Inquiry",
	"Parent Question",
	"Squish Squad/Fan Club",
	"Media/Press",
	"Feedback",
	"Other",
] as const;

export const SQUAD_INTERESTS = [
	"Everything",
	"Kindness Challenges",
	"Birthday Club",
	"New Adventure Alerts",
] as const;

/** Submissions allowed per visitor IP per hour, across both forms. */
const HOURLY_LIMIT = 8;

export interface FormResult {
	status: number;
	body: { ok: boolean; error?: string };
}

const fail = (status: number, error: string): FormResult => ({ status, body: { ok: false, error } });

const looksLikeEmail = (s: string) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(s);

/** One line, trimmed, no control characters, at most `max` characters. */
function line(v: unknown, max: number): string {
	return String(v ?? "")
		.replace(/[\u0000-\u001f\u007f]+/g, " ")
		.trim()
		.slice(0, max);
}

/** Multi-line text, trimmed, at most `max` characters. */
function block(v: unknown, max: number): string {
	return String(v ?? "")
		.replace(/\r\n?/g, "\n")
		.replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, "")
		.trim()
		.slice(0, max);
}

async function sha256(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A rough per-IP hourly cap, kept in KV. Returns false once the cap is reached. */
async function underLimit(env: Env, ip: string): Promise<boolean> {
	const hour = new Date().toISOString().slice(0, 13);
	const key = `form:rate:${await sha256(ip)}:${hour}`;
	const count = Number((await env.VISIBILITY_CACHE.get(key)) ?? "0");
	if (count >= HOURLY_LIMIT) return false;
	await env.VISIBILITY_CACHE.put(key, String(count + 1), { expirationTtl: 3600 });
	return true;
}

async function deliver(
	env: Env,
	key: string,
	to: string,
	replyTo: string,
	subject: string,
	rows: Array<[string, string]>,
): Promise<FormResult> {
	const text = rows.map(([k, v]) => (v.includes("\n") ? `${k}:\n${v}` : `${k}: ${v}`)).join("\n\n");
	const html = layout(
		env,
		subject,
		`<h2 style="margin:0 0 12px">${esc(subject)}</h2>` +
			rows
				.map(
					([k, v]) =>
						`<p style="margin:0 0 12px"><b>${esc(k)}</b><br>${esc(v).replace(/\n/g, "<br>")}</p>`,
				)
				.join(""),
	);
	try {
		const sent = await sendOnce(env, key, { to, subject, text, html, replyTo });
		if (sent.status === "skipped") return fail(503, "EMAIL_NOT_CONFIGURED");
		return { status: 200, body: { ok: true } };
	} catch (err) {
		if (err instanceof EmailError) return fail(502, "EMAIL_FAILED");
		throw err;
	}
}

/** The contact form: name, email, reason, message → contact@squishman.com. */
export async function handleContact(env: Env, input: Record<string, unknown>, ip: string): Promise<FormResult> {
	// Hidden field that people never see; bots fill it in. Pretend it worked.
	if (line(input.website, 200)) return { status: 200, body: { ok: true } };

	const name = line(input.name, 120);
	const email = line(input.email, 254);
	const reason = line(input.reason, 60);
	const message = block(input.message, 5000);
	if (!name || !looksLikeEmail(email) || !message) return fail(400, "MISSING_FIELDS");
	if (!(CONTACT_REASONS as readonly string[]).includes(reason)) return fail(400, "BAD_REASON");
	if (!(await underLimit(env, ip))) return fail(429, "TOO_MANY");

	const key = `contact:${await sha256([name, email.toLowerCase(), reason, message].join("\n"))}`;
	return deliver(env, key, CONTACT_INBOX, email, `SquishMan.com Contact — ${reason}`, [
		["Name", name],
		["Email", email],
		["Reason for Contact", reason],
		["Message", message],
	]);
}

/** The Squish Squad sign-up: parent or guardian name, email, interest → squishfans@squishman.com. */
export async function handleSquadSignup(env: Env, input: Record<string, unknown>, ip: string): Promise<FormResult> {
	if (line(input.website, 200)) return { status: 200, body: { ok: true } };

	const name = line(input.name, 120);
	const email = line(input.email, 254);
	const interest = line(input.interest, 60) || "Everything";
	if (!name || !looksLikeEmail(email)) return fail(400, "MISSING_FIELDS");
	if (!(SQUAD_INTERESTS as readonly string[]).includes(interest)) return fail(400, "BAD_INTEREST");
	if (!(await underLimit(env, ip))) return fail(429, "TOO_MANY");

	// Keep every sign-up on the fan list first, so none is lost even if email is down.
	await saveFan(env, name, email, interest);

	const key = `squad-signup:${await sha256([email.toLowerCase(), interest].join("\n"))}`;
	const result = await deliver(env, key, SQUAD_INBOX, email, `Squish Squad sign-up — ${interest}`, [
		["Parent/guardian name", name],
		["Email", email],
		["Would like to receive", interest],
	]);
	if (result.body.ok) await welcomeFan(env, name, email);
	return result;
}

/** One fan on the free Squish Squad list (parents and guardians only). */
export interface Fan {
	name: string;
	email: string;
	interest: string;
	joinedAt: string;
	updatedAt: string;
}

const FAN_PREFIX = "fan:";

async function saveFan(env: Env, name: string, email: string, interest: string): Promise<void> {
	const key = FAN_PREFIX + email.toLowerCase();
	const now = new Date().toISOString();
	const old = await env.VISIBILITY_CACHE.get<Fan>(key, "json");
	const fan: Fan = { name, email, interest, joinedAt: old?.joinedAt ?? now, updatedAt: now };
	await env.VISIBILITY_CACHE.put(key, JSON.stringify(fan));
	// Signing up again re-subscribes an address that had unsubscribed (see worker/campaigns.ts).
	await env.VISIBILITY_CACHE.delete(`fan-unsub:${email.toLowerCase()}`);
}

/** Everyone on the free fan list, newest first (admin only). */
export async function listFans(env: Env): Promise<Fan[]> {
	const fans: Fan[] = [];
	let cursor: string | undefined;
	do {
		const page = await env.VISIBILITY_CACHE.list({ prefix: FAN_PREFIX, cursor });
		for (const k of page.keys) {
			const fan = await env.VISIBILITY_CACHE.get<Fan>(k.name, "json");
			if (fan) fans.push(fan);
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
	return fans.sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));
}

/** A one-time welcome email to the new fan. A failure here never fails the sign-up. */
async function welcomeFan(env: Env, name: string, email: string): Promise<void> {
	const site = baseUrl(env);
	const book1 = `${site}/product.html?book=book-1`;
	const coloring = `${site}/assets/free/squish-man-coloring-page.pdf`;
	const collection = `${site}/story-collection.html`;
	const youtube = "https://www.youtube.com/@SquishManAdventures";
	const first = name.split(/\s+/)[0] || "friend";
	const subject = "Welcome to the Squish Squad! 👑";
	const text = [
		`Hi ${first},`,
		"Welcome to the Squish Squad! Thank you for joining. You'll get Squish Man news, family activities and new adventure alerts from us.",
		`Here's your free Squish Man coloring page to print: ${coloring}`,
		`New to Squish Man? Start with Book 1, Squish Man and the Missing Puppy Parade: ${book1}`,
		`Or get all 5 story books together, shipped free: ${collection}`,
		`Watch the cartoon and songs on YouTube: ${youtube}`,
		"Questions? Just reply to this email. To stop getting Squish Squad emails, reply STOP.",
		"Big heart, tiny hero!\nThe Squish Man team",
	].join("\n\n");
	const html = layout(
		env,
		subject,
		`<h2 style="margin:0 0 12px">Welcome to the Squish Squad, ${esc(first)}!</h2>` +
			`<p style="margin:0 0 12px">Thank you for joining. You'll get Squish Man news, family activities and new adventure alerts from us.</p>` +
			`<p style="margin:0 0 16px;padding:14px 16px;background:#fff7dc;border-radius:12px"><b>🖍️ Your free coloring page:</b> <a href="${esc(coloring)}">print the Squish Man coloring page</a>.</p>` +
			`<p style="margin:0 0 12px"><b>New to Squish Man?</b> Start with <a href="${esc(book1)}">Book 1, Squish Man and the Missing Puppy Parade</a>.</p>` +
			`<p style="margin:0 0 12px">Or get <a href="${esc(collection)}">all 5 story books together</a>, shipped free.</p>` +
			`<p style="margin:0 0 12px">Watch the cartoon and songs on <a href="${youtube}">YouTube</a>.</p>` +
			`<p style="margin:0 0 12px">Questions? Just reply to this email. To stop getting Squish Squad emails, reply STOP.</p>` +
			`<p style="margin:0">Big heart, tiny hero!<br>The Squish Man team</p>`,
	);
	try {
		await sendOnce(env, `squad-welcome:${await sha256(email.toLowerCase())}`, {
			to: email,
			from: DEFAULT_FROM,
			replyTo: SQUAD_INBOX,
			subject,
			text,
			html,
		});
	} catch (err) {
		console.log(JSON.stringify({ at: "forms", event: "welcome_failed", error: String(err) }));
	}
}
