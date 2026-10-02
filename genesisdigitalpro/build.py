"""Build the deployable GenesisDigitalPro.com site into ./dist.

Input is ./source (the master build, unchanged) plus ./source-extra-covers
(exact Drive originals for covers the build hot-linked but did not package).
Cover image files are copied byte-for-byte; nothing is re-encoded or redrawn.

    python3 build.py
"""

import base64
import hashlib
import html
import json
import re
import shutil
from pathlib import Path

import catalog

ROOT = Path(__file__).parent
SRC = ROOT / "source"
EXTRA = ROOT / "source-extra-covers"
OUT = ROOT / "dist"
SITE = "https://genesisdigitalpro.com"

COVERS = "/assets/home-covers/"
EXTRA_COVERS = {
    # Drive file id -> published path. Exact Drive originals, not in the ZIP.
    "1qWtxDQykc5DHMfbJ0Rlu-w7z6-ing2jq": "/assets/covers/squish-man-spanish-book1.png",
    "1puPkCmcyHE0gg1UoocLskAkFu_GGO54u": "/assets/covers/squish-man-spanish-book2.png",
}

# Drive thumbnail ids the build hot-linked. Each was downloaded and verified
# byte-identical to the packaged cover named here, except the two marked below.
DRIVE_IDS = {
    "1W4oPWoeEBoBXdLZUFE1Ugtwr4VOPvcjf": "squish-man-book1.png",
    # Dead Drive link (file no longer exists); the build's QA names the packaged
    # Book 5 file as the authoritative replacement, and checkout.html already uses it.
    "1EOIzqd48B71IBAMx36X5j2Jix-aSIVwP": "squish-man-book-5.png",
    "1NClI_onRPqQtFyQgns2OY6fAsaz322kQ": "ruben-book1.png",
    # This Drive file is different artwork from the packaged ruben-book2.png. The
    # owner approved the packaged file (the ZIP is the source of truth); the Drive
    # version is kept in source-extra-covers/ for reference only.
    "1Vxn_-g5HNLdW7UmF4Tm4oyJn2cmHIw9v": "ruben-book2.png",
    "1C-PiasVSbQYhSLZw7uY2TYB9E89yHCW6": "ruben-book3.png",
    "1nEHfmn_ozdnahEQn5cj-6dIdS-A1uOQj": "ruben-book4.png",
    "1L3EzS8fwb6utcXoxobK54_57cQNdoNLu": "ruben-book5.png",
    "1BAkBzqao3JfbXX7Brgq5FDf8agP0itRY": "messiah-book1.png",
    "1tMWI2zFTMoVWVhX18l3yJjA-l3JiMw-X": "messiah-book2.png",
    "1jLVXN4TYu3RFk_7J8IAm4kYHVAh9rveJ": "messiah-book3.png",
    "18rlJ2Q6L9c2lVRe375o0MsqBcza77I7T": "messiah-book4.png",
    "1b0F4Glsh-GoRhffaJM_M3eKorX2ewvyV": "messiah-book5.png",
    "1BHNvzrsOOoy3tUU9xb3kTUvVVqtdJY10": "uptown-testimony-book1.jpg",
    "1eNWDoT7xGbn6EYn5W9hVmQUBa54_iov2": "uptown-testimony-book2.jpg",
    "1xLGWhUJ6an8MUGUvGJoUyXuINBHehk5W": "uptown-testimony-book3.png",
    "18ICmLnVkTv2U1kpviZL_lj8zU_HE_6mF": "champagne-hearts-book1.png",
    "1NZxmES7HK8kYIso0G5hEccskVy2yYpkj": "champagne-hearts-book2.png",
    "1k4L0EwYy7zbji6v-bQv5vGdA62B_0DG9": "rizzmeister-book1.png",
    "1AI5QErqJ15fDsMaJD3fT88qyOaWfxpan": "8-weeks-out-women.png",
    "1sn4cRMtuaq2d4eefpP1aysJnfVWf6oUS": "8-weeks-out-men.jpg",
    "1b1zdk2wsDiEGyFjZUKuSHfL1-Mtm3I4V": "1000-ai-prompts.png",
    "1VwQY-EKEFlJ0kcUcExjGdEX6XGJdYQRC": "ai-growth-machine.png",
    "11iAMyTe3HngPNLm79_pOXLG8WdNGJaj7": "claude-ai-guide.png",
    "1fwyyrTzaTrM8vztJpneFQublQMB8c8Yx": "futures-vs-day-trading.png",
}

# Build notes, server source and package files stay out of the web root.
NOT_PUBLIC = re.compile(r"^(?!robots\.txt$).*\.txt$|^package\.json$")

