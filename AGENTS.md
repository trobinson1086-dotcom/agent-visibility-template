# AGENTS.md — Agent Visibility Template

Notes for AI agents working on this template.

## What this template is

One enriched content store (`Resource[]`) projected onto many agent-discovery
surfaces. The data is enriched once by Workers AI and cached in KV; every
surface (`/llms.txt`, `/index.json`, `/<slug>.md`, `/robots.txt`, JSON-LD) is
just a different rendering of that same store.

## Architecture

```
src/
  worker/index.ts        Hono app: routes for every surface + JSON API
  enrichment/index.ts    Workers AI enrichment (raw page -> structured Resource)
  enrichment/surfaces.ts Pure render functions, one per surface
  lib/store.ts           KV-backed enriched store (get / upsert / clear)
  lib/content.ts         Sample content (zero-config demo data)
  lib/types.ts           Shared types (Resource, RawResource, Env, SiteConfig)
  lib/web-bot-auth.ts    OPTIONAL agent-identity module (off by default)
  fulfillment/           Stripe → Lulu books and Stripe → Printful merch (FULFILLMENT_MODE, off by default)
  react-app/             Surface-explorer UI (served at /explorer)
public/                  The live squishman.com site, served as static assets
scripts/                 import-drive-assets.sh: pulls covers/video from Drive export
test/index.test.ts       Worker tests (vitest-pool-workers, via SELF.fetch)
```

## Conventions

- **`public/` is the live squishman.com site.** Keep it identical to the
  "Squish live website" Drive folder; don't route it through Vite. The
  explorer entry is `explorer.html` (Vite's only HTML input).

- **`surfaces.ts` is pure.** Render functions take `RenderCtx` and return
  strings/objects. No I/O. This keeps surfaces easy to test and add to.
- **Enrichment must never hard-fail.** `enrichResource` falls back to
  `fallbackEnrichment` on any model/parse error so surfaces always render.
- **Keep readability and identity separate.** Web Bot Auth is about _who_ an
  agent is, not _what_ it can read. It lives in its own module and is gated by
  `ENABLE_WEB_BOT_AUTH`. Don't wire it into the core surfaces.

## Lulu fulfillment

`POST /api/stripe/webhook` (signed) → re-reads the Checkout Session from Stripe
→ physical, mapped catalog items only → one D1 row per session (idempotent)
→ Lulu quote + print job. Status/tracking arrive via `POST /api/lulu/webhook`
and the hourly cron. Admin routes live under `/api/admin/*` (ADMIN_TOKEN).

- `fulfillment/catalog.data.ts` maps every Stripe price. Physical items stay
  `FULFILLMENT_MAPPING_REQUIRED` until the owner confirms Lulu specs; never
  infer a `pod_package_id` from a title. Print PDF URLs live in the
  `LULU_PRINT_FILES` secret, not in source.
- `FULFILLMENT_MODE`: `off` records orders only; `sandbox` sends only Stripe
  test-mode orders to Lulu's sandbox; `production` sends only live orders for
  products with `productionEnabled`.
- Schema changes go in `migrations/` (applied to tests automatically).

## eBook delivery

The eBook payment links redirect to `GET /api/ebook-download?session_id=…`,
which re-reads the Checkout Session from Stripe and, only if it is paid, shows
Drive links for the `EN-EBOOK-N` items bought (`fulfillment/ebooks.ts`, files in
the "Squishman Books 1-5 Published" Drive folder). Audiobooks are paused
("Coming soon") until recordings exist.

## Squish Squad Membership

Three tiers, each a monthly or yearly Stripe subscription sold through a
Payment Link (prices and links in `fulfillment/squad.ts`):

| Tier | Price | Stripe product |
|---|---|---|
| Squish Squad Pal | $4.99/mo or $49/yr | `prod_VYAPqBiyvkZhBT` (the original membership) |
| Squish Squad Hero | $9.99/mo or $99/yr | `prod_VYM54gTY7DODed` |
| Platinum Crown | $19.99/mo or $199/yr | `prod_VYM5ij3gUcugRI` |

The links collect the child's first name (twice) and birthday month plus a US
shipping address, and redirect to `GET /api/squad/welcome?session_id=…`
(tier perks, eBooks, printable member card; Platinum also picks the child's
tee size there, `POST /api/squad/shirt-size`). The Stripe webhook records
members in KV (`squad:member:*`, with `tier`; records without one are Pal);
`GET /api/admin/squad/members` lists them with tier, birthday gift and date.
Only a parent's input of the child's first name and birth month is stored.

Phase 2 perks (`fulfillment/squad-perks.ts`) only go to members whose Stripe
subscription is `active`/`trialing`; each is idempotent via KV markers.

- **Order refunds** (`SQUAD_SHIPPING_REFUNDS=on`, `squad:refund:<session>`),
  by the best active tier on the order's email (`squad:email:*` index): Pal
  gets up to $5.99 book shipping on $25+ book orders; Hero book shipping on
  every book order plus 10% back on books and merch; Platinum shipping on
  books and merch plus 20% back.
- **Birthday gifts** (`squad:poster:<id>:<year>`), two weeks before the 1st of
  the birthday month: Pal gets the printable poster by email (Pal members who
  joined before `TIERS_LAUNCHED_AT` keep the printed poster); Hero a printed
  8×10 poster; Platinum a box (poster + name tee + sticker). Mailed gifts need
  yearly, or 3 months of monthly. The box waits for the tee size.
- **Squish Mail** (`squad:mail:<id>:<quarter>`): Platinum members get a 5.5″
  Squish Man sticker every 3 months (`GET /api/admin/squad/mail`).
- **eBooks**: Pal Book 1; Hero 2 more every 6 months; Platinum all.
- **How gifts are made** (`SQUAD_POSTERS`: `off` | `draft` | `on`): the daily
  job (hourly cron, once per UTC day after 14:00) renders "Happy Birthday,
  <name>!" poster art and the Platinum name-tee art (`squad-poster.ts`,
  resvg-wasm + embedded Fredoka font) into KV, serves them at
  `/api/squad/poster-art/<token>.png` and creates the Printful order (poster
  variant 4463; tee 3001Y white; sticker 10165). Unconfirmed name spellings
  are HELD until `POST /api/admin/squad/members/:id/confirm-name`. Same
  `FULFILLMENT_MODE` gate as merch; test-mode and `draft` orders are Printful
  drafts.
