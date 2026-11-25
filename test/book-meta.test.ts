import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { bookFormats, bookMeta, parseBooksJs, rewriteBookPage, type SiteBook } from "../src/site/book-meta";

const BASE = "https://example.com";
let books: SiteBook[] = [];
let productHtml = "";
const byId = (id: string) => books.find((b) => b.id === id)!;

beforeAll(async () => {
	books = parseBooksJs(await (await env.ASSETS!.fetch(`${BASE}/books.js`)).text());
	productHtml = await (await env.ASSETS!.fetch(`${BASE}/product`)).text();
});

describe("book page meta", () => {
	it("reads every book from public/books.js", () => {
		expect(books.length).toBe(32);
		expect(byId("book-1").name).toBe("Squish Man and the Missing Puppy Parade");
		expect(parseBooksJs("nonsense")).toEqual([]);
	});

	it("offers the same formats and prices as the book page", () => {
		expect(bookFormats(byId("book-1")).map((f) => [f.label, f.price])).toEqual([
			["Paperback", "14.99"],
			["Hardcover", "21.00"],
			["eBook", "4.99"],
		]);
		expect(bookFormats(byId("libro-1")).map((f) => f.label)).toEqual(["Paperback", "Hardcover"]);
		expect(bookFormats(byId("bonus-2"))[0].price).toBe("29.99");
		expect(bookFormats(byId("learning-3"))[0].price).toBe("16.99");
		expect(bookFormats(byId("coloring-2"))[0].price).toBe("12.99");
	});

	it("writes Book 1's own title, share image, canonical link and schema data into the page", async () => {
		const m = bookMeta(byId("book-1"));
		const res = rewriteBookPage(new Response(productHtml, { headers: { "content-type": "text/html" } }), m);
		const html = await res.text();
		expect(html).toContain("<title>Book 1: Squish Man and the Missing Puppy Parade | Squish Man™</title>");
		expect(html).toContain('<link rel="canonical" href="https://squishman.com/product?book=book-1">');
		expect(html).toMatch(/og:image['"] content=['"]https:\/\/squishman\.com\/assets\/covers\/drive_master\/Squish%20Man%20Book%201/);
		const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);
		expect(ld["@type"]).toEqual(["Product", "Book"]);
		expect(ld.offers).toHaveLength(3);
		expect(ld.offers.every((o: { priceCurrency: string }) => o.priceCurrency === "USD")).toBe(true);
	});

	it("marks Spanish books as Spanish", async () => {
		const m = bookMeta(byId("libro-2"));
		expect(m.lang).toBe("es");
		const html = await rewriteBookPage(new Response(productHtml, { headers: { "content-type": "text/html" } }), m).text();
		expect(html).toMatch(/^<!doctype html><html lang=['"]es['"]>/);
	});

	it("never lets a title break out of the schema script", () => {
		const m = bookMeta({ ...byId("book-1"), name: "</script><script>alert(1)</script>" });
		expect(m.jsonLd).not.toContain("</script>");
	});

	it("serves book pages with their own tags, and leaves unknown books alone", async () => {
		const html = await (await SELF.fetch(`${BASE}/product?book=book-3`)).text();
		expect(html).toContain("<title>Book 3: Squish Man and the Magical Garden | Squish Man™</title>");
		expect(html).toContain('"@type":["Product","Book"]');
		const plain = await (await SELF.fetch(`${BASE}/product?book=nope`)).text();
		expect(plain).toContain("<title>Squish Man™ Book Details</title>");
		expect(plain).not.toContain("application/ld+json");
	});
});
