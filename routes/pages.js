import { layout, escapeHtml, SITE_TAGLINE } from "../lib/layout.js";
import { currentUser, safeNext, PASSWORD_PATTERN, PASSWORD_HINT } from "../lib/auth.js";
import * as db from "../lib/db.js";
import { priceLabel, sizeLabel, formatDate, timeAgo, listedAgo } from "../lib/format.js";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  LISTING_TITLE_MAX_LENGTH,
  LISTING_DESC_MAX_LENGTH,
  LISTING_PRICE_NOTE_MAX_LENGTH,
  LISTING_MAX_PHOTOS,
  LISTING_MAX_DIMENSION_M,
} from "../lib/categories.js";
import { PERMISSIONS, hasPermission } from "../lib/permissions.js";
import { isEmailConfigured } from "../lib/email.js";
import { filterListings } from "../lib/listingFilters.js";
import { approximateCoords, distanceKm, publicCoords, publicLocationLine, placesCountries } from "../lib/geo.js";
import { browserMapsKey, mapsEmbedUrl } from "../lib/maps.js";
import { youTubeThumbnail, youTubeEmbedUrl, youTubeWatchUrl } from "../lib/youtube.js";
import { trackOnLoad } from "../lib/analytics.js";
import { COUNTRIES, splitMobile } from "../lib/countries.js";
import { PRICING_SCENARIOS, PRICING_FACTORS, PRICE_NOTE_EXAMPLES } from "../lib/pricingGuide.js";
import { termsHtml, privacyHtml, SAFETY_TIPS, LEGAL_UPDATED } from "../lib/legal.js";

export function send(res, status, html) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}
export function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}
export async function requireUser(req, res, nextPath) {
  const user = await currentUser(req);
  if (!user) {
    redirect(res, `/onboarding?next=${encodeURIComponent(nextPath)}`);
    return null;
  }
  return user;
}
async function requirePermission(req, res, key, nextPath) {
  const user = await requireUser(req, res, nextPath);
  if (!user) return null;
  if (!hasPermission(user, key)) {
    send(res, 403, await layout({ title: "Forbidden", user, body: `<div class="panel"><h2>403</h2><p class="muted">You don't have access to this area.</p></div>`, noindex: true }));
    return null;
  }
  return user;
}
async function requireSuperAdmin(req, res, nextPath) {
  const user = await requireUser(req, res, nextPath);
  if (!user) return null;
  if (!user.isAdmin) {
    send(res, 403, await layout({ title: "Forbidden", user, body: `<div class="panel"><h2>403</h2><p class="muted">Super-admin access only.</p></div>`, noindex: true }));
    return null;
  }
  return user;
}

export async function notFoundPage(req, res, message = "That page doesn't exist, or the listing has been taken down.") {
  const user = await currentUser(req);
  send(
    res,
    404,
    await layout({
      title: "Not found",
      user,
      noindex: true,
      body: `<div class="panel empty-state"><h1>Not found</h1><p class="muted">${escapeHtml(message)}</p><a href="/" class="btn btn-primary">Browse spaces</a></div>`,
    })
  );
}

function notice(message, kind = "green") {
  return message ? `<div class="notice notice-${kind}" role="status">${escapeHtml(message)}</div>` : "";
}

export function coverPhoto(l) {
  return (l.photos || [])[0] || (l.listingPhotos || [])[0] || null;
}

function categoryLabel(c) {
  return CATEGORY_LABEL[c] || "Other";
}

function adminSubnav(user, activeKey) {
  const items = [];
  if (hasPermission(user, "canAccessSupport")) {
    items.push({ key: "reports", href: "/admin/reports", label: "Reports" }, { key: "listings", href: "/admin/listings", label: "Listings" }, { key: "users", href: "/admin/users", label: "Users" });
  }
  if (user.isAdmin) items.push({ key: "staff", href: "/admin/staff", label: "Staff access" });
  if (items.length <= 1) return "";
  return `<div class="admin-subnav">${items.map((i) => `<a href="${i.href}"${i.key === activeKey ? ' class="active"' : ""}>${i.label}</a>`).join("")}</div>`;
}

// ---------------- Browse ----------------
const SORT_OPTIONS = {
  newest: { label: "Newest", cmp: (a, b) => (b.__seq || 0) - (a.__seq || 0) },
  price_asc: { label: "Price: low to high", cmp: (a, b) => (a.price > 0 ? a.price : Infinity) - (b.price > 0 ? b.price : Infinity) },
  price_desc: { label: "Price: high to low", cmp: (a, b) => (b.price || 0) - (a.price || 0) },
};
// Every param that should survive a category-chip click or a filter submit.
const FILTER_PARAM_KEYS = ["q", "where", "minPrice", "maxPrice", "sort", "view"];

export function listingCard(l) {
  const photo = coverPhoto(l);
  return `<a class="card" href="/listing/${escapeHtml(l.id)}">
      <div class="card-diagram">${photo ? `<img src="${escapeHtml(photo)}" alt="" loading="lazy" />` : `<span class="muted small">No photo</span>`}</div>
      <div class="card-body">
        <div class="card-price">${escapeHtml(priceLabel(l, { withNote: false }))}${l.priceNote && l.price > 0 ? ` <span class="muted card-price-note">${escapeHtml(l.priceNote)}</span>` : ""}</div>
        <h3 class="card-title">${escapeHtml(l.title)}</h3>
        <div class="muted small">${escapeHtml(categoryLabel(l.category))}${l.suburb ? ` · ${escapeHtml(l.suburb)}` : ""}</div>
      </div>
    </a>`;
}