- **Squish Squad Packs**: built-in packs live in `fulfillment/squad-packs.ts`
  (files in `public/assets/squad-packs/YYYY-MM/`); `PUT /api/admin/squad/packs/YYYY-MM` stores one that overrides it;
  once `published`, the daily job emails it once to each active member.

### Monthly pack rules (owner's standing instructions)

- **Exactly 7 printable pages per month**, in one US Letter PDF
  (`public/assets/squad-packs/YYYY-MM/squish-squad-pack-<month>-<year>.pdf`).
- **Use only the owner's own illustrations and pages from the Squish Man
  Google Drive folders** (e.g. "Squish Coloring books", "Squish Bonus
  Activities pages", "Squishman Learning Books 1-5", "Squish Man Book Series",
  "Squishman Illustration Spread", "Squishman stickers"). Don't use stock or
  generated art; when a page needs layout (title, maze, writing lines), build
  it around Drive illustrations.
- Theme each pack to its month, and pick pages that weren't in an earlier
  pack. Email header and wallpapers also come from Drive illustrations.
- Packs are due in source and merged by about the 28th of the month before
  (the daily job sends them on the 1st).
- **Tier bonus pages**: a pack's `bonus.hero` pages go to Hero and Platinum
  members, `bonus.platinum` pages to Platinum only (in the same email). Bonus
  PDFs come from the Drive folders "Squishman subscription membership tier 2
  (Hero)" and "… tier 3 (Platinum)" (3 pages each). Bonus pages added after
  the 1st go out in one follow-up email (`squad:pack-bonus-sent:*`). Test any
  tier's email with `POST /api/admin/squad/packs/YYYY-MM/test` `{"to", "tier"}`.

## Email (Resend)

`fulfillment/email.ts` sends from squishman.com through Resend (secret
`RESEND_API_KEY`; without it emails are skipped, never failed). Every send has
a KV marker (`email:sent:<key>`) so redeliveries never email twice. Emails:
order confirmation (with the eBook download link), Squish Squad welcome,
birthday poster on its way, and the monthly pack.

## Printful merch (Squish Squad Shop)

`GET /api/merch` gives the shop page its prices, sizes, colors and checkout
state. `POST /api/merch/checkout` (when `MERCH_CHECKOUT` is `preview` or `on`;
`preview` shows the buy buttons only at `/?shop=preview`) creates a
Stripe Checkout Session for one T-shirt/hoodie/long-sleeve/tote/mug/sticker/poster/puzzle/bottle/pillow/color-pillow/lumbar/hat/full-color-cap/kids-tee/kids-hoodie/kids-long-sleeve/blanket/socks/backpack/drawstring-bag/notebook/kids-leggings/baby-one-piece/beanie/kids-sweatshirt/toddler-tee/sweatshirt/ornament choice with the SKU in
`metadata.merch_sku`. The shared Stripe webhook hands those sessions to
`fulfillment/merch-service.ts` → one D1 row (`provider = 'printful'`) →
Printful order, under the same `FULFILLMENT_MODE` gate as Lulu.

- `fulfillment/merch.ts` holds the approved colors, sizes, five designs per
  product (full, Squish Man & Pudy only, crown logo only, Maple Hollow logo
  only, Maple Hollow front + crown back) with their prices, shipping,
  Printful variant ids and artwork file ids. Never add a color or product
  without a confirmed Printful variant id.
- Stickers and posters use the Maple Hollow scene art; posters center it on
  each size's print area with `positionBySize`. Puzzles use full-scene book
  art that fills (and is cropped to) each puzzle size.
- Color pillows print the art on a solid color, so each color has its own
  files (`fileIdByColor`, sources in `public/assets/merch/print/pillows/`).
- Printful has no sandbox: test-mode orders, and live orders for products
  without `productionEnabled`, are created as Printful **drafts** (nothing is
  charged or printed until confirmed in the Printful dashboard).

## Adding a surface

1. Add a pure renderer to `src/enrichment/surfaces.ts`.
2. Add a route in `src/worker/index.ts` (send the `Content-Signal` header for
   text/JSON surfaces; add `cors()` if agents fetch it cross-origin).
3. Add it to the `/api/site` `surfaces` list so the UI shows it.
4. Add a test in `test/index.test.ts`.

## Validating changes

```bash
npm run build   # tsc -b && vite build
npm test        # vitest (hits live Workers AI — needs credentials)
```

After editing `wrangler.jsonc`, rerun `npx wrangler types`.

## Deployment

Cloudflare Workers Builds deploys this repo to the `agent-visibility-template`
Worker, which serves squishman.com. Only `main` goes live (`npm run deploy`);
other branches run `npx wrangler versions upload`, which uploads a version
without changing the live site. Merge to `main` to publish.
