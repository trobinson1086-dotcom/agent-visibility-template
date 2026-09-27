# Deployments and rollback references

Production is the Worker **`agent-visibility-template`** (Custom Domain
`squishman.com`), account `a96b255849089be5527f00e922520b71`.
`wrangler.jsonc` uses that name, so `npx wrangler deploy` targets production.

## Versions

| Version | ID | Source | State |
|---|---|---|---|
| 24+ | see `npx wrangler deployments list --name agent-visibility-template` | `087858d` and later (Maple Hollow homepage theme + banner logo) | Live after the 2026-09-27 theme push |
| 23 | `aa123613-984b-422a-a2c1-5110122e994f` | `8c766eb` (v20 code + R2 media, TTL 86400, URL-safe covers) | **Rollback point** for the theme/logo release; verified in production 2026-09-27 |
| 22 | `25bd9d18-9b79-4cb9-9df7-01c781f983f0` | `ba05295` (R2 media on pre-v20 code, TTL 3600, old cover filenames) | Superseded; do not roll back to it |
| 21 | `85971ac4-646e-4a60-a813-fa0b680be4bb` | API upload, `keep_assets` | **Never deploy.** Kept the old asset routing, so video still bypasses the Worker |
| 20 | `9293156f-9d24-496f-af1c-ca7ef85d2646` | `a145fbd` (branch `claude/dazzling-turing-buq5uh`) | Last version before R2 media; video returns 200 to Range requests |

**Pushing `claude/bold-lovelace-bw43jk` deploys to production** about 40 seconds
later (observed for `ba05295` → v22 and `8c766eb` → v23). Treat a push to this
branch as a production deploy.

## Rollback

Each version keeps its own static assets, so a rollback restores code,
config and site files together.

```bash
# Back to v23 (before the Maple Hollow theme + logo)
npx wrangler rollback aa123613-984b-422a-a2c1-5110122e994f --name agent-visibility-template -m "rollback to v23"

# Back to v20 (loses 206 range support for the video)
npx wrangler rollback 9293156f-9d24-496f-af1c-ca7ef85d2646 --name agent-visibility-template -m "rollback to v20"
```

## Media

- R2 bucket `squishman-media`, object
  `assets/media/Squish_Man_Final_Website_Video.mp4` (22,353,248 bytes,
  SHA-256 `7add83d6…bf8e`, uploaded unmodified, `video/mp4`).
- `/assets/media/*` must stay in `assets.run_worker_first`; otherwise static
  assets answer first and ignore `Range` (full 200, no 206).
- `squishman-media` (`wrangler.media.jsonc`) is a standalone route Worker
  deployed to workers.dev only. It isn't attached to any route and isn't
  needed while the main Worker serves `/assets/media/*`.
