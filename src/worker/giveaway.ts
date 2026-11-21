/**
 * The Signed Squish Man Book Giveaway (holiday 2026). Prize changed 2026-11-21 on Travis's word: one signed story book plus one coloring book, not the 5-book set.
 *
 * Built and kept OFF. Nothing here is public until Travis says go:
 *   - `open` must be switched to true, and
 *   - `sponsorAddress` must hold the sponsor's mailing address for the official rules.
 * Until both are set, /giveaway and /giveaway-rules answer 404 and entries are refused.
 * Once on, entries are taken only between startsAt and endsAt (Eastern).
 *
 * Entering is free and happens only on squishman.com. Every entrant joins the free
 * Squish Squad fan list (the form says so), so the holiday emails can reach them.
 * Only adults enter; nothing about a child is asked.
 */
import type { Env } from "../lib/types";
import { DEFAULT_FROM, baseUrl, esc, layout, sendOnce } from "../fulfillment/email";
import { SQUAD_INBOX, ensureFan, line, looksLikeEmail, sha256, underLimit, type FormResult } from "./forms";

export const GIVEAWAY = {
	id: "2026-holiday",
	/** Travis's go. Leave false until he says to open it. */
	open: false as boolean,
	/** Required on the official rules before it can open: the sponsor's mailing address. */
	sponsorAddress: "" as string,
	startsAt: "2026-11-27T00:00:00-05:00",
	endsAt: "2026-12-13T23:59:59-05:00",
	startsLabel: "Friday, November 27, 2026 at 12:00 AM Eastern",
	endsLabel: "Sunday, December 13, 2026 at 11:59 PM Eastern",
	drawLabel: "Monday, December 14, 2026",
	replyLabel: "72 hours",
	prize: "a signed paperback of Squish Man and the Missing Puppy Parade (Book 1) plus Squish Man Coloring Book 1",
	prizeValue: "$27.98",
	runnerUps: 2,
	runnerUpPrize: "a signed Squish Man sticker sheet",
	runnerUpValue: "$5",
} as const;

export const US_STATES = [
	"Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
	"District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas",
	"Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
	"Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York",
	"North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
	"South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
	"West Virginia", "Wisconsin", "Wyoming",
] as const;

export interface GiveawayCfg {
	open: boolean;
	sponsorAddress: string;
	startsAt: string;
	endsAt: string;
}

/** The pages exist only once Travis has switched it on and the rules carry the sponsor address. */
export function giveawayVisible(cfg: Pick<GiveawayCfg, "open" | "sponsorAddress"> = GIVEAWAY): boolean {
	return cfg.open === true && cfg.sponsorAddress.trim().length > 0;
}

export type Phase = "off" | "soon" | "open" | "closed";

export function giveawayPhase(now = Date.now(), cfg: GiveawayCfg = GIVEAWAY): Phase {
	if (!giveawayVisible(cfg)) return "off";
	if (now < Date.parse(cfg.startsAt)) return "soon";
	if (now > Date.parse(cfg.endsAt)) return "closed";
	return "open";
}

export interface Entry {
	name: string;
	email: string;
	state: string;
	enteredAt: string;
}

const ENTRY_PREFIX = `giveaway:${GIVEAWAY.id}:entry:`;
const DRAW_KEY = `giveaway:${GIVEAWAY.id}:draws`;

const fail = (status: number, error: string): FormResult => ({ status, body: { ok: false, error } });

export async function handleGiveawayEntry(
	env: Env,
	input: Record<string, unknown>,
	ip: string,
	now = Date.now(),
	cfg: GiveawayCfg = GIVEAWAY,
): Promise<FormResult> {
	const phase = giveawayPhase(now, cfg);
	if (phase === "off") return fail(404, "NOT_FOUND");
	if (phase === "soon") return fail(409, "NOT_OPEN_YET");
	if (phase === "closed") return fail(409, "CLOSED");

	// Hidden field people never see; bots fill it in. Pretend it worked.
	if (line(input.website, 200)) return { status: 200, body: { ok: true } };

	const name = line(input.name, 120);
	const email = line(input.email, 254);
	const state = line(input.state, 40);
	const adult = ["on", "true", "1", "yes"].includes(line(input.adult, 10).toLowerCase());
	if (!name || !looksLikeEmail(email)) return fail(400, "MISSING_FIELDS");
	if (!(US_STATES as readonly string[]).includes(state)) return fail(400, "US_ONLY");
	if (!adult) return fail(400, "ADULTS_ONLY");
	if (!(await underLimit(env, ip))) return fail(429, "TOO_MANY");

	const key = ENTRY_PREFIX + email.toLowerCase();
	const already = await env.VISIBILITY_CACHE.get(key);
	if (!already) {
		const entry: Entry = { name, email, state, enteredAt: new Date(now).toISOString() };
		await env.VISIBILITY_CACHE.put(key, JSON.stringify(entry));
	}
	// Every entrant joins the free fan list; the form says so plainly.
	await ensureFan(env, name, email);
	if (!already) await confirmEntry(env, name, email);
	return { status: 200, body: { ok: true } };
}