export async function browsePage(req, res, query) {
  const user = await currentUser(req);
  const allListings = await db.getListings();
  const cat = CATEGORIES.includes(query.get("category")) ? query.get("category") : null;
  const clampNonNegative = (n) => (Number.isFinite(n) && n >= 0 ? n : NaN);
  const minPrice = clampNonNegative(parseFloat(query.get("minPrice")));
  const maxPrice = clampNonNegative(parseFloat(query.get("maxPrice")));
  const sortKey = SORT_OPTIONS[query.get("sort")] ? query.get("sort") : "newest";
  const mapView = query.get("view") === "map";

  let listings = filterListings(allListings, query).slice().sort(SORT_OPTIONS[sortKey].cmp);

  // Zero results for a place search: suggest the nearest suburbs that do
  // have matching listings, instead of a dead end.
  const locationTerm = (query.get("where") || query.get("q") || "").trim();
  let nearby = [];
  if (listings.length === 0 && locationTerm) {
    const params = new URLSearchParams(query);
    params.delete("q");
    params.delete("where");
    const candidates = filterListings(allListings, params);
    const target = candidates.length ? await approximateCoords(locationTerm) : null;
    if (target) {
      const bySuburb = new Map();
      for (const l of candidates) {
        if (l.lat == null || !l.suburb) continue;
        const key = l.suburb.toLowerCase();
        const dist = distanceKm(target, { lat: Number(l.lat), lng: Number(l.lng) });
        const entry = bySuburb.get(key) || { suburb: l.suburb, dist: Infinity, count: 0 };
        entry.count += 1;
        entry.dist = Math.min(entry.dist, dist);
        bySuburb.set(key, entry);
      }
      nearby = [...bySuburb.values()].sort((a, b) => a.dist - b.dist).slice(0, 5);
    }
  }

  function withParams(extra) {
    const params = new URLSearchParams();
    for (const key of FILTER_PARAM_KEYS) if (query.get(key)) params.set(key, query.get(key));
    if (cat) params.set("category", cat);
    Object.entries(extra).forEach(([k, v]) => (v ? params.set(k, v) : params.delete(k)));
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  }

  const noResultsHtml = nearby.length
    ? `<div class="panel empty-state"><p class="muted">No spaces match “${escapeHtml(locationTerm)}” yet. Nearby suburbs with spaces:</p>
         <div class="chip-row">${nearby.map((s) => `<a href="${withParams({ q: "", where: s.suburb })}" class="chip-pill">${escapeHtml(s.suburb)} (${s.count})</a>`).join("")}</div></div>`
    : allListings.length === 0
    ? `<div class="panel empty-state"><h2>Be the first to list a space</h2><p class="muted">Got a wall, fence, window or screen people can see? List it free in a couple of minutes.</p><a href="/sell/welcome" class="btn btn-accent">List your space</a></div>`
    : `<div class="panel empty-state"><p class="muted">No spaces match that search.</p><a href="/" class="btn btn-outline btn-sm">Clear search</a></div>`;

  const categoryChips = ["all", ...CATEGORIES]
    .map((c) => {
      const active = (cat || "all") === c;
      return `<a href="${withParams({ category: c === "all" ? "" : c })}" class="chip-pill${active ? " is-active" : ""}">${c === "all" ? "All spaces" : categoryLabel(c)}</a>`;
    })
    .join("");

  const activeFilterCount = [minPrice, maxPrice].filter(Number.isFinite).length + (query.get("where") ? 1 : 0) + (sortKey !== "newest" ? 1 : 0);
  const googleKey = browserMapsKey();

  const body = `
    <section class="hero-row">
      <div>
        <h1 class="hero-headline">Advertising space, direct from the owner.</h1>
        <p class="hero-sub">${escapeHtml(SITE_TAGLINE)} Message the owner and deal directly — listing is free.</p>
      </div>
      <a href="${user ? "/sell/new" : "/sell/welcome"}" class="btn btn-accent btn-lg">List your space — free</a>
    </section>

    <div class="browse-toolbar">
      <form method="GET" action="/" class="field-pill" role="search">
        ${cat ? `<input type="hidden" name="category" value="${escapeHtml(cat)}" />` : ""}
        ${FILTER_PARAM_KEYS.filter((k) => k !== "q")
          .map((k) => (query.get(k) ? `<input type="hidden" name="${k}" value="${escapeHtml(query.get(k))}" />` : ""))
          .join("")}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="search" name="q" aria-label="Search" placeholder="Search spaces, suburbs or keywords" value="${escapeHtml(query.get("q") || "")}" />
      </form>
      <div class="toolbar-buttons">
        <button type="button" id="map-toggle-btn" class="btn-pill btn">${mapView ? "List view" : "Map view"}</button>
        <details class="nav-dropdown" id="filters-details">
          <summary class="btn-pill btn">Filters${activeFilterCount ? ` (${activeFilterCount})` : ""}</summary>
          <form method="GET" action="/" class="nav-dropdown-menu filters-menu">
            ${cat ? `<input type="hidden" name="category" value="${escapeHtml(cat)}" />` : ""}
            ${query.get("q") ? `<input type="hidden" name="q" value="${escapeHtml(query.get("q"))}" />` : ""}
            ${mapView ? `<input type="hidden" name="view" value="map" />` : ""}
            <div class="field"><label for="f-where">Suburb, state or postcode</label><input id="f-where" name="where" value="${escapeHtml(query.get("where") || "")}" placeholder="Any" /></div>
            <div class="form-row">
              <div class="field"><label for="f-min">Min price</label><input id="f-min" type="number" name="minPrice" min="0" value="${Number.isFinite(minPrice) ? minPrice : ""}" placeholder="$0" /></div>
              <div class="field"><label for="f-max">Max price</label><input id="f-max" type="number" name="maxPrice" min="0" value="${Number.isFinite(maxPrice) ? maxPrice : ""}" placeholder="Any" /></div>
            </div>
            <div class="field"><label for="f-sort">Sort by</label><select id="f-sort" name="sort">${Object.entries(SORT_OPTIONS)
              .map(([key, opt]) => `<option value="${key}"${key === sortKey ? " selected" : ""}>${opt.label}</option>`)
              .join("")}</select></div>
            <div class="small muted" style="margin-bottom:12px">Listings with “price on request” are always included.</div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary btn-sm" type="submit" style="flex:1">Apply</button>
              <a href="${withParams({ where: "", minPrice: "", maxPrice: "", sort: "" })}" class="btn btn-outline btn-sm" data-filter-link>Clear</a>
            </div>
          </form>
        </details>
      </div>
    </div>
    <div id="category-chips" class="chip-row">${categoryChips}</div>
    <div id="browse-map" class="browse-map"${mapView ? "" : " hidden"}></div>
    <h2 class="results-heading">${listings.length} space${listings.length === 1 ? "" : "s"}${cat ? ` · ${escapeHtml(categoryLabel(cat))}` : ""}</h2>
    <div id="browse-results"${mapView ? " hidden" : ""}>${listings.length === 0 ? noResultsHtml : `<div class="grid">${listings.map(listingCard).join("")}</div>`}</div>
    <script>
      window.FRONTAGE_MAP = ${JSON.stringify({ target: "browse-map", engine: googleKey ? "google" : "leaflet", key: googleKey || null, startInMap: mapView })};
    </script>
    <script src="/browse.js" defer></script>
  `;

  send(
    res,
    200,
    await layout({
      title: cat ? `${categoryLabel(cat)} advertising space` : "Advertising space for rent",
      activeNav: "browse",
      user,
      body,
      canonicalPath: cat ? `/?category=${cat}` : "/",
    })
  );
}

// JSON for the browse map. Coordinates are the public (possibly
// approximate) ones — the exact pin never leaves the server unless the
// seller chose to show it.
export async function listingsMapJson(req, res, query) {
  const listings = filterListings(await db.getListings(), query)
    .map((l) => {
      const c = publicCoords(l);
      if (!c) return null;
      return { id: l.id, title: l.title, price: priceLabel(l, { withNote: false }), suburb: l.suburb || "", category: categoryLabel(l.category), photo: coverPhoto(l), lat: c.lat, lng: c.lng, exact: c.exact };
    })
    .filter(Boolean);
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ listings }));
}

// ---------------- Listing detail ----------------
function lightboxMarkup(photos) {
  const photosJs = JSON.stringify(photos).replace(/</g, "\\u003c");
  return `
    <div id="frontage-lightbox" class="lightbox" hidden>
      <button type="button" class="lightbox-close" data-lb="close" aria-label="Close">&times;</button>
      <button type="button" class="lightbox-prev" data-lb="prev" aria-label="Previous photo">&#8249;</button>
      <img id="frontage-lightbox-img" src="" alt="" />
      <button type="button" class="lightbox-next" data-lb="next" aria-label="Next photo">&#8250;</button>
      <div id="frontage-lightbox-counter" class="lightbox-counter"></div>
    </div>
    <script>window.FRONTAGE_PHOTOS = ${photosJs};</script>`;
}

export async function listingDetailPage(req, res, id) {
  const user = await currentUser(req);
  const listing = await db.getPublicListing(id);
  // The owner (and moderators) can still see their own non-live listing.
  if (!listing) {
    const raw = await db.getListingById(id);
    const canSee = raw && user && (raw.ownerId === user.id || hasPermission(user, "canAccessSupport")) && raw.status !== "deleted";
    if (!canSee) return notFoundPage(req, res, "This listing doesn't exist or is no longer available.");
    return renderListing(req, res, user, raw);
  }
  return renderListing(req, res, user, listing);
}

