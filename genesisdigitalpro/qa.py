"""Static QA over ./dist: every internal link and image resolves, encoding is clean,
no test-mode Stripe links, no file over Cloudflare's 25 MiB asset limit.

    python3 qa.py        # exits non-zero on any failure
"""

import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

DIST = Path(__file__).parent / "dist"
MOJIBAKE = re.compile("â€|Ã[\x80-\xbf]|Â[\x80-\xbf ]|�")
LIMIT = 25 * 1024 * 1024


class Refs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs, self.imgs_without_alt = [], 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for key in ("href", "src"):
            if a.get(key):
                self.refs.append((tag, a[key]))
        if tag == "img" and "alt" not in a:
            self.imgs_without_alt += 1
        if a.get("style"):
            self.refs += [("style", u) for u in re.findall(r"url\(['\"]?([^'\")]+)", a["style"])]


def resolve(page, ref):
    u = urlparse(ref)
    if u.scheme or ref.startswith(("#", "mailto:", "tel:", "javascript:", "data:")) or "${" in ref:
        return None
    path = unquote(u.path)
    if not path:
        return None
    target = (DIST / path.lstrip("/")) if path.startswith("/") else (page.parent / path)
    target = target.resolve()
    candidates = [target, target / "index.html", target.with_name(target.name + ".html")]
    return any(c.is_file() for c in candidates), target


def main():
    failures, pages, stripe = [], 0, set()
    for page in sorted(DIST.rglob("*.html")):
        pages += 1
        text = page.read_text(encoding="utf-8")
        rel = page.relative_to(DIST)
        if not text.lstrip().lower().startswith("<!doctype html>"):
            failures.append(f"{rel}: doctype is not first")
        if MOJIBAKE.search(text):
            failures.append(f"{rel}: mojibake {MOJIBAKE.search(text).group(0)!r}")
        if "drive.google.com" in text or "data:image" in text:
            failures.append(f"{rel}: hot-linked or embedded image remains")
        if re.search(r"test checkout|no live charge|buy\.stripe\.com/test_", text, re.I):
            failures.append(f"{rel}: test-mode checkout text or link")
        stripe |= set(re.findall(r"https://buy\.stripe\.com/[A-Za-z0-9]+", text))
        p = Refs()
        p.feed(text)
        for css_url in re.findall(r"url\(['\"]?(/[^'\")]+)", text):
            p.refs.append(("css", css_url))
        if p.imgs_without_alt:
            failures.append(f"{rel}: {p.imgs_without_alt} <img> without alt")
        for tag, ref in p.refs:
            r = resolve(page, ref)
            if r and not r[0]:
                failures.append(f"{rel}: broken {tag} -> {ref}")
    for f in DIST.rglob("*"):
        if f.is_file() and f.stat().st_size > LIMIT:
            failures.append(f"{f.relative_to(DIST)}: {f.stat().st_size} bytes exceeds 25 MiB")
    covers = sorted(DIST.glob("assets/**/*.png")) + sorted(DIST.glob("assets/**/*.jpg"))
    print(f"pages: {pages}  cover files: {len(covers)}  unique live Stripe links: {len(stripe)}")
    for f in failures:
        print("FAIL", f)
    print("OK" if not failures else f"{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
