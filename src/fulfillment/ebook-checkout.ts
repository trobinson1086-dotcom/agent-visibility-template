/**
 * eBook checkout behind a bot check.
 *
 * In November 2026 a card-testing bot ran thousands of stolen cards through the
 * public $4.99 eBook Payment Links (Stripe blocked them all). The site's eBook
 * buttons now go to GET /api/ebook/checkout?ebook=EN-EBOOK-N instead of a
 * public buy.stripe.com link:
 *
 *   - With TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY set, the buyer sees a
 *     short "one moment" page with a Cloudflare Turnstile check. The check posts
 *     back here, the worker verifies the token with Cloudflare (server side),
 *     and only then creates a one-off Stripe Checkout Session and redirects.
 *   - Without those keys the worker creates the session straight away, so
 *     buying keeps working until the keys are set.
 *
 * The session mirrors the old Payment Links: same price, a receipt invoice with
 * the download link, and the same /api/ebook-download success page.
 */
import type { Env } from "../lib/types";
import { byKey } from "./catalog";
import { driveViewUrl, EBOOK_FILES } from "./ebooks";
import { createCheckoutSession } from "./stripe";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ACTION = "ebook";

/** Book names as the old Payment Link receipts used them. */
const BOOK_NAMES: Record<string, string> = {
	"EN-EBOOK-1": "Squish Man and the Missing Puppy Parade — Book 1",
	"EN-EBOOK-2": "Squish Man's Big Dream Adventure — Book 2",
	"EN-EBOOK-3": "Squish Man and the Magical Garden — Book 3",
	"EN-EBOOK-4": "Squish Man Saves the Snow Day — Book 4",
	"EN-EBOOK-5": "Squish Man and the Great Maple Hollow Derby — Book 5",
};

const log = (event: string, data: Record<string, unknown>) =>
	console.log(JSON.stringify({ at: "ebook-checkout", event, ...data }));

export interface EbookCheckoutResult {
	status: number;
	/** Redirect target (a Stripe Checkout URL) when status is 303. */
	url?: string;
	/** Page to show otherwise. */
	html?: string;
}

export function turnstileEnabled(env: Env): boolean {
	return Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);
}

function ebookFor(key: string | undefined) {
	const file = EBOOK_FILES.find((f) => f.key === key);
	const entry = key ? byKey(key) : undefined;
	return file && entry && entry.format === "ebook" ? { file, entry } : undefined;
}

const esc = (s: string) =>
	s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function page(title: string, body: string, head = ""): string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Squish Man™</title>${head}<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fff8ec;color:#2b2140}
main{max-width:520px;margin:0 auto;padding:40px 16px;text-align:center}
h1{font-size:1.5rem;margin:0 0 8px}
.cf-turnstile{display:flex;justify-content:center;margin:20px 0}
button{padding:12px 22px;border:0;border-radius:999px;background:#e8452c;color:#fff;font-weight:700;font-size:1rem;cursor:pointer}
button[disabled]{opacity:.5;cursor:default}
p.small{font-size:.9rem;color:#5a4f6e}
</style></head><body><main>${body}<p class="small">Questions? Email <a href="mailto:orders@squishman.com">orders@squishman.com</a>.</p><p><a href="/#books">← Back to the books</a></p></main></body></html>`;
}

const notFound = (): EbookCheckoutResult => ({
	status: 404,
	html: page("eBook", `<h1>We couldn't find that eBook</h1><p>Please pick your eBook again from the books page.</p>`),
});

const unavailable = (status: number): EbookCheckoutResult => ({
	status,
	html: page("Checkout unavailable", `<h1>Checkout isn't available right now</h1><p>Please try again in a moment, or email us and we'll help you order.</p>`),
});