async function renderListing(req, res, user, listing) {
  const owner = await db.getUserById(listing.ownerId);
  const isOwner = Boolean(user && user.id === listing.ownerId);
  const isLive = listing.status === "live";
  if (!isOwner && isLive) await db.incrementListingView(listing.id);

  const photos = listing.photos || [];
  const existingConversation = user && !isOwner ? await db.getConversationFor(listing.id, user.id) : null;
  const size = sizeLabel(listing);
  const locationLine = publicLocationLine(listing);
  const embed = mapsEmbedUrl(listing);
  const coords = publicCoords(listing);
  const nextPath = `/listing/${listing.id}`;
  const sendError = new URL(req.url, "http://localhost").searchParams.get("err");

  const gallery = photos.length
    ? `<div class="gallery">
        <button type="button" class="gallery-main" data-photo="0" aria-label="View photo 1 of ${photos.length} full size"><img src="${escapeHtml(photos[0])}" alt="${escapeHtml(listing.title)}" /></button>
        ${
          photos.length > 1
            ? `<div class="gallery-thumbs">${photos
                .map((p, i) => `<button type="button" data-photo="${i}" aria-label="View photo ${i + 1}"><img src="${escapeHtml(p)}" alt="" loading="lazy" /></button>`)
                .join("")}</div>`
            : ""
        }
      </div>${lightboxMarkup(photos)}`
    : `<div class="gallery"><div class="gallery-main gallery-empty muted">No photos yet</div></div>`;

  const video = listing.youtubeId
    ? `<section class="detail-section">
        <h2>Video</h2>
        <div class="yt-facade" data-embed="${escapeHtml(youTubeEmbedUrl(listing.youtubeId))}">
          <button type="button" class="yt-play" aria-label="Play video">
            <img src="${escapeHtml(youTubeThumbnail(listing.youtubeId))}" alt="" loading="lazy" />
            <span class="yt-play-icon" aria-hidden="true">▶</span>
          </button>
        </div>
        <div class="small muted" style="margin-top:6px">Plays from YouTube. <a href="${escapeHtml(youTubeWatchUrl(listing.youtubeId))}" target="_blank" rel="noopener" class="link">Open on YouTube</a></div>
      </section>`
    : "";

  const map = embed
    ? `<iframe class="detail-map" title="Map showing ${listing.showExactLocation ? "the location" : "the approximate area"} of this space" src="${escapeHtml(embed)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`
    : coords
    ? `<div id="listing-mini-map" class="detail-map"></div>
       <script>window.FRONTAGE_SINGLE_LISTING = ${JSON.stringify({ lat: coords.lat, lng: coords.lng, exact: coords.exact })};</script>
       <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
       <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" defer></script>
       <script src="/listing-map.js" defer></script>`
    : "";

  let actionBox;
  if (isOwner) {
    actionBox = `<div class="notice notice-blue">This is your listing${isLive ? "" : ` — <strong>${listing.status === "removed" ? "removed by moderators" : escapeHtml(listing.status)}</strong>`}.</div>
      <a href="/sell/edit/${escapeHtml(listing.id)}" class="btn btn-primary btn-block">Edit listing</a>
      <a href="/account/messages" class="btn btn-outline btn-block" style="margin-top:10px">View messages</a>
      <div class="small muted" style="margin-top:10px">${listing.viewCount || 0} view${listing.viewCount === 1 ? "" : "s"} from other people.</div>`;
  } else if (!isLive) {
    actionBox = `<div class="notice notice-orange">This listing isn't live, so it can't be messaged.</div>`;
  } else if (!user) {
    actionBox = `<a href="/onboarding?next=${encodeURIComponent(nextPath)}" class="btn btn-accent btn-block btn-lg" id="message-seller">Message seller</a>
      <div class="small muted" style="text-align:center;margin-top:8px">Free account needed so the seller's reply reaches you.</div>`;
  } else {
    actionBox = `${existingConversation && existingConversation.lastMessageAt ? `<a href="/messages/${escapeHtml(existingConversation.id)}" class="btn btn-outline btn-block" style="margin-bottom:12px">View your conversation →</a>` : ""}
      <form method="POST" action="/api/listings/${escapeHtml(listing.id)}/messages" class="composer" id="message-seller" data-single-submit>
        <label for="first-message" class="composer-label">${existingConversation && existingConversation.lastMessageAt ? "Send another message" : "Send the seller a message"}</label>
        <textarea id="first-message" name="body" rows="3" maxlength="2000" required>${existingConversation && existingConversation.lastMessageAt ? "" : "Hi, is this space still available?"}</textarea>
        <button class="btn btn-accent btn-block" type="submit">Send</button>
      </form>`;
  }

  const body = `
    <a href="/" class="small muted back-link">← Back to browse</a>
    <div class="detail-layout">
      <div class="detail-main">
        ${gallery}
        <section class="detail-section">
          <h2>About this space</h2>
          <p class="prewrap">${escapeHtml(listing.description)}</p>
        </section>
        <section class="detail-section">
          <h2>Details</h2>
          <dl class="detail-facts">
            <div><dt>Type of space</dt><dd>${escapeHtml(categoryLabel(listing.category))}</dd></div>
            ${size ? `<div><dt>Size</dt><dd>${escapeHtml(size)}</dd></div>` : ""}
            <div><dt>Price</dt><dd>${escapeHtml(priceLabel(listing))}</dd></div>
            <div><dt>Location</dt><dd>${escapeHtml(locationLine)}${listing.showExactLocation ? "" : ` <span class="muted small">(approximate)</span>`}</dd></div>
            <div><dt>Listed</dt><dd>${escapeHtml(formatDate(listing.createdAt))}</dd></div>
            <div><dt>Listing ID</dt><dd class="mono">${escapeHtml(listing.id)}</dd></div>
          </dl>
        </section>
        ${video}
        ${map ? `<section class="detail-section"><h2>Location</h2>${map}<div class="small muted" style="margin-top:6px">${listing.showExactLocation ? escapeHtml(locationLine) : `Approximate area — the seller shares the exact spot when you message them.`}</div></section>` : ""}
      </div>
      <aside class="detail-side">
        <div class="side-card">
          <h1 class="detail-title">${escapeHtml(listing.title)}</h1>
          <div class="detail-price">${escapeHtml(priceLabel(listing, { withNote: false }))}${listing.priceNote && listing.price > 0 ? ` <span class="muted detail-price-note">${escapeHtml(listing.priceNote)}</span>` : ""}</div>
          ${!(listing.price > 0) && listing.priceNote ? `<div class="muted small">${escapeHtml(listing.priceNote)}</div>` : ""}
          <div class="muted small" style="margin:6px 0 16px">${escapeHtml(categoryLabel(listing.category))} · ${escapeHtml(listing.suburb || locationLine)} · ${escapeHtml(listedAgo(listing.createdAt))}</div>
          ${notice(sendError, "orange")}
          ${actionBox}
        </div>
        ${
          owner
            ? `<div class="side-card seller-card">
                 <div class="avatar" aria-hidden="true">${escapeHtml((owner.businessName || owner.fullName || "?").charAt(0).toUpperCase())}</div>
                 <div style="min-width:0">
                   <div style="font-weight:700">${escapeHtml(owner.businessName || String(owner.fullName).split(" ")[0])}</div>
                   <div class="small muted">Seller · on Frontage since ${escapeHtml(new Date(owner.createdAt).toLocaleDateString("en-AU", { month: "short", year: "numeric" }))}</div>
                   ${owner.googleBusinessUrl ? `<a href="${escapeHtml(owner.googleBusinessUrl)}" target="_blank" rel="noopener nofollow" class="small link">Google Business profile →</a>` : ""}
                 </div>
               </div>`
            : ""
        }
        <div class="side-card safety-card">
          <strong class="small">Stay safe</strong>
          <p class="small muted">Frontage never handles payments. See the space before you pay, and never pay by gift card or crypto. <a href="/safety" class="link">Safety tips</a></p>
        </div>
        ${!isOwner ? `<div class="small" style="text-align:center"><a href="/listing/${escapeHtml(listing.id)}/report" class="muted link-quiet">Report this listing</a></div>` : ""}
      </aside>
    </div>
    ${isLive && !isOwner ? `<div class="mobile-cta"><a href="#message-seller" class="btn btn-accent btn-block">Message seller</a></div>` : ""}
    ${trackOnLoad("view_listing", { listing_id: listing.id, category: listing.category })}
    <script src="/listing.js" defer></script>
  `;

  const description = `${priceLabel(listing)} · ${categoryLabel(listing.category)} in ${listing.suburb || "Australia"}. ${String(listing.description || "").slice(0, 150)}`;
  send(
    res,
    200,
    await layout({
      title: listing.title,
      activeNav: "browse",
      user,
      body,
      description,
      ogImage: coverPhoto(listing) || undefined,
      canonicalPath: `/listing/${listing.id}`,
      noindex: !isLive,
    })
  );
}

// ---------------- Report a listing ----------------
export const REPORT_REASONS = [
  ["scam", "Scam or fraud"],
  ["not_owner", "They don't control this space"],
  ["misleading", "Misleading or inaccurate"],
  ["prohibited", "Prohibited or offensive content"],
  ["not_ad_space", "Not advertising space"],
  ["spam", "Spam or duplicate"],
  ["harassment", "Harassment or abuse"],
  ["other", "Something else"],
];

export async function reportListingPage(req, res, id, query) {
  const user = await requireUser(req, res, `/listing/${id}/report`);
  if (!user) return;
  const listing = await db.getPublicListing(id);
  if (!listing) return notFoundPage(req, res);
  const body = reportFormMarkup({
    heading: "Report this listing",
    subject: listing.title,
    action: "/api/reports",
    hidden: { targetType: "listing", listingId: listing.id },
    backHref: `/listing/${listing.id}`,
    sent: query.get("sent"),
  });
  send(res, 200, await layout({ title: "Report listing", user, body, noindex: true }));
}

