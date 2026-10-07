/**
 * Fulfillment records in D1. One row per Stripe Checkout Session: the primary
 * key is what makes webhook processing idempotent — the first delivery claims
 * the row, every redelivery finds it and stops.
 *
 * Schema: migrations/0001_create_fulfillments.sql
 * (apply with `npx wrangler d1 migrations apply squishman-orders --remote`).
 */
import type { FulfillmentRecord, FulfillmentStatus } from "./types";

const now = () => new Date().toISOString();

export type NewRecord = Omit<
	FulfillmentRecord,
	| "lulu_print_job_id"
	| "lulu_status"
	| "lulu_cost_json"
	| "carrier"
	| "tracking_id"
	| "tracking_urls"
	| "attempts"
	| "created_at"
	| "updated_at"
>;

/** Insert the record unless the session already has one. True if we claimed it. */
export async function claim(db: D1Database, r: NewRecord): Promise<boolean> {
	const t = now();
	const res = await db
		.prepare(
			`INSERT INTO fulfillments (stripe_session_id, stripe_event_id, stripe_payment_intent, livemode,
				status, status_detail, items_json, shipping_json, shipping_level, attempts, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
			 ON CONFLICT(stripe_session_id) DO NOTHING`,
		)
		.bind(
			r.stripe_session_id,
			r.stripe_event_id,
			r.stripe_payment_intent,
			r.livemode,
			r.status,
			r.status_detail,
			r.items_json,
			r.shipping_json,
			r.shipping_level,
			t,
			t,
		)
		.run();
	return res.meta.changes === 1;
}

export async function get(
	db: D1Database,
	sessionId: string,
): Promise<FulfillmentRecord | null> {
	return db
		.prepare("SELECT * FROM fulfillments WHERE stripe_session_id = ?")
		.bind(sessionId)
		.first<FulfillmentRecord>();
}

export async function getByLuluJob(
	db: D1Database,
	jobId: string,
): Promise<FulfillmentRecord | null> {
	return db
		.prepare("SELECT * FROM fulfillments WHERE lulu_print_job_id = ?")
		.bind(jobId)
		.first<FulfillmentRecord>();
}

export async function list(db: D1Database, limit = 50): Promise<FulfillmentRecord[]> {
	const res = await db
		.prepare("SELECT * FROM fulfillments ORDER BY created_at DESC LIMIT ?")
		.bind(Math.min(Math.max(limit, 1), 200))
		.all<FulfillmentRecord>();
	return res.results;
}

/** Records with a Lulu job that hasn't reached a final state yet. */
export async function open(db: D1Database): Promise<FulfillmentRecord[]> {
	const res = await db
		.prepare(
			`SELECT * FROM fulfillments WHERE lulu_print_job_id IS NOT NULL
			 AND status IN ('SUBMITTED') ORDER BY updated_at ASC LIMIT 50`,
		)
		.all<FulfillmentRecord>();
	return res.results;
}

/**
 * Atomically move a record from one of `from` to `to`. Returns false if
 * another request moved it first — used to make retries single-flight.
 */
export async function transition(
	db: D1Database,
	sessionId: string,
	from: FulfillmentStatus[],
	to: FulfillmentStatus,
	detail: string | null,
): Promise<boolean> {
	const res = await db
		.prepare(
			`UPDATE fulfillments SET status = ?, status_detail = ?, updated_at = ?
			 WHERE stripe_session_id = ? AND status IN (${from.map(() => "?").join(",")})`,
		)
		.bind(to, detail, now(), sessionId, ...from)
		.run();
	return res.meta.changes === 1;
}

export async function update(
	db: D1Database,
	sessionId: string,
	fields: Partial<Omit<FulfillmentRecord, "stripe_session_id" | "created_at">>,
): Promise<void> {
	const entries = Object.entries({ ...fields, updated_at: now() });
	await db
		.prepare(
			`UPDATE fulfillments SET ${entries.map(([k]) => `${k} = ?`).join(", ")} WHERE stripe_session_id = ?`,
		)
		.bind(...entries.map(([, v]) => v ?? null), sessionId)
		.run();
}