async function confirmEntry(env: Env, name: string, email: string): Promise<void> {
	const site = baseUrl(env);
	const rules = `${site}/giveaway-rules`;
	const coloring = `${site}/assets/free/squish-man-coloring-page.pdf`;
	const collection = `${site}/story-collection.html`;
	const first = name.split(/\s+/)[0] || "friend";
	const subject = "You're entered! 🎁 Squish Man Giveaway";
	const text = [
		`Hi ${first},`,
		`You're entered to win ${GIVEAWAY.prize}. We'll pick the winner at random on ${GIVEAWAY.drawLabel} and email them from contact@squishman.com.`,
		`While you wait, here's a free Squish Man coloring page to print: ${coloring}`,
		`You're also on the Squish Squad list now, for Squish Man news and family activities. Reply STOP anytime to stop those emails.`,
		`Official rules: ${rules}`,
		`Want the books now? All 5 story books ship free: ${collection}`,
		"Big heart, tiny hero!\nThe Squish Man team",
	].join("\n\n");
	const html = layout(
		env,
		subject,
		`<h2 style="margin:0 0 12px">You're entered, ${esc(first)}! 🎁</h2>` +
			`<p style="margin:0 0 12px">You're in the drawing for ${esc(GIVEAWAY.prize)}. We'll pick the winner at random on ${esc(GIVEAWAY.drawLabel)} and email them from contact@squishman.com.</p>` +
			`<p style="margin:0 0 16px;padding:14px 16px;background:#fff7dc;border-radius:12px"><b>🖍️ While you wait:</b> <a href="${esc(coloring)}">print the free Squish Man coloring page</a>.</p>` +
			`<p style="margin:0 0 12px">You're also on the Squish Squad list now, for Squish Man news and family activities. Reply STOP anytime to stop those emails.</p>` +
			`<p style="margin:0 0 12px"><a href="${esc(rules)}">Official rules</a> · <a href="${esc(collection)}">All 5 story books, shipped free</a></p>` +
			`<p style="margin:0">Big heart, tiny hero!<br>The Squish Man team</p>`,
	);
	try {
		await sendOnce(env, `giveaway-entered:${GIVEAWAY.id}:${await sha256(email.toLowerCase())}`, {
			to: email,
			from: DEFAULT_FROM,
			replyTo: SQUAD_INBOX,
			subject,
			text,
			html,
		});
	} catch (err) {
		console.log(JSON.stringify({ at: "giveaway", event: "confirm_failed", error: String(err) }));
	}
}

