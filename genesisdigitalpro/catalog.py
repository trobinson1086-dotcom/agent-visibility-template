"""Genesis Digital Pro catalog, derived only from data already in the master build.

Titles, prices and Stripe Payment Links are parsed from the packaged storefront
pages (checkout.html, squish-books-2-3.html, squish-books-4-5.html,
squish-spanish.html). Nothing here is invented: a book with no live link in the
build is listed with ``formats_pending`` and renders as "Coming soon".
"""

import html
import re
from pathlib import Path

SRC = Path(__file__).parent / "source"

COVER_DIR = "/assets/home-covers/"

# Children's direct-site prices (as already used throughout the build).
CHILD_PENDING = [
    ("Paperback", "24.99"),
    ("Hardcover", "34.99"),
    ("eBook", "12.99"),
    ("Audiobook", "20.99"),
]
# Unreleased adult titles have no prices anywhere in the build, so none are shown.
ADULT_PENDING = []

SERIES = {
    "squish-man": {
        "name": "The Amazing Adventures of Squish Man",
        "short": "Squish Man",
        "audience": "children",
        "blurb": "Meet the tiny hero at the heart of Maple Hollow.",
        "free_page": "squish-man",
    },
    "ruben": {
        "name": "Ruben Adventures",
        "short": "Ruben",
        "audience": "children",
        "blurb": "A young-reader adventure beginning a new life in New York City.",
        "free_page": "ruben",
    },
    "messiah": {
        "name": "Messiah Adventures",
        "short": "Messiah",
        "audience": "children",
        "blurb": "Cars, curiosity and adventure for young readers.",
        "free_page": "messiah",
    },
    "champagne-hearts": {
        "name": "Champagne Hearts",
        "short": "Champagne Hearts",
        "audience": "adult",
        "blurb": None,
        "free_page": "champagne-hearts",
    },
    "uptown-testimony": {
        "name": "Uptown Testimony",
        "short": "Uptown Testimony",
        "audience": "adult",
        "blurb": None,
        "free_page": "uptown-testimony",
    },
    "rizzmeister": {
        "name": "The Rizzmeister Chronicles",
        "short": "Rizzmeister",
        "audience": "adult",
        "blurb": None,
        "free_page": "rizzmeister",
    },
    "8-weeks-out": {
        "name": "8 Weeks Out",
        "short": "8 Weeks Out",
        "audience": "adult",
        "blurb": None,
        "free_page": None,
    },
    "intelligence": {
        "name": "AI, Business & Intelligence",
        "short": "Intelligence Books",
        "audience": "adult",
        "blurb": "Ideas Today. A Bigger Tomorrow.",
        "free_page": None,
    },
    "trading": {
        "name": "Trading",
        "short": "Trading",
        "audience": "adult",
        "blurb": None,
        "free_page": None,
    },
}

