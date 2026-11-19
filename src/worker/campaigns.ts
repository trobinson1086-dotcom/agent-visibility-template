/**
 * Holiday emails to the free Squish Squad fan list (parents and guardians who
 * signed up on the site; see worker/forms.ts).
 *
 * Nothing here sends on its own. The owner runs a campaign from the admin API:
 *   GET  /api/admin/squad/campaigns                      list campaigns + list size
 *   POST /api/admin/squad/campaign?name=black-friday     dry run: who would get it + preview
 *   POST /api/admin/squad/campaign?name=…&test=you@…     one test copy to that address
 *   POST /api/admin/squad/campaign?name=…&send=1         send to every subscribed fan
 * Each fan gets each campaign at most once (sendOnce key), so a send that stops
 * part way can be run again safely. Every email carries a one-click unsubscribe
 * link and List-Unsubscribe headers; unsubscribed fans are skipped.
 */
import type { Env } from "../lib/types";
import { DEFAULT_FROM, baseUrl, esc, layout, sendOnce } from "../fulfillment/email";
import { type Fan, SQUAD_INBOX, listFans } from "./forms";

export interface Campaign {
	name: string;
	/** When it is meant to go out, Eastern time, for the owner's reference. */
	sendAt: string;
	subject: string;
	/** Paragraphs; {first} is the fan's first name, {collection} the Story Collection page. */
	paragraphs: string[];
	button?: { label: string; href: "collection" | "home" };
}

export const CAMPAIGNS: readonly Campaign[] = [
	{
		name: "black-friday",
		sendAt: "Fri Nov 27, 7 AM ET",
		subject: "All 5 Squish Man books, $64.99, shipped free 🎁",
		paragraphs: [
			"Hi {first},",
			"The Squish Man holiday deal is here. Through Cyber Monday, the whole Story Collection, all 5 picture books about kindness, courage and friendship, is $64.99 with free shipping. That's about $10 less than buying them one by one.",
			"It's an easy gift for any little hero ages 5 to 9, and you can ship it straight to them.",
		],
		button: { label: "Get all 5 story books", href: "collection" },
	},
	{
		name: "small-business-saturday",
		sendAt: "Sat Nov 28, 9 AM ET",
		subject: "Shop small with Squish Man today 💛",
		paragraphs: [
			"Hi {first},",
			"Squish Man is a small, family-made book series, written and illustrated by Travis Robinson. Every order today helps a tiny hero grow.",
			"The Black Friday price is still on: all 5 story books for $64.99, shipped free, through Cyber Monday.",
		],
		button: { label: "Shop the Story Collection", href: "collection" },
	},
	{
		name: "cyber-monday",
		sendAt: "Mon Nov 30, 6 PM ET",
		subject: "Ends at midnight: the Squish Man deal",
		paragraphs: [
			"Hi {first},",
			"Quick reminder: tonight at midnight Eastern the Story Collection goes back to its regular price. All 5 books are $64.99 with free shipping until the clock runs out.",
		],
		button: { label: "Grab it before midnight", href: "collection" },
	},
	{
		name: "giving-tuesday",
		sendAt: "Tue Dec 1, 10 AM ET",
		subject: "One kind thing today 💛",
		paragraphs: [
			"Hi {first},",
			"Squish Man's biggest power isn't strength. It's kindness. Today is Giving Tuesday, so here's a challenge for your family: do one kind thing together. Share a toy, help a neighbor, or read a story to someone.",
			"Reply and tell us your kind act. We'd love to hear it.",
		],
	},
];

export function campaignByName(name: string | null | undefined): Campaign | undefined {
	return CAMPAIGNS.find((c) => c.name === name);
}

const UNSUB_PREFIX = "fan-unsub:";

function secret(env: Env): string | undefined {
	return env.SQUAD_PACK_SECRET || env.STRIPE_WEBHOOK_SECRET || env.ADMIN_TOKEN || undefined;
}