NAV = [
    ("index.html", "HOME"),
    ("checkout.html", "SHOP"),
    ("children.html", "CHILDREN'S STORE"),
    ("collections.html", "COLLECTIONS"),
    ("series.html", "SERIES"),
    ("search.html", "SEARCH"),
    ("free-page.html", "GET A FREE PAGE"),
    ("account.html", "ACCOUNT"),
    ("cart.html", "CART"),
]
FOOTER_LINKS = [
    ("about.html", "About"),
    ("contact.html", "Contact"),
    ("schools.html", "Schools & Educators"),
    ("faq.html", "FAQ"),
    ("bulk-orders.html", "Bulk Orders"),
    ("media.html", "Media"),
    ("privacy.html", "Privacy"),
    ("terms.html", "Terms"),
    ("shipping.html", "Shipping"),
    ("refunds.html", "Refunds"),
    ("accessibility.html", "Accessibility"),
]

esc = html.escape


def money(p):
    return f"${p}"


# ---------------------------------------------------------------- shared bits


def gdpnav():
    links = "".join(
        f'<a href="/{href}">{label}{" <span id=cartCount>0</span>" if href == "cart.html" else ""}</a>'
        for href, label in NAV
    )
    return f'<nav class="gdpnav" aria-label="Main">{links}</nav>'


def info_links():
    out = []
    for href, label in NAV[1:]:
        label = label.replace("CHILDREN'S STORE", "CHILDREN").replace("GET A FREE PAGE", "FREE PAGE")
        extra = ' <span id="cartCount">0</span>' if href == "cart.html" else ""
        out.append(f'<a href="{href}">{label}{extra}</a>')
    return '<div class="links">\n' + "".join(out) + "\n</div>"


def footer_links(prefix=""):
    return " · ".join(f'<a href="{prefix}{h}">{esc(t)}</a>' for h, t in FOOTER_LINKS)


CART_JS = """<script>
function cart(){try{return JSON.parse(localStorage.getItem('gdpCart')||'[]')}catch(e){return []}}
function saveCart(c){try{localStorage.setItem('gdpCart',JSON.stringify(c))}catch(e){}updateCount()}
function updateCount(){var e=document.getElementById('cartCount');if(e)e.textContent=cart().reduce(function(a,x){return a+(x.qty||1)},0)}
function addCart(title,format,price,url){var c=cart(),k=title+'|'+format,x=c.find(function(i){return i.k===k});if(x)x.qty++;else c.push({k:k,title:title,format:format,price:price,url:url,qty:1});saveCart(c);var m=document.getElementById('cartMsg');if(m){m.textContent=title+' ('+format+') added to your cart.'}else{alert('Added to cart')}}
document.addEventListener('DOMContentLoaded',updateCount)
</script>"""


# ------------------------------------------------------------ asset handling


def copy_assets():
    covers = OUT / COVERS.strip("/")
    covers.mkdir(parents=True, exist_ok=True)
    by_hash = {}
    for f in sorted(SRC.iterdir()):
        if f.suffix.lower() in (".png", ".jpg", ".jpeg"):
            shutil.copy2(f, covers / f.name)
            by_hash[hashlib.sha256(f.read_bytes()).hexdigest()] = COVERS + f.name
    for drive_id, path in EXTRA_COVERS.items():
        src = EXTRA / f"{drive_id}.png"
        dst = OUT / path.lstrip("/")
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        by_hash[hashlib.sha256(src.read_bytes()).hexdigest()] = path
    for spanish, _ in SPANISH_COVERS.values():
        shutil.copy2(EXTRA / spanish, OUT / "assets" / "covers" / spanish)
    return by_hash


def externalize_images(s, by_hash, page):
    def data_uri(m):
        digest = hashlib.sha256(base64.b64decode(m.group(1))).hexdigest()
        if digest not in by_hash:
            raise SystemExit(f"{page}: embedded image does not match any packaged cover")
        return by_hash[digest]

    s = re.sub(r"data:image/[a-z+]+;base64,([A-Za-z0-9+/=]+)", data_uri, s)

    def drive(m):
        i = m.group(1)
        if i in EXTRA_COVERS:
            return EXTRA_COVERS[i]
        if i not in DRIVE_IDS:
            raise SystemExit(f"{page}: unknown Drive image {i}")
        return COVERS + DRIVE_IDS[i]

    s = re.sub(r"https://drive\.google\.com/thumbnail\?id=([A-Za-z0-9_-]+)(?:&amp;|&)sz=w\d+", drive, s)
    # Relative cover paths -> absolute, so the same markup works from /books/.
    return s.replace('"assets/home-covers/', '"/assets/home-covers/').replace("'assets/home-covers/", "'/assets/home-covers/")