export function reportFormMarkup({ heading, subject, action, hidden, backHref, sent }) {
  if (sent) {
    return `<div class="form-card narrow-card"><h1>Thanks — we've got your report</h1><p class="muted">Our team reviews every report. We may not be able to tell you what action we took, for the other person's privacy.</p><a class="btn btn-primary" href="${escapeHtml(backHref)}">Back</a></div>`;
  }
  return `<div class="form-card narrow-card">
    <a href="${escapeHtml(backHref)}" class="small muted">← Back</a>
    <h1 style="margin-top:8px">${escapeHtml(heading)}</h1>
    <p class="muted small">“${escapeHtml(subject)}”. Reports are confidential — the other person isn't told who reported them.</p>
    <form method="POST" action="${escapeHtml(action)}" data-single-submit>
      ${Object.entries(hidden)
        .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`)
        .join("")}
      <fieldset class="field radio-list"><legend>What's wrong?</legend>
        ${REPORT_REASONS.map(([v, l], i) => `<label><input type="radio" name="reason" value="${v}"${i === 0 ? " required" : ""} /> ${escapeHtml(l)}</label>`).join("")}
      </fieldset>
      <div class="field"><label for="report-details">Anything else we should know? (optional)</label><textarea id="report-details" name="details" rows="4" maxlength="2000"></textarea></div>
      <button class="btn btn-primary btn-block" type="submit">Send report</button>
    </form>
  </div>`;
}

// ---------------- Auth pages ----------------
// Country calling-code select + local number. The server combines them
// (lib/countries.js#parseMobile) — no script needed.
function mobileFieldMarkup({ idPrefix, iso = "AU", number = "" }) {
  const options = COUNTRIES.map((c) => `<option value="${c.iso}"${c.iso === iso ? " selected" : ""}>${c.dial} ${escapeHtml(c.name)}</option>`).join("");
  return `<div class="field">
    <label for="${idPrefix}-number">Mobile</label>
    <div class="mobile-row">
      <select name="mobileCountry" id="${idPrefix}-country" aria-label="Country calling code">${options}</select>
      <input type="tel" name="mobileNumber" id="${idPrefix}-number" required inputmode="tel" autocomplete="tel-national" maxlength="20" placeholder="412 345 678" value="${escapeHtml(number)}" />
    </div>
    <div class="hint">Kept private — never shown on your listings or to other members. Share it in a message when you're ready to.</div>
  </div>`;
}

function passwordFieldsMarkup({ idPrefix = "pw", name = "password", label = "Password" } = {}) {
  return `
    <div class="field">
      <label for="${idPrefix}-password">${escapeHtml(label)}</label>
      <div class="pw-wrap">
        <input type="password" name="${name}" id="${idPrefix}-password" required pattern="${PASSWORD_PATTERN}" title="${escapeHtml(PASSWORD_HINT)}" minlength="10" autocomplete="new-password" />
        <button type="button" class="pw-toggle" data-reveal="${idPrefix}-password" aria-label="Show password">Show</button>
      </div>
      <div class="hint">${escapeHtml(PASSWORD_HINT)}</div>
    </div>
    <div class="field">
      <label for="${idPrefix}-confirm">Confirm ${escapeHtml(label.toLowerCase())}</label>
      <div class="pw-wrap">
        <input type="password" name="confirmPassword" id="${idPrefix}-confirm" required autocomplete="new-password" data-match="${idPrefix}-password" />
        <button type="button" class="pw-toggle" data-reveal="${idPrefix}-confirm" aria-label="Show password">Show</button>
      </div>
      <div class="hint" data-match-hint="${idPrefix}-confirm"></div>
    </div>`;
}

export async function onboardingPage(req, res, query) {
  const user = await currentUser(req);
  const next = safeNext(query.get("next"));
  if (user) return redirect(res, next);
  const errorMsg = query.get("err");
  const startTab = query.get("tab") === "login" ? "login" : "signup";

  const body = `
    <div class="auth-card">
      <h1 style="text-align:center;margin-bottom:22px">Welcome to Frontage</h1>
      <div class="auth-tabs" role="tablist">
        <button type="button" class="auth-tab" data-tab="signup" role="tab">Sign up</button>
        <button type="button" class="auth-tab" data-tab="login" role="tab">Log in</button>
      </div>
      ${notice(errorMsg, "orange")}
      <div class="auth-panel" data-panel="signup">
        <p class="small muted" style="margin-bottom:18px">One free account to message sellers and list your own space.</p>
        <form method="POST" action="/api/auth/signup" data-single-submit>
          <input type="hidden" name="next" value="${escapeHtml(next)}" />
          <div class="field"><label for="su-name">Full name</label><input id="su-name" name="fullName" required maxlength="80" autocomplete="name" value="${escapeHtml(query.get("fullName") || "")}" /></div>
          <div class="field"><label for="su-email">Email</label><input id="su-email" type="email" name="email" required maxlength="200" autocomplete="email" value="${escapeHtml(query.get("email") || "")}" /></div>
          ${mobileFieldMarkup({ idPrefix: "su-mobile", iso: query.get("mobileCountry") || "AU", number: query.get("mobileNumber") || "" })}
          ${passwordFieldsMarkup({ idPrefix: "su" })}
          <label class="consent-row small"><input type="checkbox" name="agreeTerms" value="1" required /> <span>I agree to the <a href="/terms" target="_blank" class="link">Terms</a> and <a href="/privacy" target="_blank" class="link">Privacy Policy</a>.</span></label>
          <button class="btn btn-accent btn-block" type="submit">Create free account</button>
        </form>
      </div>
      <div class="auth-panel" data-panel="login">
        <form method="POST" action="/api/auth/login" data-single-submit>
          <input type="hidden" name="next" value="${escapeHtml(next)}" />
          <div class="field"><label for="li-email">Email</label><input id="li-email" type="email" name="email" required autocomplete="email" value="${escapeHtml(query.get("loginEmail") || "")}" /></div>
          <div class="field"><label for="li-pw">Password</label>
            <div class="pw-wrap"><input id="li-pw" type="password" name="password" required autocomplete="current-password" /><button type="button" class="pw-toggle" data-reveal="li-pw" aria-label="Show password">Show</button></div>
          </div>
          <button class="btn btn-primary btn-block" type="submit">Log in</button>
        </form>
        <p class="small" style="text-align:center;margin-top:14px"><a href="/forgot-password" class="link">Forgot your password?</a></p>
      </div>
    </div>
    <script>window.FRONTAGE_AUTH_TAB = ${JSON.stringify(startTab)};</script>
  `;
  send(res, 200, await layout({ title: "Sign up or log in", user: null, body, noindex: true }));
}

// Post-signup "check your inbox" page.
export async function welcomePage(req, res, query) {
  const user = await currentUser(req);
  if (!user) return redirect(res, "/onboarding");
  const next = safeNext(query.get("next"));
  const body = `
    <div class="form-card narrow-card" style="text-align:center">
      <div style="font-size:44px;line-height:1;margin-bottom:12px" aria-hidden="true">📬</div>
      <h1>Thanks for signing up, ${escapeHtml(String(user.fullName || "").split(" ")[0] || "there")}!</h1>
      <p class="muted">We've sent a link to <strong>${escapeHtml(user.email)}</strong>. Open it to verify your email — you'll need to before you can message sellers or list a space.</p>
      <p class="small muted">Can't find it? Check your spam or promotions folder.</p>
      <a href="${escapeHtml(next)}" class="btn btn-primary btn-block">Continue</a>
      <form method="POST" action="/api/account/resend-verification" style="margin-top:10px"><button class="btn btn-outline btn-block" type="submit">Resend the email</button></form>
    </div>
    <script>window.frontageTrack && window.frontageTrack("sign_up", {});</script>
  `;
  send(res, 200, await layout({ title: "Check your email", user, body, noindex: true }));
}

export async function forgotPasswordPage(req, res, query) {
  const user = await currentUser(req);
  const body = query.get("sent")
    ? `<div class="form-card narrow-card"><h1>Check your email</h1><p class="muted">If an account exists for that address, we've sent a link to reset the password. It expires in 1 hour.</p><a href="/onboarding?tab=login" class="btn btn-primary">Back to log in</a></div>`
    : `<div class="form-card narrow-card">
        <h1>Reset your password</h1>
        <p class="muted small">Enter your account email and we'll send you a reset link.</p>
        ${notice(query.get("err"), "orange")}
        <form method="POST" action="/api/auth/forgot-password" data-single-submit>
          <div class="field"><label for="fp-email">Email</label><input id="fp-email" type="email" name="email" required autocomplete="email" /></div>
          <button class="btn btn-primary btn-block" type="submit">Send reset link</button>
        </form>
      </div>`;
  send(res, 200, await layout({ title: "Reset password", user, body, noindex: true }));
}

export async function resetPasswordPage(req, res, query) {
  const token = query.get("token") || "";
  const target = await db.getUserByResetToken(token);
  const body = target
    ? `<div class="form-card narrow-card">
        <h1>Choose a new password</h1>
        ${notice(query.get("err"), "orange")}
        <form method="POST" action="/api/auth/reset-password" data-single-submit>
          <input type="hidden" name="token" value="${escapeHtml(token)}" />
          ${passwordFieldsMarkup({ idPrefix: "rp", label: "New password" })}
          <button class="btn btn-primary btn-block" type="submit">Save new password</button>
        </form>
      </div>`
    : `<div class="form-card narrow-card"><h1>This link has expired</h1><p class="muted">Reset links work once and expire after an hour.</p><a href="/forgot-password" class="btn btn-primary">Send a new link</a></div>`;
  send(res, 200, await layout({ title: "Choose a new password", user: null, body, noindex: true }));
}

// ---------------- Selling ----------------
export async function sellWelcomePage(req, res) {
  const user = await currentUser(req);
  if (user && (await db.getListingsByOwner(user.id)).length > 0) return redirect(res, "/sell");
  const steps = [
    ["Snap a few photos", "Show the space and what people see from the street. One photo is enough to start; up to 10 is better."],
    ["Set your price and details", "Any price you like — per month, per week, or “price on request”. Our pricing guide helps you gauge it."],
    ["Chat and deal directly", "Advertisers message you on Frontage. You agree the terms and get paid directly — Frontage takes no cut."],
  ];
  const body = `
    <div class="sell-intro">
      <h1>Turn your wall, fence or window into income</h1>
      <p class="muted">List advertising space for free. Local businesses find it, message you, and you deal directly.</p>
      <ol class="step-list">
        ${steps.map(([t, d], i) => `<li><span class="step-num-lg">${i + 1}</span><div><strong>${t}</strong><div class="small muted">${d}</div></div></li>`).join("")}
      </ol>
      <a href="${user ? "/sell/new" : "/onboarding?next=%2Fsell%2Fnew"}" class="btn btn-accent btn-block btn-lg">Get started</a>
      <p class="small muted" style="text-align:center;margin-top:12px">Not sure what to charge? <a href="/pricing-guide" class="link">Read the pricing guide</a>.</p>
    </div>`;
  send(res, 200, await layout({ title: "List your advertising space for free", activeNav: "sell", user, body, canonicalPath: "/sell/welcome" }));
}

