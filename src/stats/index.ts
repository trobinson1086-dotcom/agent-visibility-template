/**
 * Squish Man's own visitor counter.
 *
 * public/mh.js sends one small beacon per page view (plus time on page and
 * clicks on Buy, sign-up and social buttons) to POST /api/mh. Each row keeps
 * the page, where the visit came from, browser / device / OS, language and
 * Cloudflare's approximate location (country, region, city).
 *
 * Privacy: no cookies and no IP address is stored. Unique visitors are counted
 * with a hash of (IP + browser) mixed with a random salt that changes every
 * Eastern day and is deleted after two days, so a visitor can't be followed
 * from one day to the next and the hash can't be turned back into an IP.
 * Rows older than 400 days are deleted by the hourly cron.
 *
 * The owner reads it at /stats?k=<key> (STATS_KEY_HASH holds the key's
 * SHA-256; ADMIN_TOKEN works too). Opening that page also marks the owner's
 * browser so its own visits aren't counted.
 */
import type { Env } from "../lib/types";
import { classifySource, clean, cleanPath, easternParts, parseUa } from "./classify";

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS site_hits (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		ts INTEGER NOT NULL,
		day TEXT NOT NULL,
		hour INTEGER NOT NULL,
		weekday TEXT,
		kind TEXT NOT NULL,
		path TEXT NOT NULL,
		label TEXT,
		entry INTEGER NOT NULL DEFAULT 0,
		repeat_visitor INTEGER NOT NULL DEFAULT 0,
		secs INTEGER NOT NULL DEFAULT 0,
		source TEXT NOT NULL,
		ref_host TEXT,
		utm_source TEXT,
		utm_medium TEXT,
		utm_campaign TEXT,
		utm_content TEXT,
		browser TEXT,
		os TEXT,
		device TEXT,
		lang TEXT,
		country TEXT,
		region TEXT,
		city TEXT,
		visitor TEXT NOT NULL,
		test INTEGER NOT NULL DEFAULT 0
	)`,
	`CREATE INDEX IF NOT EXISTS site_hits_day ON site_hits (day, kind)`,
	`CREATE INDEX IF NOT EXISTS site_hits_ts ON site_hits (ts)`,
	`CREATE TABLE IF NOT EXISTS site_salts (day TEXT PRIMARY KEY, salt TEXT NOT NULL)`,
];

let schemaReady: Promise<void> | null = null;

/** Creates the tables on first use (also in migrations/0003_site_stats.sql). */
export function ensureStatsSchema(db: D1Database): Promise<void> {
	if (!schemaReady) {
		schemaReady = db
			.batch(SCHEMA.map((s) => db.prepare(s)))
			.then(() => undefined)
			.catch((err) => {
				schemaReady = null;
				throw err;
			});
	}
	return schemaReady;
}

const KINDS = new Set(["view", "time", "buy", "signup", "contact", "social", "email", "out", "peek"]);
const MAX_BODY = 4096;

async function sha256Hex(s: string): Promise<string> {
	const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function saltFor(db: D1Database, day: string): Promise<string> {
	const fresh = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
	await db.prepare("INSERT OR IGNORE INTO site_salts (day, salt) VALUES (?, ?)").bind(day, fresh).run();
	const row = await db.prepare("SELECT salt FROM site_salts WHERE day = ?").bind(day).first<{ salt: string }>();
	return row?.salt ?? fresh;
}

function hostOf(v: string | null | undefined): string {
	if (!v) return "";
	try {
		return new URL(v).hostname.toLowerCase();
	} catch {
		return "";
	}
}

function allowedOrigin(req: Request): boolean {
	const self = new URL(req.url).hostname;
	const from = hostOf(req.headers.get("origin")) || hostOf(req.headers.get("referer"));
	if (!from) return false;
	return from === self || /(^|\.)squishman\.com$/.test(from);
}

/** POST /api/mh — records one beacon. Always answers 204 so the page never waits or errors. */
export async function recordHit(env: Env, req: Request): Promise<Response> {
	const done = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
	const db = env.ORDERS_DB;
	if (!db || !allowedOrigin(req)) return done;
	const text = await req.text();
	if (text.length > MAX_BODY) return done;
	let b: Record<string, unknown>;
	try {
		b = JSON.parse(text);
	} catch {
		return done;
	}
	const kind = clean(b.k, 12);
	if (!KINDS.has(kind)) return done;

	const ua = req.headers.get("user-agent") ?? "";
	const info = parseUa(ua, b.tm === 1);
	if (info.bot) return done;

	const siteHost = new URL(req.url).hostname;
	const src = (b.s && typeof b.s === "object" ? b.s : {}) as Record<string, unknown>;
	const refHost = clean(src.r, 100).toLowerCase();
	const utmSource = clean(src.us, 60);
	const utmMedium = clean(src.um, 60);
	const clickIds = Array.isArray(src.c) ? (src.c as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 3) : [];
	const source = classifySource({ refHost, utmSource, utmMedium, clickIds, app: info.app, siteHost });

	const now = Date.now();
	const { day, hour, weekday } = easternParts(now);
	const cf = ((req as unknown as { cf?: Record<string, unknown> }).cf ?? {}) as Record<string, unknown>;
	const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "";

	try {
		await ensureStatsSchema(db);
		const salt = await saltFor(db, day);
		const visitor = (await sha256Hex(`${salt}|${ip}|${ua}`)).slice(0, 20);
		const secs = kind === "time" ? Math.max(0, Math.min(1800, Math.round(Number(b.t) || 0))) : 0;
		if (kind === "time" && secs === 0) return done;
		await db
			.prepare(
				`INSERT INTO site_hits (ts, day, hour, weekday, kind, path, label, entry, repeat_visitor, secs, source, ref_host,
				 utm_source, utm_medium, utm_campaign, utm_content, browser, os, device, lang, country, region, city, visitor, test)
				 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			)
			.bind(
				now,
				day,
				hour,
				weekday,
				kind,
				cleanPath(b.p),
				clean(b.l, 90) || null,
				b.e === 1 ? 1 : 0,
				b.rv === 1 ? 1 : 0,
				secs,
				source,
				refHost && refHost !== siteHost ? refHost : null,
				utmSource || null,
				utmMedium || null,
				clean(src.uc, 80) || null,
				clean(src.ut, 80) || null,
				info.browser,
				info.os,
				info.device,
				clean(b.lg, 12) || null,
				clean(cf.country, 4) || null,
				clean(cf.region, 60) || null,
				clean(cf.city, 60) || null,
				visitor,
				b.x === 1 ? 1 : 0,
			)
			.run();
	} catch (err) {
		console.error(JSON.stringify({ at: "stats", event: "record_failed", error: String(err).slice(0, 200) }));
	}
	return done;
}

