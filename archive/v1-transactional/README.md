# Archive — Frontage v1 (transactional marketplace)

Nothing in this folder is loaded by the running app. `server.js` never
imports from `archive/`, and the static file server only serves `public/`,
so none of it is reachable from the web.

## What this is

Before the September 2026 pivot, Frontage was a full transactional
marketplace:

- Stripe checkout: a single booking, or a multi-site "media plan" cart
- Lease contracts with e-signatures, GST tax invoices, auto-renew and
  tiered cancellation fees
- Held payouts released via Stripe Connect once an install was confirmed
- A separate contractor portal: applications with insurance documents,
  job pings, quotes, artwork approval, install scheduling
- A sales-rep ("BDR") tool that pre-built listings and sent the owner a
  claim link
- A 3-phase campaign flight calendar and structured site specifications
  (audience, surface, illumination, access, permits)

v2 is a classifieds site instead: people list advertising space, buyers
message sellers, and every deal happens off-platform. All of the above was
retired, not deleted.

## Layout

The files mirror their original paths.

- **Moved here whole:** they no longer exist in the live app. Examples:
  `lib/payments.js`, `lib/flightCalendar.js`, `lib/cancellation.js`,
  `lib/listingSpecs.js`, `lib/legal.js`, `lib/ads.js`, the old `migrate-*`,
  seed and lease-reminder scripts, `data/seed.json`,
  `public/wall-visualizer.js`, and the old `docs/DEPLOYMENT.md` and `docs/README-v1.md`.
- **Snapshots of files that live on in v2 but were rewritten:** examples
  are `server.js`, `routes/pages.js`, `routes/api.js`, `lib/db.js`,
  `lib/layout.js` and `lib/email.js`. These are the exact v1 versions and
  contain the contractor, booking, cart and payout pages and handlers.
- `scripts/schema-v1.sql`: the full v1 database schema.

The v1 data itself (users, listings, contact messages) is preserved in the
original Neon database (branch `main`), which v2 no longer writes to.

## Restoring v1

The complete, runnable v1 is tagged in git. Check it out rather than
copying files back one by one:

```bash
git checkout v1-transactional-final
```

The branch `archive/v1-transactional` points at the same commit.
