/**
 * Server-side title, description, share image and schema.org data for each
 * book page (/product?book=book-1).
 *
 * The book page draws itself in the browser from public/books.js, so search
 * engines, link previews (iMessage, Facebook, Instagram DMs) and AI agents
 * used to see one generic "Squish Man Book Details" page for every book. The
 * worker now reads the same public/books.js (one source of truth for titles,
 * covers, prices and checkout links) and writes the right tags into the page
 * before it is sent.
 */

export type SiteBook = {
	id: string;
	shelf: "english" | "bonus" | "learning" | "spanish" | "color";
	key: string;
	label: string;
	name?: string;
	cover: string;
	price: string;
	paperback?: string;
	hardcover?: string;
	ebook?: string;
	checkout?: string;
};

export const SITE = "https://squishman.com";

/** Read the book list out of public/books.js (`window.SQUISH_BOOKS=[...]`). */
export function parseBooksJs(js: string): SiteBook[] {
	const start = js.indexOf("=[");
	const end = js.lastIndexOf("]");
	if (start < 0 || end < start) return [];
	try {
		const list = JSON.parse(js.slice(start + 1, end + 1));
		return Array.isArray(list) ? (list as SiteBook[]) : [];
	} catch {
		return [];
	}
}

const STORY: Record<string, string> = {
	"1": "Squish Man follows the clues to find a lost puppy before the big Maple Hollow parade. A story about kindness, courage and helping your community.",
	"2": "Squish Man dreams of doing something big and learns that being small doesn't limit how far courage, persistence and believing in yourself can take you.",
	"3": "Squish Man discovers a magical garden and learns that wonderful things can't be rushed. A story about patience and caring for living things.",
	"4": "A giant snowfall turns Squish Man's perfect snow day into a challenge, and Maple Hollow learns what creativity and teamwork can do.",
	"5": "Squish Man and Pudy race in the Great Maple Hollow Derby, where friendship, teamwork and being yourself matter more than winning.",
};

const STORY_ES: Record<string, string> = {
	"1": "Squish Man sigue las pistas para encontrar a un cachorro perdido antes del gran desfile de Maple Hollow. Una historia de bondad, valentía y ayudar a la comunidad.",
	"2": "Squish Man sueña con hacer algo grande y descubre que ser pequeño no limita lo lejos que pueden llevarlo la valentía y la confianza en sí mismo.",
	"3": "Squish Man descubre un jardín mágico y aprende que las cosas maravillosas no se pueden apresurar. Una historia de paciencia y cuidado.",
	"4": "Una gran nevada convierte el día de nieve de Squish Man en un desafío, y Maple Hollow descubre lo que logran la creatividad y el trabajo en equipo.",
	"5": "Squish Man y Pudy corren en el Gran Derby de Maple Hollow, donde la amistad, el trabajo en equipo y ser uno mismo importan más que ganar.",
};

type Format = { label: string; price: string; url: string; bookFormat?: string };

/** The formats and prices a book page offers (same rules as public/product.html). */
export function bookFormats(b: SiteBook): Format[] {
	const all: Format[] =
		b.shelf === "color"
			? [{ label: "Coloring Book", price: "12.99", url: b.checkout ?? "", bookFormat: "Paperback" }]
			: b.id.startsWith("bonus-") || b.id.startsWith("edicion-")
				? [{ label: "Bonus Activities & Learning Edition", price: "29.99", url: b.checkout ?? "", bookFormat: "Paperback" }]
				: b.shelf === "learning" || b.id.startsWith("aprendizaje-")
					? [{ label: "Learning & Activity Book", price: "16.99", url: b.checkout ?? "", bookFormat: "Paperback" }]
					: [
							{ label: "Paperback", price: "14.99", url: b.paperback ?? "", bookFormat: "Paperback" },
							{ label: "Hardcover", price: "21.00", url: b.hardcover ?? "", bookFormat: "Hardcover" },
							{ label: "eBook", price: "4.99", url: b.ebook ?? "", bookFormat: "EBook" },
						];
	return all.filter((f) => f.url);
}

export type BookMeta = {
	title: string;
	description: string;
	url: string;
	image: string;
	imageAlt: string;
	lang: "en" | "es";
	jsonLd: string;
};

const num = (b: SiteBook) => (b.id.match(/-(\d+)$/) ?? [])[1] ?? "";

