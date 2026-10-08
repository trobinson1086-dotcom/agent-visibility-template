/**
 * Lulu Print API client (https://api.lulu.com/docs/). OAuth2 client
 * credentials; every request has a timeout and none are retried here, so a
 * failure can never create a second print job on its own.
 */
import { hmacSha256, safeEqual, toBase64, toHex } from "./crypto";
import type { FulfillmentMode, ShippingInfo } from "./types";

const TIMEOUT_MS = 20_000;

export const LULU_HOSTS = {
	sandbox: "https://api.sandbox.lulu.com",
	production: "https://api.lulu.com",
} as const;

export interface LuluCredentials {
	clientKey: string;
	clientSecret: string;
	mode: Exclude<FulfillmentMode, "off">;
}

export class LuluError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly detail: string,
	) {
		super(message);
	}
}

// Token cache per isolate, keyed by environment + client key.
const tokens = new Map<string, { token: string; expiresAt: number }>();

async function accessToken(c: LuluCredentials): Promise<string> {
	const cacheKey = `${c.mode}:${c.clientKey}`;
	const hit = tokens.get(cacheKey);
	if (hit && hit.expiresAt > Date.now()) return hit.token;
	const res = await fetch(
		`${LULU_HOSTS[c.mode]}/auth/realms/glasstree/protocol/openid-connect/token`,
		{
			method: "POST",
			headers: {
				Authorization: `Basic ${btoa(`${c.clientKey}:${c.clientSecret}`)}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: "grant_type=client_credentials",
			signal: AbortSignal.timeout(TIMEOUT_MS),
		},
	);
	if (!res.ok) {
		throw new LuluError("Lulu authentication failed", res.status, await safeText(res));
	}
	const json = (await res.json()) as { access_token: string; expires_in?: number };
	const ttl = Math.max(30, (json.expires_in ?? 300) - 60) * 1000;
	tokens.set(cacheKey, { token: json.access_token, expiresAt: Date.now() + ttl });
	return json.access_token;
}

async function safeText(res: Response): Promise<string> {
	try {
		return (await res.text()).slice(0, 2000);
	} catch {
		return "";
	}
}

async function luluFetch<T>(
	c: LuluCredentials,
	method: "GET" | "POST",
	path: string,
	body?: unknown,
): Promise<T> {
	const token = await accessToken(c);
	const res = await fetch(`${LULU_HOSTS[c.mode]}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			"Cache-Control": "no-cache",
		},
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (!res.ok) {
		throw new LuluError(`Lulu ${method} ${path} failed`, res.status, await safeText(res));
	}
	return (await res.json()) as T;
}

/** Verify the Lulu credentials by obtaining a token. */
export async function checkAuth(c: LuluCredentials): Promise<void> {
	await accessToken(c);
}

export type ShippingLevel = "MAIL" | "PRIORITY_MAIL" | "GROUND" | "EXPEDITED" | "EXPRESS";
export const SHIPPING_LEVELS: readonly ShippingLevel[] = [
	"MAIL",
	"PRIORITY_MAIL",
	"GROUND",
	"EXPEDITED",
	"EXPRESS",
];

export interface CostLineItem {
	pod_package_id: string;
	page_count: number;
	quantity: number;
}

/** POST /print-job-cost-calculations/ — print + shipping + fees for a destination. */
export function calculateCost(
	c: LuluCredentials,
	lineItems: CostLineItem[],
	address: Omit<ShippingInfo, "email" | "name"> & { name?: string },
	shippingOption: ShippingLevel,
): Promise<Record<string, unknown>> {
	return luluFetch(c, "POST", "/print-job-cost-calculations/", {
		line_items: lineItems,
		shipping_address: address,
		shipping_option: shippingOption,
	});
}

export interface PrintJobLineItem {
	external_id: string;
	title: string;
	quantity: number;
	printable_normalization: {
		pod_package_id: string;
		cover: { source_url: string };
		interior: { source_url: string };
	};
}

export interface LuluPrintJob {
	id: number;
	external_id?: string | null;
	status?: { name?: string; message?: string };
	line_items?: Array<{
		status?: {
			name?: string;
			messages?: {
				tracking_id?: string;
				tracking_urls?: string[];
				carrier_name?: string;
			};
		};
	}>;
}

/** POST /print-jobs/ — create a print job. */
export function createPrintJob(
	c: LuluCredentials,
	payload: {
		external_id: string;
		contact_email: string;
		shipping_level: ShippingLevel;
		shipping_address: ShippingInfo;
		line_items: PrintJobLineItem[];
	},
): Promise<LuluPrintJob> {
	return luluFetch(c, "POST", "/print-jobs/", payload);
}

/** GET /print-jobs/{id}/ */
export function getPrintJob(c: LuluCredentials, id: string): Promise<LuluPrintJob> {
	return luluFetch(c, "GET", `/print-jobs/${encodeURIComponent(id)}/`);
}

/** GET /print-jobs/?search= — find jobs already created for our external_id. */
export async function findPrintJobs(
	c: LuluCredentials,
	externalId: string,
): Promise<LuluPrintJob[]> {
	const res = await luluFetch<{ results?: LuluPrintJob[] }>(
		c,
		"GET",
		`/print-jobs/?search=${encodeURIComponent(externalId)}`,
	);
	return (res.results ?? []).filter((j) => j.external_id === externalId);
}

/**
 * Verify the `Lulu-HMAC-SHA256` header: HMAC-SHA256 of the raw body keyed with
 * the API (client) secret. Lulu's docs don't state the encoding, so both hex
 * and base64 are accepted.
 */
export async function verifyLuluSignature(
	rawBody: string,
	header: string | null | undefined,
	clientSecret: string,
): Promise<boolean> {
	if (!header) return false;
	const mac = await hmacSha256(clientSecret, rawBody);
	const got = header.trim();
	return safeEqual(got.toLowerCase(), toHex(mac)) || safeEqual(got, toBase64(mac));
}

/** Pull carrier / tracking info out of a print job, if shipped. */
export function trackingOf(job: LuluPrintJob): {
	carrier: string | null;
	trackingId: string | null;
	trackingUrls: string[];
} {
	const ids: string[] = [];
	const urls: string[] = [];
	let carrier: string | null = null;
	for (const li of job.line_items ?? []) {
		const m = li.status?.messages;
		if (!m) continue;
		if (m.tracking_id) ids.push(m.tracking_id);
		if (m.tracking_urls) urls.push(...m.tracking_urls);
		if (m.carrier_name) carrier ??= m.carrier_name;
	}
	return {
		carrier,
		trackingId: ids.length ? [...new Set(ids)].join(", ") : null,
		trackingUrls: [...new Set(urls)],
	};
}
