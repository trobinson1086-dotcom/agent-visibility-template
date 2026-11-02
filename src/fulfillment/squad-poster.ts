// Squish Squad birthday poster art: an 8×10 in landscape enhanced matte poster
// (Printful product 1, variant 4463, print area 3000×2400 at 300 DPI) with
// "Happy Birthday, <name>!" next to Squish Man & Pudy in Maple Hollow.
//
// The SVG is pure (posterSvg); renderPosterPng rasterizes it with resvg-wasm,
// using the embedded Fredoka Bold font and sticker art served from public/assets.
import { FREDOKA_BOLD_TTF_BASE64 } from "./poster-font";

export const POSTER_VARIANT_ID = 4463;
export const POSTER_SIZE_LABEL = "8×10 in";
export const POSTER_WIDTH = 3000;
export const POSTER_HEIGHT = 2400;
export const POSTER_ART_PATH = "/assets/merch/print/stickers/maple-hollow-pals.png";

const xml = (s: string) =>
	s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!);

/** Font size that keeps the name (and its "!") inside the 1300px text column. */
export function nameFontSize(name: string): number {
	// Fredoka Bold letters average ~0.62em wide (wide letters up to ~0.85em,
	// so very long names are also squeezed to the column with textLength).
	const fit = Math.floor(1300 / ((name.length + 1) * 0.7));
	return Math.max(140, Math.min(380, fit));
}

/** Deterministic confetti so every poster looks the same. */
function confetti(): string {
	const colors = ["#ffd632", "#ef4338", "#0758bd", "#6cc44f", "#ff8fc7"];
	let seed = 7;
	const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
	const out: string[] = [];
	for (let i = 0; i < 90; i++) {
		const x = Math.round(rnd() * POSTER_WIDTH);
		const y = Math.round(rnd() * POSTER_HEIGHT);
		// Keep the name and art clear.
		if (y > 260 && y < 2150 && x > 120 && x < 2900) continue;
		const c = colors[i % colors.length];
		const r = Math.round(14 + rnd() * 18);
		out.push(
			i % 2
				? `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`
				: `<rect x="${x}" y="${y}" width="${r * 2}" height="${r}" rx="6" fill="${c}" transform="rotate(${Math.round(rnd() * 180)} ${x} ${y})"/>`,
		);
	}
	return out.join("");
}

/** The poster as SVG. `artHref` is a data: URI (or URL) of the Squish Man & Pudy art. */
export function posterSvg(childName: string, artHref: string): string {
	const name = xml(childName);
	const size = nameFontSize(childName);
	const squeeze = size === 140 || /[WMwm]{4,}/.test(childName);
	const font = `font-family="Fredoka" font-weight="700"`;
	return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" viewBox="0 0 ${POSTER_WIDTH} ${POSTER_HEIGHT}">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfeaff"/><stop offset="0.62" stop-color="#eef8ff"/><stop offset="1" stop-color="#fff3bf"/></linearGradient>
</defs>
<rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="url(#sky)"/>
<rect x="60" y="60" width="${POSTER_WIDTH - 120}" height="${POSTER_HEIGHT - 120}" rx="90" fill="none" stroke="#ffd632" stroke-width="36"/>
${confetti()}
<image x="170" y="560" width="1350" height="1234" preserveAspectRatio="xMidYMid meet" xlink:href="${artHref}" href="${artHref}"/>
<g text-anchor="middle" ${font}>
<text x="2230" y="760" font-size="200" fill="#0758bd">Happy</text>
<text x="2230" y="990" font-size="200" fill="#0758bd">Birthday,</text>
<text x="2230" y="${1230 + Math.round(size * 0.35)}" font-size="${size}"${squeeze ? ` textLength="1300" lengthAdjust="spacingAndGlyphs"` : ""} fill="#ef4338" stroke="#ffffff" stroke-width="22" paint-order="stroke" stroke-linejoin="round">${name}!</text>
<text x="2230" y="1720" font-size="96" fill="#07347d">Love, Squish Man &amp; Pudy</text>
</g>
<g text-anchor="middle" ${font}>
<text x="${POSTER_WIDTH / 2}" y="2060" font-size="80" fill="#07347d" letter-spacing="6">OFFICIAL SQUISH SQUAD MEMBER</text>
<text x="${POSTER_WIDTH / 2}" y="2170" font-size="62" fill="#0758bd" letter-spacing="3">BIG HEART. TINY HERO. ENDLESS ADVENTURES!™</text>
</g>
</svg>`;
}

function base64(bytes: Uint8Array): string {
	let s = "";
	for (let i = 0; i < bytes.length; i += 0x8000) {
		s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(s);
}

let wasmReady: Promise<typeof import("@resvg/resvg-wasm")> | null = null;

async function resvg() {
	if (!wasmReady) {
		wasmReady = (async () => {
			const mod = await import("@resvg/resvg-wasm");
			const wasm = (await import("@resvg/resvg-wasm/index_bg.wasm")).default;
			await mod.initWasm(wasm);
			return mod;
		})();
		wasmReady.catch(() => (wasmReady = null));
	}
	return wasmReady;
}

async function asset(assets: Fetcher, path: string): Promise<Uint8Array> {
	const res = await assets.fetch(new Request(`https://assets.local${path}`));
	if (!res.ok) throw new Error(`Poster asset ${path} unavailable (HTTP ${res.status})`);
	return new Uint8Array(await res.arrayBuffer());
}