def normalize_head(s, lang="en"):
    """Put the doctype first (several pages had <style> before it, which forces quirks mode)."""
    if s.lstrip().lower().startswith("<!doctype"):
        s = re.sub(r"<html>", f'<html lang="{lang}">', s, count=1)
    else:
        s = re.sub(r"<!doctype html>", "", s, flags=re.I)
        s = re.sub(r'<meta charset="?utf-8"?>', "", s, flags=re.I)
        s = f'<!doctype html>\n<html lang="{lang}">\n<meta charset="utf-8">\n' + s.lstrip()
    if 'rel="icon"' not in s:
        s = s.replace("<title>", '<link rel="icon" href="data:,"><title>', 1)
    return s


# -------------------------------------------------------------- product pages

PRODUCT_CSS = """
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;color:#fff;font-family:Arial,Helvetica,sans-serif;background:#07111a;min-height:100vh}
a{color:inherit}
.theme{position:fixed;inset:0;z-index:-2;background-size:cover;background-position:center;filter:blur(22px) brightness(.42) saturate(1.15);transform:scale(1.18)}
.veil{position:fixed;inset:0;z-index:-1;background:linear-gradient(180deg,#07111acc 0%,#07111a8c 35%,#07111ad9 100%)}
.gdpnav{position:sticky;top:0;z-index:50;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:12px;background:#02080dcc;backdrop-filter:blur(12px);border-bottom:1px solid #e5c46e55}
.gdpnav a{color:#e5c46e;text-decoration:none;font:800 12px Arial;padding:9px 11px;border:1px solid #e5c46e55;border-radius:8px}
.brand{display:block;text-align:center;padding:22px 16px 6px;color:#e5c46e;font:700 15px Georgia;letter-spacing:.18em;text-decoration:none}
.wrap{max-width:1140px;margin:0 auto;padding:0 16px}
.hero{display:grid;grid-template-columns:minmax(0,440px) minmax(0,1fr);gap:44px;align-items:center;padding:34px 0 40px}
.cover{display:flex;justify-content:center}
.cover img{display:block;max-width:100%;max-height:72vh;width:auto;height:auto;object-fit:contain;border-radius:6px;box-shadow:0 30px 70px #000c,0 0 0 1px #ffffff1a}
.kicker{color:#e5c46e;font:800 13px Arial;letter-spacing:.14em;text-transform:uppercase}
h1,h2,h3{font-family:Georgia,serif}
h1{font-size:clamp(34px,5vw,58px);line-height:1.05;margin:10px 0 14px}
.lead{font-size:19px;line-height:1.6;color:#eef2f4;max-width:620px}
.from{font-size:18px;margin:16px 0}.from strong{color:#e5c46e;font-size:26px}
.btn{display:inline-block;border:0;border-radius:9px;padding:14px 20px;background:#e5c46e;color:#07111a;font-weight:900;text-decoration:none;cursor:pointer;font-size:14px}
.btn2{display:inline-block;border:1px solid #e5c46e;border-radius:9px;padding:13px 19px;color:#e5c46e;font-weight:800;text-decoration:none;background:#07111a66;cursor:pointer;font-size:14px}
.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}
.panel{background:#07111ab8;border:1px solid #e5c46e40;border-radius:20px;padding:30px;margin:0 0 28px;backdrop-filter:blur(10px)}
.panel h2{margin:0 0 16px;font-size:30px}
.formats{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.format{background:#0d1b26d9;border:1px solid #ffffff1f;border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:10px}
.format h3{margin:0;font-size:19px}.price{font:900 26px Arial;color:#e5c46e}
.format .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}
.soon{opacity:.75}.soon .price{font-size:20px;color:#cfd6db}
.note{color:#c9d5df;font-size:14px;line-height:1.6}
dl{display:grid;grid-template-columns:max-content 1fr;gap:10px 22px;margin:0}dt{color:#e5c46e;font-weight:800}dd{margin:0;color:#eef2f4}
.related{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:18px}
.related a{text-decoration:none;display:block;background:#0d1b26d9;border:1px solid #ffffff1f;border-radius:14px;padding:12px;text-align:center}
.related img{width:100%;height:220px;object-fit:contain;display:block;margin-bottom:10px}
.related span{font-size:14px;font-weight:700;line-height:1.35}
.free{display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}
footer{margin-top:20px;padding:36px 16px 90px;text-align:center;background:#02080dcc;border-top:1px solid #e5c46e40;color:#c9d5df;line-height:1.8}
footer b{color:#e5c46e;font-family:Georgia;letter-spacing:.12em}footer a{color:#c9d5df}
#cartMsg{min-height:1.4em;color:#e5c46e;font-weight:700;margin-top:10px}
@media(max-width:820px){.hero{grid-template-columns:1fr;gap:26px;padding-top:22px;text-align:center}.cover img{max-height:62vh}.actions{justify-content:center}.lead{margin:0 auto}.panel{padding:22px}dl{grid-template-columns:1fr;gap:4px}dt{margin-top:10px}}
"""