export async function myListingsPage(req, res, query) {
  const user = await requireUser(req, res, "/sell");
  if (!user) return;
  const listings = await db.getListingsByOwner(user.id);
  const statusBadge = (l) =>
    l.status === "live" ? `<span class="badge badge-green">Live</span>` : l.status === "removed" ? `<span class="badge badge-orange">Removed by moderators</span>` : `<span class="badge badge-steel">${escapeHtml(l.status)}</span>`;
  const rows = listings
    .map(
      (l) => `<div class="listing-row">
        <a href="/listing/${escapeHtml(l.id)}" class="listing-row-thumb">${coverPhoto(l) ? `<img src="${escapeHtml(coverPhoto(l))}" alt="" loading="lazy" />` : ""}</a>
        <div class="listing-row-body">
          <a href="/listing/${escapeHtml(l.id)}"><strong>${escapeHtml(l.title)}</strong></a> ${statusBadge(l)}
          <div class="small muted">${escapeHtml(priceLabel(l))} · ${escapeHtml(categoryLabel(l.category))} · ${l.viewCount || 0} views · listed ${escapeHtml(timeAgo(l.createdAt))}</div>
          ${l.status === "removed" && l.removedReason ? `<div class="small" style="color:var(--red)">Reason: ${escapeHtml(l.removedReason)}</div>` : ""}
        </div>
        <div class="listing-row-actions"><a href="/sell/edit/${escapeHtml(l.id)}" class="btn btn-outline btn-sm">Edit</a></div>
      </div>`
    )
    .join("");
  const body = `
    <div class="page-head">
      <h1>My listings</h1>
      <a href="/sell/new" class="btn btn-accent">+ New listing</a>
    </div>
    ${notice(query.get("created") ? "Your listing is live." : query.get("deleted") ? "Listing deleted." : query.get("updated") ? "Changes saved." : "")}
    ${listings.length ? `<div class="listing-rows">${rows}</div>` : `<div class="panel empty-state"><p class="muted">You haven't listed anything yet.</p><a href="/sell/new" class="btn btn-accent">List your space</a></div>`}
    ${query.get("created") ? trackOnLoad("publish_listing", {}) : ""}`;
  send(res, 200, await layout({ title: "My listings", activeNav: "sell", user, body, noindex: true }));
}

// The single-page listing form, shared by create and edit. Submitted by
// public/listing-form.js (photos managed client-side: previews, reorder,
// in-browser resizing); validation errors come back as JSON and are shown
// inline, so nothing the seller typed is lost.
function listingFormMarkup({ listing = null, action, submitLabel, needsVerification }) {
  const v = listing || {};
  const mapsKey = browserMapsKey();
  const existingPhotos = JSON.stringify(v.photos || []).replace(/</g, "\\u003c");
  const fieldError = (name) => `<div class="field-error" data-error-for="${name}" hidden></div>`;
  const ytValue = v.youtubeId ? youTubeWatchUrl(v.youtubeId) : "";
  return `
    ${needsVerification ? `<div class="notice notice-orange">Verify your email before publishing — check your inbox, or <a href="/account" class="link">resend the link</a>.</div>` : ""}
    <form id="listing-form" class="listing-form" method="POST" action="${escapeHtml(action)}" enctype="multipart/form-data" novalidate
      data-existing-photos='${escapeHtml(existingPhotos)}' data-max-photos="${LISTING_MAX_PHOTOS}">
      <div class="form-error" id="form-error" role="alert" hidden></div>

      <section class="form-section">
        <h2>Photos</h2>
        <p class="small muted">Up to ${LISTING_MAX_PHOTOS}. Drag to reorder — the first photo is the cover. Show the space itself and what people see from the street.</p>
        <div id="photo-grid" class="photo-grid" aria-live="polite"></div>
        <label class="photo-add" id="photo-add">
          <input type="file" id="photo-input" name="photos" accept="image/*" multiple />
          <span>+ Add photos</span>
        </label>
        ${fieldError("photos")}
      </section>

      <section class="form-section">
        <div class="field">
          <label for="lf-title">Title</label>
          <input id="lf-title" name="title" required maxlength="${LISTING_TITLE_MAX_LENGTH}" value="${escapeHtml(v.title || "")}" placeholder="e.g. Street-facing brick wall on Pittwater Rd" data-counter="${LISTING_TITLE_MAX_LENGTH}" />
          ${fieldError("title")}
        </div>
        <div class="form-row">
          <div class="field">
            <label for="lf-price">Price (AUD)</label>
            <div class="input-prefix"><span>$</span><input id="lf-price" name="price" inputmode="decimal" value="${v.price > 0 ? escapeHtml(String(v.price)) : v.id ? "0" : ""}" placeholder="e.g. 250" /></div>
            <div class="hint">Enter 0 for “price on request”.</div>
            ${fieldError("price")}
          </div>
          <div class="field">
            <label for="lf-price-note">Price details <span class="optional">(optional)</span></label>
            <input id="lf-price-note" name="priceNote" maxlength="${LISTING_PRICE_NOTE_MAX_LENGTH}" value="${escapeHtml(v.priceNote || "")}" placeholder="e.g. per month, negotiable" list="price-note-examples" />
            <datalist id="price-note-examples">${PRICE_NOTE_EXAMPLES.map((e) => `<option value="${escapeHtml(e)}"></option>`).join("")}</datalist>
            ${fieldError("priceNote")}
          </div>
        </div>
        <p class="small" style="margin:-4px 0 16px"><a href="/pricing-guide" target="_blank" class="link">Not sure what to charge? See the pricing guide →</a></p>
        <div class="field">
          <label for="lf-category">Type of space</label>
          <select id="lf-category" name="category" required>
            <option value="">Choose…</option>
            ${CATEGORIES.map((c) => `<option value="${c}"${v.category === c ? " selected" : ""}>${categoryLabel(c)}</option>`).join("")}
          </select>
          ${fieldError("category")}
        </div>
        <div class="field">
          <label for="lf-desc">Description</label>
          <textarea id="lf-desc" name="description" rows="6" required maxlength="${LISTING_DESC_MAX_LENGTH}" data-counter="${LISTING_DESC_MAX_LENGTH}" placeholder="Where is it, who sees it (cars, pedestrians, members), how visible is it, is it lit at night, and what's included (printing, install)?">${escapeHtml(v.description || "")}</textarea>
          ${fieldError("description")}
        </div>
      </section>

      <section class="form-section">
        <h2>Location</h2>
        <div class="field address-field">
          <label for="lf-address">Address of the space</label>
          <input id="lf-address" name="address" required autocomplete="off" value="${escapeHtml(v.address || "")}" placeholder="Start typing the street address" aria-autocomplete="list" aria-controls="address-suggestions" />
          <ul id="address-suggestions" class="address-suggestions" role="listbox" hidden></ul>
          <input type="hidden" name="placeId" value="${escapeHtml(v.placeId || "")}" />
          <input type="hidden" name="lat" value="${v.lat != null ? escapeHtml(String(v.lat)) : ""}" />
          <input type="hidden" name="lng" value="${v.lng != null ? escapeHtml(String(v.lng)) : ""}" />
          <input type="hidden" name="suburb" value="${escapeHtml(v.suburb || "")}" />
          <input type="hidden" name="state" value="${escapeHtml(v.state || "")}" />
          <input type="hidden" name="postcode" value="${escapeHtml(v.postcode || "")}" />
          <input type="hidden" name="country" value="${escapeHtml(v.country || "")}" />
          ${fieldError("address")}
        </div>
        <label class="consent-row"><input type="checkbox" name="showExactLocation" value="1"${v.showExactLocation ? " checked" : ""} />
          <span><strong>Show the exact address and pin</strong><br/><span class="small muted">Leave this off and buyers only see the suburb and an approximate area until you share more in a message — recommended if it's your home.</span></span></label>
      </section>

      <section class="form-section">
        <h2>More details <span class="optional">(optional)</span></h2>
        <div class="form-row">
          <div class="field"><label for="lf-w">Width (metres)</label><input id="lf-w" name="widthM" inputmode="decimal" value="${v.widthM ? escapeHtml(String(v.widthM)) : ""}" placeholder="e.g. 2.4" /></div>
          <div class="field"><label for="lf-h">Height (metres)</label><input id="lf-h" name="heightM" inputmode="decimal" value="${v.heightM ? escapeHtml(String(v.heightM)) : ""}" placeholder="e.g. 1.2" /></div>
        </div>
        <div class="hint" style="margin-top:-8px;margin-bottom:12px">Up to ${LISTING_MAX_DIMENSION_M}m per side.</div>
        ${fieldError("size")}
        <div class="field">
          <label for="lf-yt">Video presentation <span class="optional">(YouTube link)</span></label>
          <input id="lf-yt" name="youtubeUrl" inputmode="url" value="${escapeHtml(ytValue)}" placeholder="https://youtu.be/…" />
          <div class="hint">A short video where you present the listing — walk the advertiser through the space, where it is, who passes it and how visible it is. Talk to camera or add voice-over; plain background footage on its own doesn't sell the space.</div>
          <div id="yt-preview" class="yt-preview" hidden></div>
          ${fieldError("youtubeUrl")}
        </div>
      </section>

      <div class="form-submit">
        <button class="btn btn-accent btn-lg" type="submit" id="listing-submit">${escapeHtml(submitLabel)}</button>
        <span class="small muted" id="listing-progress" aria-live="polite"></span>
      </div>
      <p class="small muted">By publishing you confirm you control this space (or have permission to offer it) and agree to the <a href="/terms" target="_blank" class="link">Terms</a>.</p>
    </form>
    <script>window.FRONTAGE_PLACES = ${JSON.stringify({ key: mapsKey || null, countries: placesCountries() })};</script>
    <script src="/listing-form.js" defer></script>`;
}

export async function newListingPage(req, res) {
  const user = await requireUser(req, res, "/sell/new");
  if (!user) return;
  const body = `
    <div class="form-page">
      <a href="${(await db.getListingsByOwner(user.id)).length ? "/sell" : "/"}" class="small muted">← Back</a>
      <h1 style="margin:8px 0 4px">List your space</h1>
      <p class="muted" style="margin-bottom:24px">Free to list. Advertisers message you and you deal directly.</p>
      ${listingFormMarkup({ action: "/api/listings", submitLabel: "Publish listing", needsVerification: isEmailConfigured() && !user.emailVerifiedAt })}
    </div>`;
  send(res, 200, await layout({ title: "List your space", activeNav: "sell", user, body, noindex: true }));
}

export async function editListingPage(req, res, id) {
  const user = await requireUser(req, res, `/sell/edit/${id}`);
  if (!user) return;
  const listing = await db.getListingById(id);
  if (!listing || listing.ownerId !== user.id || listing.status === "deleted") return notFoundPage(req, res);
  const body = `
    <div class="form-page">
      <a href="/sell" class="small muted">← My listings</a>
      <div class="page-head" style="margin-top:8px"><h1>Edit listing</h1><a href="/listing/${escapeHtml(listing.id)}" class="btn btn-outline btn-sm">View listing</a></div>
      ${listing.status === "removed" ? `<div class="notice notice-orange">Our moderators removed this listing${listing.removedReason ? `: ${escapeHtml(listing.removedReason)}` : ""}. Editing it won't put it back live — <a href="/contact" class="link">contact us</a> if you think this was a mistake.</div>` : ""}
      ${listingFormMarkup({ listing, action: `/api/listings/${listing.id}/update`, submitLabel: "Save changes", needsVerification: false })}
      <div class="panel danger-zone">
        <h2>Delete this listing</h2>
        <p class="small muted">Takes it off Frontage straight away. Your existing conversations stay in your inbox.</p>
        <form method="POST" action="/api/listings/${escapeHtml(listing.id)}/delete" data-confirm="Delete this listing? This can't be undone.">
          <button class="btn btn-danger" type="submit">Delete listing</button>
        </form>
      </div>
    </div>`;
  send(res, 200, await layout({ title: "Edit listing", activeNav: "sell", user, body, noindex: true }));
}

// ---------------- Account ----------------
export async function accountPage(req, res, query) {
  const user = await requireUser(req, res, "/account");
  if (!user) return;
  const updated = query.get("updated");
  const notices = `
    ${updated ? notice(`${updated} updated.`) : ""}
    ${notice(query.get("err"), "orange")}
    ${query.get("verified") ? notice("Email verified — you're all set.") : ""}
    ${
      isEmailConfigured() && !user.emailVerifiedAt
        ? `<div class="notice notice-orange">Your email isn't verified yet, so messaging and listing are locked. Check your inbox for the link.
            <form method="POST" action="/api/account/resend-verification" style="display:inline;margin-left:6px"><button class="btn-link link">Resend email</button></form></div>`
        : ""
    }`;
  const body = `
    <h1 style="margin-bottom:24px">Account</h1>
    ${notices}
    <div class="settings-shell">
      <nav class="settings-nav">
        <a href="#profile" data-section="profile" class="is-active">Personal info</a>
        <a href="#security" data-section="security">Login &amp; security</a>
        <a href="#notifications" data-section="notifications">Notifications</a>
      </nav>
      <div class="settings-content">
        <section class="settings-section" data-section="profile">
          <h2>Personal info</h2>
          <p class="section-hint">Other members see your first name (or business name) on your listings. Your email and mobile stay private.</p>
          <form method="POST" action="/api/account/profile">
            <div class="field"><label for="ac-name">Full name</label><input id="ac-name" name="fullName" required maxlength="80" value="${escapeHtml(user.fullName)}" /></div>
            <div class="field"><label for="ac-email">Email</label><input id="ac-email" type="email" name="email" required maxlength="200" value="${escapeHtml(user.email)}" />
              <div class="hint">Changing it means verifying the new address.</div></div>
            ${mobileFieldMarkup({ idPrefix: "ac-mobile", ...splitMobile(user.mobile) })}
            <div class="field"><label for="ac-biz">Business name <span class="optional">(optional)</span></label><input id="ac-biz" name="businessName" maxlength="100" value="${escapeHtml(user.businessName || "")}" />
              <div class="hint">Shown as the seller name on your listings instead of your first name.</div></div>
            <div class="field"><label for="ac-gbp">Google Business profile link <span class="optional">(optional)</span></label><input id="ac-gbp" type="url" name="googleBusinessUrl" maxlength="300" value="${escapeHtml(user.googleBusinessUrl || "")}" placeholder="https://g.page/your-business" /></div>
            <button class="btn btn-primary" type="submit">Save</button>
          </form>
        </section>
        <section class="settings-section" data-section="security" hidden>
          <h2>Login &amp; security</h2>
          <p class="section-hint">Changing your password logs you out on other devices.</p>
          <form method="POST" action="/api/account/password">
            <div class="field"><label for="ac-cur">Current password</label><input id="ac-cur" type="password" name="currentPassword" required autocomplete="current-password" /></div>
            ${passwordFieldsMarkup({ idPrefix: "ac", name: "newPassword", label: "New password" })}
            <button class="btn btn-primary" type="submit">Update password</button>
          </form>
        </section>
        <section class="settings-section" data-section="notifications" hidden>
          <h2>Notifications</h2>
          <p class="section-hint">We email you when someone messages you — at most one email until you've read the conversation.</p>
          <form method="POST" action="/api/account/notifications">
            <label class="consent-row"><input type="checkbox" name="notifyMessages" value="1"${user.notifyMessages ? " checked" : ""} /> <span>Email me about new messages</span></label>
            <button class="btn btn-primary" type="submit">Save</button>
          </form>
        </section>
      </div>
    </div>`;
  send(res, 200, await layout({ title: "Account", activeNav: "account", user, body, noindex: true }));
}

// ---------------- Content pages ----------------
function contentPage(inner) {
  return `<article class="content-page">${inner}</article>`;
}

export async function aboutPage(req, res) {
  const user = await currentUser(req);
  const body = contentPage(`
    <h1>About Frontage</h1>
    <p class="lead">Frontage is a marketplace for advertising space — the walls, fences, windows, screens and vehicles that people walk and drive past every day.</p>
    <p>Most of that space sits idle, while local businesses find traditional outdoor advertising expensive and hard to buy. Frontage puts the two together: owners list their space for free, and advertisers message them directly.</p>
    <p>Like any classifieds site, Frontage doesn't take part in the deal. You agree the price, the term and the details between yourselves, and payment goes straight to the owner — we don't take a cut.</p>
    <p><a href="/how-it-works" class="link">How it works →</a></p>`);
  send(res, 200, await layout({ title: "About", user, body, canonicalPath: "/about" }));
}

export async function howItWorksPage(req, res) {
  const user = await currentUser(req);
  const body = contentPage(`
    <h1>How it works</h1>
    <h2>If you have space</h2>
    <ol>
      <li><strong>List it free.</strong> Add photos, a price and a description. Buyers see only the suburb unless you choose to show the exact address.</li>
      <li><strong>Answer messages.</strong> Advertisers message you on Frontage, and we email you when they do.</li>
      <li><strong>Deal directly.</strong> Agree the price, dates, and who prints and installs the ad. Payment goes straight to you.</li>
    </ol>
    <h2>If you want to advertise</h2>
    <ol>
      <li><strong>Browse spaces</strong> by type, suburb or on the map.</li>
      <li><strong>Message the owner</strong> with your questions — availability, visibility, size, permits.</li>
      <li><strong>Agree the details</strong> with the owner. We recommend seeing the space first and putting the deal in writing.</li>
    </ol>
    <div class="panel-tint"><strong>Frontage never handles payments.</strong> If anyone asks you to pay “through Frontage”, it's a scam — please <a href="/contact" class="link">tell us</a>. Read our <a href="/safety" class="link">safety tips</a>.</div>`);
  send(res, 200, await layout({ title: "How it works", user, body, canonicalPath: "/how-it-works" }));
}