/** Every entry, oldest first (admin only). */
export async function listEntries(env: Env): Promise<Entry[]> {
	const out: Entry[] = [];
	let cursor: string | undefined;
	do {
		const page = await env.VISIBILITY_CACHE.list({ prefix: ENTRY_PREFIX, cursor });
		for (const k of page.keys) {
			const e = await env.VISIBILITY_CACHE.get<Entry>(k.name, "json");
			if (e) out.push(e);
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
	return out.sort((a, b) => a.enteredAt.localeCompare(b.enteredAt));
}

export interface Draw {
	email: string;
	name: string;
	state: string;
	drawnAt: string;
	from: number;
}

/**
 * A fair random draw from every valid entry, skipping anyone already drawn
 * (so a re-draw after a winner doesn't reply picks someone new). Saved as a record.
 * Only after entries close.
 */
export async function drawWinner(env: Env, now = Date.now()): Promise<{ status: number; body: unknown }> {
	if (now <= Date.parse(GIVEAWAY.endsAt)) return { status: 409, body: { ok: false, error: "ENTRIES_STILL_OPEN" } };
	const draws = (await env.VISIBILITY_CACHE.get<Draw[]>(DRAW_KEY, "json")) ?? [];
	const taken = new Set(draws.map((d) => d.email.toLowerCase()));
	const pool = (await listEntries(env)).filter((e) => !taken.has(e.email.toLowerCase()));
	if (!pool.length) return { status: 409, body: { ok: false, error: "NO_ENTRIES_LEFT" } };
	const pick = pool[uniformIndex(pool.length)];
	const draw: Draw = { email: pick.email, name: pick.name, state: pick.state, drawnAt: new Date(now).toISOString(), from: pool.length };
	draws.push(draw);
	await env.VISIBILITY_CACHE.put(DRAW_KEY, JSON.stringify(draws));
	return { status: 200, body: { ok: true, draw, allDraws: draws } };
}

/** An unbiased random index below n, from the platform's secure random source. */
function uniformIndex(n: number): number {
	const max = Math.floor(0x100000000 / n) * n;
	const buf = new Uint32Array(1);
	for (;;) {
		crypto.getRandomValues(buf);
		if (buf[0] < max) return buf[0] % n;
	}
}

const HEAD = (title: string, desc: string, path: string) =>
	`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="https://squishman.com${path}"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap"><link rel="stylesheet" href="/style.css"><link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#07347d"><meta property="og:type" content="website"><meta property="og:site_name" content="Squish Man"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="https://squishman.com${path}"><meta property="og:image" content="https://squishman.com/assets/og-image.jpg">
<style>
.gw{background:#fffaf0;min-height:70vh}.gw-wrap{max-width:980px;margin:auto;padding:40px 5% 60px}
.gw-top{display:flex;justify-content:space-between;align-items:center;padding:14px 4%;background:var(--blue)}.gw-top a{color:var(--gold);font-weight:900;text-decoration:none;font-size:20px}.gw-top a.small{color:#fff;font-size:13px}
.gw-hero{display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:center}
.gw h1{font:700 clamp(32px,4.4vw,50px)/1.05 'Fredoka',Arial,sans-serif;color:var(--deep);margin:10px 0 14px}
.gw .lede{font-size:18px;line-height:1.6}
.gw-art img{width:100%;height:auto;border-radius:22px;box-shadow:0 14px 34px #0003}.gw-pair{display:flex;gap:14px;align-items:flex-end}.gw-pair img{width:calc(50% - 7px);border-radius:14px}
.gw-card{background:#fff;border-radius:22px;padding:26px;box-shadow:0 10px 30px #0001;margin-top:28px}
.gw-form{display:grid;gap:12px}.gw-form label{display:grid;gap:6px;font-weight:800}.gw-form input,.gw-form select{border:1px solid #cddbf2;border-radius:10px;padding:13px;font:inherit}
.gw-form .check{display:flex;gap:10px;align-items:flex-start;font-weight:700}.gw-form .check input{margin-top:4px;width:20px;height:20px}
.gw-fine{font-size:13px;line-height:1.5;color:#4b5a7c}.gw-hp{position:absolute;left:-9999px}
.gw-dates{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0}.gw-dates div{background:#edf7ff;border-radius:14px;padding:14px;text-align:center}.gw-dates b{display:block;color:var(--deep)}
.gw-rules h2{text-align:left;font-size:22px;margin:26px 0 8px}.gw-rules p,.gw-rules li{line-height:1.6}
.gw-status{font-weight:800}
@media(max-width:800px){.gw-hero{grid-template-columns:1fr}.gw-dates{grid-template-columns:1fr}}
</style></head><body>
<div class="gw-top"><a href="/">👑 Squish Man™</a><a class="small" href="/#books">Shop the books</a></div>`;

const FOOT = `<footer style="display:block;text-align:center"><p><small>This giveaway is in no way sponsored, endorsed, administered by or associated with Instagram, Facebook, TikTok, YouTube or Pinterest.</small></p><p><small>SquishMan.com · © 2026 Travis Robinson. All rights reserved. · <a style="color:#fff" href="/privacy.html">Privacy</a></small></p></footer><script src="/mh.js" defer></script></body></html>`;

export function giveawayPage(now = Date.now(), cfg: GiveawayCfg = GIVEAWAY): string {
	const phase = giveawayPhase(now, cfg);
	const states = US_STATES.map((s) => `<option>${esc(s)}</option>`).join("");
	const form =
		phase === "open"
			? `<form class="gw-form" id="gwForm" novalidate>
<label>Parent or guardian name<input name="name" type="text" required autocomplete="name" placeholder="Your name"></label>
<label>Parent or guardian email<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label>
<label>State<select name="state" required><option value="" selected disabled>Choose your state</option>${states}</select></label>
<label class="check"><input type="checkbox" name="adult" value="on" required> I'm 18 or older and live in the US.</label>
<div class="gw-hp" aria-hidden="true"><label>Leave this empty<input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>
<button class="btn" type="submit">ENTER THE GIVEAWAY, IT'S FREE</button>
<p class="gw-fine">Entering adds you to Squish Squad emails (Squish Man news and family activities). Unsubscribe anytime. One entry per person. No purchase necessary; buying doesn't improve your chances. We never ask for anything about your child. <a href="/giveaway-rules">Official rules</a>.</p>
<p class="gw-status" role="status" aria-live="polite"></p>
</form>
<script>(function(){var f=document.getElementById('gwForm'),s=f.querySelector('.gw-status');f.addEventListener('submit',function(e){e.preventDefault();if(!f.checkValidity()){s.textContent='Please fill in every box and tick the 18+ box.';return}s.textContent='Entering...';fetch('/api/giveaway/enter',{method:'POST',body:new FormData(f)}).then(function(r){return r.json()}).then(function(d){if(d.ok){f.reset();s.textContent="You're entered! Check your email for your free coloring page."}else{s.textContent=d.error==='US_ONLY'?'Sorry, this giveaway is open to US residents only.':d.error==='ADULTS_ONLY'?'Please ask a parent or guardian to enter.':d.error==='TOO_MANY'?'Too many tries. Please try again in an hour.':'Something went wrong. Please try again.'}}).catch(function(){s.textContent='Something went wrong. Please try again.'})})})();</script>`
			: phase === "soon"
				? `<p class="lede"><b>Entries open ${esc(GIVEAWAY.startsLabel)}.</b> Join the <a href="/#squad-join">Squish Squad</a> to get a reminder and a free coloring page.</p>`
				: `<p class="lede"><b>This giveaway has closed.</b> Thank you to every family who entered! Join the <a href="/#squad-join">Squish Squad</a> for the next one.</p>`;
	return `${HEAD("Win a Signed Squish Man Book + Coloring Book | Free Giveaway", "Enter free to win a signed Squish Man story book and a Squish Man coloring book. US parents and guardians, 18+. No purchase necessary.", "/giveaway")}
<main class="gw"><div class="gw-wrap">
<div class="gw-hero"><div><span class="eyebrow">🎁 FREE HOLIDAY GIVEAWAY</span><h1>Win a signed Squish Man book and coloring book</h1>
<p class="lede">Book 1, <i>Squish Man and the Missing Puppy Parade</i>, signed by the author, plus Squish Man Coloring Book 1, for the little reader in your life. Free to enter, one entry per family email.</p></div>
<div class="gw-art gw-pair"><img src="/assets/covers/400/drive_master/Squish%20Man%20Book%201%20-%20The%20Missing%20Puppy%20Parade.webp" width="400" height="409" alt="Cover of Squish Man and the Missing Puppy Parade, Book 1"><img src="/assets/covers/400/drive_master/Squish%20Man%20Coloring%20Book.webp" width="400" height="549" alt="Cover of Squish Man Coloring Book 1"></div></div>
<div class="gw-dates"><div><b>Opens</b>Fri Nov 27</div><div><b>Closes</b>Sun Dec 13, 11:59 PM ET</div><div><b>Winner picked</b>Mon Dec 14</div></div>
<div class="gw-card">${form}</div>
<p class="gw-fine" style="margin-top:18px">Grand prize: ${esc(GIVEAWAY.prize)} (value ${esc(GIVEAWAY.prizeValue)}). ${GIVEAWAY.runnerUps} runner-ups win ${esc(GIVEAWAY.runnerUpPrize)}. Open to legal US residents 18 or older. Void where prohibited. See the <a href="/giveaway-rules">official rules</a>.</p>
</div></main>${FOOT}`;
}

export function giveawayRulesPage(sponsorAddress: string = GIVEAWAY.sponsorAddress): string {
	const g = GIVEAWAY;
	return `${HEAD("Official Rules | Squish Man Holiday Giveaway", "Official rules for the Signed Squish Man Book Giveaway.", "/giveaway-rules")}
<main class="gw"><div class="gw-wrap gw-rules">
<h1>Official Rules: Signed Squish Man Book Giveaway</h1>
<p><b>NO PURCHASE NECESSARY TO ENTER OR WIN. A PURCHASE WILL NOT INCREASE YOUR CHANCES OF WINNING. VOID WHERE PROHIBITED.</b></p>
<h2>1. Sponsor</h2><p>The Amazing Adventures of Squish Man (Travis Robinson), ${esc(sponsorAddress)} ("Sponsor"). Questions: contact@squishman.com.</p>
<h2>2. Who can enter</h2><p>Open to legal residents of the 50 United States and the District of Columbia who are 18 or older at the time of entry, entering on behalf of their household. Children may not enter. Employees and immediate family of the Sponsor are not eligible.</p>
<h2>3. Entry period</h2><p>The giveaway starts ${esc(g.startsLabel)} and ends ${esc(g.endsLabel)} (the "Entry Period"). The Sponsor's server clock is the official clock.</p>
<h2>4. How to enter</h2><p>Visit squishman.com/giveaway during the Entry Period and complete the entry form with your name, email address and state, and confirm you are 18 or older and live in the US. Limit one entry per person and per email address. Entries made by automated means, with fake or temporary email addresses, or beyond the limit are void. Comments, likes, shares or tags on social media are not entries.</p>
<h2>5. Prizes</h2><p>One (1) Grand Prize: ${esc(g.prize)}. Approximate retail value (ARV): ${esc(g.prizeValue)}. ${g.runnerUps} Runner-Up Prizes: ${esc(g.runnerUpPrize)} each, ARV ${esc(g.runnerUpValue)} each. Total ARV of all prizes: about $38. Prizes ship to US addresses only. No cash or other substitution, except the Sponsor may substitute a prize of equal or greater value if a prize is unavailable. Any taxes are the winner's responsibility.</p>
<h2>6. How winners are picked and told</h2><p>On or about ${esc(g.drawLabel)}, the Sponsor will select the Grand Prize winner and Runner-Up winners in a random drawing from all eligible entries received during the Entry Period. Odds of winning depend on the number of eligible entries received. Winners will be notified by email from contact@squishman.com and must reply with a US mailing address within ${esc(g.replyLabel)}. If a winner does not reply in time, is found ineligible or the prize is returned undeliverable, that prize may be forfeited and an alternate winner selected at random.</p>
<h2>7. Your information</h2><p>Entry information is used to run the giveaway and to send Squish Squad emails, which you can stop anytime by replying STOP or using the unsubscribe link. We never sell your information and never ask for information about your child. See our <a href="/privacy.html">privacy policy</a>.</p>
<h2>8. Publicity</h2><p>The Sponsor will share a winner's first name and state publicly only with the winner's permission.</p>
<h2>9. General conditions</h2><p>By entering, entrants agree to these Official Rules and the Sponsor's decisions, which are final. The Sponsor may cancel, suspend or modify the giveaway if fraud, technical failure or any other factor beyond its control impairs its integrity. The Sponsor is not responsible for lost, late, incomplete or misdirected entries or emails. To the extent permitted by law, by accepting a prize the winner releases the Sponsor from any liability arising from the prize or the giveaway.</p>
<h2>10. Social media</h2><p>This giveaway is in no way sponsored, endorsed, administered by or associated with Instagram, Facebook, TikTok, YouTube or Pinterest. Entrants release those platforms from any liability.</p>
<h2>11. Winners list</h2><p>For the name of the Grand Prize winner (available after December 20, 2026), email contact@squishman.com with the subject "Giveaway Winner" by January 31, 2027.</p>
<p><a class="btn" href="/giveaway">Back to the giveaway</a></p>
</div></main>${FOOT}`;
}
