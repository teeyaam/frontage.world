# Frontage — orientation for a new Claude Code session

Read this first, then README.md.

## What Frontage is (v2, from September 2026)

A **classifieds marketplace for advertising space**, like Facebook
Marketplace: listings plus messaging only, with every deal done
off-platform. No payments, bookings or contractors on the platform — that
v1 transactional product is archived in `archive/v1-transactional/` (tag
`v1-transactional-final`, branch `archive/v1-transactional`). Never import
from `archive/`.

One account type: any user can both list space and message sellers.

## Production (live since 27 September 2026)

- https://frontage.world (www redirects) → Render web service `frontage-v2`
  (Singapore, Starter plan), deploying from **`main`** on every push.
  `npm start` applies `scripts/schema.sql` before starting.
- Database: Render Postgres `frontage-db` (Singapore). Local `.env` holds
  its external URL as `PRODUCTION_DATABASE_URL`; target it explicitly
  (`DATABASE_URL=$PRODUCTION_DATABASE_URL node scripts/...`) — never by
  default.
- Photos: Cloudflare R2 bucket `frontage-media`, served at
  https://media.frontage.world. DNS for frontage.world is on Cloudflare
  (CNAMEs to `frontage-v2.onrender.com`, DNS only).
- Admins: teeyaam@gmail.com (U-1009) and frontage.world@gmail.com (U-1011).
- The old v1 service (`frontage.world` in Virginia) has no domain and
  auto-deploy is off; the v1 data stays in Neon (`production` branch).

## Working rules from the owner

- Work in `C:\dev\frontage-app` (the OneDrive copy is not the repo).
- Develop locally against `localhost:3000` and only `git push` when the owner
  explicitly says "push". Pushing `main` auto-deploys to frontage.world
  (Render).
- Local `.env` must point at a **development** database (Neon dev branch),
  never production. Check the host before running any script that writes.
- Never print secret values from `.env`, or password hashes.

## Architecture

Plain Node.js, no framework, no build step. See README.md for the table.
Every integration (R2, Resend, Google Maps browser/server keys, GA4/Pixel,
passcode) is **env-gated**: fully off when its variables are unset. Keep that
invariant.

- `scripts/schema.sql` is the schema source of truth; it's idempotent and runs
  on every `npm start`. For a column change on an existing database, add an
  idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to schema.sql, and
  run `scripts/check-schema-parity.mjs`.
- All SQL lives in `lib/db.js` (snake_case columns ↔ camelCase objects).
- Two Google keys: `GOOGLE_MAPS_API_KEY` (browser, referrer-restricted) and
  `GOOGLE_MAPS_SERVER_KEY` (Geocoding only, never rendered).
- Location privacy: the public sees `publicCoords()` / `publicLocationLine()`
  unless the seller ticked "show exact location". Never send raw lat/lng of
  a non-exact listing to the browser.
- Message bodies are rendered with `textContent` in `public/chat.js`; every
  server-rendered value goes through `escapeHtml`.

## Known environment quirks (this machine)

- Windows; PowerShell primary, Git Bash also available — use the right syntax.
- No local Postgres. For throwaway local testing, PGlite
  (`@electric-sql/pglite-socket`) in the session scratchpad works as a real
  Postgres server on a spare port.
- The `Claude_Browser` preview is embedded Chromium; it can't reach some
  hosts (e.g. R2's storage endpoint) that production can.
- If a configured feature behaves as if its key is wrong, first check that
  the value saved in Render's dashboard isn't a masked placeholder (`•••`).