export function bookMeta(b: SiteBook): BookMeta {
	const es = b.shelf === "spanish";
	const n = num(b);
	const display = b.name ? `${b.label}: ${b.name}` : b.label;
	const kind = b.id.startsWith("bonus-")
		? "Bonus Activities & Learning Edition"
		: b.id.startsWith("edicion-")
			? "Edición especial con actividades"
			: b.shelf === "learning"
				? "Learning & Activity Book"
				: b.id.startsWith("aprendizaje-")
					? "Libro de aprendizaje y actividades"
					: b.shelf === "color"
						? "Coloring Book"
						: es
							? "Cuento ilustrado"
							: "Picture book";
	const story = (es ? STORY_ES : STORY)[n] ?? "";
	let description: string;
	if (b.shelf === "color") {
		description = `Squish Man ${display}: coloring pages with Squish Man, Pudy and friends from Maple Hollow, for kids ages 5–9.`;
	} else if (b.shelf === "learning") {
		description = `${display}: puzzles, mazes, letters, numbers and creative activities with Squish Man and friends, for K–4 readers ages 5–9.`;
	} else if (b.id.startsWith("aprendizaje-")) {
		description = `${display}: actividades de aprendizaje, laberintos, letras y números con Squish Man y sus amigos, para niños de 5 a 9 años.`;
	} else if (b.shelf === "bonus") {
		description = `${display}, the bonus edition with extra story activities and learning pages. ${story}`;
	} else {
		description = `${display}. ${story}`.trim();
	}
	description = description.replace(/\s+/g, " ").trim();
	const url = `${SITE}/product?book=${encodeURIComponent(b.id)}`;
	// Share previews and search results use the book's own cover.
	const image = `${SITE}/assets/covers/${encodeURI(b.cover)}`;
	const formats = bookFormats(b);
	const ld: Record<string, unknown> = {
		"@context": "https://schema.org",
		"@type": ["Product", "Book"],
		"@id": `${url}#book`,
		name: b.name ? `${b.name}${b.shelf === "english" || b.shelf === "spanish" ? "" : ` (${b.label})`}` : `Squish Man ${b.label}`,
		alternateName: display,
		description,
		image,
		url,
		inLanguage: es || b.id.startsWith("edicion-") || b.id.startsWith("aprendizaje-") ? "es" : "en",
		genre: kind,
		brand: { "@type": "Brand", name: "The Amazing Adventures of Squish Man" },
		publisher: { "@id": `${SITE}/#org`, "@type": "Organization", name: "The Amazing Adventures of Squish Man", url: `${SITE}/` },
		audience: { "@type": "PeopleAudience", suggestedMinAge: 5, suggestedMaxAge: 9 },
		// The story covers print "Written by Travis Robinson".
		...(b.shelf === "english" || b.shelf === "spanish" ? { author: { "@type": "Person", name: "Travis Robinson" } } : {}),
		isPartOf: { "@type": "BookSeries", name: "The Amazing Adventures of Squish Man" },
		...(n && (b.shelf === "english" || b.shelf === "spanish") ? { position: Number(n) } : {}),
		offers: formats.map((f) => ({
			"@type": "Offer",
			name: f.label,
			price: f.price,
			priceCurrency: "USD",
			availability: "https://schema.org/InStock",
			url,
		})),
	};
	const isEs = es || b.id.startsWith("edicion-") || b.id.startsWith("aprendizaje-");
	return {
		title: `${display} | Squish Man™`,
		description,
		url,
		image,
		imageAlt: `${display} ${isEs ? "portada" : "cover"}`,
		lang: isEs ? "es" : "en",
		// `<` is escaped so no title can ever close the script tag.
		jsonLd: JSON.stringify(ld).replace(/</g, "\\u003c"),
	};
}

/** Rewrite the static book page's head for one book. */
export function rewriteBookPage(page: Response, m: BookMeta): Response {
	const setContent = (value: string) => ({
		element(el: Element) {
			el.setAttribute("content", value);
		},
	});
	const out = new HTMLRewriter()
		.on("html", {
			element(el) {
				el.setAttribute("lang", m.lang);
			},
		})
		.on("title", {
			element(el) {
				el.setInnerContent(m.title);
			},
		})
		.on("meta[name=description]", setContent(m.description))
		.on("meta[property='og:title']", setContent(m.title))
		.on("meta[property='og:description']", setContent(m.description))
		.on("meta[property='og:url']", setContent(m.url))
		.on("meta[property='og:type']", setContent("product"))
		.on("meta[property='og:image']", setContent(m.image))
		.on("meta[property='og:image:alt']", setContent(m.imageAlt))
		.on("meta[property='og:image:width']", { element: (el) => { el.remove(); } })
		.on("meta[property='og:image:height']", { element: (el) => { el.remove(); } })
		.on("meta[name='twitter:image']", setContent(m.image))
		.on("head", {
			element(el) {
				el.append(
					`<link rel="canonical" href="${m.url}"><script type="application/ld+json">${m.jsonLd}</script>`,
					{ html: true },
				);
			},
		})
		.transform(page);
	const res = new Response(out.body, page);
	res.headers.delete("content-length");
	res.headers.set("Cache-Control", "public, max-age=300");
	return res;
}
