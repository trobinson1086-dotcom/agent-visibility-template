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

## Printful merch (Squish Squad Shop)

`GET /api/merch` gives the shop page its prices, sizes, colors and checkout
state. `POST /api/merch/checkout` (when `MERCH_CHECKOUT` is `preview` or `on`;
`preview` shows the buy buttons only at `/?shop=preview`) creates a
Stripe Checkout Session for one T-shirt/hoodie/long-sleeve/tote/mug/sticker/poster/puzzle/bottle choice with the SKU in
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