/** Hourly: drop rows past the retention window and old salts. */
export async function pruneStats(env: Env): Promise<void> {
	const db = env.ORDERS_DB;
	if (!db) return;
	await ensureStatsSchema(db);
	const cutoff = Date.now() - 400 * 86_400_000;
	const saltCutoff = easternParts(Date.now() - 2 * 86_400_000).day;
	await db.batch([
		db.prepare("DELETE FROM site_hits WHERE ts < ?").bind(cutoff),
		db.prepare("DELETE FROM site_salts WHERE day < ?").bind(saltCutoff),
	]);
}

// --- Reading --------------------------------------------------------------------

export async function statsAuthorized(env: Env & { STATS_KEY_HASH?: string }, key: string | undefined): Promise<boolean> {
	if (!key || key.length < 8 || key.length > 200) return false;
	if (env.ADMIN_TOKEN && key === env.ADMIN_TOKEN) return true;
	const want = (env.STATS_KEY_HASH ?? "").toLowerCase();
	if (!/^[0-9a-f]{64}$/.test(want)) return false;
	const got = await sha256Hex(key);
	let diff = 0;
	for (let i = 0; i < 64; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
	return diff === 0;
}

export interface Row {
	name: string;
	visitors: number;
	n: number;
}

export interface StatsReport {
	range: { days: number; from: string; to: string };
	totals: {
		visitors: number;
		views: number;
		visits: number;
		avgSecondsPerVisitor: number;
		onePageVisitorsPct: number;
		buyClicks: number;
		buyVisitors: number;
		signups: number;
		contacts: number;
		returningVisitsPct: number;
	};
	liveNow: number;
	daily: { day: string; visitors: number; views: number; buys: number }[];
	sources: { name: string; visitors: number; visits: number; buys: number }[];
	campaigns: { source: string; campaign: string; content: string; visitors: number; buys: number }[];
	referrers: Row[];
	pages: Row[];
	landing: Row[];
	buys: Row[];
	actions: Row[];
	browsers: Row[];
	devices: Row[];
	os: Row[];
	languages: Row[];
	countries: Row[];
	regions: Row[];
	cities: Row[];
	hours: { hour: number; views: number }[];
	weekdays: { name: string; views: number }[];
	recent: {
		time: string;
		kind: string;
		page: string;
		label: string | null;
		source: string;
		place: string;
		device: string;
		browser: string;
	}[];
}

const COUNTRY = (() => {
	try {
		return new Intl.DisplayNames(["en"], { type: "region" });
	} catch {
		return null;
	}
})();
function countryName(code: string | null): string {
	if (!code) return "Unknown";
	if (code === "T1") return "Tor network";
	try {
		return COUNTRY?.of(code) ?? code;
	} catch {
		return code;
	}
}

export async function buildReport(env: Env, days: number): Promise<StatsReport> {
	const db = env.ORDERS_DB!;
	await ensureStatsSchema(db);
	const to = easternParts(Date.now()).day;
	const from = easternParts(Date.now() - (days - 1) * 86_400_000).day;
	const W = "test = 0 AND day >= ?1 AND day <= ?2";
	const all = <T>(sql: string, ...extra: unknown[]) =>
		db.prepare(sql).bind(from, to, ...extra).all<T>().then((r) => r.results ?? []);
	const one = <T>(sql: string) => db.prepare(sql).bind(from, to).first<T>();
	const visitorKey = "(day || visitor)";
	const grouped = (col: string, kind = "view", limit = 15) =>
		all<Row>(
			`SELECT COALESCE(${col}, 'Unknown') AS name, COUNT(DISTINCT ${visitorKey}) AS visitors, COUNT(*) AS n
			 FROM site_hits WHERE ${W} AND kind = '${kind}' GROUP BY name ORDER BY visitors DESC, n DESC LIMIT ${limit}`,
		);

	const [t, time, onePage, buyT, liveNow, daily, sources, campaigns, referrers, pages, landing, buys, actions, browsers, devices, os, languages, countriesRaw, regions, cities, hours, weekdays, recent] =
		await Promise.all([
			one<{ visitors: number; views: number; visits: number; repeats: number; signups: number; contacts: number }>(
				`SELECT COUNT(DISTINCT CASE WHEN kind='view' THEN ${visitorKey} END) AS visitors,
				        SUM(kind='view') AS views,
				        SUM(kind='view' AND entry=1) AS visits,
				        SUM(kind='view' AND entry=1 AND repeat_visitor=1) AS repeats,
				        SUM(kind='signup') AS signups,
				        SUM(kind='contact') AS contacts
				 FROM site_hits WHERE ${W}`,
			),
			one<{ secs: number }>(`SELECT COALESCE(SUM(secs),0) AS secs FROM site_hits WHERE ${W} AND kind='time'`),
			one<{ single: number; total: number }>(
				`SELECT SUM(c=1) AS single, COUNT(*) AS total FROM
				 (SELECT COUNT(*) AS c FROM site_hits WHERE ${W} AND kind='view' GROUP BY day, visitor)`,
			),
			one<{ clicks: number; people: number }>(
				`SELECT COUNT(*) AS clicks, COUNT(DISTINCT ${visitorKey}) AS people FROM site_hits WHERE ${W} AND kind='buy'`,
			),
			db
				.prepare("SELECT COUNT(DISTINCT visitor) AS n FROM site_hits WHERE test=0 AND ts > ?")
				.bind(Date.now() - 30 * 60_000)
				.first<{ n: number }>(),
			all<{ day: string; visitors: number; views: number; buys: number }>(
				`SELECT day, COUNT(DISTINCT CASE WHEN kind='view' THEN visitor END) AS visitors,
				        SUM(kind='view') AS views, SUM(kind='buy') AS buys
				 FROM site_hits WHERE ${W} GROUP BY day ORDER BY day`,
			),
			all<{ name: string; visitors: number; visits: number; buys: number }>(
				`SELECT source AS name, COUNT(DISTINCT CASE WHEN kind='view' THEN ${visitorKey} END) AS visitors,
				        SUM(kind='view' AND entry=1) AS visits, SUM(kind='buy') AS buys
				 FROM site_hits WHERE ${W} GROUP BY source HAVING visitors > 0 OR buys > 0 ORDER BY visitors DESC, buys DESC LIMIT 20`,
			),
			all<{ source: string; campaign: string; content: string; visitors: number; buys: number }>(
				`SELECT COALESCE(utm_source,'') AS source, COALESCE(utm_campaign,'') AS campaign, COALESCE(utm_content,'') AS content,
				        COUNT(DISTINCT CASE WHEN kind='view' THEN ${visitorKey} END) AS visitors, SUM(kind='buy') AS buys
				 FROM site_hits WHERE ${W} AND (utm_source IS NOT NULL OR utm_campaign IS NOT NULL)
				 GROUP BY 1,2,3 ORDER BY visitors DESC LIMIT 25`,
			),
			all<Row>(
				`SELECT ref_host AS name, COUNT(DISTINCT ${visitorKey}) AS visitors, COUNT(*) AS n
				 FROM site_hits WHERE ${W} AND kind='view' AND entry=1 AND ref_host IS NOT NULL
				 GROUP BY ref_host ORDER BY visitors DESC LIMIT 15`,
			),
			grouped("path", "view", 20),
			all<Row>(
				`SELECT path AS name, COUNT(DISTINCT ${visitorKey}) AS visitors, COUNT(*) AS n
				 FROM site_hits WHERE ${W} AND kind='view' AND entry=1 GROUP BY path ORDER BY visitors DESC LIMIT 10`,
			),
			grouped("label", "buy", 25),
			all<Row>(
				`SELECT kind || ': ' || COALESCE(label,'') AS name, COUNT(DISTINCT ${visitorKey}) AS visitors, COUNT(*) AS n
				 FROM site_hits WHERE ${W} AND kind IN ('signup','contact','social','email','out','peek')
				 GROUP BY name ORDER BY n DESC LIMIT 20`,
			),
			grouped("browser"),
			grouped("device"),
			grouped("os"),
			grouped("lang", "view", 10),
			grouped("country", "view", 15),
			grouped("CASE WHEN region IS NULL THEN NULL ELSE region || ', ' || COALESCE(country,'') END", "view", 15),
			grouped("CASE WHEN city IS NULL THEN NULL ELSE city || ', ' || COALESCE(region, country, '') END", "view", 20),
			all<{ hour: number; views: number }>(
				`SELECT hour, COUNT(*) AS views FROM site_hits WHERE ${W} AND kind='view' GROUP BY hour ORDER BY hour`,
			),
			all<{ name: string; views: number }>(
				`SELECT weekday AS name, COUNT(*) AS views FROM site_hits WHERE ${W} AND kind='view' GROUP BY weekday`,
			),
			db
				.prepare(
					`SELECT ts, kind, path, label, source, city, region, country, device, browser FROM site_hits
					 WHERE test=0 AND kind <> 'time' ORDER BY ts DESC LIMIT 30`,
				)
				.all<{ ts: number; kind: string; path: string; label: string | null; source: string; city: string | null; region: string | null; country: string | null; device: string; browser: string }>()
				.then((r) => r.results ?? []),
		]);

	const visitors = Number(t?.visitors ?? 0);
	const visits = Number(t?.visits ?? 0);
	const hourFill = Array.from({ length: 24 }, (_, h) => ({ hour: h, views: Number(hours.find((x) => x.hour === h)?.views ?? 0) }));
	const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
	const fmtTime = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

	return {
		range: { days, from, to },
		totals: {
			visitors,
			views: Number(t?.views ?? 0),
			visits,
			avgSecondsPerVisitor: visitors ? Math.round(Number(time?.secs ?? 0) / visitors) : 0,
			onePageVisitorsPct: onePage?.total ? Math.round((100 * Number(onePage.single ?? 0)) / Number(onePage.total)) : 0,
			buyClicks: Number(buyT?.clicks ?? 0),
			buyVisitors: Number(buyT?.people ?? 0),
			signups: Number(t?.signups ?? 0),
			contacts: Number(t?.contacts ?? 0),
			returningVisitsPct: visits ? Math.round((100 * Number(t?.repeats ?? 0)) / visits) : 0,
		},
		liveNow: Number(liveNow?.n ?? 0),
		daily: daily.map((d) => ({ day: d.day, visitors: Number(d.visitors), views: Number(d.views), buys: Number(d.buys) })),
		sources: sources.map((s) => ({ ...s, visitors: Number(s.visitors), visits: Number(s.visits), buys: Number(s.buys) })),
		campaigns,
		referrers,
		pages,
		landing,
		buys,
		actions,
		browsers,
		devices,
		os,
		languages,
		countries: countriesRaw.map((r) => ({ ...r, name: countryName(r.name === "Unknown" ? null : r.name) })),
		regions,
		cities,
		hours: hourFill,
		weekdays: WD.map((name) => ({ name, views: Number(weekdays.find((w) => w.name === name)?.views ?? 0) })),
		recent: recent.map((r) => ({
			time: fmtTime.format(new Date(r.ts)),
			kind: r.kind,
			page: r.path,
			label: r.label,
			source: r.source,
			place: [r.city, r.region, countryName(r.country)].filter(Boolean).join(", "),
			device: r.device,
			browser: r.browser,
		})),
	};
}