async function render(
	assets: Fetcher,
	build: (artHref: string) => string,
	background?: string,
): Promise<Uint8Array> {
	const [mod, art] = await Promise.all([resvg(), asset(assets, POSTER_ART_PATH)]);
	const font = Uint8Array.from(atob(FREDOKA_BOLD_TTF_BASE64), (c) => c.charCodeAt(0));
	const r = new mod.Resvg(build(`data:image/png;base64,${base64(art)}`), {
		font: { fontBuffers: [font], defaultFontFamily: "Fredoka", loadSystemFonts: false },
		fitTo: { mode: "original" },
		...(background ? { background } : {}),
	});
	const png = r.render().asPng();
	r.free();
	return png;
}

/** Rasterize the poster for `childName` to a 3000×2400 PNG. */
export function renderPosterPng(assets: Fetcher, childName: string): Promise<Uint8Array> {
	return render(assets, (href) => posterSvg(childName, href), "#ffffff");
}

// --- Platinum Crown birthday tee ------------------------------------------------
// Front of a white kids' tee (Printful 3001Y, front print area 1500×1800 at
// 150 DPI): Squish Man & Pudy above the child's name, on a transparent background.

export const TEE_WIDTH = 1500;
export const TEE_HEIGHT = 1800;

export function teeSvg(childName: string, artHref: string): string {
	const name = xml(childName);
	// Same fit as the poster name, scaled to the tee's 1400px width.
	const size = Math.max(110, Math.min(300, Math.floor(1400 / ((childName.length + 1) * 0.7))));
	const squeeze = size === 110 || /[WMwm]{4,}/.test(childName);
	const font = `font-family="Fredoka" font-weight="700"`;
	return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${TEE_WIDTH}" height="${TEE_HEIGHT}" viewBox="0 0 ${TEE_WIDTH} ${TEE_HEIGHT}">
<image x="110" y="0" width="1280" height="1170" preserveAspectRatio="xMidYMid meet" xlink:href="${artHref}" href="${artHref}"/>
<g text-anchor="middle" ${font}>
<text x="750" y="${1410 + Math.round(size * 0.35)}" font-size="${size}"${squeeze ? ` textLength="1400" lengthAdjust="spacingAndGlyphs"` : ""} fill="#ef4338" stroke="#07347d" stroke-width="18" paint-order="stroke" stroke-linejoin="round">${name}</text>
<text x="750" y="1760" font-size="110" fill="#0758bd" letter-spacing="8">SQUISH SQUAD</text>
</g>
</svg>`;
}

/** Rasterize the tee front for `childName` to a transparent 1500×1800 PNG. */
export function renderTeePng(assets: Fetcher, childName: string): Promise<Uint8Array> {
	return render(assets, (href) => teeSvg(childName, href));
}
