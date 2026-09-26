# Frontage

A classifieds marketplace for advertising space: people list walls, fences,
windows, billboards, screens and vehicles for free, and advertisers message
them directly. **Every deal happens off-platform** — Frontage hosts listings
and messages only, and never handles payments.

Live at https://frontage.world. The previous transactional version (Stripe
checkout, leases, contractor portal) is archived in
[`archive/v1-transactional/`](archive/v1-transactional/README.md) and tagged
`v1-transactional-final`.

## Stack

Plain Node.js (`http.createServer` + a hand-written router in `server.js`),
no framework, no build step. Server-rendered HTML from template strings, with
small progressive-enhancement scripts in `public/`.

| Concern | What | Where |
|---|---|---|
| Database | Postgres | `lib/db.js` (all SQL), `scripts/schema.sql` (source of truth) |
| Photos | Cloudflare R2 (S3 API), local disk fallback | `lib/upload.js` |
| Email | Resend | `lib/email.js` |
| Maps | Google Maps JS + Places (New) + Maps Embed; Leaflet/OSM fallback | `lib/maps.js`, `public/browse.js`, `public/listing-form.js` |
| Geocoding | Google Geocoding (server key), OSM Nominatim fallback | `lib/geo.js` |
| Analytics | GA4 + Meta Pixel after cookie consent | `lib/analytics.js`, `public/client.js` |

Every integration is env-gated: unset its variables and it switches off
cleanly (see `.env.example`).

## Running locally

```bash
npm install
cp .env.example .env    # then fill in DATABASE_URL (a Neon *dev* branch — never production)
npm run schema          # creates tables (idempotent)
npm run dev             # http://localhost:3000
```

`npm start` (used by Render) applies the schema, then starts the server.

## How it works

- **Listings** (`/sell/new`, `/sell/edit/:id`): photos (1–10, resized in the
  browser), title, free-form price + price details, type of space,
  description, address (Google autocomplete), optional size and YouTube
  link. Unless the seller opts in, the public only sees the suburb and an
  approximate map area (`lib/geo.js#publicCoords`).
- **Messaging** (`routes/messages.js`): one conversation per listing +
  buyer, one inbox labelled by listing title, per-conversation unread state,
  "Seen" receipts, polling (no websockets). Email alerts are throttled to one
  per unread streak. Spam limits live in `lib/rateLimit.js`.
- **Moderation**: Report links on listings and conversations feed
  `/admin/reports`; moderators can remove listings (the seller is emailed),
  suspend users, and see reported conversations. Staff permissions:
  `/admin/staff`.
- **Security**: hashed passwords and session tokens, same-origin check on
  every POST, rate-limited auth forms, `safeNext` against open redirects,
  security headers, body size caps.

## Scripts

| Script | What it does |
|---|---|
| `scripts/run-schema.mjs` | Applies `scripts/schema.sql` (idempotent) |
| `scripts/check-schema-parity.mjs` | Confirms a database's columns exactly match `schema.sql` |
| `scripts/smoke.mjs` | Read-only smoke test of a running site (`BASE_URL=...`) |
| `scripts/check-storage.mjs` | Uploads, fetches and deletes a test file in R2 |
| `scripts/bootstrap-owner.mjs` | Copies one account from the v1 DB into a v2 DB as super-admin (dry run unless `--apply`) |
| `scripts/purge-nonowner-data.mjs` | Deletes all test data except the owner's account (dry run unless `--apply`) |
| `scripts/reset-dev-db.mjs` | Wipes a **dev** DB and applies the schema (needs `CONFIRM_RESET_DB_HOST`) |

## Layout

```
server.js                routing, static files, security headers, redirects for retired v1 URLs, robots/sitemap
routes/pages.js          browse, listing page, listing form, auth pages, account, content + legal pages, admin
routes/messages.js       inbox, conversation page, sending, reporting a conversation
routes/api.js            auth, listings, account, contact, reports, moderation actions
lib/                     db, auth, geo, maps, upload, email, rateLimit, listingInput, youtube, legal, pricingGuide, ...
public/                  style.css, client.js (shared), browse.js, listing.js, listing-form.js, chat.js
scripts/                 schema + operational scripts (above)
archive/v1-transactional the retired transactional product (not loaded)
```
