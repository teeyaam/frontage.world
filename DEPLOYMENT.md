# Deploying Frontage for real

Steps 1–4 below are now implemented in code (Postgres, S3/R2 uploads, real
Stripe payments) — this guide is the configuration path from "code is
ready" to "live for real customers," in the order you'd actually do it.
Steps 5–7 are still genuinely ahead of you.

Each step names the exact file in this repo involved, so you can tell the
difference between "flip a config value" and "code that already exists."

---

## Step 0 — Decide your stack (recommended, not the only option)

| Piece | Recommendation | Why |
|---|---|---|
| App hosting | [Render](https://render.com) or [Railway](https://railway.app) | Both deploy a plain Node app straight from a git push, with zero-downtime deploys and free TLS. Cheaper/simpler than standing up your own VM + nginx + certbot for a first launch. |
| Database | Managed Postgres (Render/Railway both offer one) | `lib/db.js` already talks to Postgres — you just need a real instance and its connection string. |
| File storage | Cloudflare R2 or AWS S3 | `lib/upload.js` already supports either (they're both S3-API-compatible) — you just need a bucket and its credentials. |
| Payments | Stripe (Connect Express for payouts) | `lib/payments.js` already makes real Stripe calls — you just need an account and API keys. |
| Domain + HTTPS | Any registrar + your host's automatic TLS | Required — the camera/gyroscope wall-visualizer feature refuses to run at all without HTTPS (browsers block camera access on insecure origins). |

---

## Step 1 — Postgres

**Already implemented** — `lib/db.js` runs entirely on Postgres now (no more
JSON file), `scripts/schema.sql` has the table definitions, and
`scripts/seed-db.mjs` loads `data/seed.json`'s demo data into a fresh
database. To go live:

1. Provision a Postgres database on your host (Render's free tier is fine
   to start).
2. Set `DATABASE_URL` to its connection string (see `.env.example`).
3. Apply the schema: `psql "$DATABASE_URL" -f scripts/schema.sql`
4. Optionally load demo data: `node scripts/seed-db.mjs` — skip this for a
   real production launch (see Step 7 on the seeded accounts) and instead
   let real signups populate the tables.

Every route in `routes/pages.js` and `routes/api.js` only ever calls
exported functions from `lib/db.js` — nothing else touches the database
directly, so this stayed a contained change.

---

## Step 2 — File uploads (S3 / R2)

**Already implemented** — `lib/upload.js` uses `multer-s3` when S3 env vars
are set, falling back to local disk only when they're not (useful for a
quick local test, not for real hosting — most hosts' local disk doesn't
persist across deploys). To go live:

1. Create an S3-compatible bucket (Cloudflare R2 is cheaper than S3 for this
   traffic pattern and has no egress fees; AWS S3 works identically).
2. Set `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
   `S3_ENDPOINT`, and `S3_PUBLIC_BASE_URL` (see `.env.example`).
3. Make the bucket's `listings/` prefix publicly readable (R2: enable the
   bucket's public access or map a custom domain to it) — that's what
   `S3_PUBLIC_BASE_URL` should point at. Leave `contractor-docs/` private;
   it's only ever served via the short-lived signed URLs
   `lib/upload.js#getContractorDocUrl` generates on demand.

---

## Step 3 — Environment variables and secrets

Nothing in this repo should ever hold real secrets. `.env.example` at the
repo root documents every variable the app reads — copy it to `.env` for
local development (already gitignored) and set the same values as real
environment variables in your host's dashboard for production:

- `DATABASE_URL` (Step 1)
- `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_PUBLIC_BASE_URL` (Step 2)
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` (Step 4)
- `SESSION_SECRET` — a long random string, generated per `.env.example`'s
  instructions
- `NODE_ENV=production`

Also rotate the password hashes in `data/seed.json` — the shipped demo
accounts (`marco@…`, `jordan@…`, `alex@…`, `admin@…`) all share the same
hash for `password123`. Don't run `scripts/seed-db.mjs` against a real
production database; see Step 7 for bootstrapping a real admin instead.

---

## Step 4 — Stripe payments

**Already implemented** — `lib/payments.js` makes real Stripe API calls
whenever `STRIPE_SECRET_KEY` is set (falling back to an always-succeeds
stub when it's not, so the app stays testable before you're ready). The
buyer-payment flow is an embedded Stripe Elements card field on `bookPage`
(no redirect off Frontage) backed by `POST /api/bookings/create-intent`;
`createBookingHandler` re-verifies the PaymentIntent with Stripe itself
before ever creating a booking. `POST /api/stripe/webhook` is a safety net
that finalizes a booking from Stripe's own event if the client round-trip
never completes. Seller payouts go out via Stripe Connect Express
(`POST /api/account/connect-payouts` on the Account page) once a job order
reaches `installed`, same trigger point as before. To go live:

1. Create a Stripe account (or use your existing one) and grab its API
   keys — use **test-mode** keys (`sk_test_...` / `pk_test_...`) while you
   verify everything end-to-end, switch to live keys only once you're ready
   to take real payments.
2. Set `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`.
3. Register a webhook endpoint in the Stripe dashboard pointed at
   `https://yourdomain.com/api/stripe/webhook`, subscribed to at least
   `payment_intent.succeeded`. Set `STRIPE_WEBHOOK_SECRET` to the signing
   secret it gives you. For local testing before you have a real domain,
   use the [Stripe CLI](https://stripe.com/docs/stripe-cli):
   `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
4. Enable **Connect** (Express accounts) in the Stripe dashboard so sellers
   can complete payout onboarding from `/account`.
5. Test with Stripe's test card `4242 4242 4242 4242`, any future expiry,
   any CVC — that's what the embedded card field expects while
   `STRIPE_SECRET_KEY` is a test-mode key.

---

## Step 5 — Domain, HTTPS, and the camera features

1. Point your domain's DNS at your host (Render/Railway both document this).
2. Enable automatic TLS (both hosts do this for free with a custom domain).
3. Once live on HTTPS, re-test the wall-visualizer (`public/wall-visualizer.js`)
   and the map (`public/map.js`) on an actual phone — camera and device-tilt
   access only work over HTTPS or `localhost`, so this is the first point
   they can be properly tested off a development machine.

---

## Step 6 — Harden before real money moves

- **Input validation** — the current forms trust whatever the browser
  sends. Add server-side validation (length limits, format checks) on every
  `routes/api.js` handler before this touches real users.
- **Rate limiting** — especially on `/api/auth/login` and
  `/api/contractor-auth/login`, to slow down credential-stuffing attempts.
- **CSRF protection** — every state-changing form in this app is a plain
  POST with a session cookie and no CSRF token today.
- **Replace the staff-permission stand-in** — `lib/permissions.js` is
  boolean flags on a user record with no audit trail. Before a real
  customer-service team uses `/admin/deals`, add logging of who
  viewed/removed what.
- **Backups** — set up automated daily backups on your Postgres instance
  (Step 1) before real bookings/payments live there.

---

## Step 7 — Bootstrap your first real admin

Don't ship the seeded `admin@frontage.app` account. Instead:

1. Deploy with an empty `users` table (skip `scripts/seed-db.mjs`, or seed
   only real accounts you control).
2. Insert one real admin row directly in the database (via your host's SQL
   console) with `is_admin = true` and a password you set yourself.
3. Log in as that account, immediately visit `/admin/staff`, and use it to
   grant the specific department permissions (`canApproveContractors`,
   `canAccessSupport`, `canCreateBdrListings`) to your actual team members'
   accounts — each of them should sign up normally first, then get flagged.

---

## Monitoring, once live

At minimum, wire up:
- Uptime monitoring (a free tier of UptimeRobot or your host's built-in
  health checks) pointed at `/`.
- Error logging — the app currently only `console.error`s
  (`server.js`'s `serverError`); pipe that to a real log aggregator
  (your host's log stream is enough to start) so a 500 doesn't disappear
  silently.
- Stripe's own dashboard for payment/payout failures (Step 4) — that's your
  earliest signal that something in the money flow broke.
