# Frontage — working app

This is a real, running version of Frontage — not a mockup. It's a Node.js
process with a minimal dependency footprint — just **multer**, for handling
file uploads (listing photos, contractor insurance/registration documents).
Everything else uses Node's built-in `http`, `fs`, and `crypto` modules.

## Run it

```
npm install
node server.js
```

Then open **http://localhost:3000**. No build step.

Data is stored in `data/db.json`, a plain JSON file that's created from
`data/seed.json` the first time you run the server. Delete `data/db.json` (or
copy `seed.json` over it) to reset to the seeded demo state. Uploaded files
live under `public/uploads/listings/` (listing photos, public) and
`data/uploads/contractor-docs/` (insurance/registration documents, private —
served only through an authenticated download route).

## Demo accounts

Password for all of them: `password123`

| Email | Role |
|---|---|
| `marco@castlehillbjj.com.au` | Seller (Castle Hill BJJ Academy) — log in at `/onboarding` |
| `jordan@openhouserealty.com.au` | Buyer (OpenHouse Realty) — log in at `/onboarding` |
| `alex@thesigndepot.com.au` | Contractor (The Sign Depot, pre-approved) — log in at **`/contractor/login`**, a separate portal |
| `admin@frontage.app` | Super-admin — log in at `/onboarding`, then visit `/admin/staff` |

Or sign up as a brand-new buyer/seller at `/onboarding` — one universal
signup, no role to pick. You become a seller the moment you list a space and
a buyer the moment you book one.

**Contractors are a fully separate account system**, not a role on the
buyer/seller account — separate signup (`/contractor/signup`), separate
login (`/contractor/login`), separate session cookie, own `contractors`
collection in the datastore. A buyer/seller account can never become a
contractor and vice versa. After signing up, a contractor applies for
approval at `/contractor/apply` before job orders become visible.

**The Staff area has no button or link anywhere in the main app nav.** The
only way in is a small, low-contrast "Staff" link in the footer (next to
About/Contact/How it works) pointing at `/admin/staff` — intentionally easy
to miss unless you're looking for it. Once logged in with any department
permission, every admin page shows a small sub-nav strip linking to whatever
other admin sections that account can reach.

The super-admin can grant three separate department permissions to any
account from `/admin/staff` (or create a new staff account directly there):
`canApproveContractors` (contractor department — application review +
contractor support inbox at `/admin/contractor-applications`),
`canAccessSupport` (customer service — all deals, chat logs, and general
contact messages at `/admin/deals`), and `canCreateBdrListings` (business
development — pre-built listings with a claim link at `/sell/bdr-new`).

## What's real here