/** The "one moment" page with the Turnstile check that posts back here. */
function checkPage(env: Env, key: string, retry = false): string {
	const name = BOOK_NAMES[key] ?? "your eBook";
	const head = `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`;
	const body = `<h1>${retry ? "Let's try that again" : "One moment…"}</h1>
<p>${esc(name)} eBook, $4.99. We're making sure you're a real reader, then we'll take you to secure checkout.</p>
<form id="go" method="post" action="/api/ebook/checkout">
<input type="hidden" name="ebook" value="${esc(key)}">
<div class="cf-turnstile" data-sitekey="${esc(env.TURNSTILE_SITE_KEY ?? "")}" data-action="${TURNSTILE_ACTION}" data-callback="squishReady"></div>
<button id="btn" type="submit" disabled>Continue to checkout</button>
</form>
<script>function squishReady(){var b=document.getElementById('btn');b.disabled=false;b.textContent='Taking you to checkout…';document.getElementById('go').submit();}</script>
<noscript><p>Please turn on JavaScript to buy the eBook, or email us and we'll help you order.</p></noscript>`;
	return page("Checkout", body, head);
}

/** Ask Cloudflare whether a Turnstile token is good. Fails closed. */
export async function verifyTurnstile(env: Env, token: string, ip: string | undefined): Promise<boolean> {
	if (!token || token.length > 2048 || !env.TURNSTILE_SECRET_KEY) return false;
	const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
	if (ip) form.set("remoteip", ip);
	try {
		const res = await fetch(SITEVERIFY, { method: "POST", body: form, signal: AbortSignal.timeout(10_000) });
		if (!res.ok) return false;
		const r = (await res.json()) as { success?: boolean; action?: string; "error-codes"?: string[] };
		if (!r.success || (r.action && r.action !== TURNSTILE_ACTION)) {
			log("turnstile_failed", { codes: r["error-codes"] ?? [], action: r.action ?? null });
			return false;
		}
		return true;
	} catch (err) {
		log("turnstile_error", { error: String(err).slice(0, 120) });
		return false;
	}
}

/** Create the one-off Stripe Checkout Session for one eBook. */
async function createSession(env: Env, key: string, origin: string): Promise<EbookCheckoutResult> {
	const found = ebookFor(key);
	if (!found) return notFound();
	if (!env.STRIPE_SECRET_KEY) return unavailable(503);
	const name = BOOK_NAMES[key] ?? found.entry.title;
	try {
		const s = await createCheckoutSession(env.STRIPE_SECRET_KEY, {
			mode: "payment",
			"line_items[0][price]": found.entry.stripePriceId,
			"line_items[0][quantity]": "1",
			"invoice_creation[enabled]": "true",
			"invoice_creation[invoice_data][description]": `Thank you for buying ${name} eBook!`,
			"invoice_creation[invoice_data][footer]": `Your eBook (read or download any time): ${driveViewUrl(found.file.driveFileId)} — Questions? orders@squishman.com`,
			"invoice_creation[invoice_data][metadata][ebook]": key,
			"metadata[ebook]": key,
			"metadata[source]": "site-ebook-checkout",
			success_url: `${origin}/api/ebook-download?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${origin}/#books`,
		});
		log("checkout_created", { ebook: key });
		return { status: 303, url: s.url };
	} catch (err) {
		log("checkout_failed", { ebook: key, error: String(err).slice(0, 120) });
		return unavailable(502);
	}
}

/** GET /api/ebook/checkout?ebook=EN-EBOOK-N */
export async function startEbookCheckout(env: Env, key: string | undefined, origin: string): Promise<EbookCheckoutResult> {
	if (!key || !ebookFor(key)) return notFound();
	if (!turnstileEnabled(env)) return createSession(env, key, origin);
	return { status: 200, html: checkPage(env, key) };
}

/** POST /api/ebook/checkout (from the check page): verify, then go to Stripe. */
export async function finishEbookCheckout(
	env: Env,
	form: { ebook?: unknown; "cf-turnstile-response"?: unknown },
	ip: string | undefined,
	origin: string,
): Promise<EbookCheckoutResult> {
	const key = typeof form.ebook === "string" ? form.ebook : undefined;
	if (!key || !ebookFor(key)) return notFound();
	if (turnstileEnabled(env)) {
		const token = typeof form["cf-turnstile-response"] === "string" ? form["cf-turnstile-response"] : "";
		if (!(await verifyTurnstile(env, token, ip))) {
			return { status: 403, html: checkPage(env, key, true) };
		}
	}
	return createSession(env, key, origin);
}