def product_page(b, books):
    series = catalog.SERIES[b["series"]]
    store = "children.html" if series["audience"] == "children" else "collections.html"
    store_label = "Children’s Store" if series["audience"] == "children" else "Collections"
    num = f" • Book {b['num']}" if b["num"] else ""
    title = b["title"]
    page_title = f"{title} | {series['short']} | Genesis Digital Pro"

    if b["formats"]:
        low = min(float(p) for _, p, _ in b["formats"])
        price_line = f'<p class="from">Formats from <strong>${low:.2f}</strong></p>'
        cards = []
        for label, price, url in b["formats"]:
            js = json.dumps([title, label, price, url])[1:-1].replace('"', "&quot;")
            cards.append(
                f'<div class="format"><h3>{esc(label)}</h3><div class="price">{money(price)}</div>'
                f'<div class="row"><a class="btn" href="{url}" target="_blank" rel="noopener">BUY NOW</a>'
                f'<button class="btn2" type="button" onclick="addCart({js})">ADD TO CART</button></div></div>'
            )
        if b.get("spanish"):
            label, price, url = b["spanish"]
            js = json.dumps([title, label, price, url])[1:-1].replace('"', "&quot;")
            cards.append(
                f'<div class="format"><h3>{esc(label)}</h3><div class="price">{money(price)}</div>'
                f'<div class="row"><a class="btn" href="{url}" target="_blank" rel="noopener">BUY NOW</a>'
                f'<button class="btn2" type="button" onclick="addCart({js})">ADD TO CART</button></div></div>'
            )
        formats = (
            '<div class="formats">' + "".join(cards) + "</div>"
            '<p id="cartMsg" role="status" aria-live="polite"></p>'
            '<p class="note">Checkout is completed on Stripe’s secure payment page.</p>'
        )
        hero_cta = '<a class="btn" href="#formats">CHOOSE A FORMAT</a>'
    else:
        pending = b.get("formats_pending") or []
        if pending:
            cards = "".join(
                f'<div class="format soon"><h3>{esc(l)}</h3><div class="price">{money(p)}</div><div class="row"><span class="btn2" aria-disabled="true">COMING SOON</span></div></div>'
                for l, p in pending
            )
            formats = f'<div class="formats">{cards}</div>'
        else:
            formats = '<p class="note">This title is coming soon to the Genesis Digital Pro store.</p>'
        price_line = '<p class="from"><strong>Coming soon</strong></p>'
        hero_cta = f'<a class="btn" href="/{store}">BROWSE AVAILABLE BOOKS</a>'

    details = [("Series", series["name"])]
    if b["num"]:
        details.append(("Book", str(b["num"])))
    details.append(("Reader", "Children’s" if series["audience"] == "children" else "Adult & general"))
    fmts = [f[0] for f in b["formats"]] + ([b["spanish"][0]] if b.get("spanish") and b["formats"] else [])
    if fmts:
        details.append(("Formats", ", ".join(fmts)))
    details.append(("Publisher", "Genesis Digital Pro"))
    dl = "".join(f"<dt>{esc(k)}</dt><dd>{esc(v)}</dd>" for k, v in details)

    about = ""
    if series.get("blurb"):
        about = f'<section class="panel" id="about"><h2>About the Series</h2><p class="lead">{esc(series["blurb"])}</p></section>'

    related = [x for x in books if x["series"] == b["series"] and x["slug"] != b["slug"]]
    if len(related) < 3:
        related += [
            x for x in books
            if x["slug"] != b["slug"] and x not in related
            and catalog.SERIES[x["series"]]["audience"] == series["audience"]
        ][: 6 - len(related)]
    rel = "".join(
        f'<a href="/books/{x["slug"]}.html"><img src="{x["cover"]}" alt="{esc(x["title"])} cover" loading="lazy" decoding="async"><span>{esc(x["title"])}</span></a>'
        for x in related[:8]
    )

    free = ""
    if series.get("free_page"):
        free = (
            '<section class="panel free"><div><h2>Get a Free Page</h2>'
            f'<p class="note">Request a free sample page from {esc(series["name"])}.</p></div>'
            '<a class="btn" href="/free-page.html">GET A FREE PAGE</a></section>'
        )

    desc = f"{title} — {series['name']}{num.replace(' •', ',')} from Genesis Digital Pro."
    ld = {
        "@context": "https://schema.org",
        "@type": "Book",
        "name": title,
        "image": SITE + b["cover"],
        "url": f"{SITE}/books/{b['slug']}.html",
        "publisher": {"@type": "Organization", "name": "Genesis Digital Pro"},
        "isPartOf": {"@type": "BookSeries", "name": series["name"]},
    }
    if b["formats"]:
        ld["offers"] = [
            {"@type": "Offer", "name": l, "price": p, "priceCurrency": "USD", "url": u, "availability": "https://schema.org/InStock"}
            for l, p, u in b["formats"]
        ]

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:,">
<title>{esc(page_title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{SITE}/books/{b['slug']}.html">
<meta property="og:title" content="{esc(title)}">
<meta property="og:image" content="{SITE}{b['cover']}">
<meta property="og:type" content="book">
<link rel="preload" as="image" href="{b['cover']}">
<style>{PRODUCT_CSS}</style>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<div class="theme" style="background-image:url('{b['cover']}')" aria-hidden="true"></div><div class="veil" aria-hidden="true"></div>
{gdpnav()}
<a class="brand" href="/index.html">GENESIS DIGITAL PRO</a>
<main class="wrap">
<section class="hero">
<div class="cover"><img src="{b['cover']}" alt="{esc(title)} — {esc(series['name'])} book cover" fetchpriority="high" decoding="async"></div>
<div>
<div class="kicker">{esc(series['name'])}{num}</div>
<h1>{esc(title)}</h1>
{price_line}
<div class="actions">{hero_cta}<a class="btn2" href="/{store}">BACK TO {store_label.upper()}</a></div>
</div>
</section>
<section class="panel" id="formats"><h2>Formats &amp; Pricing</h2>{formats}</section>
{about}
<section class="panel" id="details"><h2>Book Details</h2><dl>{dl}</dl></section>
{free}
<section class="panel" id="related"><h2>{'More in This Series' if b['series'] == (related[0]['series'] if related else '') else 'You May Also Like'}</h2><div class="related">{rel}</div></section>
</main>
<footer><b>GENESIS DIGITAL PRO</b><p>Good Books. Brighter Tomorrows.™<br>Books That Inspire. Entertain. Empower.</p><p>{footer_links('/')}</p></footer>
{CART_JS}
</body>
</html>
"""


# ------------------------------------------------------------ page rewrites


def card_href_by_cover(books):
    return {b["cover_file"]: f"/books/{b['slug']}.html" for b in books}


def rewrite_index(s, books):
    hrefs = card_href_by_cover(books)

    def card(m):
        cover = m.group(2)
        href = hrefs.get(cover, m.group(1))
        return f'<a class="covercard" href="{href}"><div class="art"><img src="/assets/home-covers/{cover}"'

    s = re.sub(r'<a class="covercard" href="([^"]+)"><div class="art"><img src="/assets/home-covers/([^"]+)"', card, s)
    s = re.sub(r'(<img src="/assets/home-covers/[^"]+" alt="[^"]*")>', r'\1 loading="lazy" decoding="async">', s)
    s = s.replace(
        "<p>Browse more original Genesis Digital Pro collections.</p>",
        "<p>Browse more original Genesis Digital Pro collections.</p>"
        '<p class="tagline"><b>INTELLIGENCE BOOKS</b> — Ideas Today. A Bigger Tomorrow.</p>',
    )
    old_card = re.search(r"<div class=card><b>GENESIS DIGITAL PRO</b><h2>More Collections</h2>.*?</div>", s, flags=re.S)
    if old_card:
        s = s.replace(
            old_card.group(0),
            '<a class=card href="collections.html"><b>GENESIS DIGITAL PRO</b><h2>More Collections</h2>'
            "<p>Adult fiction, business, AI, trading and fitness collections.</p><b>EXPLORE COLLECTIONS →</b></a>",
        )
    s = s.replace(
        "<header><b>GENESIS DIGITAL PRO</b><nav>",
        "<header><b>GENESIS DIGITAL PRO</b><nav aria-label=\"Shop\">",
    )
    s = s.replace("</footer>", f'<p class="foot">{footer_links()}</p></footer>', 1)
    s = s.replace(
        "</style>\n</head>",
        ".tagline{color:#e5c46e;font-family:Georgia;font-size:20px}.foot{font-size:14px;line-height:1.9}.foot a{color:#c9d5df}footer p{margin:10px 0}\n</style>\n</head>",
        1,
    )
    return s


def children_grid(books):
    out = []
    for b in books:
        if catalog.SERIES[b["series"]]["audience"] != "children":
            continue
        series = catalog.SERIES[b["series"]]["short"].upper()
        prices = b["formats"] or [(l, p, None) for l, p in b.get("formats_pending", [])]
        core = {l: p for l, p, *_ in prices}
        line = (
            f"Paperback {money(core['Paperback'])} • Hardcover {money(core['Hardcover'])}<br>"
            f"eBook {money(core['eBook'])} • Audiobook {money(core['Audiobook'])}"
        )
        href = f"/books/{b['slug']}.html"
        if b["formats"]:
            action = f'<a class=buy href="{href}">SHOP THIS BOOK</a>'
        else:
            action = f'<button disabled>COMING SOON</button><a class=more href="{href}">VIEW BOOK</a>'
        out.append(
            f'<article class=book><a href="{href}"><img src="{b["cover"]}" alt="{esc(b["title"])} cover" loading="lazy" decoding="async"></a>'
            f'<div><b>{series} • BOOK {b["num"]}</b><h2><a href="{href}">{esc(b["title"])}</a></h2><p>{line}</p>{action}</div></article>'
        )
    return "\n".join(out)


def rewrite_children(s, books):
    start = s.index("<main class=grid>") + len("<main class=grid>")
    end = s.index("</main>")
    s = s[:start] + "\n" + children_grid(books) + "\n" + s[end:]
    s = s.replace(
        "</main>",
        '</main><p class=spanish><a class=buy href="/squish-spanish.html">SQUISH MAN EN ESPAÑOL — ACTIVITY &amp; LEARNING EDITIONS</a></p>',
        1,
    )
    s = s.replace("<footer>", f"<footer><p>{footer_links()}</p>", 1)
    s = s.replace(
        "@media(max-width:600px){.book{grid-template-columns:1fr}",
        "*{box-sizing:border-box}.book h2 a{text-decoration:none}.more{display:block;text-align:center;margin-top:10px;color:#e5c46e;font-weight:bold}"
        ".spanish{max-width:850px;margin:0 auto 30px;padding:0 25px}footer a{color:#c9d5df}footer p{line-height:1.9}"
        "@media(max-width:600px){.book{grid-template-columns:1fr}",
        1,
    )
    return s


def checkout_article(b):
    series = catalog.SERIES[b["series"]]["name"]
    links = "".join(
        f'<a class=buy target=_blank rel=noopener href="{u}">{esc(l)} <strong>{money(p)}</strong></a>' for l, p, u in b["formats"]
    )
    return (
        f'<article><div class=bg style="background-image:url(\'{b["cover"]}\')"></div><img src="{b["cover"]}" alt="{esc(b["title"])} cover" loading="lazy" decoding="async">'
        f'<section><b>{esc(series)}</b><h2>{esc(b["title"])} (Book {b["num"]})</h2><div class=formats>{links}</div></section></article>'
    )


def link_titles(s, books):
    """Link each storefront card heading to its product page, and give images alt text."""
    hrefs = card_href_by_cover(books)

    def art(m):
        a = m.group(0)
        img = re.search(r'<img src="/assets/home-covers/([^"]+)"', a)
        if not img or img.group(1) not in hrefs:
            return a
        href = hrefs[img.group(1)]
        a = re.sub(r"<h2>(.*?)</h2>", lambda h: f'<h2><a href="{href}">{h.group(1)}</a></h2>', a, count=1)
        if "alt=" not in a.split(">", 3)[-2] and 'alt="' not in a[: a.find(">", a.find("<img")) + 1]:
            title = re.sub(r"<[^>]+>", "", re.search(r"<h2>(.*?)</h2>", a).group(1))
            a = a.replace(f'<img src="/assets/home-covers/{img.group(1)}"', f'<img src="/assets/home-covers/{img.group(1)}" alt="{title} cover" loading="lazy" decoding="async"', 1)
        return a

    return re.sub(r"<article>.*?</article>", art, s, flags=re.S)


def rewrite_checkout(s, books):
    by_slug = {b["slug"]: b for b in books}
    first_end = s.index("</article>") + len("</article>")
    extra = checkout_article(by_slug["squish-man-book-2-big-dream-adventure"]) + checkout_article(
        by_slug["squish-man-book-3-the-magical-garden"]
    )
    s = s[:first_end] + extra + s[first_end:]
    s = link_titles(s, books)
    s = s.replace(
        "<p>Verified Stripe links from your uploaded checkout catalog.</p>",
        "<p>Choose a format to continue to Stripe’s secure checkout.</p>",
    )
    s = s.replace("</main>", f"</main><footer><p>{footer_links()}</p></footer>", 1)
    s = s.replace(".buy{display:flex;", "h2 a{text-decoration:none}footer a{color:#c9d5df}footer p{line-height:1.9}.buy{display:flex;", 1)
    return s


# Spanish covers for Books 3-5, supplied by the owner (copied unchanged). The
# master build showed the English Book 3-5 covers on these Spanish editions.
SPANISH_COVERS = {
    "Squish Man and the Magical Garden - Spanish": ("squish-man-spanish-book3.jpg", "squish-man-book-3.png"),
    "Squish Man Saves the Snow Day - Spanish": ("squish-man-spanish-book4.jpg", "squish-man-book-4.png"),
    "Squish Man and the Great Maple Hollow Derby - Spanish": ("squish-man-spanish-book5.png", "squish-man-book-5.png"),
}


def rewrite_spanish(s):
    for marker, (spanish, english) in SPANISH_COVERS.items():
        i = s.index(marker)
        start, end = s.rfind("<article", 0, i), s.index("</article>", i)
        article = s[start:end].replace(COVERS + english, "/assets/covers/" + spanish)
        if "/assets/covers/" + spanish not in article:
            raise SystemExit(f"Spanish cover swap failed for {marker}")
        s = s[:start] + article + s[end:]
    s = re.sub(
        r'(<img src="(/assets/[^"]+)")>',
        lambda m: m.group(1) + ' alt="Squish Man Spanish Activity &amp; Learning Edition cover" loading="lazy" decoding="async">',
        s,
    )
    return s


def rewrite_squish_pair(s):
    return s.replace('" alt="', '" loading="lazy" decoding="async" alt="')


def rewrite_cart(s):
    s = s.replace(
        "${x.url?`<a class=\"btn\" href=\"collections.html\">BUY THIS ITEM</a>`:''}",
        "${/^https:\\/\\/buy\\.stripe\\.com\\//.test(x.url||'')?`<a class=\"btn\" href=\"${x.url}\" target=\"_blank\" rel=\"noopener\">BUY THIS ITEM</a>`:''}",
    )
    s = s.replace(
        "<p class=\"lead\">Keep several books together while you shop. Each purchase uses the book’s existing secure checkout link.</p>",
        "<p class=\"lead\">Keep several books together while you shop. Each book is purchased through its own secure Stripe checkout.</p>",
    )
    s = s.replace(
        "<p class=\"muted\">A single combined Stripe transaction requires a server-side Stripe cart/Checkout Session integration. Until that is connected, existing product checkout links remain the payment source of truth.</p>",
        "<p class=\"muted\">Select BUY THIS ITEM for each book to complete its secure Stripe checkout.</p>",
    )
    # Only offer combined checkout when cart items carry Stripe Price IDs.
    s = s.replace(
        "function rm(i){",
        "function syncMulti(){var b=document.getElementById('secureCheckout');if(b)b.style.display=cart().some(function(x){return /^price_[A-Za-z0-9]+$/.test(x.priceId||'')})?'':'none'}\n"
        "document.addEventListener('DOMContentLoaded',syncMulti)\nfunction rm(i){",
    )
    s = s.replace("saveCart(c);render()}", "saveCart(c);render();syncMulti()}")
    return s


def rewrite_search(s, books):
    items = []
    for b in books:
        series = catalog.SERIES[b["series"]]
        keys = " ".join([b["title"], series["name"], series["short"], series["audience"], " ".join(f[0] for f in b["formats"])]).lower()
        keys = esc(re.sub(r"[^\w\s&-]", " ", keys))
        items.append(
            f'<div class="card item" data-k="{keys}"><img src="{b["cover"]}" alt="{esc(b["title"])} cover" loading="lazy" decoding="async" style="width:100%;height:260px;object-fit:contain">'
            f'<h2>{esc(b["title"])}</h2><p class="muted">{esc(series["name"])}</p><a class="btn" href="/books/{b["slug"]}.html">VIEW BOOK</a></div>'
        )
    s = s.replace("</div></div></section>\n<script>function filterBooks", "\n".join(items) + "\n</div></div></section>\n<script>function filterBooks", 1)
    s = s.replace("x.dataset.k.includes(q)", "x.dataset.k.includes(q.trim())")
    return s


def rewrite_series(s):
    anchors = {
        "Uptown Testimony": "uptown-testimony",
        "Champagne Hearts": "champagne-hearts",
        "Rizzmeister": "rizzmeister",
        "8 Weeks Out": "8-weeks-out",
        "Business, AI &amp; Trading": "intelligence",
    }
    for name, a in anchors.items():
        s = s.replace(
            f'<div class="card"><h2>{name}</h2></div>',
            f'<div class="card"><h2>{name}</h2><a class="btn" href="collections.html#{a}">EXPLORE</a></div>',
        )
    return s


def rewrite_info(s):
    return re.sub(r'<div class="links">.*?</div>', info_links(), s, count=1, flags=re.S)


# ------------------------------------------------------------ collections page


def collections_page(books, index_html):
    # Reuse the homepage's styling so the page matches the approved design.
    css = "\n".join(re.findall(r"<style[^>]*>.*?</style>", index_html, flags=re.S)[:3])
    order = ["champagne-hearts", "uptown-testimony", "rizzmeister", "8-weeks-out", "intelligence", "trading"]
    sections = []
    for key in order:
        series = catalog.SERIES[key]
        cards = "".join(
            f'<a class="covercard" href="/books/{b["slug"]}.html"><div class="art"><img src="{b["cover"]}" alt="{esc(b["title"])} cover" loading="lazy" decoding="async"></div>'
            f'<div class="info"><b>{esc(series["name"].upper())}</b><h3>{esc(b["title"])}</h3>'
            f'<span class="view">{"SHOP THIS BOOK →" if b["formats"] else "COMING SOON"}</span></div></a>'
            for b in books
            if b["series"] == key
        )
        tagline = f"<p>{esc(series['blurb'])}</p>" if series.get("blurb") else ""
        sections.append(
            f'<section class="featured" id="{key}"><div class="sectionhead"><b>GENESIS DIGITAL PRO</b><h2>{esc(series["name"])}</h2>{tagline}</div><div class="covergrid">{cards}</div></section>'
        )
    return f"""<!doctype html>
<html lang="en">
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">
<title>Collections | Genesis Digital Pro</title>
<meta name="description" content="Adult fiction, AI, business, trading and fitness collections from Genesis Digital Pro.">
{css}
<style>.foot{{font-size:14px;line-height:1.9}}.foot a{{color:#c9d5df}}</style>
<body>{gdpnav()}
<section class="hero" style="min-height:0;padding:70px 7%"><b>GENESIS DIGITAL PRO</b><h1>Collections</h1><p>Fiction, intelligence, trading and fitness titles for adult and general readers. Looking for children’s books? Visit the <a href="/children.html" style="color:#e5c46e">Children’s Store</a>.</p></section>
{''.join(sections)}
<footer><b>GENESIS DIGITAL PRO</b><p>Books That Inspire. Entertain. Empower.</p><p class="foot">{footer_links()}</p></footer>
{CART_JS}
</body>
</html>
"""


# ------------------------------------------------------------------- driver


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    by_hash = copy_assets()
    books = catalog.load()

    pages = {}
    for f in sorted(SRC.glob("*.html")):
        s = f.read_text(encoding="utf-8")
        s = externalize_images(s, by_hash, f.name)
        s = normalize_head(s)
        s = re.sub(r"<header><meta charset=\"UTF-8\">", "<header>", s)
        s = re.sub(r'<nav class="gdpnav">.*?</nav>', gdpnav(), s, count=1, flags=re.S)
        pages[f.name] = s

    pages["index.html"] = rewrite_index(pages["index.html"], books)
    pages["children.html"] = rewrite_children(pages["children.html"], books)
    pages["checkout.html"] = rewrite_checkout(pages["checkout.html"], books)
    pages["squish-spanish.html"] = rewrite_spanish(pages["squish-spanish.html"])
    for name in ("squish-books-2-3.html", "squish-books-4-5.html"):
        pages[name] = link_titles(rewrite_squish_pair(pages[name]), books)
    pages["cart.html"] = rewrite_cart(pages["cart.html"])
    pages["search.html"] = rewrite_search(pages["search.html"], books)
    pages["series.html"] = rewrite_series(pages["series.html"])
    for name, s in pages.items():
        if '<div class="links">' in s:
            pages[name] = rewrite_info(s)

    if "collections.html" not in pages:
        # The master collections.html (90 MB) could not be retrieved; see README.
        pages["collections.html"] = collections_page(books, pages["index.html"])

    for name, s in pages.items():
        (OUT / name).write_text(s, encoding="utf-8")

    (OUT / "books").mkdir()
    for b in books:
        (OUT / "books" / f"{b['slug']}.html").write_text(product_page(b, books), encoding="utf-8")

    for name in ("robots.txt", "site.js"):
        shutil.copy2(SRC / name, OUT / name)
    # Pages already serves index.html at "/"; the build's "/ /index.html 200" rewrite
    # is rejected by Cloudflare as an infinite loop, so only the alias rules are kept.
    redirects = (SRC / "_redirects").read_text(encoding="utf-8")
    redirects = re.sub(r"(?m)^/\s+/index\.html\s+200\s*\n", "", redirects)
    (OUT / "_redirects").write_text(redirects, encoding="utf-8")
    headers = (SRC / "_headers").read_text(encoding="utf-8")
    headers = headers.replace(
        "  X-Content-Type-Options: nosniff\n",
        "  X-Content-Type-Options: nosniff\n  Strict-Transport-Security: max-age=31536000\n",
        1,
    )
    # Without "! Cache-Control" Pages merges the /* and /assets/* values into one
    # conflicting header ("max-age=300, ..., max-age=31536000").
    headers = headers.replace("/assets/*\n  Cache-Control:", "/assets/*\n  ! Cache-Control\n  Cache-Control:", 1)
    (OUT / "_headers").write_text(headers, encoding="utf-8")

    urls = ["/"] + [
        f"/{n}" for n in sorted(pages) if n not in ("index.html", "404.html", "500.html", "success.html", "cart.html", "account.html")
    ] + [f"/books/{b['slug']}.html" for b in books]
    sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    sitemap += "".join(f"<url><loc>{SITE}{u}</loc></url>\n" for u in urls) + "</urlset>\n"
    (OUT / "sitemap.xml").write_text(sitemap, encoding="utf-8")

    skipped = sorted(p.name for p in SRC.iterdir() if p.is_file() and NOT_PUBLIC.match(p.name))
    print(f"built {len(pages)} pages + {len(books)} product pages into {OUT}")
    print("kept out of the web root:", ", ".join(skipped + ["api/", "functions/ (deployed as Pages Functions)"]))


if __name__ == "__main__":
    main()