- **Real auth** — password hashing (scrypt) + signed session cookies, no third-party auth service.
- **Real shared state across all three sides of the marketplace** — a booking a buyer makes shows up as a broadcast job order a contractor can claim on `/contractor/ping` (their own separate portal), and accepting it there actually makes it appear on `/contractor/board` and on the seller's job orders at `/seller/jobs`. One real database behind every page, even though buyers/sellers and contractors are two separate identity spaces.
- **Real business rules from the decisions made during design**: 15% platform fee deducted from the seller's payout, computed on every booking; the lease clock (`booking.leaseStartDate`) only starts the moment a contractor marks a job `installed`, not on signing; the one-month break-lease fee is stated in the lease terms text; the estimated contractor cost shown to a buyer before they pay (`estimateJobFee`) is the exact same number the resulting job order is created with.
- **Contextual onboarding** — business/payout details are only collected the first time a user actually lists a space; card details only the first time they book. Browsing needs nothing extra.
- **Contractor vetting** — contractors sign up through their own separate portal, then submit a business number, company registration, and proof of insurance at `/contractor/apply`; an admin approves or rejects the application (against the `contractors` collection, not `users`) before job orders become visible.
- **Listing moderation** — a customer-service account can remove a listing with a required reason from `/admin/listings`; it disappears from browse and its direct URL immediately (same mechanism as an unclaimed BDR draft), and can be restored later. The reason and who removed it are kept on the listing record.
- **Map view** (`/map`) — every live listing pinned on a Leaflet + OpenStreetMap map (no API key or billing account needed), each with a popup linking back to the listing. New listings snap to an approximate suburb center (`lib/geo.js`); a seller can override with manual coordinates.
- **Listing photos** — sellers can upload up to 8 photos per listing; browse cards and the listing detail page use them in place of the schematic diagram when present.
- **Chat** — one thread per job order (seller ↔ contractor, scoped to that job) and one private thread per prospective buyer on a listing (buyer ↔ seller), both polling-refreshed every few seconds — no websockets.
- **My leases dashboard** (`/account/leases`) — every booking a user is party to (as buyer or seller), with time remaining, who signed, a link to the signed contract, and payment/payout summaries. Buyers see renew / end-at-term-end actions once a lease is within 30 days of its end date.
- **Account self-service** — contact info, password, and banking details are all editable from `/account`.
- **Residential category** — homeowners can list spaces too (e.g. a corner-block fence panel or a real-estate-sign-sized board), alongside the original gym/cafe/office/studio/retail categories.
- **Estimated daily "eyes"** — a heuristic impressions estimate (auto-calculated from category + size if the seller leaves it blank) shown as a small gauge on browse cards and listing detail.
- **Camera + gyroscope wall-sizing aid** — "Preview on your wall" on the listing form opens a live camera view with a rectangle overlaid at the entered width:height ratio, plus a device-tilt readout. This is a sizing/leveling aid, **not** real AR measurement. It also only works over HTTPS or `localhost` — browsers refuse camera/orientation access on a plain `http://<lan-ip>` address (e.g. testing from a phone against the dev server), which is a platform restriction, not something the app can work around.
- **Payment escrow** — a buyer's payment is created `payoutStatus: "held"`; the seller's cut (`payoutAmount`, after the 15% fee) only flips to `"released"` the moment the assigned contractor marks the job `installed` (see `releasePayoutForBooking` in `lib/db.js`). This models the real Stripe Connect flow (charge lands with the platform first, a Transfer to the seller follows later) even though the actual money movement is still stubbed in `lib/payments.js`.
- **Granular staff permissions** — a super-admin (`isAdmin`) can grant three separate department flags to any account from `/admin/staff`: contractor-application review, customer-service visibility, and BDR listing creation. Each gates its own area independently — a customer-service account can't approve contractors, and vice versa.
- **Admin customer-service backend** (`/admin/deals`) — every booking on the platform with its contract, payment/payout status, job order stage, and both the job-order and listing-inquiry chat logs, read-only, for handling disputes or questions. General contact-form messages land here too.
- **Contractor support inbox** (`/contractor/support`) — a separate message queue from the general Contact Us form, reviewed by the contractor department (`canApproveContractors`) rather than customer service.
- **BDR pre-built listings** (`/sell/bdr-new`) — a business-development account can create a listing (photos, size, price) for a business that hasn't signed up yet. It's invisible on browse and unreachable by ID until someone opens its one-time secret claim link (`/claim/:token`) and signs up or logs in, which hands them ownership.
- **Unified messages inbox** (`/account/messages`) — every listing-inquiry and job-order conversation a user is party to, in one place, with an unread-count bell in the nav that clears on visiting the inbox.
- **Seller listing insights** (`/sell/insights/:id`) — view count (excluding the owner's own visits), buyer-enquiry count, booking count, and a rough view→booking conversion rate per listing.

## What's stubbed (on purpose, for now)

- **Payments** — `lib/payments.js` exports `charge()` and `payout()` functions that instantly return stub "paid"/"released" results. `lib/db.js` calls them instead of inlining payment logic, so swapping in a real Stripe/PayPal integration should only mean rewriting that one file. See "Roadmap notes" below.
- **Staff permissions** — real per-account toggles now exist (see above), which is a step up from a single `isAdmin` flag, but it's still just booleans on the user record with no audit trail, no scoping, and no way to time-limit access. Fine for a small team; not a real roles/permissions system.
- **Buyer ad-visualization + chat** (the visualization half) — not ported into this app yet (`frontage-buyer-visualize-chat.jsx` mockup only); the chat half now exists for real (see above).
- **Quote approval UI for buyers** — the contractor board has a "simulate buyer acceptance" button standing in for a real buyer-facing "review this quote" screen.
- **Contractor job routing** — any approved contractor can claim any broadcast job order; there's no distance/rating-based routing or multi-contractor race condition handling.
- **Database** — `data/db.json` is a single flat file with a read-modify-write pattern (see `lib/db.js`). Fine for one person clicking around; not safe for concurrent writers. A real deployment needs Postgres (or similar) behind it.
- **Google Business Profile linking** — only a `googleBusinessUrl` field exists today (editable on `/account`, shown as a "View on Google" link on listing pages). No OAuth integration. See "Roadmap notes."

## Project structure

```
server.js                entry point — plain http.createServer + a small manual router
lib/db.js                the datastore — swap this file for a real DB client later
lib/auth.js              password hashing + cookie sessions for BOTH identity spaces (users + contractors)
lib/layout.js            two HTML shells: layout() for the marketplace, contractorLayout() for the separate contractor portal
lib/format.js            money/date/mm formatting, job-fee & eyes-gauge heuristics, lease-date math
lib/body.js              reads urlencoded/JSON POST bodies (multipart goes through lib/upload.js instead)
lib/upload.js            multer configuration for listing photos + contractor documents
lib/payments.js          payment charge/payout seam — stubbed today, see Roadmap notes
lib/permissions.js       staff department permission flags (hasPermission / hasAnyPermission)
lib/categories.js        single source of truth for listing categories
lib/geo.js               suburb → approximate lat/lng lookup for the map tab (no geocoding API)
routes/pages.js          every page — marketplace, the separate contractor portal, admin (staff/contractor apps/deals/listings), BDR/claim, account, leases, messages inbox, chat, marketing, map
routes/api.js            every POST/JSON endpoint the pages call, including the parallel contractor-auth endpoints
public/style.css         the whole design system as CSS variables
public/client.js         small progressive enhancements (flash auto-dismiss, chat polling)
public/wall-visualizer.js  camera + gyroscope wall-sizing aid, loaded only on the listing form
public/map.js            Leaflet + OpenStreetMap rendering for /map, loaded only there
public/uploads/listings  uploaded listing photos (public)
data/uploads/contractor-docs  uploaded contractor documents (private, gated download route)
data/seed.json           starting data — users, a separate contractors collection, listings, empty collections
data/db.json             generated on first run — the actual live data
```

## Roadmap notes

Three product questions came up during review that are answered here rather
than built, since each is either a genuine multi-week integration or needs
credentials/accounts this environment doesn't have.

### Path to a mobile app (iOS/Android)

Two realistic tracks:

1. **Near-term: wrap the existing app in a [Capacitor](https://capacitorjs.com/) shell.** This reuses every current HTML/CSS template as-is — no rewrite — while giving proper native permission handling for the camera and gyroscope APIs the wall-visualizer already depends on (far better than a bare mobile-browser WebView). The main risk is Apple App Store guideline 4.2 ("thin wrapper" rejection); that's mitigated by the app having real native-feeling functionality (camera-based wall preview, job alerts) rather than being a pure content wrapper.
2. **Longer-term: a full native or React Native rewrite.** This is more contained than it sounds, because all business logic already funnels through `lib/db.js` function calls rather than being spread across `routes/pages.js`. The main work would be `routes/api.js` growing JSON responses alongside its current redirect/HTML responses (content negotiation on the `Accept` header), not a backend rewrite.

### Google Business Profile linking

The real path is an OAuth2 consent flow requesting Google's Business Profile
API scope (note: API access approval is a separate, slower step than a
generic OAuth scope grant), a callback route exchanging the authorization
code for tokens, encrypted-at-rest refresh-token storage (today's plaintext
JSON store isn't suitable for that), and periodic pulls of location data to
enrich listings automatically. That's future work. What's shipped now as the
lightweight first step: the `googleBusinessUrl` field on the user record,
editable on `/account`, rendered as a "View on Google" link on listing pages
when present — so the data model is ready without any OAuth work yet.

### Stripe / PayPal integration

The real path: client-side Stripe Elements replacing the current plaintext
card-number fields, a PaymentIntent or Checkout Session created *before*
`db.createBookingBundle` runs (inverting today's "book, then stub-pay" order
into "pay or authorize, then book"), a signature-verified webhook route as
the source of truth for payment status rather than trusting the redirect
alone, and Stripe Connect Express accounts to split the platform fee from
seller payouts automatically — eventually extending to paying contractors
directly, too. The concrete seam shipped now: `lib/payments.js`, a single
`charge()` function that every payment-creating code path already calls
instead of inlining `status: "paid"` — so the future Stripe integration
touches one file.

### Switching the map from Leaflet to Google Maps

`/map` uses Leaflet + OpenStreetMap because it needs no API key or billing
account — this environment couldn't generate a Google Maps key. If you get
one, the swap is contained: replace the Leaflet `<link>`/`<script>` tags in
`mapPage` (`routes/pages.js`) and the tile-layer setup in `public/map.js`
with the Google Maps JS API loader and `google.maps.Map`/`google.maps.Marker`
calls — the `GET /api/listings/map` JSON endpoint it fetches from doesn't
need to change either way.

## Natural next steps

1. Swap `lib/db.js` for a real database (Postgres via `pg`, or Prisma) — every other file only calls functions exported from this one module, so the swap is contained.
2. Wire in real Stripe Connect for payments/payouts inside `lib/payments.js`.
3. Add the buyer-facing quote-approval screen (currently just a "simulate" button on the contractor board).
4. Port the buyer-visualize/chat mockup's visualization half into a real page (chat itself now exists).
5. Replace the department-flag stand-in (`lib/permissions.js`) with a real roles/permissions system with an audit trail.
6. Add proper input validation, rate limiting, and CSRF protection before this touches real money or real users — the current forms trust the browser more than a production app should.
7. Add distance/rating-based contractor job routing instead of first-come-first-claimed.
8. Give BDR draft listings an expiry or reminder flow — an unclaimed listing sits invisible forever today if the claim link is never opened.
