/**
 * Pure helpers for the site's own visitor counter (src/stats): turn a
 * user-agent and a visit's referrer / UTM tags into plain labels.
 * No I/O, no identifiers — easy to test.
 */

export interface UaInfo {
	browser: string;
	os: string;
	device: "Phone" | "Tablet" | "Desktop";
	/** In-app browser of a social app, when the UA says so (its referrer is often empty). */
	app: string | null;
	bot: boolean;
}

const BOT_RE =
	/bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|quora link|whatsapp|python|curl|wget|node-fetch|axios|go-http|java\/|httpclient|phantom|puppeteer|playwright|selenium|scrapy|monitor|uptime|pingdom|validator/i;

export function parseUa(ua: string, touchMac = false): UaInfo {
	const s = ua || "";
	const bot = s.length < 20 || BOT_RE.test(s);

	let app: string | null = null;
	if (/Instagram/i.test(s)) app = "Instagram";
	else if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(s)) app = "Facebook";
	else if (/musical_ly|BytedanceWebview|TikTok|trill_/i.test(s)) app = "TikTok";
	else if (/Snapchat/i.test(s)) app = "Snapchat";
	else if (/Pinterest/i.test(s)) app = "Pinterest";
	else if (/LinkedInApp/i.test(s)) app = "LinkedIn";
	else if (/GSA\//.test(s)) app = "Google app";

	let browser = "Other";
	if (app) browser = `${app} app`;
	else if (/Edg(e|A|iOS)?\//.test(s)) browser = "Edge";
	else if (/OPR\/|Opera/.test(s)) browser = "Opera";
	else if (/SamsungBrowser/.test(s)) browser = "Samsung Internet";
	else if (/Firefox|FxiOS/.test(s)) browser = "Firefox";
	else if (/DuckDuckGo/.test(s)) browser = "DuckDuckGo";
	else if (/Chrome|CriOS|Chromium/.test(s)) browser = "Chrome";
	else if (/Safari/.test(s) && /Version\//.test(s)) browser = "Safari";
	else if (/AppleWebKit/.test(s) && /iPhone|iPad|iPod/.test(s)) browser = "Safari (in-app)";

	let os = "Other";
	if (/iPhone|iPod/.test(s)) os = "iPhone (iOS)";
	else if (/iPad/.test(s) || (touchMac && /Macintosh/.test(s))) os = "iPad (iPadOS)";
	else if (/Android/.test(s)) os = "Android";
	else if (/Windows/.test(s)) os = "Windows";
	else if (/CrOS/.test(s)) os = "ChromeOS";
	else if (/Macintosh|Mac OS X/.test(s)) os = "Mac";
	else if (/Linux/.test(s)) os = "Linux";

	let device: UaInfo["device"] = "Desktop";
	if (/iPad|Tablet|Kindle|Silk/.test(s) || (touchMac && /Macintosh/.test(s)) || (/Android/.test(s) && !/Mobile/.test(s)))
		device = "Tablet";
	else if (/Mobi|iPhone|iPod|Android/.test(s)) device = "Phone";

	return { browser, os, device, app, bot };
}

export interface SourceInput {
	refHost: string;
	utmSource: string;
	utmMedium: string;
	/** Which ad/social click ids were on the landing URL (ids themselves are never kept). */
	clickIds: string[];
	app: string | null;
	siteHost: string;
}

const UTM_MAP: [RegExp, string][] = [
	[/^(ig|insta|instagram)/i, "Instagram"],
	[/^(tt|tiktok)/i, "TikTok"],
	[/^(fb|facebook|meta)/i, "Facebook"],
	[/^(yt|youtube|shorts)/i, "YouTube"],
	[/^google/i, "Google"],
	[/^(bing|microsoft)/i, "Bing"],
	[/^(pin|pinterest)/i, "Pinterest"],
	[/^(x|twitter)$/i, "X (Twitter)"],
	[/^(email|newsletter|mail|resend|gmail)/i, "Email"],
	[/^(sms|text)/i, "Text message"],
	[/^(qr|flyer|print|card)/i, "QR code / print"],
	[/^amazon/i, "Amazon"],
	[/^(lulu)/i, "Lulu"],
];

const HOST_MAP: [RegExp, string][] = [
	[/(^|\.)google\.[a-z.]+$/, "Google"],
	[/(^|\.)bing\.com$/, "Bing"],
	[/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
	[/(^|\.)search\.yahoo\.com$|(^|\.)yahoo\.com$/, "Yahoo"],
	[/(^|\.)search\.brave\.com$/, "Brave Search"],
	[/(^|\.)ecosia\.org$/, "Ecosia"],
	[/(^|\.)instagram\.com$/, "Instagram"],
	[/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, "Facebook"],
	[/(^|\.)tiktok\.com$/, "TikTok"],
	[/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/, "YouTube"],
	[/(^|\.)pinterest\.[a-z.]+$|(^|\.)pin\.it$/, "Pinterest"],
	[/(^|\.)(t\.co|twitter\.com|x\.com)$/, "X (Twitter)"],
	[/(^|\.)(linkedin\.com|lnkd\.in)$/, "LinkedIn"],
	[/(^|\.)reddit\.com$/, "Reddit"],
	[/(^|\.)snapchat\.com$/, "Snapchat"],
	[/(^|\.)threads\.(net|com)$/, "Threads"],
	[/(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|mail\.yahoo\.com|mail\.aol\.com)$/, "Email"],
	[/(^|\.)(chatgpt\.com|openai\.com)$/, "ChatGPT"],
	[/(^|\.)perplexity\.ai$/, "Perplexity"],
	[/(^|\.)claude\.ai$/, "Claude"],
	[/(^|\.)gemini\.google\.com$/, "Gemini"],
	[/(^|\.)copilot\.microsoft\.com$/, "Copilot"],
	[/(^|\.)amazon\.[a-z.]+$/, "Amazon"],
	[/(^|\.)stripe\.com$/, "Back from checkout"],
	[/(^|\.)metricool\.com$/, "Metricool link"],
	[/(^|\.)linktr\.ee$/, "Linktree"],
];

/** One plain label for where a visit came from. */
export function classifySource(i: SourceInput): string {
	const utm = (i.utmSource || "").trim();
	if (utm) {
		for (const [re, name] of UTM_MAP) if (re.test(utm)) return name;
	}
	if (i.clickIds.includes("gclid")) return "Google Ads";
	if (i.clickIds.includes("ttclid")) return "TikTok";
	const host = (i.refHost || "").toLowerCase().replace(/^www\./, "");
	if (host && host !== i.siteHost.replace(/^www\./, "")) {
		for (const [re, name] of HOST_MAP) if (re.test(host)) return name;
		if (i.clickIds.includes("fbclid")) return i.app ?? "Facebook";
		return host;
	}
	if (i.clickIds.includes("fbclid")) return i.app ?? "Facebook";
	if (i.app && i.app !== "Google app") return i.app;
	if (utm) return utm.toLowerCase().slice(0, 40);
	if (/email/i.test(i.utmMedium)) return "Email";
	return "Direct (typed or bookmarked)";
}

/** Eastern-time calendar day and hour for a timestamp. */
export function easternParts(ms: number): { day: string; hour: number; weekday: string } {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		weekday: "short",
		hourCycle: "h23",
	}).formatToParts(new Date(ms));
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
	return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24, weekday: get("weekday") };
}

/** Trim a free-text value from the page to a short, single-line label. */
export function clean(v: unknown, max = 80): string {
	if (typeof v !== "string") return "";
	return v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Keep a page path short and free of anything but the few query keys that name a page. */
export function cleanPath(v: unknown): string {
	const s = clean(v, 200);
	if (!s.startsWith("/")) return "/";
	const [path, query = ""] = s.split("?");
	const keep = new URLSearchParams();
	const q = new URLSearchParams(query);
	for (const k of ["book", "shop"]) {
		const val = q.get(k);
		if (val && /^[a-z0-9-]{1,40}$/i.test(val)) keep.set(k, val);
	}
	const p = path.replace(/\/index\.html$/, "/").replace(/\.html$/, "") || "/";
	const qs = keep.toString();
	return qs ? `${p}?${qs}` : p;
}
