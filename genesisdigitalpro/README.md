# GenesisDigitalPro.com

Production build of the Genesis Digital Pro storefront, deployed as a Cloudflare
Pages project (`genesisdigitalpro`): static pages from `dist/` plus Pages
Functions from `functions/`.

```
source/               Master build, unchanged (from the "Genesis website" Drive folder,
                      the extracted GenesisDigitalPro_All_Missing_Covers_Complete.zip)
source-extra-covers/  Exact Drive originals for covers the build hot-linked but did not package
catalog.py            Book catalog parsed from the build's own pages (titles, prices, Stripe links)
build.py              source/ -> dist/
qa.py                 Static QA over dist/ (links, images, encoding, Stripe test links, size limits)
functions/api/        Pages Functions: free-page (Resend), create-checkout-session, stripe-webhook
```

## Build, check, deploy

```bash
python3 build.py
python3 qa.py
npx wrangler pages deploy        # project "genesisdigitalpro", output dir dist/
```

Server-side secrets are set in Cloudflare (Pages → genesisdigitalpro → Settings →
Variables and Secrets), never in this repo:

| Name | Used by |
| --- | --- |
| `RESEND_API_KEY` | `/api/free-page` (Resend `sample.requested` event) |
| `SAMPLE_URL_SQUISH_MAN`, `SAMPLE_URL_MESSIAH`, `SAMPLE_URL_RUBEN`, `SAMPLE_URL_CHAMPAGNE_HEARTS`, `SAMPLE_URL_UPTOWN_TESTIMONY`, `SAMPLE_URL_RIZZMEISTER` | `/api/free-page`. One approved, real interior page per series; a series without one is refused, never substituted |
| `STRIPE_SECRET_KEY` | `/api/create-checkout-session` |
| `STRIPE_WEBHOOK_SECRET` | `/api/stripe-webhook` |

## What the build changes

- **Covers**: every embedded (base64) cover and every `drive.google.com/thumbnail`
  hot-link is replaced by the packaged file, matched byte-for-byte by SHA-256.
  Files are copied unchanged; nothing is resized, re-encoded or redrawn.
- **Product pages** (`/books/<slug>.html`, one per title): the exact cover in front,
  the same file blurred and darkened behind the whole page. Formats, prices and
  Stripe links come only from the build. Titles with no live link show
  "Coming soon". Look Inside and About the Book are omitted because the build has
  no interior pages or book descriptions.
- **Storefront fixes**: doctype moved to the top of the pages that started with
  `<style>` (they rendered in quirks mode); the "Stripe test checkout — no live
  charge" notice removed; "LIVE BUY LINK PENDING" buttons replaced with links to
  the product pages, or "Coming soon" where no live link exists; Squish Man Books 2
  and 3 added to the Children's Store and Shop; the cart's "Buy this item" now
  opens that item's own Stripe link instead of collections.html.
- **Not published**: build notes (`*.txt` other than robots.txt), `package.json`,
  and the Node `api/` fallbacks stay out of the web root.
- **Headers**: HSTS added; asset `Cache-Control` no longer merges with the
  site-wide value. The `/ /index.html 200` redirect was dropped because Pages
  rejects it as an infinite loop.

## Decisions

- Ruben Book 2: the children's page hot-linked Drive file
  `1Vxn_-g5HNLdW7UmF4Tm4oyJn2cmHIw9v`, which is different artwork from the packaged
  `ruben-book2.png`. The packaged cover was approved and is used everywhere; the
  Drive version is kept in `source-extra-covers/` and compared in `review/`.
- Spanish Activity & Learning editions, Books 3–5: the master build showed the
  English covers. The owner supplied the Spanish covers (Libro 3, 4, 5), copied
  unchanged into `source-extra-covers/squish-man-spanish-book{3,4,5}.*`.

## Open items

- `collections.html` in the master build is 90 MB and could not be retrieved
  (the Drive connector caps downloads at 10 MB). `build.py` generates a
  collections page from the packaged covers and the catalog in its place; it is
  replaced automatically if the original is added to `source/`.
- No Stripe Price IDs exist in the build, so the combined multi-book checkout stays
  hidden; each format sells through its existing live Payment Link.
- Ruben Books 1–5, Champagne Hearts Book 3, Rizzmeister Books 2–3, AI for Small
  Business 2026 and GoHighLevel AI for Beginners have covers but no live Stripe
  links in the build.
