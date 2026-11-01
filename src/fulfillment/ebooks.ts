// eBook delivery: after a paid eBook checkout, Stripe sends the buyer to
// /api/ebook-download?session_id={CHECKOUT_SESSION_ID}. We re-read that session
// from Stripe and only show download links for eBooks it actually paid for.
// The files live in Travis's "Squishman Books 1-5 Published" Drive folder
// (shared as "anyone with the link can view").
import { byPriceId } from "./catalog";
import { fetchCheckoutSession, type StripeCheckoutSession } from "./stripe";
import type { Env } from "../lib/types";

export interface EbookFile {
	key: string;
	title: string;
	driveFileId: string;
}

export const EBOOK_FILES: readonly EbookFile[] = [
	{ key: "EN-EBOOK-1", title: "Book 1 — The Missing Puppy Parade", driveFileId: "11YNGwr_PZ0c2_RueXfMOlUBV4uvAsQFP" },
	{ key: "EN-EBOOK-2", title: "Book 2 — Squish Man's Big Dream Adventure", driveFileId: "1tBBHmCX3WDWYoPkJvooEuFk4ousLHgPE" },
	{ key: "EN-EBOOK-3", title: "Book 3 — Squish Man and the Magical Garden", driveFileId: "17cIZ5y2ZnS7KUaemw35szRXO3BApYAFW" },
	{ key: "EN-EBOOK-4", title: "Book 4 — Squish Man Saves the Snow Day", driveFileId: "1PXF6vf-HGK5xmDgUsw1BBVZwlfwVj1Jv" },
	{ key: "EN-EBOOK-5", title: "Book 5 — The Great Maple Hollow Derby", driveFileId: "1uzmQOKiAiCvaC5XWP5c0Ww_rQWwmQo82" },
];

const BY_KEY = new Map(EBOOK_FILES.map((f) => [f.key, f]));

export function driveViewUrl(id: string): string {
	return `https://drive.google.com/file/d/${id}/view?usp=sharing`;
}

export function driveDownloadUrl(id: string): string {
	return `https://drive.google.com/uc?export=download&id=${id}`;
}

/** The eBooks a Checkout Session paid for (empty unless it is paid). */
export function paidEbooks(session: StripeCheckoutSession): EbookFile[] {
	if (session.payment_status !== "paid") return [];
	const out: EbookFile[] = [];
	for (const item of session.line_items?.data ?? []) {
		const entry = item.price?.id ? byPriceId(item.price.id) : undefined;
		const file = entry && entry.format === "ebook" ? BY_KEY.get(entry.key) : undefined;
		if (file && !out.includes(file)) out.push(file);
	}
	return out;
}

const esc = (s: string) =>
	s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function page(title: string, body: string): string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Squish Man™</title><style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fff8ec;color:#2b2140}
main{max-width:560px;margin:0 auto;padding:32px 16px}
h1{font-size:1.6rem;margin:0 0 8px}
.card{background:#fff;border-radius:16px;padding:18px;margin:16px 0;box-shadow:0 2px 10px rgba(0,0,0,.08)}
.card h2{font-size:1.1rem;margin:0 0 12px}
a.btn{display:inline-block;margin:4px 8px 4px 0;padding:12px 18px;border-radius:999px;background:#e8452c;color:#fff;font-weight:700;text-decoration:none}
a.btn.alt{background:#2b2140}
p.small{font-size:.9rem;color:#5a4f6e}
</style></head><body><main>${body}<p class="small">Questions? Email <a href="mailto:orders@squishman.com">orders@squishman.com</a>.</p><p><a href="/">← Back to squishman.com</a></p></main></body></html>`;
}

/** Render the download page for a Checkout Session id. */
export async function ebookDownloadPage(
	env: Env,
	sessionId: string | undefined,
): Promise<{ status: number; html: string }> {
	if (!sessionId || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
		return {
			status: 400,
			html: page("Download", `<h1>We couldn't find your order</h1><p>This download link is missing its order number. Please use the link from your checkout, or email us and we'll send your eBook.</p>`),
		};
	}
	if (!env.STRIPE_SECRET_KEY) {
		return {
			status: 503,
			html: page("Download", `<h1>Thank you for your order!</h1><p>Downloads are temporarily unavailable. Email us and we'll send your eBook right away.</p>`),
		};
	}
	let session: StripeCheckoutSession;
	try {
		session = await fetchCheckoutSession(env.STRIPE_SECRET_KEY, sessionId);
	} catch {
		return {
			status: 404,
			html: page("Download", `<h1>We couldn't find your order</h1><p>Please try the link again in a minute. If it still doesn't work, email us and we'll send your eBook.</p>`),
		};
	}
	if (session.payment_status !== "paid") {
		return {
			status: 402,
			html: page("Download", `<h1>Your payment is still processing</h1><p>Refresh this page in a minute. Your download will appear as soon as the payment goes through.</p>`),
		};
	}
	const books = paidEbooks(session);
	if (books.length === 0) {
		return {
			status: 404,
			html: page("Download", `<h1>Thank you for your order!</h1><p>This order doesn't include an eBook download. If you think that's wrong, email us.</p>`),
		};
	}
	const cards = books
		.map(
			(b) =>
				`<div class="card"><h2>${esc(b.title)}</h2><a class="btn" href="${driveViewUrl(b.driveFileId)}" target="_blank" rel="noopener">Read now</a><a class="btn alt" href="${driveDownloadUrl(b.driveFileId)}">Download PDF</a></div>`,
		)
		.join("");
	return {
		status: 200,
		html: page(
			"Your eBook",
			`<h1>Thank you! Your eBook is ready 🐾</h1><p>Tap <b>Read now</b> to open it, or <b>Download PDF</b> to save it. Bookmark this page to come back to your download any time.</p>${cards}`,
		),
	};
}