export async function pricingGuidePage(req, res) {
  const user = await currentUser(req);
  const body = contentPage(`
    <h1>Pricing guide</h1>
    <p class="lead">You can set any price you like. Here's how to work out a fair one.</p>
    <p>Look at similar spaces near you on Frontage, then use the examples below as a rough starting point. Enter <strong>0</strong> if you'd rather say “price on request” and negotiate each enquiry. Use the <em>price details</em> field to say what the price covers — e.g. “per month, min 3 months” or “includes install”.</p>
    <p class="small muted">These ranges are illustrative, in AUD, to help you gauge a price — they aren't a valuation or a guarantee of what a space will earn.</p>
    <h2>Example situations</h2>
    <div class="scenario-grid">
      ${PRICING_SCENARIOS.map(
        (s) => `<div class="scenario">
          <div class="small muted">${escapeHtml(categoryLabel(s.category))}</div>
          <h3>${escapeHtml(s.title)}</h3>
          <div class="scenario-range">${escapeHtml(s.range)}</div>
          <div class="small"><strong>Seen by:</strong> ${escapeHtml(s.seenBy)}</div>
          <p class="small muted">${escapeHtml(s.notes)}</p>
        </div>`
      ).join("")}
    </div>
    <h2>What moves the price</h2>
    <dl class="factor-list">
      ${PRICING_FACTORS.map((f) => `<div><dt>${escapeHtml(f.title)}</dt><dd>${escapeHtml(f.body)}</dd></div>`).join("")}
    </dl>
    <h2>Tips</h2>
    <ul>
      <li>Start in the middle of the range, and adjust if you get lots of enquiries (too cheap) or none (too dear).</li>
      <li>Photos taken from where people actually see the space make a bigger difference than size.</li>
      <li>If you know traffic or visitor numbers, put them in the description.</li>
    </ul>
    <p><a href="${user ? "/sell/new" : "/sell/welcome"}" class="btn btn-accent">List your space</a></p>`);
  send(res, 200, await layout({ title: "Pricing guide for advertising space", user, body, canonicalPath: "/pricing-guide", description: "How to price a wall, fence, window, billboard or screen for advertising — example situations, typical ranges and what moves the price." }));
}

