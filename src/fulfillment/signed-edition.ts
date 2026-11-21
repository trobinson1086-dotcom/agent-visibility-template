/**
 * The Signed Holiday Edition of the Story Collection (Black Friday to Cyber Monday 2026).
 *
 * Built and kept OFF. Nothing here is public or buyable until Travis says go and
 * `open` is switched to true. Price and limit are a proposal awaiting his yes.
 *
 * How it works:
 *   - Same five story paperbacks as the Story Collection, printed by Lulu and shipped
 *     free straight to the buyer, so delivery is the same as the regular set.
 *   - Travis signs and numbers a bookplate ("No. 7 of 50"), made out to the name the
 *     buyer types at checkout, and mails it in a holiday envelope with a Squish Squad
 *     Hero card. The bookplate goes inside the cover of Book 1.
 *   - Hard limit of `limit` sets across all orders; at most `maxPerOrder` per order.
 *     Sold only between startsAt and endsAt (Eastern). After that, or once sold out,
 *     the checkout refuses and the page shows "sold out" or "ended".
 *
 * The register of signed orders lives in KV (one record per paid checkout), kept
 * for 90 days, readable only from the admin API. Bookplate numbers are given in the
 * order the payments came in.
 */
import type { Env } from "../lib/types";
import { DEFAULT_FROM, baseUrl, esc, layout, sendOnce } from "./email";
import type { StripeCheckoutSession } from "./stripe";

export interface SignedEditionCfg {
	/** Travis's go. Leave false until he says to open it. */
	open: boolean;
	unitCents: number;
	limit: number;
	maxPerOrder: number;
	startsAt: string;
	endsAt: string;
}

export const SIGNED_EDITION: SignedEditionCfg & { id: string; name: string; mailBy: string } = {
	id: "2026-holiday",
	name: "Squish Man Story Collection, Signed Holiday Edition (Books 1–5 Paperbacks + signed, numbered bookplate)",
	open: false,
	unitCents: 6999,
	limit: 50,
	maxPerOrder: 3,
	// Same window as the Black Friday price (bundles.ts HOLIDAY_SALE; a test keeps them equal).
	startsAt: "2026-11-27T00:00:00-05:00",
	endsAt: "2026-12-01T00:00:00-05:00",
	mailBy: "within 2 business days of your order",
};

export const SIGNED_BUNDLE_KEY = "EN-STORY-SIGNED";
const PREFIX = `signed:${SIGNED_EDITION.id}:`;
const KEEP_SECONDS = 90 * 24 * 60 * 60;

export type SignedPhase = "off" | "soon" | "live" | "ended";

export function signedPhase(now = Date.now(), cfg: SignedEditionCfg = SIGNED_EDITION): SignedPhase {
	if (cfg.open !== true) return "off";
	if (now < Date.parse(cfg.startsAt)) return "soon";
	if (now >= Date.parse(cfg.endsAt)) return "ended";
	return "live";
}

export interface SignedOrder {
	session: string;
	paidAt: string;
	quantity: number;
	/** The name the buyer asked Travis to sign to; blank means "sign it to the reader". */
	signTo: string;
	buyerName: string;
	buyerEmail: string;
	shipTo: { name: string; line1: string; line2: string; city: string; state: string; postal: string };
	livemode: boolean;
}