# (slug, series, book number, display title, packaged cover file, source page, title marker in source)
BOOKS = [
    ("squish-man-book-1-the-missing-puppy-parade", "squish-man", 1, "The Missing Puppy Parade", "squish-man-book1.png", "checkout.html", "Squish Man Book 1 - The Missing Puppy Parade"),
    ("squish-man-book-2-big-dream-adventure", "squish-man", 2, "Squish Man’s Big Dream Adventure", "squish-man-book-2.png", "squish-books-2-3.html", "Squish Man’s Big Dream Adventure — Book 2"),
    ("squish-man-book-3-the-magical-garden", "squish-man", 3, "Squish Man and the Magical Garden", "squish-man-book-3.png", "squish-books-2-3.html", "Squish Man and the Magical Garden — Book 3"),
    ("squish-man-book-4-saves-the-snow-day", "squish-man", 4, "Squish Man Saves the Snow Day", "squish-man-book-4.png", "checkout.html", "Squish Man Saves the Snow Day (Book 4)"),
    ("squish-man-book-5-great-maple-hollow-derby", "squish-man", 5, "Squish Man and the Great Maple Hollow Derby", "squish-man-book-5.png", "checkout.html", "Squish Man and the Great Maple Hollow Derby (Book 5)"),
    ("ruben-book-1-first-day-in-new-york-city", "ruben", 1, "Ruben’s First Day in New York City", "ruben-book1.png", None, None),
    ("ruben-book-2-second-day-in-new-york-city", "ruben", 2, "Ruben’s Second Day in New York City", "ruben-book2.png", None, None),
    ("ruben-book-3-third-day-in-new-york-city", "ruben", 3, "Ruben’s Third Day in New York City", "ruben-book3.png", None, None),
    ("ruben-book-4-fourth-day-in-new-york-city", "ruben", 4, "Ruben’s Fourth Day in New York City", "ruben-book4.png", None, None),
    ("ruben-book-5-fifth-day-in-new-york-city", "ruben", 5, "Ruben’s Fifth Day in New York City", "ruben-book5.png", None, None),
    ("messiah-book-1-the-mystery-car", "messiah", 1, "The Mystery Car", "messiah-book1.png", "checkout.html", "Messiah - Book 1 (The Mystery Car)"),
    ("messiah-book-2-great-race-day-challenge", "messiah", 2, "Messiah and the Great Race-Day Challenge", "messiah-book2.png", "checkout.html", "Messiah: Race Day Challenge (Book 2)"),
    ("messiah-book-3-the-secret-garage", "messiah", 3, "The Secret Garage", "messiah-book3.png", "checkout.html", "Messiah - Book 3 (The Secret Garage)"),
    ("messiah-book-4-the-road-trip-nobody-expected", "messiah", 4, "The Road Trip Nobody Expected", "messiah-book4.png", "checkout.html", "Messiah - Book 4 (The Road Trip Nobody Expected)"),
    ("messiah-book-5-messiah-takes-the-lead", "messiah", 5, "Messiah Takes the Lead", "messiah-book5.png", "checkout.html", "Messiah Takes the Lead (Book 5)"),
    ("champagne-hearts-book-1-the-weight-of-the-name", "champagne-hearts", 1, "The Weight of the Name", "champagne-hearts-book1.png", "checkout.html", "The Weight of the Name (Book 1)"),
    ("champagne-hearts-book-2-the-price-of-belonging", "champagne-hearts", 2, "The Price of Belonging", "champagne-hearts-book2.png", "checkout.html", "The Price of Belonging (Book 2)"),
    ("champagne-hearts-book-3-the-secrets-we-keep", "champagne-hearts", 3, "The Secrets We Keep", "champagne-hearts-book3.png", None, None),
    ("uptown-testimony-book-1-uptown-testimony", "uptown-testimony", 1, "Uptown Testimony", "uptown-testimony-book1.jpg", "checkout.html", "Uptown Testimony (Book 1)"),
    ("uptown-testimony-book-2-the-name-they-gave-me", "uptown-testimony", 2, "The Name They Gave Me", "uptown-testimony-book2.jpg", "checkout.html", "The Name They Gave Me (Book 2)"),
    ("uptown-testimony-book-3-children-of-the-legacy", "uptown-testimony", 3, "Children of the Legacy", "uptown-testimony-book3.png", "checkout.html", "Children of the Legacy (Book 3)"),
    ("rizzmeister-book-1-new-kid-old-soul", "rizzmeister", 1, "New Kid, Old Soul", "rizzmeister-book1.png", "checkout.html", "The Rizzmeister Chronicles - Book One (New Kid Old Soul)"),
    ("rizzmeister-book-2-more-than-a-game", "rizzmeister", 2, "More Than a Game", "rizzmeister-book2.png", None, None),
    ("rizzmeister-book-3-next-level", "rizzmeister", 3, "Next Level", "rizzmeister-book3.png", None, None),
    ("8-weeks-out-womens-edition", "8-weeks-out", None, "8 Weeks Out — Women’s Edition", "8-weeks-out-women.png", "checkout.html", "8-Week Women&#x27;s Workout Book"),
    ("8-weeks-out-mens-edition", "8-weeks-out", None, "8 Weeks Out — Men’s Edition", "8-weeks-out-men.jpg", "checkout.html", "8-Week Workout Book for Men"),
    ("1000-ai-prompts-for-entrepreneurs", "intelligence", None, "1000 AI Prompts for Entrepreneurs", "1000-ai-prompts.png", "checkout.html", "1000 AI Prompts for Entrepreneurs"),
    ("the-ai-growth-machine", "intelligence", None, "The AI Growth Machine", "ai-growth-machine.png", "checkout.html", "The AI Growth Machine"),
    ("claude-ai-a-problem-solving-guide", "intelligence", None, "Claude AI — A Problem-Solving Guide", "claude-ai-guide.png", "checkout.html", "Claude AI - A Problem-Solving Guide"),
    ("ai-for-small-business-2026", "intelligence", None, "AI for Small Business 2026", "ai-small-business-2026.png", None, None),
    ("gohighlevel-ai-for-beginners", "intelligence", None, "GoHighLevel AI for Beginners", "gohighlevel-ai-beginners.png", None, None),
    ("futures-vs-day-trading-stocks", "trading", None, "Futures vs. Day Trading Stocks", "futures-vs-day-trading.png", "checkout.html", "Futures vs. Day Trading Stocks"),
]