export async function safetyPage(req, res) {
  const user = await currentUser(req);
  const body = contentPage(`
    <h1>Staying safe on Frontage</h1>
    <p class="lead">Most people on Frontage are genuine. These habits keep it that way.</p>
    <div class="tip-list">${SAFETY_TIPS.map((t) => `<div class="tip"><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.body)}</p></div>`).join("")}</div>
    <h2>Something not right?</h2>
    <p>Use the <strong>Report</strong> link on the listing or conversation — it goes straight to our moderators. If you've lost money, contact your bank straight away and report it to <a href="https://www.scamwatch.gov.au" target="_blank" rel="noopener" class="link">Scamwatch</a>.</p>`);
  send(res, 200, await layout({ title: "Safety tips", user, body, canonicalPath: "/safety" }));
}

export async function termsPage(req, res) {
  const user = await currentUser(req);
  const body = contentPage(`<h1>Terms of Use</h1><p class="small muted">Last updated ${LEGAL_UPDATED}</p>${termsHtml()}`);
  send(res, 200, await layout({ title: "Terms of Use", user, body, canonicalPath: "/terms" }));
}

export async function privacyPage(req, res) {
  const user = await currentUser(req);
  const body = contentPage(`<h1>Privacy Policy</h1><p class="small muted">Last updated ${LEGAL_UPDATED}</p>${privacyHtml()}`);
  send(res, 200, await layout({ title: "Privacy Policy", user, body, canonicalPath: "/privacy" }));
}

export async function contactPage(req, res, query) {
  const user = await currentUser(req);
  const body = `
    <div class="form-card narrow-card">
      <h1>Contact us</h1>
      <p class="small muted">Questions, feedback or a problem with a listing? We usually reply within two business days. To report a specific listing or conversation, use its Report link.</p>
      ${query.get("sent") ? notice("Thanks — we'll get back to you.") : ""}
      ${notice(query.get("err"), "orange")}
      <form method="POST" action="/api/contact" data-single-submit>
        <div class="field"><label for="ct-name">Name</label><input id="ct-name" name="name" required maxlength="80" value="${escapeHtml(user ? user.fullName : "")}" /></div>
        <div class="field"><label for="ct-email">Email</label><input id="ct-email" type="email" name="email" required maxlength="200" value="${escapeHtml(user ? user.email : "")}" /></div>
        <div class="field"><label for="ct-msg">Message</label><textarea id="ct-msg" name="message" rows="5" required maxlength="4000"></textarea></div>
        <div class="hp-field" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off" /></label></div>
        <button class="btn btn-primary btn-block" type="submit">Send message</button>
      </form>
    </div>`;
  send(res, 200, await layout({ title: "Contact", user, body, canonicalPath: "/contact" }));
}

// ---------------- Admin ----------------
export async function adminReportsPage(req, res, query) {
  const user = await requirePermission(req, res, "canAccessSupport", "/admin/reports");
  if (!user) return;
  const status = ["open", "actioned", "dismissed", "all"].includes(query.get("status")) ? query.get("status") : "open";
  const reports = await db.getReports(status === "all" ? null : status);
  const reasonLabel = Object.fromEntries(REPORT_REASONS);
  const rows = reports
    .map((r) => {
      const target =
        r.targetType === "listing"
          ? `Listing <a href="/listing/${escapeHtml(r.listingId)}" class="link">${escapeHtml(r.listingTitle || r.listingId)}</a> ${r.listingStatus && r.listingStatus !== "live" ? `<span class="badge badge-steel">${escapeHtml(r.listingStatus)}</span>` : ""}`
          : `Conversation <a href="/admin/conversations/${escapeHtml(r.conversationId)}" class="link">${escapeHtml(r.conversationId)}</a>${r.listingTitle ? ` about “${escapeHtml(r.listingTitle)}”` : ""}`;
      const actions =
        r.status === "open"
          ? `<form method="POST" action="/api/admin/reports/${escapeHtml(r.id)}/resolve" class="admin-actions">
              <input name="note" placeholder="Note / reason (shown to the seller if you remove a listing)" maxlength="500" />
              ${r.listingId && r.listingStatus === "live" ? `<button class="btn btn-outline btn-sm" name="action" value="remove_listing">Remove listing</button>` : ""}
              ${r.reportedUserId && !r.reportedUserSuspendedAt && r.reportedUserId !== user.id ? `<button class="btn btn-outline btn-sm" name="action" value="suspend_user" data-confirm="Suspend ${escapeHtml(r.reportedUserName || "this user")}? They'll be logged out and their listings hidden.">Suspend user</button>` : ""}
              <button class="btn btn-outline btn-sm" name="action" value="actioned">Mark actioned</button>
              <button class="btn btn-outline btn-sm" name="action" value="dismiss">Dismiss</button>
            </form>`
          : `<div class="small muted">${escapeHtml(r.status)} ${escapeHtml(timeAgo(r.resolvedAt))}${r.resolutionNote ? ` — ${escapeHtml(r.resolutionNote)}` : ""}</div>`;
      return `<div class="job-row">
        <div class="row-between"><strong>${escapeHtml(reasonLabel[r.reason] || r.reason)}</strong><span class="small muted">${escapeHtml(timeAgo(r.createdAt))} · ${escapeHtml(r.id)}</span></div>
        <div class="small">${target}</div>
        <div class="small muted">Reported user: ${r.reportedUserId ? `<a href="/admin/users?q=${encodeURIComponent(r.reportedUserId)}" class="link">${escapeHtml(r.reportedUserName || r.reportedUserId)}</a>${r.reportedUserSuspendedAt ? ` <span class="badge badge-orange">suspended</span>` : ""}` : "—"} · by ${escapeHtml(r.reporterName)}</div>
        ${r.details ? `<p class="small prewrap report-details">${escapeHtml(r.details)}</p>` : ""}
        ${actions}
      </div>`;
    })
    .join("");
  const tabs = ["open", "actioned", "dismissed", "all"].map((s) => `<a href="/admin/reports?status=${s}" class="chip-pill${s === status ? " is-active" : ""}">${s[0].toUpperCase() + s.slice(1)}</a>`).join("");
  const body = `${adminSubnav(user, "reports")}
    <h1>Reports</h1>
    ${notice(query.get("done") ? "Report updated." : "")}
    <div class="chip-row">${tabs}</div>
    ${reports.length ? `<div class="job-list">${rows}</div>` : `<div class="panel empty-state"><p class="muted">No ${status === "all" ? "" : status} reports.</p></div>`}`;
  send(res, 200, await layout({ title: "Reports", activeNav: "admin-reports", user, body, noindex: true }));
}

