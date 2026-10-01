# Frontage marketing brief

Hand this file to a new Claude session to plan social content and campaigns.
It covers what Frontage is, who it's for, how it should sound, what it may
and may not claim, and what can be measured. Written 27 September 2026, the
day the international version went live.

**Your task in the new session:** build a social media marketing plan and
content for **Instagram, TikTok, Facebook and LinkedIn**. Start with the
questions in the last section before committing to a plan.

---

## 1. The product in one paragraph

**Frontage** (https://frontage.world) is a free classifieds marketplace for
advertising space. People who own a wall, fence, shop window, billboard,
digital screen or vehicle list it for free. Businesses browse by map or
list, then message the owner directly. **Every deal is done off the
platform**: Frontage hosts the listings and the messages, and never handles
payments, contracts, printing or installation. Think Facebook Marketplace
or Gumtree, only for ad space.

**Headline:** *Every wall is a billboard.*
**Tagline:** *List your wall, window or fence — or find the spot where your
business can really be seen.*

### How it works
- **Listing is free.** A listing has 1–10 photos, a title, the owner's own
  price (any amount, or "price on request") plus price details, the type of
  space, a description, the address, and an optional size and YouTube video
  walk-through.
- **Location privacy.** Unless the owner opts in, the public sees only the
  suburb and an approximate area on the map, never the exact address.
- **Messaging.** Buyers message the owner from the listing and both sides
  get email alerts. Mobile numbers are required at sign-up but kept private.
- **Listings stay fresh.** Each listing is live for 60 days, the owner gets a
  reminder before it expires, and a renewal takes one click. Owners can mark
  a space as rented and relist it later.
- **Deals reporting.** When an owner marks a space rented, they can tell us
  whether the deal came through Frontage, roughly what it was worth and
  whether we may feature it. Buyers get a check-in email 3 weeks after
  their first message. **The price is never shown publicly.** A deal can
  only be featured if the owner ticked "OK to feature" (the admin Deals
  page shows which).
- **Pricing guide** at /pricing-guide gives illustrative monthly ranges in
  AUD, from a suburban fence at $40–$120 up to a main-road wall at
  $300–$1,200. These are starting points, not market data.
- **Types of space:** wall, fence, window, billboard, digital screen,
  vehicle, indoor space, other.

---

## 2. Markets (30)

Australia (home market; the business is Australian), Austria, Belgium,
Brazil, Canada, Denmark, Finland, France, Germany, Hong Kong, India,
Ireland, Italy, Japan, Mexico, Netherlands, New Zealand, Norway, Poland,
Portugal, Singapore, South Africa, South Korea, Spain, Sweden,
Switzerland, Taiwan, United Arab Emirates, United Kingdom, United States.

- Each listing is priced in its own country's currency and never
  converted. Visitors start on listings from all countries and can narrow
  to one country.
- Sizes show in metres, or feet for US members; any member can change
  this.
- **The site is English-only.** Content for non-English markets should
  either be in English or treated as an experiment, and should link to an
  English site.
- **Recommendation to test:** a marketplace needs listings and buyers in
  the *same place*. Concentrate early effort on one or two cities (for
  example Sydney and Melbourne) rather than spreading across 30 countries.

---

## 3. Audiences

Frontage is two-sided, and supply comes first: buyers leave if a city has
no listings.

### Supply — people with space to list
- Homeowners with a fence or wall on a busy road, corner block or near a
  school, shops or traffic lights.
- Shop, café and small-business owners with window space or a side wall.
- Commercial landlords and building managers with blank walls or empty
  shopfronts.
- Farmers and rural landowners with fences along highways.
- Tradies, couriers, rideshare drivers and anyone with a vehicle for wraps
  or signage.
- Venues, gyms and co-working spaces with indoor screens or noticeboards.

**Message:** earn money from space you already have; listing is free and
takes minutes; you pick the price and who you deal with.

### Demand — businesses that want to be seen locally
- Local businesses: cafés, gyms, dentists, real estate agents, tradies,
  driving schools, childcare.
- Event promoters, new venue openings, pop-ups.
- Startups and direct-to-consumer brands trying out-of-home advertising
  cheaply.
- Marketing agencies and media buyers looking for hyper-local, non-network
  inventory (reach them on LinkedIn).

**Message:** find the exact spot your customers walk or drive past, deal
directly with the owner, with no agency markup and no minimum spend.

---

## 4. Brand voice and visuals

- **Voice:** plain, confident, a bit cheeky, and local. Short sentences.
  Talk like a neighbour, not a media company. Say "space", "wall" and
  "fence", not "inventory" or "OOH assets" (except in LinkedIn copy for
  agencies).
- **Recurring idea:** "Every wall is a billboard." Show ordinary surfaces
  (a paling fence, a café window, a ute) and reveal them as ad space.
- **Visuals:**
  - The logo is a dashed-outline square mark (a frame waiting to be
    filled) with the FRONTAGE wordmark.
  - The accent colour is orange (the site's primary buttons) on white and
    dark navy.
  - Real-world photography beats stock.
- **Assets:**
  - `public/logo-mark.svg` and `public/favicon.svg`
  - `public/og-default.png` (the social share image)
  - Live screenshots from https://frontage.world

---

## 5. Facts, claims and guard-rails

**Safe to say**
- Free to list. Free to browse and message.
- You set your own price; you deal directly; Frontage takes no commission.
- Available in the 30 countries above.
- Exact address stays private unless the owner chooses to show it.

**Do not claim**
- That Frontage verifies owners, listings, traffic, audience numbers or
  permits. It doesn't; the Terms say so.
- Any guaranteed income, bookings or visibility.
- Traffic or impression figures, unless they come from a named, citable
  source.
- That Frontage handles payment, contracts, escrow, printing or
  installation, or offers any protection on deals.
- Numbers of users, listings or deals before there is real data. The admin
  Deals page will provide totals.
- Any real deal's price, even when it may be featured.
- That signage is always allowed. Many councils, landlords and strata
  schemes restrict signage, so content that encourages listing should nod
  to "check your local rules". The site's safety page says the same.

**Featuring a deal:** only when the owner ticked "OK to feature". Show the
space and the business (with their permission), never the price. Ask the
owner before posting photos of their property.

**Legal basics:**
- Frontage is an Australian business.
- The contact address is frontage.world@gmail.com.
- The Terms and Privacy Policy are at /terms and /privacy.
- Paid ads must follow each platform's rules and local advertising law, for
  example the ACL in Australia and the FTC in the US for endorsements and
  influencer disclosure.

---

## 6. Tracking

GA4 and a Meta Pixel are built in. They load only after cookie consent and
switch on once the IDs are set (`GA4_MEASUREMENT_ID` and `META_PIXEL_ID` in
Render). **They are not set yet**, so setting them up is a prerequisite
for paid social.

| Event | When it fires | Meta standard event |
|---|---|---|
| `sign_up` | An account is created | CompleteRegistration |
| `publish_listing` | A new listing goes live | SubmitApplication |
| `view_listing` | A listing page is viewed | ViewContent |
| `contact_seller` | A first message is sent to an owner | Lead |

**Still to do:**
- Meta domain verification for frontage.world.
- Google Search Console.
- A UTM convention, for example
  `utm_source=instagram&utm_medium=social&utm_campaign=<name>`.

**Suggested north-star metrics:**
- Supply: published listings per target city.
- Demand: `contact_seller` leads.
- Outcome: deals reported via Frontage.

---

## 7. Budget context

- Running costs are small: Render hosting and database, Cloudflare R2
  photo storage, and Resend email.
- **No marketing budget has been set.** Ask the owner before proposing
  paid spend.
- Assume organic-first, then small paid tests on Meta (Instagram and
  Facebook) and TikTok aimed at one city at a time.

---

## 8. Content pillars (starting ideas)

1. **"Every wall is a billboard" reveals.** Walk past ordinary fences,
   walls, windows and utes and overlay "this could be earning $X a month".
   Label the figure as an example and use pricing-guide ranges.
2. **How it works in 30 seconds.** List a space: take photos, set a price,
   publish. Find a space: map, message, deal.
3. **Owner stories.** Real listers (with permission) talk about why they
   listed and what happened.
4. **Small-business wins.** A local café or tradie explains why a nearby
   fence beats a boosted post (with permission).
5. **Street-smart pricing tips.** What makes a spot valuable: dwell time,
   traffic lights, sightlines, foot traffic. Drawn from /pricing-guide.
6. **Do it right.** Checking council and landlord rules, weatherproof
   printing, simple agreements. This builds trust.
7. **B2B (LinkedIn).** Hyper-local out-of-home without agency minimums,
   aimed at founders, marketers and agencies.

### Channel notes
- **TikTok and Instagram Reels:** the reveal and how-to formats; street
  footage; trending audio; captions on.
- **Instagram grid and Stories:** before/after of spaces, listing
  spotlights (with the owner's permission), polls such as "Would you rent
  your fence?"
- **Facebook:** local community groups and Marketplace-style audiences;
  suburb-targeted ads; strong for homeowners and small-business owners.
- **LinkedIn:** the founder's voice, the out-of-home market angle, the case
  for agencies, and milestones once real numbers exist.

---

## 9. Questions to settle first in the new session

1. Which launch city or cities come first, and how many listings is "enough"
   before pushing demand?
2. What is the monthly budget, if any, for paid social and creators?
3. Who appears on camera: the founder, creators, or faceless?
4. Handles: are @frontage / @frontageworld claimed on each platform?
5. Posting cadence and who approves posts.
6. Is there a first batch of owners or businesses willing to be featured?