/** Every signed order so far, oldest first. */
export async function listSignedOrders(env: Env): Promise<SignedOrder[]> {
	const out: SignedOrder[] = [];
	let cursor: string | undefined;
	do {
		const page = await env.VISIBILITY_CACHE.list({ prefix: PREFIX, cursor });
		for (const k of page.keys) {
			const v = await env.VISIBILITY_CACHE.get(k.name);
			if (v) out.push(JSON.parse(v) as SignedOrder);
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
	return out.sort((a, b) => a.paidAt.localeCompare(b.paidAt) || a.session.localeCompare(b.session));
}

/** Sets sold in live mode (test orders don't use up the limit). */
export async function signedSold(env: Env): Promise<number> {
	return (await listSignedOrders(env)).filter((o) => o.livemode).reduce((n, o) => n + o.quantity, 0);
}

export interface SignedStatus {
	phase: SignedPhase;
	limit: number;
	sold: number;
	remaining: number;
	priceCents: number;
	endsAt: string;
}

export async function signedStatus(env: Env, now = Date.now(), cfg: SignedEditionCfg = SIGNED_EDITION): Promise<SignedStatus> {
	const phase = signedPhase(now, cfg);
	const sold = phase === "off" ? 0 : await signedSold(env);
	return { phase, limit: cfg.limit, sold, remaining: Math.max(0, cfg.limit - sold), priceCents: cfg.unitCents, endsAt: cfg.endsAt };
}

/** Whether a new signed checkout may start now, and how many sets it may hold. */
export async function signedCheckoutAllowance(
	env: Env,
	now = Date.now(),
	cfg: SignedEditionCfg = SIGNED_EDITION,
): Promise<{ ok: true; max: number } | { ok: false; reason: "OFF" | "NOT_STARTED" | "ENDED" | "SOLD_OUT" }> {
	const s = await signedStatus(env, now, cfg);
	if (s.phase === "off") return { ok: false, reason: "OFF" };
	if (s.phase === "soon") return { ok: false, reason: "NOT_STARTED" };
	if (s.phase === "ended") return { ok: false, reason: "ENDED" };
	if (s.remaining < 1) return { ok: false, reason: "SOLD_OUT" };
	return { ok: true, max: Math.min(cfg.maxPerOrder, s.remaining) };
}

/** Clean up what a buyer typed for the bookplate: letters, spaces and simple punctuation, 40 characters. */
export function cleanSignTo(raw: string | null | undefined): string {
	return (raw ?? "")
		.normalize("NFC")
		.replace(/[^\p{L}\p{M}\s'.,&-]/gu, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 40);
}

/**
 * Called from the Stripe webhook for a paid signed-edition checkout: adds it to the
 * register (once per session) and emails Travis what to sign and where to mail it.
 */
export async function recordSignedOrder(env: Env, session: StripeCheckoutSession, quantity: number): Promise<SignedOrder | null> {
	const key = PREFIX + session.id;
	if (await env.VISIBILITY_CACHE.get(key)) return null;
	const ship = session.collected_information?.shipping_details ?? session.shipping_details ?? null;
	const a = ship?.address ?? null;
	const field = session.custom_fields?.find((f) => f.key === "signto");
	const order: SignedOrder = {
		session: session.id,
		paidAt: new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
		quantity: Math.max(1, Math.trunc(quantity)),
		signTo: cleanSignTo(field?.text?.value),
		buyerName: session.customer_details?.name ?? "",
		buyerEmail: session.customer_details?.email ?? "",
		shipTo: {
			name: ship?.name ?? "",
			line1: a?.line1 ?? "",
			line2: a?.line2 ?? "",
			city: a?.city ?? "",
			state: a?.state ?? "",
			postal: a?.postal_code ?? "",
		},
		livemode: session.livemode,
	};
	await env.VISIBILITY_CACHE.put(key, JSON.stringify(order), { expirationTtl: KEEP_SECONDS });
	console.log(JSON.stringify({ at: "signed", event: "recorded", session: session.id, quantity: order.quantity, livemode: order.livemode }));
	const to = env.FULFILLMENT_CONTACT_EMAIL;
	if (to) {
		const all = await listSignedOrders(env);
		const numbers = bookplateNumbers(all).get(session.id) ?? [];
		const label = numbers.length ? numbers.map((n) => `No. ${n}`).join(", ") : "number pending";
		const lines = [
			`New Signed Holiday Edition order: ${order.quantity} set${order.quantity > 1 ? "s" : ""} (${label} of ${SIGNED_EDITION.limit}).`,
			`Sign to: ${order.signTo || "(no name given: sign it to the reader)"}`,
			`Mail the bookplate${order.quantity > 1 ? "s" : ""} to: ${[order.shipTo.name, order.shipTo.line1, order.shipTo.line2, `${order.shipTo.city}, ${order.shipTo.state} ${order.shipTo.postal}`].filter(Boolean).join(", ")}`,
			`Promised to the buyer: mailed ${SIGNED_EDITION.mailBy}. The books print and ship from Lulu on their own.`,
			`Full list: ${baseUrl(env)}/api/admin/signed-edition`,
		];
		await sendOnce(env, `signed-notice:${session.id}`, {
			to,
			from: DEFAULT_FROM,
			subject: `✍️ Sign ${label}${order.signTo ? ` to ${order.signTo}` : ""}`,
			text: lines.join("\n\n"),
			html: layout(env, "Signed Holiday Edition order", lines.map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join("")),
			tags: [{ name: "type", value: "signed_notice" }],
		}).catch((err) => console.log(JSON.stringify({ at: "signed", event: "notice_failed", error: String(err).slice(0, 120) })));
	}
	return order;
}

/** Bookplate numbers per session, in payment order, live orders only. */
export function bookplateNumbers(orders: SignedOrder[]): Map<string, number[]> {
	const out = new Map<string, number[]>();
	let n = 0;
	for (const o of orders) {
		if (!o.livemode) continue;
		const mine: number[] = [];
		for (let i = 0; i < o.quantity; i++) mine.push(++n);
		out.set(o.session, mine);
	}
	return out;
}

/** The admin register: every order with its bookplate numbers. */
export async function signedRegister(env: Env) {
	const orders = await listSignedOrders(env);
	const nums = bookplateNumbers(orders);
	const live = orders.filter((o) => o.livemode);
	return {
		limit: SIGNED_EDITION.limit,
		sold: live.reduce((n, o) => n + o.quantity, 0),
		orders: orders.map((o) => ({ ...o, bookplates: nums.get(o.session) ?? [] })),
	};
}