export async function adminConversationPage(req, res, id) {
  const user = await requirePermission(req, res, "canAccessSupport", `/admin/conversations/${id}`);
  if (!user) return;
  const convo = await db.getConversationById(id);
  if (!convo) return notFoundPage(req, res);
  const messages = await db.getMessagesForConversation(id);
  const names = { [convo.buyerId]: `${convo.buyerName} (buyer)`, [convo.sellerId]: `${convo.sellerName} (seller)` };
  const body = `${adminSubnav(user, "reports")}
    <a href="/admin/reports" class="small muted">← Reports</a>
    <h1 style="margin-top:8px">Conversation ${escapeHtml(convo.id)}</h1>
    <p class="small muted">About <a href="/listing/${escapeHtml(convo.listingId)}" class="link">${escapeHtml(convo.listingTitle)}</a> · buyer ${escapeHtml(convo.buyerName)} (${escapeHtml(convo.buyerId)}) · seller ${escapeHtml(convo.sellerName)} (${escapeHtml(convo.sellerId)}). Visible to moderators only because it was reported.</p>
    <div class="panel">${messages
      .map((m) => `<div class="admin-msg"><div class="small muted">${escapeHtml(names[m.senderId] || m.senderId)} · ${escapeHtml(new Date(m.createdAt).toLocaleString("en-AU"))}</div><div class="prewrap">${escapeHtml(m.body)}</div></div>`)
      .join("") || `<p class="muted">No messages.</p>`}</div>`;
  send(res, 200, await layout({ title: "Conversation", activeNav: "admin-reports", user, body, noindex: true }));
}

export async function adminListingsPage(req, res, query) {
  const user = await requirePermission(req, res, "canAccessSupport", "/admin/listings");
  if (!user) return;
  const listings = await db.getAllListingsAdmin();
  const badge = (s) => ({ live: "badge-green", removed: "badge-orange" }[s] || "badge-steel");
  const rows = listings
    .map((l) => {
      let action = "";
      if (l.status === "live") {
        action = `<form method="POST" action="/api/admin/listings/${escapeHtml(l.id)}/remove" class="admin-actions">
          <input name="reason" placeholder="Reason (emailed to the seller)" required maxlength="500" />
          <button class="btn btn-outline btn-sm" type="submit">Remove</button></form>`;
      } else if (l.status === "removed") {
        action = `<div class="small muted">Removed ${escapeHtml(formatDate(l.removedAt))}: “${escapeHtml(l.removedReason || "")}”</div>
          <form method="POST" action="/api/admin/listings/${escapeHtml(l.id)}/restore" style="margin-top:6px"><button class="btn btn-outline btn-sm" type="submit">Restore</button></form>`;
      }
      return `<div class="job-row">
        <div class="row-between"><div><a href="/listing/${escapeHtml(l.id)}" class="link"><strong>${escapeHtml(l.title)}</strong></a>
          <div class="small muted">${escapeHtml(l.id)} · ${escapeHtml(l.ownerName)} (${escapeHtml(l.ownerId)})${l.ownerSuspendedAt ? " · owner suspended" : ""} · ${escapeHtml(priceLabel(l))} · ${escapeHtml(timeAgo(l.createdAt))}</div></div>
          <span class="badge ${badge(l.status)}">${escapeHtml(l.status)}</span></div>
        ${action}
      </div>`;
    })
    .join("");
  const body = `${adminSubnav(user, "listings")}
    <h1>Listings</h1>
    ${notice(query.get("done") ? "Listing updated." : "")}
    <p class="muted small">Every listing, newest first. Removing one takes it off Frontage immediately and emails the seller the reason. Seller-deleted listings can't be restored.</p>
    ${listings.length ? `<div class="job-list">${rows}</div>` : `<div class="panel empty-state"><p class="muted">No listings yet.</p></div>`}`;
  send(res, 200, await layout({ title: "Listings", activeNav: "admin-listings", user, body, noindex: true }));
}

export async function adminUsersPage(req, res, query) {
  const user = await requirePermission(req, res, "canAccessSupport", "/admin/users");
  if (!user) return;
  const q = (query.get("q") || "").slice(0, 100);
  const users = await db.searchUsers(q);
  const rows = users
    .map(
      (u) => `<div class="job-row">
        <div class="row-between"><div><strong>${escapeHtml(u.fullName)}</strong> <span class="small muted">${escapeHtml(u.id)}</span>
          <div class="small muted">${escapeHtml(u.email)}${u.mobile ? ` · ${escapeHtml(u.mobile)}` : ""} · joined ${escapeHtml(formatDate(u.createdAt))} · ${u.liveListingCount} live listing${u.liveListingCount === 1 ? "" : "s"} · ${u.emailVerifiedAt ? "verified" : "unverified"}</div></div>
          ${u.suspendedAt ? `<span class="badge badge-orange">Suspended</span>` : u.isAdmin ? `<span class="badge badge-blue">Admin</span>` : ""}</div>
        ${u.suspendedAt ? `<div class="small muted">Suspended ${escapeHtml(formatDate(u.suspendedAt))}${u.suspendedReason ? `: ${escapeHtml(u.suspendedReason)}` : ""}</div>` : ""}
        ${
          u.isAdmin || u.id === user.id
            ? ""
            : u.suspendedAt
            ? `<form method="POST" action="/api/admin/users/${escapeHtml(u.id)}/unsuspend" class="admin-actions"><button class="btn btn-outline btn-sm" type="submit">Lift suspension</button></form>`
            : `<form method="POST" action="/api/admin/users/${escapeHtml(u.id)}/suspend" class="admin-actions" data-confirm="Suspend ${escapeHtml(u.fullName)}? They'll be logged out and their listings hidden.">
                 <input name="reason" placeholder="Reason (internal)" maxlength="500" /><button class="btn btn-outline btn-sm" type="submit">Suspend</button></form>`
        }
      </div>`
    )
    .join("");
  const body = `${adminSubnav(user, "users")}
    <h1>Users</h1>
    ${notice(query.get("done") ? "User updated." : "")}
    <form method="GET" action="/admin/users" class="field-pill" style="max-width:420px;margin-bottom:18px"><input type="search" name="q" value="${escapeHtml(q)}" placeholder="Search name, email or ID" aria-label="Search users" /></form>
    ${users.length ? `<div class="job-list">${rows}</div>` : `<div class="panel empty-state"><p class="muted">No users found.</p></div>`}`;
  send(res, 200, await layout({ title: "Users", activeNav: "admin-users", user, body, noindex: true }));
}

export async function adminStaffPage(req, res, query) {
  const user = await requireSuperAdmin(req, res, "/admin/staff");
  if (!user) return;
  const staff = (await db.searchUsers("", 500)).filter((u) => u.isAdmin || PERMISSIONS.some((p) => u[p.key]));
  const rows = staff
    .map((u) => {
      const checkboxes = PERMISSIONS.map(
        (p) => `<label class="small consent-row"><input type="checkbox" name="${p.key}" value="1" ${u[p.key] ? "checked" : ""} /> ${escapeHtml(p.label)}</label>`
      ).join("");
      return `<div class="job-row">
        <div class="row-between"><div><strong>${escapeHtml(u.fullName)}</strong><div class="small muted">${escapeHtml(u.email)}</div></div>${u.isAdmin ? `<span class="badge badge-blue">Super-admin</span>` : ""}</div>
        ${u.isAdmin ? `<div class="small muted">Super-admins have every permission.</div>` : `<form method="POST" action="/api/admin/users/${escapeHtml(u.id)}/permissions">${checkboxes}<button class="btn btn-outline btn-sm" type="submit">Save</button></form>`}
      </div>`;
    })
    .join("");
  const body = `${adminSubnav(user, "staff")}
    <h1>Staff access</h1>
    ${notice(query.get("done") ? "Permissions saved." : "")}
    ${notice(query.get("err"), "orange")}
    <p class="muted small">Give an existing account moderation access by email. They must sign up first.</p>
    <form method="POST" action="/api/admin/staff" class="admin-actions" style="margin-bottom:22px">
      <input type="email" name="email" required placeholder="their@email.com" />
      ${PERMISSIONS.map((p) => `<input type="hidden" name="${p.key}" value="1" />`).join("")}
      <button class="btn btn-primary btn-sm" type="submit">Grant moderation access</button>
    </form>
    <div class="job-list">${rows}</div>`;
  send(res, 200, await layout({ title: "Staff access", activeNav: "admin-staff", user, body, noindex: true }));
}