# Spanish Learning & Activity editions (squish-spanish.html), keyed by English book number.
SPANISH_MARKERS = {
    1: "Squish Man Book 1 - Spanish Learning &amp; Activity Edition",
    2: "Squish Man&#x27;s Big Dream Adventure - Spanish Learning &amp; Activity Edition",
    3: "Squish Man and the Magical Garden - Spanish Learning &amp; Activity Edition",
    4: "Squish Man Saves the Snow Day - Spanish Learning &amp; Activity Edition",
    5: "Squish Man and the Great Maple Hollow Derby - Spanish Learning &amp; Activity Edition",
}

_DATA = re.compile(r"data:image/[a-z+]+;base64,[A-Za-z0-9+/=]+")
_cache = {}


def _page(name):
    if name not in _cache:
        _cache[name] = _DATA.sub("DATA", (SRC / name).read_text(encoding="utf-8"))
    return _cache[name]


def _article_for(page, marker):
    s = _page(page)
    i = s.find(marker)
    if i < 0:
        raise KeyError(f"{marker!r} not found in {page}")
    start = s.rfind("<article", 0, i)
    end = s.find("</article>", i)
    return s[start:end]


_LINK = re.compile(
    r'href="(https://buy\.stripe\.com/[A-Za-z0-9]+)">\s*([^<]+?)\s*(?:<strong>\s*\$([\d.]+)\s*</strong>|—\s*\$([\d.]+))'
)


def formats_for(page, marker):
    out = []
    for url, label, p1, p2 in _LINK.findall(_article_for(page, marker)):
        out.append((html.unescape(label).strip(" —"), p1 or p2, url))
    return out


def spanish_edition(n):
    links = formats_for("squish-spanish.html", SPANISH_MARKERS[n])
    if len(links) != 1:
        raise ValueError(f"expected one Spanish link for book {n}, got {links}")
    return links[0]


def load():
    books = []
    for slug, series, num, title, cover, page, marker in BOOKS:
        b = {
            "slug": slug,
            "series": series,
            "num": num,
            "title": title,
            "cover": COVER_DIR + cover,
            "cover_file": cover,
            "formats": formats_for(page, marker) if page else [],
        }
        if not b["formats"]:
            pending = CHILD_PENDING if SERIES[series]["audience"] == "children" else ADULT_PENDING
            b["formats_pending"] = pending
        if series == "squish-man":
            b["spanish"] = spanish_edition(num)
        books.append(b)
    return books


if __name__ == "__main__":
    for b in load():
        print(b["slug"], len(b["formats"]), [f[:2] for f in b["formats"]], b.get("spanish", ("",))[0])
