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
import { EmailError, esc, layout, sendOnce } from "../fulfillment/email";

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

	const key = `squad-signup:${await sha256([email.toLowerCase(), interest].join("\n"))}`;
	return deliver(env, key, SQUAD_INBOX, email, `Squish Squad sign-up — ${interest}`, [
		["Parent/guardian name", name],
		["Email", email],
		["Would like to receive", interest],
	]);
}
