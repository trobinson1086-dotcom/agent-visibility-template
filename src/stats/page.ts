/** Renders the owner's private stats page from a StatsReport. Pure (no I/O). */
import type { Row, StatsReport } from "./index";

const esc = (s: unknown) =>
	String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const num = (n: number) => Number(n || 0).toLocaleString("en-US");

function duration(secs: number): string {
	if (!secs) return "0s";
	const m = Math.floor(secs / 60);
	const s = secs % 60;
	return m ? `${m}m ${s}s` : `${s}s`;
}

function prettyDay(day: string): string {
	const [y, m, d] = day.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Single-series vertical bars, with a hover/tap tip on each bar. */
function columns(items: { label: string; value: number; tip: string }[], height = 140): string {
	if (!items.length) return `<p class="empty">No visits in this range yet.</p>`;
	const max = Math.max(1, ...items.map((i) => i.value));
	const w = 1000;
	const gap = 2;
	const bw = Math.max(2, (w - gap * (items.length - 1)) / items.length);
	const bars = items
		.map((it, i) => {
			const h = it.value ? Math.max(3, (it.value / max) * (height - 4)) : 0;
			const x = i * (bw + gap);
			const r = Math.min(4, bw / 2, h);
			// rounded top only: path with arcs at the data end
			const d = h
				? `M${x},${height} V${height - h + r} Q${x},${height - h} ${x + r},${height - h} H${x + bw - r} Q${x + bw},${height - h} ${x + bw},${height - h + r} V${height} Z`
				: "";
			return `<g class="hit" data-tip="${esc(it.tip)}"><rect x="${x}" y="0" width="${bw + gap}" height="${height}" fill="transparent"/>${d ? `<path d="${d}" class="bar"/>` : ""}</g>`;
		})
		.join("");
	const first = items[0].label;
	const last = items[items.length - 1].label;
	return `<svg class="cols" viewBox="0 0 ${w} ${height}" preserveAspectRatio="none" role="img" aria-label="Chart">${bars}<line x1="0" x2="${w}" y1="${height - 0.5}" y2="${height - 0.5}" class="base"/></svg>
<div class="axis"><span>${esc(first)}</span><span>${esc(last)}</span></div>`;
}

/** Ranked list with a thin single-hue bar behind each value. */
function ranked(rows: Row[], opts: { col?: string; showN?: string; total?: number } = {}): string {
	if (!rows.length) return `<p class="empty">Nothing yet.</p>`;
	const max = Math.max(1, ...rows.map((r) => r.visitors));
	return `<table class="rank"><thead><tr><th>${esc(opts.col ?? "")}</th><th class="r">Visitors</th>${opts.showN ? `<th class="r">${esc(opts.showN)}</th>` : ""}</tr></thead><tbody>${rows
		.map(
			(r) =>
				`<tr><td><div class="lbl">${esc(r.name)}</div><div class="meter"><span style="width:${((100 * r.visitors) / max).toFixed(1)}%"></span></div></td><td class="r">${num(r.visitors)}${opts.total ? `<small> ${Math.round((100 * r.visitors) / opts.total)}%</small>` : ""}</td>${opts.showN ? `<td class="r">${num(r.n)}</td>` : ""}</tr>`,
		)
		.join("")}</tbody></table>`;
}

export function renderStatsPage(r: StatsReport, key: string): string {
	const T = r.totals;
	const k = encodeURIComponent(key);
	const ranges: [number, string][] = [
		[1, "Today"],
		[7, "7 days"],
		[30, "30 days"],
		[90, "90 days"],
		[365, "Year"],
	];
	const dailyChart = columns(
		fillDays(r).map((d) => ({
			label: prettyDay(d.day),
			value: d.visitors,
			tip: `${prettyDay(d.day)}: ${num(d.visitors)} visitors, ${num(d.views)} page views, ${num(d.buys)} Buy clicks`,
		})),
	);
	const hourChart = columns(
		r.hours.map((h) => ({
			label: h.hour === 0 ? "12 AM" : h.hour < 12 ? `${h.hour} AM` : h.hour === 12 ? "12 PM" : `${h.hour - 12} PM`,
			value: h.views,
			tip: `${h.hour === 0 ? "12 AM" : h.hour < 12 ? `${h.hour} AM` : h.hour === 12 ? "12 PM" : `${h.hour - 12} PM`} ET: ${num(h.views)} page views`,
		})),
		100,
	);
	const sourceRows = r.sources
		.map(
			(s) =>
				`<tr><td><div class="lbl">${esc(s.name)}</div><div class="meter"><span style="width:${((100 * s.visitors) / Math.max(1, r.sources[0]?.visitors ?? 1)).toFixed(1)}%"></span></div></td><td class="r">${num(s.visitors)}</td><td class="r">${num(s.visits)}</td><td class="r">${num(s.buys)}</td></tr>`,
		)
		.join("");
	const campaignRows = r.campaigns
		.map(
			(c) =>
				`<tr><td>${esc(c.source || "–")}</td><td>${esc(c.campaign || "–")}${c.content ? `<br><small>${esc(c.content)}</small>` : ""}</td><td class="r">${num(c.visitors)}</td><td class="r">${num(c.buys)}</td></tr>`,
		)
		.join("");
	const recentRows = r.recent
		.map(
			(x) =>
				`<tr><td class="nw">${esc(x.time)}</td><td>${esc(KIND[x.kind] ?? x.kind)}${x.label ? `: <small>${esc(x.label)}</small>` : ""}<br><small>${esc(x.page)}</small></td><td>${esc(x.source)}</td><td>${esc(x.place || "Unknown")}<br><small>${esc(x.device)} · ${esc(x.browser)}</small></td></tr>`,
		)
		.join("");

	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Squish Man visitors</title><link rel="icon" href="/favicon.ico">
<style>
:root{--bg:#f6f5f2;--card:#fcfcfb;--ink:#1d1d1b;--ink2:#55554f;--muted:#83837b;--line:#e4e2dc;--bar:#2a78d6;--track:#ecebe6;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#111110;--card:#1a1a19;--ink:#f1f0ec;--ink2:#c2c1ba;--muted:#8f8e87;--line:#2e2e2b;--bar:#3987e5;--track:#262624;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:0 0 10px}.sub{color:var(--ink2);margin:0 0 14px}
.ranges{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 18px}.ranges a{padding:6px 12px;border:1px solid var(--line);border-radius:999px;color:var(--ink);text-decoration:none;background:var(--card)}
.ranges a.on{background:var(--bar);border-color:var(--bar);color:#fff}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}.tile b{display:block;font-size:26px;font-weight:650;font-variant-numeric:tabular-nums}.tile span{color:var(--ink2);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;min-width:0;overflow-x:auto}.card.wide{grid-column:1/-1}
.cols{width:100%;height:140px;display:block}.cols .bar{fill:var(--bar)}.cols .base{stroke:var(--line)}.hit:hover .bar{opacity:.8}
.axis{display:flex;justify-content:space-between;color:var(--muted);font-size:12px;margin-top:4px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th{text-align:left;color:var(--muted);font-weight:500;font-size:12px;padding:4px 6px;border-bottom:1px solid var(--line)}
td{padding:6px;border-bottom:1px solid var(--line);vertical-align:top}.r{text-align:right;white-space:nowrap}.nw{white-space:nowrap}small{color:var(--muted)}
.lbl{overflow-wrap:anywhere}.meter{height:4px;background:var(--track);border-radius:4px;margin-top:4px}.meter span{display:block;height:100%;background:var(--bar);border-radius:4px}
.empty{color:var(--muted)}.live{display:inline-block;width:8px;height:8px;border-radius:50%;background:#2e9e5b;margin-right:6px}
#tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--bg);padding:6px 9px;border-radius:8px;font-size:13px;display:none;max-width:260px;z-index:9}
.note{color:var(--ink2);font-size:13px}details summary{cursor:pointer;color:var(--ink2)}
</style></head><body><main>
<h1>Squish Man visitors</h1>
<p class="sub">squishman.com · ${esc(prettyDay(r.range.from))} to ${esc(prettyDay(r.range.to))} (Eastern time) · <span class="live"></span>${num(r.liveNow)} on the site in the last 30 minutes</p>
<nav class="ranges">${ranges.map(([d, l]) => `<a href="/stats?k=${k}&d=${d}"${d === r.range.days ? ' class="on"' : ""}>${l}</a>`).join("")}<a href="/stats?k=${k}&d=${r.range.days}">Refresh</a></nav>
<section class="tiles">
<div class="tile"><b>${num(T.visitors)}</b><span>Visitors (people)</span></div>
<div class="tile"><b>${num(T.views)}</b><span>Page views</span></div>
<div class="tile"><b>${num(T.visits)}</b><span>Visits</span></div>
<div class="tile"><b>${duration(T.avgSecondsPerVisitor)}</b><span>Average time per visitor</span></div>
<div class="tile"><b>${num(T.buyClicks)}</b><span>Buy button clicks (${num(T.buyVisitors)} people)</span></div>
<div class="tile"><b>${T.visitors ? ((100 * T.buyVisitors) / T.visitors).toFixed(1) : "0"}%</b><span>Visitors who clicked Buy</span></div>
<div class="tile"><b>${num(T.signups)}</b><span>Squad sign-ups</span></div>
<div class="tile"><b>${T.returningVisitsPct}%</b><span>Visits from returning people</span></div>
<div class="tile"><b>${T.onePageVisitorsPct}%</b><span>Looked at one page only</span></div>
</section>
<div class="grid">
<section class="card wide"><h2>Visitors per day</h2>${dailyChart}
<details><summary>Show as a table</summary><table><thead><tr><th>Day</th><th class="r">Visitors</th><th class="r">Page views</th><th class="r">Buy clicks</th></tr></thead><tbody>${fillDays(r)
		.slice()
		.reverse()
		.map((d) => `<tr><td>${esc(prettyDay(d.day))}</td><td class="r">${num(d.visitors)}</td><td class="r">${num(d.views)}</td><td class="r">${num(d.buys)}</td></tr>`)
		.join("")}</tbody></table></details></section>
<section class="card wide"><h2>Where visitors came from</h2>${
		sourceRows
			? `<table><thead><tr><th>Source</th><th class="r">Visitors</th><th class="r">Visits</th><th class="r">Buy clicks</th></tr></thead><tbody>${sourceRows}</tbody></table>`
			: `<p class="empty">Nothing yet.</p>`
	}
<p class="note">Instagram, TikTok and Facebook apps often hide the link a visitor tapped. Visits opened inside those apps are still counted under the app's name. Links tagged with utm_source (for example squishman.com/?utm_source=instagram&amp;utm_campaign=book1) show up below, post by post.</p></section>
<section class="card wide"><h2>Posts and campaigns (tagged links)</h2>${
		campaignRows
			? `<table><thead><tr><th>Source</th><th>Campaign / post</th><th class="r">Visitors</th><th class="r">Buy clicks</th></tr></thead><tbody>${campaignRows}</tbody></table>`
			: `<p class="empty">No tagged links visited yet.</p>`
	}</section>
<section class="card"><h2>What they clicked to buy</h2>${ranked(r.buys, { col: "Item", showN: "Clicks" })}</section>
<section class="card"><h2>Other actions</h2>${ranked(r.actions.map((a) => ({ ...a, name: a.name.replace(/^(\w+):/, (_, x) => `${KIND[x] ?? x}:`) })), { col: "Action", showN: "Times" })}</section>
<section class="card"><h2>Top pages</h2>${ranked(r.pages, { col: "Page", showN: "Views" })}</section>
<section class="card"><h2>First page seen</h2>${ranked(r.landing, { col: "Page", showN: "Visits" })}</section>
<section class="card"><h2>Referring websites</h2>${ranked(r.referrers, { col: "Website", showN: "Visits" })}</section>
<section class="card"><h2>Browsers</h2>${ranked(r.browsers, { col: "Browser", total: T.visitors })}</section>
<section class="card"><h2>Devices</h2>${ranked(r.devices, { col: "Device", total: T.visitors })}</section>
<section class="card"><h2>Operating systems</h2>${ranked(r.os, { col: "System", total: T.visitors })}</section>
<section class="card"><h2>Countries</h2>${ranked(r.countries, { col: "Country", total: T.visitors })}</section>
<section class="card"><h2>States and regions</h2>${ranked(r.regions, { col: "Region", total: T.visitors })}</section>
<section class="card"><h2>Cities (approximate)</h2>${ranked(r.cities, { col: "City", total: T.visitors })}</section>
<section class="card"><h2>Browser language</h2>${ranked(r.languages, { col: "Language", total: T.visitors })}</section>
<section class="card wide"><h2>Busiest hours (Eastern time)</h2>${hourChart}
<p class="note">Busiest day: ${esc([...r.weekdays].sort((a, b) => b.views - a.views)[0]?.views ? [...r.weekdays].sort((a, b) => b.views - a.views)[0].name : "not enough visits yet")}. ${r.weekdays.map((w) => `${w.name} ${num(w.views)}`).join(" · ")}</p></section>
<section class="card wide"><h2>Latest activity</h2>${
		recentRows
			? `<table><thead><tr><th>When (ET)</th><th>What</th><th>From</th><th>Where / device</th></tr></thead><tbody>${recentRows}</tbody></table>`
			: `<p class="empty">No visits yet.</p>`
	}</section>
</div>
<p class="note">Counted by the site itself: no cookies, no ads, and no IP addresses are kept. Locations are approximate (from the visitor's internet provider). Visits from bots and from this browser are left out: opening this page marks your browser so your own visits aren't counted.</p>
</main><div id="tip"></div>
<script>
try{localStorage.setItem('sm_owner','1')}catch(e){}
(function(){var t=document.getElementById('tip');function show(e){var g=e.target.closest&&e.target.closest('[data-tip]');if(!g){t.style.display='none';return}t.textContent=g.getAttribute('data-tip');t.style.display='block';var x=Math.min(e.clientX+12,innerWidth-t.offsetWidth-8),y=e.clientY-t.offsetHeight-10;t.style.left=x+'px';t.style.top=(y<4?e.clientY+16:y)+'px'}
document.addEventListener('pointermove',show);document.addEventListener('pointerdown',show);document.addEventListener('scroll',function(){t.style.display='none'},{passive:true})})();
</script></body></html>`;
}

const KIND: Record<string, string> = {
	view: "Viewed",
	buy: "Clicked Buy",
	signup: "Squad sign-up",
	contact: "Contact form",
	social: "Social link",
	email: "Email link",
	out: "Left for",
	peek: "Look inside",
};

/** Every day in the range, with zero for days nobody visited. */
function fillDays(r: StatsReport): { day: string; visitors: number; views: number; buys: number }[] {
	const out = [];
	const [y, m, d] = r.range.from.split("-").map(Number);
	const start = Date.UTC(y, m - 1, d);
	for (let i = 0; i < r.range.days; i++) {
		const day = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
		if (day > r.range.to) break;
		out.push(r.daily.find((x) => x.day === day) ?? { day, visitors: 0, views: 0, buys: 0 });
	}
	return out;
}