/** A per-address token, so only the person holding the email can unsubscribe it. */
export async function unsubscribeToken(env: Env, email: string): Promise<string | null> {
	const s = secret(env);
	if (!s) return null;
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`fan-unsub:${email.toLowerCase()}`)));
	return [...sig.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function unsubscribeUrl(env: Env, email: string): Promise<string | null> {
	const t = await unsubscribeToken(env, email);
	return t ? `${baseUrl(env)}/api/squad/unsubscribe?e=${encodeURIComponent(email.toLowerCase())}&t=${t}` : null;
}

export async function isUnsubscribed(env: Env, email: string): Promise<boolean> {
	return (await env.VISIBILITY_CACHE.get(UNSUB_PREFIX + email.toLowerCase())) !== null;
}

/** Marks an address unsubscribed when the token matches. Signing up again later re-subscribes. */
export async function unsubscribe(env: Env, email: string, token: string): Promise<boolean> {
	const want = await unsubscribeToken(env, email);
	if (!want || !email || token !== want) return false;
	await env.VISIBILITY_CACHE.put(UNSUB_PREFIX + email.toLowerCase(), new Date().toISOString());
	return true;
}

/** Called on every sign-up: joining again clears an earlier unsubscribe. */
export async function resubscribe(env: Env, email: string): Promise<void> {
	await env.VISIBILITY_CACHE.delete(UNSUB_PREFIX + email.toLowerCase());
}

async function render(env: Env, c: Campaign, fan: Pick<Fan, "name" | "email">) {
	const site = baseUrl(env);
	const first = fan.name.split(/\s+/)[0] || "friend";
	const fill = (p: string) => p.replaceAll("{first}", first).replaceAll("{collection}", `${site}/story-collection.html`);
	const paras = c.paragraphs.map(fill);
	const href = c.button ? (c.button.href === "collection" ? `${site}/story-collection.html?utm_source=email&utm_campaign=${c.name}` : `${site}/?utm_source=email&utm_campaign=${c.name}`) : null;
	const unsub = await unsubscribeUrl(env, fan.email);
	const text = [
		...paras,
		...(c.button && href ? [`${c.button.label}: ${href}`] : []),
		"Big heart, tiny hero!\nTravis and the Squish Man team",
		unsub ? `Don't want these emails? Unsubscribe: ${unsub}` : "Don't want these emails? Reply STOP.",
	].join("\n\n");
	const html = layout(
		env,
		c.subject,
		paras.map((p) => `<p style="margin:0 0 12px">${esc(p)}</p>`).join("") +
			(c.button && href
				? `<p style="margin:18px 0"><a href="${esc(href)}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#ffd632;color:#07347d;font-weight:800;text-decoration:none">${esc(c.button.label)}</a></p>`
				: "") +
			`<p style="margin:0">Big heart, tiny hero!<br>Travis and the Squish Man team</p>`,
		unsub
			? `<p style="margin:0;font-size:12px;color:#6b7a99">You're getting this because you joined the free Squish Squad list at squishman.com. <a href="${esc(unsub)}" style="color:#6b7a99">Unsubscribe</a>.</p>`
			: "",
	);
	const headers: Record<string, string> = unsub
		? { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
		: {};
	return { subject: c.subject, text, html, headers };
}

export interface CampaignRun {
	campaign: string;
	mode: "dry-run" | "test" | "send";
	listSize: number;
	eligible: number;
	sent: number;
	alreadySent: number;
	skippedUnsubscribed: number;
	failed: number;
	remaining: number;
	preview?: { subject: string; text: string };
}

/** Dry run, a single test copy, or the real send (at most `limit` new emails per call). */
export async function runCampaign(
	env: Env,
	name: string | undefined,
	opts: { send?: boolean; test?: string; limit?: number },
): Promise<{ status: number; body: CampaignRun | { error: string } }> {
	const c = campaignByName(name);
	if (!c) return { status: 404, body: { error: "UNKNOWN_CAMPAIGN" } };
	if (opts.test) {
		const msg = await render(env, c, { name: "Travis", email: opts.test });
		const r = await sendOnce(env, `campaign-test:${c.name}:${opts.test.toLowerCase()}:${Date.now()}`, {
			to: opts.test,
			from: DEFAULT_FROM,
			replyTo: SQUAD_INBOX,
			...msg,
			subject: `[TEST] ${msg.subject}`,
		});
		return {
			status: r.status === "sent" ? 200 : 502,
			body: { campaign: c.name, mode: "test", listSize: 0, eligible: 0, sent: r.status === "sent" ? 1 : 0, alreadySent: 0, skippedUnsubscribed: 0, failed: r.status === "sent" ? 0 : 1, remaining: 0 },
		};
	}
	const fans = await listFans(env);
	const run: CampaignRun = { campaign: c.name, mode: opts.send ? "send" : "dry-run", listSize: fans.length, eligible: 0, sent: 0, alreadySent: 0, skippedUnsubscribed: 0, failed: 0, remaining: 0 };
	const limit = Math.max(1, Math.min(opts.limit ?? 40, 200));
	for (const fan of fans) {
		if (await isUnsubscribed(env, fan.email)) {
			run.skippedUnsubscribed++;
			continue;
		}
		run.eligible++;
		if (!opts.send) continue;
		if (run.sent >= limit) {
			run.remaining++;
			continue;
		}
		try {
			const msg = await render(env, c, fan);
			const r = await sendOnce(env, `campaign:${c.name}:${fan.email.toLowerCase()}`, { to: fan.email, from: DEFAULT_FROM, replyTo: SQUAD_INBOX, ...msg });
			if (r.status === "sent") run.sent++;
			else if (r.status === "duplicate") run.alreadySent++;
			else run.failed++;
		} catch {
			run.failed++;
		}
	}
	if (!opts.send) {
		const msg = await render(env, c, fans[0] ?? { name: "Friend", email: "parent@example.com" });
		run.preview = { subject: msg.subject, text: msg.text };
	}
	return { status: 200, body: run };
}

/** The small page a fan sees after tapping Unsubscribe. */
export function unsubscribePage(ok: boolean): string {
	const msg = ok
		? "You're unsubscribed. You won't get Squish Squad emails anymore. Changed your mind? Just sign up again on squishman.com."
		: "That unsubscribe link didn't work. Please reply to any Squish Squad email with STOP and we'll take you off the list.";
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Squish Squad emails</title><link rel="stylesheet" href="/style.css"></head><body><main class="policy"><h1>Squish Squad emails</h1><p>${esc(msg)}</p><p><a href="/">Back to squishman.com</a></p></main></body></html>`;
}
