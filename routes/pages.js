import { layout, contractorLayout, escapeHtml } from "../lib/layout.js";
import { currentUser, currentContractor } from "../lib/auth.js";
import * as db from "../lib/db.js";
import { money, formatMm, formatDate, svgSpaceDiagram, svgEyesGauge, STAGE_LABELS, STAGES, estimateJobFee, leaseEndIso, daysUntil } from "../lib/format.js";
import { CATEGORIES, CATEGORY_LABEL } from "../lib/categories.js";
import { PERMISSIONS, hasPermission } from "../lib/permissions.js";
import { isStripeConfigured } from "../lib/payments.js";
import { isEmailConfigured } from "../lib/email.js";
import { adUnitMarkup } from "../lib/ads.js";
import { PASSWORD_PATTERN, PASSWORD_HINT } from "../lib/auth.js";
import { COUNTRIES } from "../lib/countries.js";

function send(res, status, html) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}
function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}
async function requireUser(req, res, nextPath) {
  const user = await currentUser(req);
  if (!user) {
    redirect(res, `/onboarding?next=${encodeURIComponent(nextPath)}`);
    return null;
  }
  return user;
}
// Since the Staff area has zero presence in the main nav (access is via a
// single footer link only), each admin page renders this strip so a staff
// member can reach whichever other admin sections they have permission for
// once they've landed on any one of them.
function adminSubnav(user, activeKey) {
  const items = [];
  if (hasPermission(user, "canApproveContractors")) items.push({ key: "contractor-apps", href: "/admin/contractor-applications", label: "Contractor department" });
  if (hasPermission(user, "canAccessSupport")) items.push({ key: "deals", href: "/admin/deals", label: "Customer service" }, { key: "listings", href: "/admin/listings", label: "Listings" });
  if (hasPermission(user, "canCreateBdrListings")) items.push({ key: "bdr", href: "/sell/bdr-new", label: "Create BDR listing" });
  if (user.isAdmin) items.push({ key: "staff", href: "/admin/staff", label: "Manage staff" });
  if (items.length <= 1) return "";
  return `<div class="admin-subnav">${items.map((i) => `<a href="${i.href}"${i.key === activeKey ? ' class="active"' : ""}>${i.label}</a>`).join("")}</div>`;
}

async function requireContractor(req, res, nextPath) {
  const contractor = await currentContractor(req);
  if (!contractor) {
    redirect(res, `/contractor/login?next=${encodeURIComponent(nextPath)}`);
    return null;
  }
  return contractor;
}
async function requirePermission(req, res, key, nextPath) {
  const user = await currentUser(req);
  if (!user) {
    redirect(res, `/onboarding?next=${encodeURIComponent(nextPath)}`);
    return null;
  }
  if (!hasPermission(user, key)) {
    send(res, 403, await layout({ title: "Forbidden", user, body: `<div class="panel"><h2>403</h2><p class="muted">You don't have access to this area.</p></div>` }));
    return null;
  }
  return user;
}
async function requireSuperAdmin(req, res, nextPath) {
  const user = await currentUser(req);
  if (!user) {
    redirect(res, `/onboarding?next=${encodeURIComponent(nextPath)}`);
    return null;
  }
  if (!user.isAdmin) {
    send(res, 403, await layout({ title: "Forbidden", user, body: `<div class="panel"><h2>403</h2><p class="muted">Super-admin access only.</p></div>` }));
    return null;
  }
  return user;
}

// ---------------- Browse ----------------
const SORT_OPTIONS = {
  newest: { label: "Newest", cmp: (a, b) => (b.__seq || 0) - (a.__seq || 0) },
  price_asc: { label: "Price: low to high", cmp: (a, b) => a.price - b.price },
  price_desc: { label: "Price: high to low", cmp: (a, b) => b.price - a.price },
  exposure_desc: { label: "Most exposure", cmp: (a, b) => (b.estimatedEyesPerDay || 0) - (a.estimatedEyesPerDay || 0) },
};

// Every filter/sort param that should survive a category-chip click or a
// filter-form submit, carried forward as hidden fields / querystring so
// browsing never silently drops an active filter.
const FILTER_PARAM_KEYS = ["q", "minPrice", "maxPrice", "minArea", "minEyes", "sort"];

export async function browsePage(req, res, query) {
  const user = await currentUser(req);
  let listings = await db.getListings();
  const cat = query.get("category");
  const q = (query.get("q") || "").toLowerCase();
  const minPrice = parseFloat(query.get("minPrice"));
  const maxPrice = parseFloat(query.get("maxPrice"));
  const minArea = parseFloat(query.get("minArea")); // buyer-facing unit: m²
  const minEyes = parseInt(query.get("minEyes"), 10);
  const sortKey = SORT_OPTIONS[query.get("sort")] ? query.get("sort") : "newest";

  if (cat && cat !== "all") listings = listings.filter((l) => l.category === cat);
  if (q) listings = listings.filter((l) => `${l.title} ${l.venue} ${l.suburb}`.toLowerCase().includes(q));
  if (Number.isFinite(minPrice)) listings = listings.filter((l) => l.price >= minPrice);
  if (Number.isFinite(maxPrice)) listings = listings.filter((l) => l.price <= maxPrice);
  if (Number.isFinite(minArea)) listings = listings.filter((l) => (l.sizeW * l.sizeH) / 1e6 >= minArea);
  if (Number.isFinite(minEyes)) listings = listings.filter((l) => (l.estimatedEyesPerDay || 0) >= minEyes);
  listings = listings.slice().sort(SORT_OPTIONS[sortKey].cmp);

  // Carries every active filter/sort param forward into a link's querystring
  // (used by category chips) so switching category never resets a filter.
  function withParams(extra) {
    const params = new URLSearchParams();
    for (const key of FILTER_PARAM_KEYS) {
      const val = query.get(key);
      if (val) params.set(key, val);
    }
    Object.entries(extra).forEach(([k, v]) => (v ? params.set(k, v) : params.delete(k)));
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  }

  const cards = listings
    .map(
      (l) => `
      <a class="card" href="/listing/${l.id}">
        <div class="card-diagram">${l.photos && l.photos.length ? `<img src="${escapeHtml(l.photos[0])}" alt="" style="width:100%;height:100%;object-fit:cover" />` : svgSpaceDiagram(l.sizeW, l.sizeH)}</div>
        <div class="card-body">
          <div class="row-between" style="margin-bottom:8px">
            <div class="badge badge-blue">✓ Verified · ★ ${l.rating} (${l.reviews})</div>
            ${l.estimatedEyesPerDay ? `<div class="badge badge-steel">${l.estimatedEyesPerDay >= 1000 ? (l.estimatedEyesPerDay / 1000).toFixed(1) + "k" : l.estimatedEyesPerDay} eyes/day</div>` : ""}
          </div>
          <h3 style="font-size:16px">${escapeHtml(l.title)}</h3>
          <div class="muted small">${escapeHtml(l.venue)} · ${escapeHtml(l.suburb)}, Sydney${l.subtype ? ` · ${escapeHtml(l.subtype)}` : ""}</div>
          <div class="row-between" style="margin-top:12px;padding-top:12px;border-top:1px solid #EAE7DF">
            <div class="mono" style="font-weight:700">${money(l.price)}<span class="muted small"> /mo</span></div>
            <span class="small" style="color:var(--orange);font-weight:600">View space →</span>
          </div>
        </div>
      </a>`
    )
    .join("");

  const categoryChips = ["all", ...CATEGORIES]
    .map((c) => {
      const active = (cat || "all") === c;
      return `<a href="${withParams({ category: c === "all" ? "" : c })}" class="btn btn-sm ${active ? "btn-dark" : "btn-outline"}">${c === "all" ? "All spaces" : CATEGORY_LABEL[c]}</a>`;
    })
    .join(" ");

  const sortOptionsHtml = Object.entries(SORT_OPTIONS)
    .map(([key, opt]) => `<option value="${key}"${key === sortKey ? " selected" : ""}>${opt.label}</option>`)
    .join("");

  const activeFilterCount = [minPrice, maxPrice, minArea, minEyes].filter(Number.isFinite).length;

  // Google Maps when a key is configured (see .env.example) — otherwise the
  // free Leaflet/OpenStreetMap map, same as before. Either way the toggle
  // and card layout behave identically; only the map engine differs.
  const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY;

  const body = `
    <div class="hero-row">
      <div>
        <h1 class="hero-headline">FREE SPACE,<br/><span style="color:var(--orange)">FREE MONEY.</span></h1>
        <p class="hero-sub">List your wall, window, or fence space and start earning from advertisers — or find the right spot to put your ad up.</p>
      </div>
      ${user ? `<a href="/sell/new" class="btn btn-primary btn-lg">List a space</a>` : `<a href="/onboarding" class="btn btn-primary btn-lg">Get started</a>`}
    </div>

    <div class="row-between" style="margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <h2 style="font-size:20px">Browse spaces</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <form method="GET" action="/" style="display:flex;gap:8px">
          ${cat ? `<input type="hidden" name="category" value="${escapeHtml(cat)}" />` : ""}
          ${FILTER_PARAM_KEYS.filter((k) => k !== "q").map((k) => (query.get(k) ? `<input type="hidden" name="${k}" value="${escapeHtml(query.get(k))}" />` : "")).join("")}
          <input type="text" name="q" placeholder="Search suburb, venue, or space" value="${escapeHtml(query.get("q") || "")}"
            style="padding:9px 12px;border-radius:8px;border:1px solid var(--border);background:var(--white);font-size:13px;min-width:220px" />
          <button class="btn btn-outline btn-sm" type="submit">Search</button>
        </form>
        <button type="button" id="map-toggle-btn" class="btn btn-outline btn-sm">🗺️ Map view</button>
      </div>
    </div>
    <div id="browse-map" style="display:none;height:420px;border-radius:10px;overflow:hidden;border:1px solid var(--border);margin-bottom:18px"></div>
    <div class="row-between" style="margin-bottom:18px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;flex-wrap:wrap;gap:8px">${categoryChips}</div>
      <details class="nav-dropdown" id="filters-details">
        <summary class="btn btn-outline btn-sm" style="cursor:pointer;list-style:none">⚙️ Filters${activeFilterCount ? ` (${activeFilterCount})` : ""}</summary>
        <form method="GET" action="/" class="nav-dropdown-menu" style="padding:16px;min-width:260px;right:0;left:auto">
          ${cat ? `<input type="hidden" name="category" value="${escapeHtml(cat)}" />` : ""}
          ${query.get("q") ? `<input type="hidden" name="q" value="${escapeHtml(query.get("q"))}" />` : ""}
          <div class="form-row">
            <div class="field" style="margin-bottom:10px"><label>Min price/mo</label><input type="number" name="minPrice" value="${Number.isFinite(minPrice) ? minPrice : ""}" placeholder="$0" /></div>
            <div class="field" style="margin-bottom:10px"><label>Max price/mo</label><input type="number" name="maxPrice" value="${Number.isFinite(maxPrice) ? maxPrice : ""}" placeholder="Any" /></div>
          </div>
          <div class="field" style="margin-bottom:10px"><label>Min size (m²)</label><input type="number" step="0.1" name="minArea" value="${Number.isFinite(minArea) ? minArea : ""}" placeholder="Any" /></div>
          <div class="field" style="margin-bottom:10px"><label>Min exposure (eyes/day)</label><input type="number" name="minEyes" value="${Number.isFinite(minEyes) ? minEyes : ""}" placeholder="Any" /></div>
          <div class="field" style="margin-bottom:12px"><label>Sort by</label><select name="sort">${sortOptionsHtml}</select></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary btn-sm" type="submit" style="flex:1">Apply</button>
            <a href="${withParams({ minPrice: "", maxPrice: "", minArea: "", minEyes: "", sort: "" })}" class="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>
      </details>
    </div>
    <div id="browse-results">${listings.length === 0 ? `<p class="muted">No spaces match that search.</p>` : `<div class="grid">${cards}</div>`}</div>
    <div id="browse-below-fold" style="margin-top:24px">${adUnitMarkup("ADSENSE_SLOT_BROWSE")}</div>
    <script>
      (function () {
        var btn = document.getElementById("map-toggle-btn");
        var mapEl = document.getElementById("browse-map");
        var resultsEl = document.getElementById("browse-results");
        var belowFoldEl = document.getElementById("browse-below-fold");
        var loaded = false;
        btn.addEventListener("click", function () {
          var showing = mapEl.style.display !== "none";
          if (showing) {
            mapEl.style.display = "none";
            resultsEl.style.display = "";
            belowFoldEl.style.display = "";
            btn.textContent = "🗺️ Map view";
            return;
          }
          mapEl.style.display = "block";
          resultsEl.style.display = "none";
          belowFoldEl.style.display = "none";
          btn.textContent = "📋 List view";
          if (!loaded) {
            loaded = true;
            window.FRONTAGE_MAP_TARGET = "browse-map";
            ${
              googleMapsKey
                ? `var loaderScript = document.createElement("script");
            loaderScript.src = "/google-map.js";
            loaderScript.onload = function () {
              var gScript = document.createElement("script");
              gScript.src = "https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsKey)}&callback=frontageInitGoogleMap";
              gScript.async = true;
              document.head.appendChild(gScript);
            };
            document.body.appendChild(loaderScript);`
                : `var link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
            document.head.appendChild(link);
            var leafletScript = document.createElement("script");
            leafletScript.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
            leafletScript.onload = function () {
              var mapScript = document.createElement("script");
              mapScript.src = "/map.js";
              document.body.appendChild(mapScript);
            };
            document.body.appendChild(leafletScript);`
            }
          } else if (window.__frontageMap) {
            setTimeout(function () {
              if (window.google && window.google.maps) {
                google.maps.event.trigger(window.__frontageMap, "resize");
              } else if (window.__frontageMap.invalidateSize) {
                window.__frontageMap.invalidateSize();
              }
            }, 50);
          }
        });
      })();
    </script>
  `;

  send(res, 200, await layout({ title: "Browse spaces", activeNav: "browse", user, body }));
}

// Full-screen photo viewer with prev/next — replaces the old
// `<a target="_blank">` navigation, which some browsers/OSes treated as a
// download prompt for images served from R2 instead of opening them.
// Clicking a photo now only ever opens this in-page overlay.
function lightboxMarkup(photos) {
  // Raw JS source inside a <script> tag, not an HTML attribute — no
  // HTML-escaping needed, just guard against a literal "</script>" if a
  // photo URL ever contained one.
  const photosJs = JSON.stringify(photos).replace(/</g, "\\u003c");
  return `
    <div id="frontage-lightbox" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:200;align-items:center;justify-content:center;flex-direction:column">
      <button type="button" onclick="frontageCloseLightbox()" aria-label="Close" style="position:absolute;top:16px;right:20px;background:none;border:none;color:#fff;font-size:30px;cursor:pointer;line-height:1;padding:6px">&times;</button>
      <button type="button" onclick="frontagePrevPhoto()" aria-label="Previous photo" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#fff;font-size:38px;cursor:pointer;padding:10px">&#8249;</button>
      <img id="frontage-lightbox-img" src="" alt="" style="max-width:88vw;max-height:78vh;object-fit:contain;border-radius:6px" />
      <button type="button" onclick="frontageNextPhoto()" aria-label="Next photo" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#fff;font-size:38px;cursor:pointer;padding:10px">&#8250;</button>
      <div id="frontage-lightbox-counter" class="small" style="color:#fff;margin-top:10px"></div>
    </div>
    <script>
      (function () {
        var photos = ${photosJs};
        var idx = 0;
        var overlay = document.getElementById("frontage-lightbox");
        var imgEl = document.getElementById("frontage-lightbox-img");
        var counterEl = document.getElementById("frontage-lightbox-counter");
        function render() {
          imgEl.src = photos[idx];
          counterEl.textContent = (idx + 1) + " / " + photos.length;
        }
        window.frontageOpenLightbox = function (i) {
          idx = i;
          render();
          overlay.style.display = "flex";
        };
        window.frontageCloseLightbox = function () {
          overlay.style.display = "none";
        };
        window.frontagePrevPhoto = function () {
          idx = (idx - 1 + photos.length) % photos.length;
          render();
        };
        window.frontageNextPhoto = function () {
          idx = (idx + 1) % photos.length;
          render();
        };
        overlay.addEventListener("click", function (e) {
          if (e.target === overlay) window.frontageCloseLightbox();
        });
        document.addEventListener("keydown", function (e) {
          if (overlay.style.display === "none") return;
          if (e.key === "Escape") window.frontageCloseLightbox();
          if (e.key === "ArrowLeft") window.frontagePrevPhoto();
          if (e.key === "ArrowRight") window.frontageNextPhoto();
        });
      })();
    </script>
  `;
}

// Country-code select + national-number input, combined into a single
// "mobile" value (e.g. "+61 412 345 678") by the client script right
// before submit — the server just receives one mobile field either way.
function mobileFieldMarkup({ idPrefix = "mobile" } = {}) {
  const options = COUNTRIES.map(
    (c) => `<option value="${c.dial}" data-min="${c.digits[0]}" data-max="${c.digits[1]}"${c.iso === "AU" ? " selected" : ""}>${escapeHtml(c.name)} (${c.dial})</option>`
  ).join("");
  return `<div class="field">
    <label>Mobile</label>
    <div style="display:flex;gap:8px">
      <select id="${idPrefix}-dial" style="flex:0 0 168px">${options}</select>
      <input type="tel" id="${idPrefix}-number" required inputmode="numeric" pattern="[0-9]*" placeholder="412 345 678" style="flex:1" />
    </div>
    <div class="hint" id="${idPrefix}-hint"></div>
  </div>
  <script>
    (function () {
      var sel = document.getElementById("${idPrefix}-dial");
      var num = document.getElementById("${idPrefix}-number");
      var hint = document.getElementById("${idPrefix}-hint");
      var form = num.closest("form");
      function update() {
        var opt = sel.options[sel.selectedIndex];
        num.setAttribute("maxlength", opt.getAttribute("data-max"));
        var min = opt.getAttribute("data-min"), max = opt.getAttribute("data-max");
        hint.textContent = (min === max ? min : min + "–" + max) + " digits, no spaces";
      }
      sel.addEventListener("change", update);
      update();
      if (form) {
        form.addEventListener("submit", function () {
          var hidden = document.createElement("input");
          hidden.type = "hidden";
          hidden.name = "mobile";
          hidden.value = sel.value + " " + num.value;
          form.appendChild(hidden);
        });
      }
    })();
  </script>`;
}

// Password + confirm-password pair with a live "do these match" hint. The
// `pattern`/`title` mirror lib/auth.js's isStrongPassword() exactly so a
// password the client accepts is never rejected as a surprise server-side.
function passwordFieldsMarkup({ idPrefix = "pw", label = "Password" } = {}) {
  return `
    <div class="field"><label>${escapeHtml(label)}</label><input type="password" name="password" id="${idPrefix}-password" required pattern="${PASSWORD_PATTERN}" title="${escapeHtml(PASSWORD_HINT)}" placeholder="At least 10 characters" minlength="10" /></div>
    <div class="small muted" style="margin-top:-8px;margin-bottom:14px">${escapeHtml(PASSWORD_HINT)}</div>
    <div class="field"><label>Confirm ${escapeHtml(label.toLowerCase())}</label><input type="password" name="confirmPassword" id="${idPrefix}-confirm" required /></div>
    <div class="small" id="${idPrefix}-match-hint" style="margin-top:-8px;margin-bottom:14px"></div>
    <script>
      (function () {
        var pw = document.getElementById("${idPrefix}-password");
        var cf = document.getElementById("${idPrefix}-confirm");
        var hint = document.getElementById("${idPrefix}-match-hint");
        function check() {
          if (!cf.value) { hint.textContent = ""; return; }
          if (pw.value === cf.value) { hint.textContent = "✓ Passwords match"; hint.style.color = "var(--green)"; }
          else { hint.textContent = "Passwords do not match"; hint.style.color = "var(--red)"; }
        }
        pw.addEventListener("input", check);
        cf.addEventListener("input", check);
      })();
    </script>`;
}

// ---------------- Listing detail ----------------
export async function listingDetailPage(req, res, id) {
  const user = await currentUser(req);
  const listing = await db.getListingById(id);
  if (!listing || listing.status !== "live") return send(res, 404, await layout({ title: "Not found", user, body: "<p>Listing not found.</p>" }));
  const owner = await db.getUserById(listing.ownerId);
  const feePreview = listing.price * 0.15;
  if (!user || user.id !== listing.ownerId) await db.incrementListingView(listing.id);

  const photos = listing.photos || [];
  const isOwner = Boolean(user && user.id === listing.ownerId);
  const thumbStrip =
    photos.length > 1
      ? `<div style="display:flex;gap:6px;margin-top:6px">${photos
          .slice(1)
          .map(
            (p, i) =>
              `<button type="button" onclick="frontageOpenLightbox(${i + 1})" style="padding:0;border:1px solid var(--border);border-radius:6px;cursor:zoom-in;background:none"><img src="${escapeHtml(p)}" alt="" style="width:64px;height:48px;object-fit:cover;border-radius:5px;display:block" /></button>`
          )
          .join("")}</div>`
      : "";

  const body = `
    <a href="/" class="small muted">← Back to browse</a>
    <div class="two-col" style="margin-top:14px;align-items:start">
      <div>
        <div class="panel" style="padding:0;overflow:hidden">
          <div class="card-diagram" style="height:280px;background:var(--concrete)">${
            photos.length
              ? `<button type="button" onclick="frontageOpenLightbox(0)" title="View full photo" style="width:100%;height:100%;padding:0;border:none;background:none;cursor:zoom-in"><img src="${escapeHtml(photos[0])}" alt="" style="width:100%;height:100%;object-fit:contain" /></button>`
              : svgSpaceDiagram(listing.sizeW, listing.sizeH, { big: true })
          }</div>
        </div>
        ${photos.length ? `<div class="small muted" style="margin-top:6px">Click the photo to view it full size.</div>` : ""}
        ${thumbStrip}
        ${photos.length ? lightboxMarkup(photos) : ""}
      </div>
      <div>
        <div class="row-between" style="margin-bottom:8px">
          <div class="badge badge-blue">Verified · ★ ${listing.rating} (${listing.reviews} reviews)</div>
          ${listing.estimatedEyesPerDay ? svgEyesGauge(listing.estimatedEyesPerDay, { big: true }) : ""}
        </div>
        <h1 style="font-size:26px">${escapeHtml(listing.title)}</h1>
        <div class="muted" style="margin-bottom:16px">${escapeHtml(listing.venue)} · ${escapeHtml(listing.suburb)}, Sydney${listing.subtype ? ` · ${escapeHtml(listing.subtype)}` : ""}</div>
        <p style="margin-bottom:18px">${escapeHtml(listing.desc)}</p>
        <div class="panel-tint stat-grid-3" style="margin-bottom:18px">
          <div><div class="mono" style="font-weight:700">${formatMm(listing.sizeW)} × ${formatMm(listing.sizeH)}</div><div class="small muted">Space size</div></div>
          <div><div class="mono" style="font-weight:700">${money(listing.price)}/mo</div><div class="small muted">Lease rate</div></div>
          <div><div class="mono" style="font-weight:700">${escapeHtml(listing.footfall)}</div><div class="small muted">Exposure</div></div>
        </div>
        ${
          listing.lat != null && listing.lng != null
            ? `<div id="listing-mini-map" style="height:170px;border-radius:10px;overflow:hidden;border:1px solid var(--border);margin-bottom:18px"></div>
               <script>window.FRONTAGE_SINGLE_LISTING = { lat: ${listing.lat}, lng: ${listing.lng}, title: ${JSON.stringify(listing.title)} };</script>
               <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
               <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
               <script src="/listing-map.js"></script>`
            : ""
        }
        ${
          owner
            ? `<div class="panel" style="margin-bottom:18px;display:flex;gap:12px;align-items:center">
                 <div style="width:44px;height:44px;border-radius:50%;background:var(--concrete);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--ink);flex-shrink:0">${escapeHtml(
                   (owner.businessName || owner.fullName || "?").charAt(0).toUpperCase()
                 )}</div>
                 <div style="flex:1;min-width:0">
                   <div style="font-weight:700">${escapeHtml(owner.businessName || owner.fullName)}</div>
                   <div class="small muted">Listed by ${escapeHtml(owner.fullName)}</div>
                   ${owner.googleBusinessUrl ? `<a href="${escapeHtml(owner.googleBusinessUrl)}" target="_blank" rel="noopener" class="small" style="color:var(--blue)">View on Google →</a>` : ""}
                 </div>
               </div>`
            : ""
        }
        <div style="margin-bottom:18px">${adUnitMarkup("ADSENSE_SLOT_LISTING")}</div>
        ${
          isOwner
            ? `<div class="badge badge-blue" style="margin-bottom:12px;display:block;padding:10px">This is your listing.</div>
               <a href="/sell/insights/${listing.id}" class="btn btn-primary btn-block">View insights</a>
               <a href="/seller/inquiries" class="btn btn-outline btn-block" style="margin-top:10px">Buyer inquiries</a>`
            : `<div class="small muted" style="border:1px dashed var(--steel);border-radius:8px;padding:10px;margin-bottom:18px">
                 Platform fee on booking (15%) at this rate: ${money(feePreview)}/mo — deducted from the seller's payout.
               </div>
               <a href="/book/${listing.id}" class="btn btn-primary btn-block">Book this space</a>
               ${user ? `<a href="/listing/${listing.id}/chat" class="btn btn-outline btn-block" style="margin-top:10px">Ask the seller a question</a>` : ""}`
        }
      </div>
    </div>
  `;
  send(res, 200, await layout({ title: listing.title, activeNav: "browse", user, body }));
}

// ---------------- Listing inquiry chat ----------------
export async function listingChatPage(req, res, listingId, query) {
  const user = await requireUser(req, res, `/listing/${listingId}/chat`);
  if (!user) return;
  const listing = await db.getListingById(listingId);
  if (!listing) return send(res, 404, await layout({ title: "Not found", user, body: "<p>Listing not found.</p>" }));

  const isOwner = listing.ownerId === user.id;
  let buyerId;
  if (isOwner) {
    buyerId = query.get("buyer");
    if (!buyerId) return redirect(res, "/seller/inquiries");
  } else {
    buyerId = user.id;
  }
  const threadId = `${listing.id}:${buyerId}`;
  const messages = await db.getMessagesForThread("listing", threadId);
  const buyer = await db.getUserById(buyerId);

  const body = `
    <a href="${isOwner ? "/seller/inquiries" : `/listing/${listing.id}`}" class="small muted">← Back</a>
    <h1 style="font-size:20px;margin:10px 0 4px">${escapeHtml(listing.title)}</h1>
    <div class="small muted" style="margin-bottom:16px">${isOwner ? `Conversation with ${escapeHtml(buyer ? buyer.fullName : buyerId)}` : `Conversation with the seller`}</div>
    <div class="panel">
      <div class="chat-thread" data-poll-url="/api/listings/${listing.id}/messages?buyer=${encodeURIComponent(buyerId)}" data-current-user="${escapeHtml(user.id)}">
        ${await renderChatBubbles(messages, user.id)}
      </div>
      <form method="POST" action="/api/listings/${listing.id}/messages" class="chat-form" style="margin-top:10px">
        <input type="hidden" name="buyerId" value="${escapeHtml(buyerId)}" />
        <input name="body" placeholder="Ask a question..." required />
        <button class="btn btn-primary btn-sm" type="submit">Send</button>
      </form>
    </div>
  `;
  send(res, 200, await layout({ title: "Messages", activeNav: isOwner ? "seller-inquiries" : "browse", user, body }));
}

export async function sellerInquiriesPage(req, res) {
  const user = await requireUser(req, res, "/seller/inquiries");
  if (!user) return;
  const threads = await db.getListingThreadsForSeller(user.id);
  const rows = (
    await Promise.all(
      threads.map(async (t) => {
        const listing = await db.getListingById(t.listingId);
        const buyer = await db.getUserById(t.buyerId);
        return `<a class="job-row" href="/listing/${t.listingId}/chat?buyer=${encodeURIComponent(t.buyerId)}" style="display:block">
        <div class="row-between">
          <div><strong>${escapeHtml(listing ? listing.title : t.listingId)}</strong><div class="small muted">${escapeHtml(buyer ? buyer.fullName : t.buyerId)}</div></div>
          <div class="small muted">${formatDate(t.lastAt)}</div>
        </div>
        <div class="small muted" style="margin-top:6px">${escapeHtml(t.lastMessage)}</div>
      </a>`;
      })
    )
  ).join("");
  const body = `<h1 style="font-size:22px;margin-bottom:16px">Buyer inquiries</h1>${threads.length === 0 ? `<div class="panel"><p class="muted">No messages yet — questions buyers ask from a listing page will show up here.</p></div>` : `<div class="job-list">${rows}</div>`}`;
  send(res, 200, await layout({ title: "Buyer inquiries", activeNav: "seller-inquiries", user, body }));
}

// ---------------- Unified messages inbox ----------------
export async function messagesInboxPage(req, res) {
  const user = await requireUser(req, res, "/account/messages");
  if (!user) return;

  await db.markMessagesSeen(user.id);

  const buyerThreads = (await db.getListingThreadsForBuyer(user.id)).map((t) => ({ ...t, perspective: "buyer" }));
  const sellerThreads = (await db.getListingThreadsForSeller(user.id)).map((t) => ({ ...t, perspective: "seller" }));
  const listingThreads = [...buyerThreads, ...sellerThreads].sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

  const listingRows = (
    await Promise.all(
      listingThreads.map(async (t) => {
        const listing = await db.getListingById(t.listingId);
        const other = t.perspective === "buyer" ? await db.getUserById(listing ? listing.ownerId : null) : await db.getUserById(t.buyerId);
        const href = t.perspective === "buyer" ? `/listing/${t.listingId}/chat` : `/listing/${t.listingId}/chat?buyer=${encodeURIComponent(t.buyerId)}`;
        return `<a class="job-row" href="${href}" style="display:block">
        <div class="row-between">
          <div><strong>${escapeHtml(listing ? listing.title : t.listingId)}</strong><div class="small muted">${t.perspective === "buyer" ? "You asked" : "Buyer inquiry"} · ${escapeHtml(other ? other.fullName : "—")}</div></div>
          <div class="small muted">${formatDate(t.lastAt)}</div>
        </div>
        <div class="small muted" style="margin-top:6px">${escapeHtml(t.lastMessage)}</div>
      </a>`;
      })
    )
  ).join("");

  const jobThreads = await db.getJobThreadsForUser(user.id);
  const jobRows = (
    await Promise.all(
      jobThreads.map(async (t) => {
        const listing = await db.getListingById(t.listingId);
        return `<a class="job-row" href="/job/${t.jobOrderId}/chat" style="display:block">
        <div class="row-between">
          <div><strong>${escapeHtml(listing ? listing.title : t.listingId)}</strong><div class="small muted">Job ${t.jobOrderId} · as ${t.role}</div></div>
          <div class="small muted">${formatDate(t.lastAt)}</div>
        </div>
        <div class="small muted" style="margin-top:6px">${t.lastMessage ? escapeHtml(t.lastMessage) : "No messages yet"}</div>
      </a>`;
      })
    )
  ).join("");

  const body = `
    <h1 style="font-size:22px;margin-bottom:16px">Messages</h1>
    <h2 style="font-size:15px;margin-bottom:10px">Listing enquiries</h2>
    ${listingThreads.length === 0 ? `<div class="panel" style="margin-bottom:24px"><p class="muted">No listing conversations yet.</p></div>` : `<div class="job-list" style="margin-bottom:24px">${listingRows}</div>`}
    <h2 style="font-size:15px;margin-bottom:10px">Job order chats</h2>
    ${jobThreads.length === 0 ? `<div class="panel"><p class="muted">No job order chats yet.</p></div>` : `<div class="job-list">${jobRows}</div>`}
  `;
  send(res, 200, await layout({ title: "Messages", activeNav: "account-messages", user, body }));
}

export async function jobChatPage(req, res, id) {
  const job = await db.getJobOrderById(id);
  const user = await currentUser(req);
  const contractor = await currentContractor(req);
  const asSeller = Boolean(job && user && job.sellerId === user.id);
  const asContractor = Boolean(job && contractor && job.contractorId === contractor.id);

  if (!user && !contractor) return redirect(res, `/onboarding?next=${encodeURIComponent(`/job/${id}/chat`)}`);
  if (!job || (!asSeller && !asContractor)) {
    // Not this job's seller or contractor — show a 404 in whichever portal
    // they're actually logged into, without leaking whether the job exists.
    return user
      ? send(res, 404, await layout({ title: "Not found", user, body: "<p>Job order not found.</p>" }))
      : send(res, 404, await contractorLayout({ title: "Not found", contractor, body: "<p>Job order not found.</p>" }));
  }

  const person = asSeller ? user : contractor;
  const listing = await db.getListingById(job.listingId);
  const messages = await db.getMessagesForThread("job", job.id);
  const backHref = asSeller ? "/account/messages" : "/contractor/messages";
  const renderLayout = asSeller ? layout : contractorLayout;
  const identityKey = asSeller ? "user" : "contractor";

  const body = `
    <a href="${backHref}" class="small muted">← Back to messages</a>
    <h1 style="font-size:20px;margin:10px 0 4px">${escapeHtml(listing ? listing.title : job.listingId)}</h1>
    <div class="small muted" style="margin-bottom:16px">Job ${job.id} · Status: ${STAGE_LABELS[job.status]}</div>
    <div class="panel">
      <div class="chat-thread" data-poll-url="/api/joborders/${job.id}/messages" data-current-user="${escapeHtml(person.id)}">
        ${await renderChatBubbles(messages, person.id)}
      </div>
      <form method="POST" action="/api/joborders/${job.id}/messages" class="chat-form" style="margin-top:10px">
        <input name="body" placeholder="Message about this job..." required />
        <button class="btn btn-primary btn-sm" type="submit">Send</button>
      </form>
    </div>
  `;
  send(res, 200, await renderLayout({ title: "Job chat", activeNav: asSeller ? "account-messages" : "contractor-messages", [identityKey]: person, body }));
}

// ---------------- Onboarding (unified signup/login) ----------------
export async function onboardingPage(req, res, query, errorMsg) {
  const user = await currentUser(req);
  const next = query.get("next") || "/";
  if (user) return redirect(res, next);

  const body = `
    <div class="two-col" style="max-width:900px;margin:0 auto;gap:32px">
      <div class="form-card">
        <h2 style="margin-bottom:4px">Create your account</h2>
        <p class="small muted" style="margin-bottom:16px">One account for browsing, booking, or listing space — no role to pick up front. We only ask for business or payment details later, right when you actually list or book.</p>
        ${errorMsg ? `<div class="badge badge-orange" style="margin-bottom:12px;display:block">${escapeHtml(errorMsg)}</div>` : ""}
        <form method="POST" action="/api/auth/signup">
          <input type="hidden" name="next" value="${escapeHtml(next)}" />
          <div class="field"><label>Full name</label><input name="fullName" required placeholder="Jordan Reyes" /></div>
          <div class="field"><label>Email</label><input type="email" name="email" required placeholder="jordan@email.com" /></div>
          ${mobileFieldMarkup({ idPrefix: "signup-mobile" })}
          ${passwordFieldsMarkup({ idPrefix: "signup-pw" })}
          <button class="btn btn-primary btn-block" type="submit">Create free account</button>
        </form>
      </div>
      <div class="form-card">
        <h2 style="margin-bottom:4px">Already have an account?</h2>
        <p class="small muted" style="margin-bottom:16px">Log in to pick up where you left off.</p>
        <form method="POST" action="/api/auth/login">
          <input type="hidden" name="next" value="${escapeHtml(next)}" />
          <div class="field"><label>Email</label><input type="email" name="email" required /></div>
          <div class="field"><label>Password</label><input type="password" name="password" required /></div>
          <button class="btn btn-outline btn-block" type="submit">Log in</button>
        </form>
        <div class="divider"></div>
        <p class="small muted">Demo accounts (password <span class="mono">password123</span>):</p>
        <ul class="small muted" style="padding-left:18px">
          <li>marco@castlehillbjj.com.au — seller</li>
          <li>jordan@openhouserealty.com.au — buyer</li>
        </ul>
        <p class="small muted" style="margin-top:8px">Contractor? That's a separate login at <a href="/contractor/login" style="color:var(--orange)">/contractor/login</a>.</p>
      </div>
    </div>
  `;
  send(res, 200, await layout({ title: "Sign up / Log in", user: null, body }));
}

// ---------------- List a space ----------------
export async function sellNewPage(req, res, query) {
  const user = await requireUser(req, res, "/sell/new");
  if (!user) return;

  const myListings = await db.getListingsByOwner(user.id);
  const needsPayout = !user.bankAccount;

  const created = query.get("created");
  const deleted = query.get("deleted");
  const err = query.get("err");

  const statusBadge = (l) =>
    l.status === "leased"
      ? `<span class="badge badge-blue">LEASED</span>`
      : l.status === "removed"
      ? `<span class="badge badge-steel">REMOVED</span>`
      : `<span class="badge badge-green">LIVE</span>`;
  const listRows = myListings
    .map(
      (l) => `<div class="job-row row-between">
        <div><strong>${escapeHtml(l.title)}</strong> ${statusBadge(l)}<div class="small muted">${escapeHtml(l.venue)} · ${money(l.price)}/mo</div></div>
        <div><a href="/listing/${l.id}" class="small" style="color:var(--orange)">View →</a> &nbsp; <a href="/sell/edit/${l.id}" class="small" style="color:var(--ink)">Edit →</a> &nbsp; <a href="/sell/insights/${l.id}" class="small" style="color:var(--blue)">Insights →</a></div>
      </div>`
    )
    .join("");

  const body = `
    <h1 style="font-size:22px;margin-bottom:6px">List your space</h1>
    <p class="muted" style="margin-bottom:20px">We only ask for business and payout details the first time you list.</p>
    ${created ? `<div class="badge badge-green" style="margin-bottom:16px;display:block;padding:10px">Listing created — it's live on the marketplace.</div>` : ""}
    ${deleted ? `<div class="badge badge-green" style="margin-bottom:16px;display:block;padding:10px">Listing deleted.</div>` : ""}
    ${err ? `<div class="badge badge-orange" style="margin-bottom:16px;display:block;padding:10px">${escapeHtml(err)}</div>` : ""}

    ${myListings.length ? `<div class="panel" style="margin-bottom:24px"><h3 style="font-size:14px;margin-bottom:10px">Your listings</h3><div class="job-list">${listRows}</div></div>` : ""}

    <div class="form-card form-card-wide">
      <h2 style="font-size:16px;margin-bottom:14px">Space details</h2>
      <form method="POST" action="/api/listings" enctype="multipart/form-data">
        <div class="form-row">
          <div class="field"><label>Business or venue name</label><input name="venue" required placeholder="${escapeHtml(user.businessName || "Castle Hill BJJ Academy")}" value="${escapeHtml(user.businessName || "")}" /></div>
          <div class="field"><label>Listing title</label><input name="title" required placeholder="Wall above the mats" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Category</label>
            <select name="category">
              ${CATEGORIES.map((c) => `<option value="${c}">${CATEGORY_LABEL[c]}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Space type (optional)</label><input name="subtype" placeholder="e.g. front fence panel, driveway sign board" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Suburb</label><input name="suburb" required placeholder="Castle Hill" /></div>
          <div class="field"><label>Premises address</label><input name="address" required value="${escapeHtml(user.address || "")}" placeholder="14 Wattle St, Castle Hill NSW" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Map latitude (optional)</label><input type="number" step="any" name="lat" placeholder="auto from suburb" /></div>
          <div class="field"><label>Map longitude (optional)</label><input type="number" step="any" name="lng" placeholder="auto from suburb" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Width (mm)</label><input type="number" id="sizeW" name="sizeW" required placeholder="2000" /></div>
          <div class="field"><label>Height (mm)</label><input type="number" id="sizeH" name="sizeH" required placeholder="3000" /></div>
        </div>
        <button type="button" id="ar-preview-btn" class="btn btn-outline btn-block" style="margin-bottom:14px">📷 Preview on your wall</button>
        <div class="form-row">
          <div class="field"><label>Monthly rate (AUD)</label><input type="number" name="price" required placeholder="100" /></div>
          <div class="field"><label>Estimated daily eyes (leave blank to auto-estimate)</label><input type="number" name="estimatedEyesPerDay" placeholder="e.g. 250" /></div>
        </div>
        <div class="field"><label>Description</label><textarea name="desc" rows="3" placeholder="What makes this space worth advertising on?"></textarea></div>
        <div class="field"><label>Photos (up to 8)</label><input type="file" name="photos" accept="image/*" multiple /></div>

        ${
          needsPayout
            ? `<div class="divider"></div>
        <h3 style="font-size:13px;margin-bottom:10px">Where should we send your earnings?</h3>
        <p class="small muted" style="margin-bottom:10px">Only asked once — payouts are sent monthly, minus Frontage's 15% fee.</p>
        <div class="form-row">
          <div class="field"><label>BSB</label><input name="bankBsb" required placeholder="062-000" /></div>
          <div class="field"><label>Account number</label><input name="bankAccount" required placeholder="12345678" /></div>
        </div>
        <div class="field"><label>Account name</label><input name="bankAccountName" required placeholder="${escapeHtml(user.businessName || "Account name")}" /></div>`
            : `<div class="small muted" style="margin-bottom:10px">Payouts go to the bank account already on file (••••${escapeHtml(user.bankAccount ? user.bankAccount.slice(-4) : "")}).</div>`
        }

        <button class="btn btn-primary btn-block" type="submit" style="margin-top:6px">Publish listing</button>
      </form>
    </div>
    <script src="/wall-visualizer.js"></script>
  `;
  send(res, 200, await layout({ title: "List your space", activeNav: "sell", user, body }));
}

// ---------------- Edit an existing listing (owner only) ----------------
export async function editListingPage(req, res, id, query) {
  const user = await requireUser(req, res, `/sell/edit/${id}`);
  if (!user) return;
  const listing = await db.getListingById(id);
  if (!listing || listing.ownerId !== user.id) {
    return send(res, 404, await layout({ title: "Not found", user, body: "<p>Listing not found.</p>" }));
  }

  const updated = query.get("updated");
  const err = query.get("err");
  const photos = listing.photos || [];

  const photoRows = photos
    .map(
      (p, i) => `<div class="row-between" style="margin-bottom:8px;gap:10px">
        <img src="${escapeHtml(p)}" alt="" style="width:72px;height:54px;object-fit:cover;border-radius:6px;border:1px solid var(--border)" />
        <div style="display:flex;gap:6px;flex:1;justify-content:flex-end;flex-wrap:wrap">
          ${
            i > 0
              ? `<form method="POST" action="/api/listings/${id}/photos/${i}/move/up"><button class="btn btn-outline btn-sm" type="submit">↑ Move up</button></form>`
              : ""
          }
          ${
            i < photos.length - 1
              ? `<form method="POST" action="/api/listings/${id}/photos/${i}/move/down"><button class="btn btn-outline btn-sm" type="submit">↓ Move down</button></form>`
              : ""
          }
          <form method="POST" action="/api/listings/${id}/photos/${i}/remove"><button class="btn btn-outline btn-sm" type="submit">Remove</button></form>
        </div>
      </div>`
    )
    .join("");

  const body = `
    <a href="/sell/new" class="small muted">← Back to your listings</a>
    <h1 style="font-size:22px;margin:10px 0 6px">Edit listing</h1>
    <p class="muted" style="margin-bottom:20px">${escapeHtml(listing.title)} · ${escapeHtml(listing.venue)}</p>
    ${updated ? `<div class="badge badge-green" style="margin-bottom:16px;display:block;padding:10px">Listing updated.</div>` : ""}
    ${err ? `<div class="badge badge-orange" style="margin-bottom:16px;display:block;padding:10px">${escapeHtml(err)}</div>` : ""}

    <div class="panel" style="margin-bottom:24px">
      <h2 style="font-size:15px;margin-bottom:12px">Photos</h2>
      ${photos.length ? photoRows : `<p class="small muted" style="margin-bottom:12px">No photos yet.</p>`}
      <form method="POST" action="/api/listings/${id}/photos" enctype="multipart/form-data" style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <input type="file" name="photos" accept="image/*" multiple />
        <button class="btn btn-outline btn-sm" type="submit">Add photos</button>
        <button type="button" id="ar-preview-btn" class="btn btn-outline btn-sm">📷 Mock up on your wall</button>
      </form>
      <div class="small muted" style="margin-top:8px">${photos.length}/8 photos used.</div>
    </div>
    <script src="/wall-visualizer.js"></script>

    <div class="form-card form-card-wide" style="margin-bottom:24px">
      <h2 style="font-size:16px;margin-bottom:14px">Space details</h2>
      <form method="POST" action="/api/listings/${id}/update">
        <div class="form-row">
          <div class="field"><label>Business or venue name</label><input name="venue" required value="${escapeHtml(listing.venue)}" /></div>
          <div class="field"><label>Listing title</label><input name="title" required value="${escapeHtml(listing.title)}" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Category</label>
            <select name="category">
              ${CATEGORIES.map((c) => `<option value="${c}"${c === listing.category ? " selected" : ""}>${CATEGORY_LABEL[c]}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Space type (optional)</label><input name="subtype" value="${escapeHtml(listing.subtype || "")}" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Suburb</label><input name="suburb" required value="${escapeHtml(listing.suburb)}" /></div>
          <div class="field"><label>Premises address</label><input name="address" required value="${escapeHtml(listing.address)}" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Map latitude (optional)</label><input type="number" step="any" name="lat" value="${listing.lat != null ? listing.lat : ""}" /></div>
          <div class="field"><label>Map longitude (optional)</label><input type="number" step="any" name="lng" value="${listing.lng != null ? listing.lng : ""}" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Width (mm)</label><input type="number" name="sizeW" required value="${listing.sizeW}" /></div>
          <div class="field"><label>Height (mm)</label><input type="number" name="sizeH" required value="${listing.sizeH}" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Monthly rate (AUD)</label><input type="number" name="price" required value="${listing.price}" /></div>
          <div class="field"><label>Estimated daily eyes</label><input type="number" name="estimatedEyesPerDay" value="${listing.estimatedEyesPerDay || ""}" /></div>
        </div>
        <div class="field"><label>Description</label><textarea name="desc" rows="3">${escapeHtml(listing.desc || "")}</textarea></div>
        <button class="btn btn-primary btn-block" type="submit" style="margin-top:6px">Save changes</button>
      </form>
    </div>

    <div class="panel" style="border-color:var(--red)">
      <h2 style="font-size:15px;margin-bottom:8px;color:var(--red)">Delete this listing</h2>
      <p class="small muted" style="margin-bottom:12px">Takes it off the marketplace immediately. Existing leases and their history are kept — this only affects new bookings.</p>
      <form method="POST" action="/api/listings/${id}/delete" onsubmit="return confirm('Delete this listing? It will come off the marketplace immediately.');">
        <button class="btn btn-outline btn-block" type="submit" style="color:var(--red);border-color:var(--red)">Delete listing</button>
      </form>
    </div>
  `;
  send(res, 200, await layout({ title: "Edit listing", activeNav: "sell", user, body }));
}

// ---------------- Seller listing insights ----------------
export async function listingInsightsPage(req, res, id) {
  const user = await requireUser(req, res, `/sell/insights/${id}`);
  if (!user) return;
  const listing = await db.getListingById(id);
  if (!listing || listing.ownerId !== user.id) {
    return send(res, 404, await layout({ title: "Not found", user, body: "<p>Listing not found.</p>" }));
  }

  const bookings = await db.getBookingsForListing(id);
  const threads = (await db.getListingThreadsForSeller(user.id)).filter((t) => t.listingId === id);
  const views = listing.viewCount || 0;
  const conversionPct = views > 0 ? Math.round((bookings.length / views) * 1000) / 10 : 0;

  const body = `
    <a href="/sell/new" class="small muted">← Back to your listings</a>
    <h1 style="font-size:22px;margin:10px 0 16px">Insights — ${escapeHtml(listing.title)}</h1>
    <div class="panel-tint stat-grid-3" style="margin-bottom:18px">
      <div><div class="mono" style="font-weight:700;font-size:20px">${views}</div><div class="small muted">Listing views</div></div>
      <div><div class="mono" style="font-weight:700;font-size:20px">${threads.length}</div><div class="small muted">Buyer enquiries</div></div>
      <div><div class="mono" style="font-weight:700;font-size:20px">${bookings.length}</div><div class="small muted">Bookings</div></div>
    </div>
    <div class="panel">
      <div class="row-between small"><span class="muted">View → booking conversion</span><span class="mono">${conversionPct}%</span></div>
      <div class="small muted" style="margin-top:8px">Views count visits from anyone other than you. Conversion is a rough guide, not a rate you should read too much into at low volume.</div>
    </div>
  `;
  send(res, 200, await layout({ title: "Listing insights", activeNav: "sell", user, body }));
}

// ---------------- BDR: pre-built listings + claim link ----------------
export async function bdrNewListingPage(req, res, query) {
  const user = await requirePermission(req, res, "canCreateBdrListings", "/sell/bdr-new");
  if (!user) return;

  const created = query.get("created");
  const claimUrl = query.get("claimUrl");

  const body = `
    ${adminSubnav(user, "bdr")}
    <h1 style="font-size:22px;margin-bottom:6px">Create a BDR listing</h1>
    <p class="muted" style="margin-bottom:20px">Pre-build a listing for a business that hasn't signed up yet. No owner or payout details are collected here — whoever opens the claim link and signs up becomes the owner.</p>
    ${
      created
        ? `<div class="badge badge-green" style="margin-bottom:16px;display:block;padding:10px">
            Draft created. Claim link (share this with the business — anyone who opens it can claim the listing):<br/>
            <span class="mono small">${escapeHtml(claimUrl || "")}</span>
          </div>`
        : ""
    }
    <div class="form-card form-card-wide">
      <h2 style="font-size:16px;margin-bottom:14px">Space details</h2>
      <form method="POST" action="/api/bdr/listings" enctype="multipart/form-data">
        <div class="form-row">
          <div class="field"><label>Business or venue name</label><input name="venue" required placeholder="Corner Press Café" /></div>
          <div class="field"><label>Listing title</label><input name="title" required placeholder="Wall above the counter" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Category</label>
            <select name="category">
              ${CATEGORIES.map((c) => `<option value="${c}">${CATEGORY_LABEL[c]}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Space type (optional)</label><input name="subtype" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Suburb</label><input name="suburb" required /></div>
          <div class="field"><label>Premises address</label><input name="address" required /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Width (mm)</label><input type="number" name="sizeW" required placeholder="2000" /></div>
          <div class="field"><label>Height (mm)</label><input type="number" name="sizeH" required placeholder="3000" /></div>
        </div>
        <div class="field"><label>Monthly rate (AUD)</label><input type="number" name="price" required placeholder="100" /></div>
        <div class="field"><label>Description</label><textarea name="desc" rows="3"></textarea></div>
        <div class="field"><label>Photos (up to 8)</label><input type="file" name="photos" accept="image/*" multiple /></div>
        <div class="divider"></div>
        <div class="field"><label>Business contact name (your reference only)</label><input name="bdrContactName" placeholder="Who you spoke to on-site" /></div>
        <div class="field"><label>Business contact email (your reference only)</label><input type="email" name="bdrContactEmail" /></div>
        <button class="btn btn-primary btn-block" type="submit" style="margin-top:6px">Create draft &amp; get claim link</button>
      </form>
    </div>
  `;
  send(res, 200, await layout({ title: "Create BDR listing", activeNav: "bdr-new-listing", user, body }));
}

export async function claimListingPage(req, res, token) {
  const listing = await db.getListingByClaimToken(token);
  const user = await currentUser(req);
  if (!listing || listing.status !== "unclaimed") {
    return send(res, 404, await layout({ title: "Not found", user, body: `<div class="panel"><h2>Link not valid</h2><p class="muted">This claim link doesn't exist or has already been used.</p></div>` }));
  }

  const body = `
    <div class="panel" style="max-width:520px;margin:0 auto">
      <div class="badge badge-blue" style="margin-bottom:12px">Pre-built listing</div>
      <h1 style="font-size:22px;margin-bottom:6px">${escapeHtml(listing.title)}</h1>
      <div class="muted" style="margin-bottom:16px">${escapeHtml(listing.venue)} · ${escapeHtml(listing.suburb)}, Sydney</div>
      <div class="panel-tint" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center;margin-bottom:18px">
        <div><div class="mono" style="font-weight:700">${formatMm(listing.sizeW)} × ${formatMm(listing.sizeH)}</div><div class="small muted">Space size</div></div>
        <div><div class="mono" style="font-weight:700">${money(listing.price)}/mo</div><div class="small muted">Lease rate</div></div>
      </div>
      <p class="small muted" style="margin-bottom:18px">A Frontage team member built this listing for your space. Claim it to start earning passive income from it — no cost to list.</p>
      ${
        user
          ? `<form method="POST" action="/api/claim/${token}"><button class="btn btn-primary btn-block" type="submit">Claim this listing as ${escapeHtml(user.fullName)}</button></form>`
          : `<a href="/onboarding?next=${encodeURIComponent(`/claim/${token}`)}" class="btn btn-primary btn-block">Sign up or log in to claim this listing</a>`
      }
    </div>
  `;
  send(res, 200, await layout({ title: "Claim your listing", user, body }));
}

// ---------------- Book / contract / payment ----------------
export async function bookPage(req, res, listingId, query) {
  const user = await requireUser(req, res, `/book/${listingId}`);
  if (!user) return;
  const listing = await db.getListingById(listingId);
  if (!listing) return send(res, 404, await layout({ title: "Not found", user, body: "<p>Listing not found.</p>" }));

  const confirmedBookingId = query.get("confirmed");
  if (confirmedBookingId) {
    const booking = await db.getBookingById(confirmedBookingId);
    const jobOrder = booking ? (await db.getJobOrdersForSeller(booking.sellerId)).find((j) => j.bookingId === booking.id) : null;
    const payment = booking ? await db.getPaymentByBookingId(booking.id) : null;
    const body = `
      <div class="panel" style="max-width:520px;margin:0 auto;text-align:center">
        <div class="badge badge-blue" style="margin:0 auto 12px">Booking confirmed</div>
        <h1 style="font-size:22px">${escapeHtml(listing.title)}</h1>
        <p class="muted" style="margin-bottom:18px">${booking.term}-month lease · ${money(listing.price)}/mo · ${escapeHtml(listing.venue)}</p>
        <div class="panel-tint" style="text-align:left;margin-bottom:16px">
          <div class="row-between small"><span class="muted">Total charged today</span><span class="mono">${money(payment.totalAmount)}</span></div>
          <div class="row-between small" style="margin-top:6px"><span class="muted">Frontage fee (15%, from seller payout)</span><span class="mono">${money(payment.feeAmount)}</span></div>
        </div>
        <div class="panel-tint" style="text-align:left">
          <div style="font-weight:600;font-size:13px;margin-bottom:6px">Job order ${jobOrder.id}</div>
          <div class="small muted">Status: ${STAGE_LABELS[jobOrder.status]}. A contractor will pick this up from the job-ping queue — check back on the job order once one accepts.</div>
        </div>
        <a href="/" class="btn btn-outline" style="margin-top:18px">Back to browse</a>
      </div>
    `;
    return send(res, 200, await layout({ title: "Booking confirmed", activeNav: "browse", user, body }));
  }

  const needsCard = !user.cardLast4;
  // Real Stripe wired up (STRIPE_SECRET_KEY set) → embedded Elements card
  // field, charged via createPaymentIntent before the booking is created.
  // Not configured yet → the original plaintext-card stub flow, so the app
  // stays fully testable before real Stripe keys exist (see lib/payments.js).
  const stripeConfigured = isStripeConfigured() && Boolean(process.env.STRIPE_PUBLISHABLE_KEY);
  const body = `
    <a href="/listing/${listing.id}" class="small muted">← Back to listing</a>
    <div class="two-col" style="margin-top:14px;align-items:start">
      <div class="panel">
        <h2 style="font-size:16px;margin-bottom:10px">Lease terms</h2>
        <p class="small" style="line-height:1.6">
          <strong>1. Space.</strong> ${formatMm(listing.sizeW)} × ${formatMm(listing.sizeH)} at ${escapeHtml(listing.venue)}, as listed.<br/>
          <strong>2. Term.</strong> Fixed term of 6 or 12 months, commencing the date the assigned contractor marks installation complete — not the date this is signed. Auto-renews monthly at term end unless cancelled with 30 days' notice.<br/>
          <strong>3. Rate.</strong> ${money(listing.price)} per month, billed to the payment method on file.<br/>
          <strong>4. Install & removal.</strong> You engage and pay a Frontage-network contractor directly for printing, install and uninstall — separate from this lease.<br/>
          <strong>5. Platform fee.</strong> Frontage deducts 15% from the seller's payout on each payment.<br/>
          <strong>6. Early termination.</strong> Ending this lease early incurs a break fee equal to one month's rent (${money(listing.price)}).<br/>
          <strong>7. Content & conduct.</strong> Advertising content must be lawful and meet the standards in the <a href="/terms" target="_blank" style="color:var(--orange)">Terms &amp; Conditions</a>. The seller warrants they have authority over the listed space. Misrepresentation, unlawful content, or interference with an installed ad by either party is a breach.<br/>
          <strong>8. Breach & liability.</strong> A party in breach is liable for the other party's resulting losses. Frontage is the marketplace facilitator, not a party to this lease — losses caused by a buyer's or seller's wrongdoing are borne by the party at fault, not by Frontage, and each party indemnifies Frontage against claims arising from their own breach.
        </p>
        <div class="panel-tint" style="margin-top:16px">
          <div style="font-weight:600;font-size:13px;margin-bottom:6px">Estimated contractor cost</div>
          <div class="row-between small"><span class="muted">Print + install + uninstall (est.)</span><span class="mono" style="font-weight:700">${money(estimateJobFee(listing.sizeW, listing.sizeH))}</span></div>
          <div class="small muted" style="margin-top:8px">Paid directly to the contractor who takes this job — separate from the lease payment below. This is an estimate; the assigned contractor may send a different final quote once they've confirmed site details.</div>
        </div>
      </div>
      <div class="form-card">
        <h2 style="font-size:16px;margin-bottom:14px">Confirm & pay</h2>
        <form method="POST" action="/api/bookings" id="booking-form">
          <input type="hidden" name="listingId" value="${listing.id}" />
          <div class="field"><label>Lease term</label>
            <select name="term" id="term-select">
              <option value="6">6 months</option>
              <option value="12" selected>12 months</option>
            </select>
          </div>
          <div class="panel-tint" style="margin-bottom:14px">
            <div class="row-between small"><span class="muted">Monthly rate</span><span class="mono">${money(listing.price)}</span></div>
            <div class="row-between small" style="margin-top:6px"><span class="muted" id="term-label">Term (12mo)</span><span class="mono" id="term-total">${money(listing.price * 12)}</span></div>
          </div>
          <div class="field"><label>Type your name to sign</label><input name="signature" required placeholder="${escapeHtml(user.fullName)}" />
            <div class="signature" id="sig-preview"></div>
          </div>
          <label class="small" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px">
            <input type="checkbox" required style="margin-top:2px" /> I have read and agree to the lease terms shown on this page.
          </label>
          <label class="small" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:14px">
            <input type="checkbox" required style="margin-top:2px" /> I have read and agree to the <a href="/terms" target="_blank" style="color:var(--orange)">Frontage Terms &amp; Conditions</a>, including the conduct, breach, and liability provisions.
          </label>
          ${
            stripeConfigured
              ? `<div class="divider"></div>
          <h3 style="font-size:13px;margin-bottom:10px">Payment details</h3>
          <div class="field"><label>Card</label>
            <div id="card-element" style="padding:11px 13px;border-radius:8px;border:1px solid var(--border);background:var(--concrete)"></div>
            <div id="card-errors" class="small" style="color:var(--red);margin-top:6px"></div>
          </div>`
              : needsCard
              ? `<div class="divider"></div>
          <h3 style="font-size:13px;margin-bottom:10px">Add a payment method</h3>
          <p class="small muted" style="margin-bottom:10px">Only asked the first time you book.</p>
          <div class="field"><label>Card number</label><input name="cardNumber" required placeholder="4242 4242 4242 4242" maxlength="19" /></div>
          <div style="display:flex;gap:10px">
            <div class="field" style="flex:1"><label>Expiry</label><input name="expiry" required placeholder="MM/YY" /></div>
            <div class="field" style="flex:1"><label>CVC</label><input name="cvc" required placeholder="123" /></div>
          </div>`
              : `<div class="small muted" style="margin-bottom:14px">Charging card on file ending ${escapeHtml(user.cardLast4)}.</div>`
          }
          <button class="btn btn-primary btn-block" type="submit" id="pay-btn">Sign & pay ${money(listing.price * 12)}</button>
        </form>
      </div>
    </div>
    ${stripeConfigured ? `<script src="https://js.stripe.com/v3/"></script>` : ""}
    <script>
      (function() {
        var rate = ${listing.price};
        var sel = document.getElementById('term-select');
        var total = document.getElementById('term-total');
        var label = document.getElementById('term-label');
        var btn = document.getElementById('pay-btn');
        function fmt(n) { return '$' + n.toLocaleString('en-AU', {minimumFractionDigits:2, maximumFractionDigits:2}); }
        function update() {
          var term = parseInt(sel.value, 10);
          total.textContent = fmt(rate * term);
          label.textContent = 'Term (' + term + 'mo)';
          if (btn) btn.textContent = 'Sign & pay ' + fmt(rate * term);
        }
        sel.addEventListener('change', update);
        var sigInput = document.querySelector('input[name=signature]');
        var sigPreview = document.getElementById('sig-preview');
        sigInput.addEventListener('input', function() { sigPreview.textContent = sigInput.value; });

        ${
          stripeConfigured
            ? `
        // Embedded Stripe Elements flow: intercept submit, confirm the card
        // payment in-page (no redirect off Frontage), then let the form post
        // through normally with the confirmed paymentIntentId attached.
        // createBookingHandler (routes/api.js) re-verifies the PaymentIntent
        // server-side before ever creating the booking.
        var stripe = Stripe(${JSON.stringify(process.env.STRIPE_PUBLISHABLE_KEY || "")});
        var elements = stripe.elements();
        var card = elements.create('card');
        card.mount('#card-element');
        card.on('change', function (event) {
          document.getElementById('card-errors').textContent = event.error ? event.error.message : '';
        });
        var form = document.getElementById('booking-form');
        var listingId = ${JSON.stringify(listing.id)};
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          btn.disabled = true;
          var originalText = btn.textContent;
          btn.textContent = 'Processing payment...';
          fetch('/api/bookings/create-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listingId: listingId, term: parseInt(sel.value, 10) }),
          })
            .then(function (r) { return r.json().then(function (data) { if (!r.ok) throw new Error(data.error || 'Could not start payment.'); return data; }); })
            .then(function (data) {
              return stripe.confirmCardPayment(data.clientSecret, {
                payment_method: { card: card, billing_details: { name: sigInput.value || ${JSON.stringify(user.fullName)} } },
              });
            })
            .then(function (result) {
              if (result.error) throw new Error(result.error.message);
              var hidden = document.createElement('input');
              hidden.type = 'hidden';
              hidden.name = 'paymentIntentId';
              hidden.value = result.paymentIntent.id;
              form.appendChild(hidden);
              form.submit();
            })
            .catch(function (err) {
              document.getElementById('card-errors').textContent = err.message;
              btn.disabled = false;
              btn.textContent = originalText;
            });
        });
        `
            : ""
        }
      })();
    </script>
  `;
  send(res, 200, await layout({ title: "Book this space", activeNav: "browse", user, body }));
}

// ---------------- Chat (shared helpers) ----------------
async function renderChatBubbles(messages, currentUserId) {
  if (!messages.length) return `<div class="small muted">No messages yet.</div>`;
  const bubbles = await Promise.all(
    messages.map(async (m) => {
      const sender = await db.getPersonById(m.senderId);
      const mine = m.senderId === currentUserId;
      return `<div class="chat-bubble${mine ? " mine" : ""}">
        <div class="small" style="font-weight:600;margin-bottom:2px">${escapeHtml(sender ? sender.fullName.split(" ")[0] : "Unknown")}</div>
        <div>${escapeHtml(m.body)}</div>
        <div class="small muted" style="margin-top:2px">${formatDate(m.createdAt)}</div>
      </div>`;
    })
  );
  return bubbles.join("");
}

async function jobChatBlock(jobOrder, currentUserId, otherPartyLabel = "") {
  const messages = await db.getMessagesForThread("job", jobOrder.id);
  return `<details style="margin-top:10px">
    <summary class="small" style="cursor:pointer;color:var(--orange);font-weight:600">💬 Chat${otherPartyLabel ? ` with the ${otherPartyLabel}` : ""} (${messages.length})</summary>
    <div class="chat-thread" data-poll-url="/api/joborders/${jobOrder.id}/messages" data-current-user="${escapeHtml(currentUserId)}" style="margin-top:8px">
      ${await renderChatBubbles(messages, currentUserId)}
    </div>
    <form method="POST" action="/api/joborders/${jobOrder.id}/messages" class="chat-form" style="margin-top:8px">
      <input name="body" placeholder="Message about this job..." required />
      <button class="btn btn-sm btn-dark" type="submit">Send</button>
    </form>
  </details>`;
}

// ---------------- Seller job orders ----------------
export async function sellerJobsPage(req, res) {
  const user = await requireUser(req, res, "/seller/jobs");
  if (!user) return;
  const jobOrders = await db.getJobOrdersForSeller(user.id);

  if (jobOrders.length === 0) {
    return send(
      res,
      200,
      await layout({
        title: "Job orders",
        activeNav: "seller-jobs",
        user,
        body: `<h1 style="font-size:22px;margin-bottom:8px">Job orders</h1><p class="muted">No job orders yet — once someone books one of your listings, it'll show up here.</p>`,
      })
    );
  }

  const cards = (
    await Promise.all(
      jobOrders.map(async (j) => {
        const listing = await db.getListingById(j.listingId);
        const buyer = await db.getUserById(j.buyerId);
        const idx = STAGES.indexOf(j.status);
        const steps = STAGES.map((s, i) => {
          const cls = i < idx ? "done" : i === idx ? "active" : "";
          return `<div class="step"><div class="step-dot ${cls}"></div>${STAGE_LABELS[s]}</div>`;
        }).join("");

        const accessForm =
          !j.sellerAccessConfirmed && j.status !== "broadcast"
            ? `<form method="POST" action="/api/joborders/${j.id}/access" style="margin-top:12px">
              <div class="field" style="max-width:260px"><label>Confirm install access window</label>
                <select name="installWindow">
                  <option>12–16 Aug</option><option>19–23 Aug</option><option>26–30 Aug</option>
                </select>
              </div>
              <button class="btn btn-primary btn-sm" type="submit">Confirm access</button>
            </form>`
            : j.sellerAccessConfirmed
            ? `<div class="small" style="color:var(--green);margin-top:10px">✓ Access confirmed for ${escapeHtml(j.installWindow)}</div>`
            : `<div class="small muted" style="margin-top:10px">Waiting for a contractor to accept this job before scheduling access.</div>`;

        const payment = await db.getPaymentByBookingId(j.bookingId);
        const payoutLine = !payment
          ? ""
          : payment.payoutStatus === "released"
          ? `<div class="small" style="color:var(--green)">✓ Payout released: <span class="mono">${money(payment.payoutAmount)}</span>/mo${payment.payoutBlockedReason ? ` — ${escapeHtml(payment.payoutBlockedReason)}` : ""}</div>`
          : `<div class="small muted">Payout held by Frontage until install is confirmed: <span class="mono" style="color:var(--ink)">${money(payment.payoutAmount)}</span>/mo (after 15% fee)</div>`;

        return `<div class="panel" style="margin-bottom:16px">
        <div class="row-between" style="margin-bottom:10px">
          <div><strong>${escapeHtml(listing ? listing.title : j.listingId)}</strong><div class="small muted">Job ${j.id} · Booked by ${escapeHtml(buyer ? buyer.businessName || buyer.fullName : "—")}</div></div>
          <span class="badge ${j.status === "installed" ? "badge-green" : j.status === "broadcast" ? "badge-orange" : "badge-blue"}">${STAGE_LABELS[j.status].toUpperCase()}</span>
        </div>
        <div class="steps" style="margin-bottom:10px">${steps}</div>
        ${payoutLine}
        ${accessForm}
        ${j.contractorId ? await jobChatBlock(j, user.id, "contractor") : ""}
      </div>`;
      })
    )
  ).join("");

  const body = `<h1 style="font-size:22px;margin-bottom:16px">Job orders</h1>${cards}`;
  send(res, 200, await layout({ title: "Job orders", activeNav: "seller-jobs", user, body }));
}

// ---------------- Contractor: ping / claim ----------------
export async function contractorPingPage(req, res) {
  const contractor = await requireContractor(req, res, "/contractor/ping");
  if (!contractor) return;

  if (!contractor.isApprovedContractor) {
    const status = contractor.contractorApplicationStatus;
    let body;
    if (status === "pending") {
      body = `
      <div class="panel" style="max-width:480px;margin:0 auto;text-align:center">
        <div class="badge badge-orange" style="margin:0 auto 12px">Application under review</div>
        <h2 style="margin-bottom:8px">Thanks for applying</h2>
        <p class="muted small" style="margin-bottom:12px">We're reviewing your business number, company registration, and insurance documents. You'll get job alerts as soon as you're approved.</p>
        <a href="/contractor/support" class="small" style="color:var(--orange)">Questions about your application? Contact contractor support →</a>
      </div>`;
    } else if (status === "rejected") {
      const apps = await db.getContractorApplicationsByContractor(contractor.id);
      const app = apps.slice(-1)[0];
      body = `
      <div class="panel" style="max-width:480px;margin:0 auto;text-align:center">
        <div class="badge badge-orange" style="margin:0 auto 12px">Application not approved</div>
        <h2 style="margin-bottom:8px">Your application wasn't approved</h2>
        <p class="muted small" style="margin-bottom:16px">${escapeHtml((app && app.rejectionReason) || "Please check your documentation and try again.")}</p>
        <a href="/contractor/apply" class="btn btn-primary btn-block">Re-apply</a>
        <a href="/contractor/support" class="small" style="color:var(--orange);display:block;margin-top:10px">Questions? Contact contractor support →</a>
      </div>`;
    } else {
      body = `
      <div class="panel" style="max-width:480px;margin:0 auto;text-align:center">
        <h2 style="margin-bottom:8px">Become a contractor</h2>
        <p class="muted small" style="margin-bottom:16px">Contractors are vetted before they can claim jobs — we need proof of insurance, your business number, and company registration details.</p>
        <a href="/contractor/apply" class="btn btn-primary btn-block">Apply as a contractor</a>
      </div>`;
    }
    return send(res, 200, await contractorLayout({ title: "Contractor", activeNav: "contractor-ping", contractor, body }));
  }

  const broadcasts = await db.getBroadcastJobOrders();
  const rows = (
    await Promise.all(
      broadcasts.map(async (j) => {
        const listing = await db.getListingById(j.listingId);
        return `<div class="job-row">
        <div class="row-between">
          <div>
            <div class="badge badge-orange" style="margin-bottom:6px">NEW JOB ORDER</div>
            <strong>${escapeHtml(listing.title)}</strong>
            <div class="small muted">${escapeHtml(listing.venue)} · ${escapeHtml(listing.suburb)} · ${formatMm(listing.sizeW)} × ${formatMm(listing.sizeH)}</div>
          </div>
          <div style="text-align:right">
            <div class="mono" style="font-weight:700;color:var(--green)">${money(j.estimate)}</div>
            <div class="small muted">est. payout</div>
          </div>
        </div>
        <form method="POST" action="/api/joborders/${j.id}/claim" style="margin-top:10px">
          <button class="btn btn-primary btn-sm" type="submit">Accept job</button>
        </form>
      </div>`;
      })
    )
  ).join("");

  const body = `
    <div class="row-between" style="margin-bottom:16px">
      <div>
        <h1 style="font-size:22px">Job pings</h1>
        <div class="badge badge-green">● Online — job alerts on</div>
      </div>
      <a href="/contractor/board" class="btn btn-outline btn-sm">View job board →</a>
    </div>
    ${broadcasts.length === 0 ? `<div class="panel"><p class="muted">Listening for jobs — nothing waiting right now. New bookings appear here the moment a seller confirms.</p></div>` : `<div class="job-list">${rows}</div>`}
  `;
  send(res, 200, await contractorLayout({ title: "Job pings", activeNav: "contractor-ping", contractor, body }));
}

// ---------------- Contractor: job board ----------------
export async function contractorBoardPage(req, res) {
  const contractor = await requireContractor(req, res, "/contractor/board");
  if (!contractor) return;
  if (!contractor.isApprovedContractor) return redirect(res, "/contractor/ping");

  const jobs = await db.getJobOrdersForContractor(contractor.id);

  const cards = (
    await Promise.all(
      jobs.map(async (j) => {
        const listing = await db.getListingById(j.listingId);
        const idx = STAGES.indexOf(j.status);
        const steps = STAGES.slice(1) // hide "broadcast" once claimed
          .map((s, i2) => {
            const i = i2 + 1;
            const cls = i < idx ? "done" : i === idx ? "active" : "";
            return `<div class="step"><div class="step-dot ${cls}"></div>${STAGE_LABELS[s]}</div>`;
          })
          .join("");

        let actionBlock = "";
        if (j.status === "new") {
          actionBlock = `<form method="POST" action="/api/joborders/${j.id}/confirm-site"><button class="btn btn-primary btn-sm" type="submit">Confirm site details</button></form>`;
        } else if (j.status === "site_confirmed") {
          actionBlock = `<form method="POST" action="/api/joborders/${j.id}/quote">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
            <div class="field" style="flex:1;min-width:100px;margin-bottom:0"><label>Print</label><input type="number" name="print" value="340" required /></div>
            <div class="field" style="flex:1;min-width:100px;margin-bottom:0"><label>Install</label><input type="number" name="install" value="260" required /></div>
            <div class="field" style="flex:1;min-width:100px;margin-bottom:0"><label>Uninstall</label><input type="number" name="uninstall" value="120" required /></div>
          </div>
          <button class="btn btn-primary btn-sm" type="submit">Send quote to buyer</button>
        </form>`;
        } else if (j.status === "quote_sent") {
          const total = j.quote ? j.quote.print + j.quote.install + j.quote.uninstall : 0;
          actionBlock = `<div class="small muted" style="margin-bottom:8px">Quote of ${money(total)} sent — waiting on buyer to accept.</div>
          <form method="POST" action="/api/joborders/${j.id}/simulate-buyer-accept"><button class="btn btn-outline btn-sm" type="submit">Simulate buyer acceptance (demo)</button></form>`;
        } else if (j.status === "quote_accepted") {
          actionBlock = `<form method="POST" action="/api/joborders/${j.id}/schedule" style="display:flex;gap:8px;align-items:flex-end">
          <div class="field" style="margin-bottom:0"><label>Install date</label><input type="date" name="installDate" required /></div>
          <button class="btn btn-primary btn-sm" type="submit">Confirm date</button>
        </form>`;
        } else if (j.status === "scheduled") {
          actionBlock = `<div class="small muted" style="margin-bottom:8px">Scheduled for ${formatDate(j.installDate)}.</div>
          <form method="POST" action="/api/joborders/${j.id}/complete"><button class="btn btn-dark btn-sm" type="submit">Mark install complete</button></form>`;
        } else if (j.status === "installed") {
          const total = j.quote ? j.quote.print + j.quote.install + j.quote.uninstall : 0;
          actionBlock = `<div class="small" style="color:var(--green)">✓ Installed — invoiced ${money(total)} directly to buyer (outside Frontage payouts). Lease is now active.</div>`;
        }

        return `<div class="panel" style="margin-bottom:16px">
        <div class="row-between" style="margin-bottom:10px">
          <div><strong>${escapeHtml(listing.title)}</strong><div class="small muted">${j.id} · ${escapeHtml(listing.venue)} · ${escapeHtml(listing.address)}</div></div>
          <span class="badge ${j.status === "installed" ? "badge-green" : "badge-blue"}">${STAGE_LABELS[j.status].toUpperCase()}</span>
        </div>
        <div class="steps" style="margin-bottom:10px">${steps}</div>
        ${j.sellerAccessConfirmed ? `<div class="small" style="color:var(--green);margin-bottom:8px">✓ Seller confirmed access: ${escapeHtml(j.installWindow)}</div>` : `<div class="small muted" style="margin-bottom:8px">Waiting on seller to confirm an access window — use the chat below to coordinate directly with them.</div>`}
        ${actionBlock}
        ${await jobChatBlock(j, contractor.id, "seller")}
      </div>`;
      })
    )
  ).join("");

  const body = `
    <div class="row-between" style="margin-bottom:16px">
      <div>
        <h1 style="font-size:22px">Job board</h1>
        <div class="small muted">Jobs you've accepted — quote, schedule, and mark them installed here.</div>
      </div>
      <a href="/contractor/ping" class="btn btn-outline btn-sm">Check for new pings →</a>
    </div>
    ${jobs.length === 0 ? `<div class="panel"><p class="muted">No jobs accepted yet. <a href="/contractor/ping" style="color:var(--orange)">Go check for pings →</a></p></div>` : cards}
  `;
  send(res, 200, await contractorLayout({ title: "Job board", activeNav: "contractor-board", contractor, body }));
}

// ---------------- Contractor: apply / admin review ----------------
export async function contractorApplyPage(req, res, query) {
  const contractor = await requireContractor(req, res, "/contractor/apply");
  if (!contractor) return;

  if (contractor.isApprovedContractor) return redirect(res, "/contractor/ping");

  const submitted = query.get("submitted");
  const err = query.get("err");
  const body = `
    <h1 style="font-size:22px;margin-bottom:6px">Apply as a contractor</h1>
    <p class="muted" style="margin-bottom:20px">Contractors are vetted before they can see or claim job orders — we ask for proof of insurance, your business number, and company registration.</p>
    ${submitted ? `<div class="badge badge-green" style="margin-bottom:16px;display:block;padding:10px">Application submitted — we'll review it and let you know here.</div>` : ""}
    ${err ? `<div class="badge badge-orange" style="margin-bottom:16px;display:block;padding:10px">${escapeHtml(err)}</div>` : ""}
    <div class="form-card">
      <form method="POST" action="/api/contractor/apply" enctype="multipart/form-data">
        <div class="field"><label>Business number (ABN or equivalent)</label><input name="businessNumber" required placeholder="12 345 678 901" /></div>
        <div class="field"><label>Company name</label><input name="companyName" required placeholder="${escapeHtml(contractor.businessName || "The Sign Depot")}" value="${escapeHtml(contractor.businessName || "")}" /></div>
        <div class="field"><label>Company registration number (optional)</label><input name="companyRegistrationNumber" placeholder="ACN 123 456 789" /></div>
        <div class="field"><label>Public liability insurance expiry</label><input type="date" name="insuranceExpiry" /></div>
        <div class="field"><label>Proof of insurance (image or PDF)</label><input type="file" name="insuranceDoc" accept="image/*,application/pdf" required /></div>
        <div class="field"><label>Company registration document (optional)</label><input type="file" name="companyRegoDoc" accept="image/*,application/pdf" /></div>
        <button class="btn btn-primary btn-block" type="submit">Submit application</button>
      </form>
    </div>
    <a href="/contractor/support" class="small" style="color:var(--orange);display:block;margin-top:14px">Questions before you apply? Contact contractor support →</a>
  `;
  send(res, 200, await contractorLayout({ title: "Apply as a contractor", activeNav: "contractor-apply", contractor, body }));
}

export async function adminContractorApplicationsPage(req, res) {
  const user = await requirePermission(req, res, "canApproveContractors", "/admin/contractor-applications");
  if (!user) return;

  const pending = await db.getPendingContractorApplications();
  const rows = (
    await Promise.all(
      pending.map(async (a) => {
        const applicant = await db.getContractorById(a.contractorId);
        return `<div class="job-row" style="margin-bottom:12px">
        <div class="row-between" style="margin-bottom:8px">
          <div><strong>${escapeHtml(a.companyName)}</strong><div class="small muted">${escapeHtml(applicant ? applicant.fullName : a.contractorId)} · ABN ${escapeHtml(a.businessNumber)}</div></div>
          <span class="badge badge-orange">PENDING</span>
        </div>
        <div class="small muted" style="margin-bottom:10px">
          Rego: ${escapeHtml(a.companyRegistrationNumber || "—")} · Insurance expiry: ${escapeHtml(a.insuranceExpiry || "—")}<br/>
          <a href="/api/contractor-applications/${a.id}/doc/insuranceDoc" style="color:var(--orange)">View insurance doc →</a>
          ${a.companyRegoDocPath ? ` · <a href="/api/contractor-applications/${a.id}/doc/companyRegoDoc" style="color:var(--orange)">View rego doc →</a>` : ""}
        </div>
        <div style="display:flex;gap:8px">
          <form method="POST" action="/api/admin/contractor-applications/${a.id}/approve"><button class="btn btn-dark btn-sm" type="submit">Approve</button></form>
          <form method="POST" action="/api/admin/contractor-applications/${a.id}/reject" style="display:flex;gap:6px">
            <input name="reason" placeholder="Rejection reason" class="mono" style="font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--border)" />
            <button class="btn btn-outline btn-sm" type="submit">Reject</button>
          </form>
        </div>
      </div>`;
      })
    )
  ).join("");

  const supportMessages = (await db.getContactMessages("contractor")).slice(0, 10);
  const supportRows = supportMessages
    .map(
      (m) => `<div class="job-row" style="margin-bottom:8px">
        <div class="row-between"><strong>${escapeHtml(m.name)}</strong><span class="small muted">${formatDate(m.createdAt)}</span></div>
        <div class="small muted">${escapeHtml(m.email)}</div>
        <div class="small" style="margin-top:6px">${escapeHtml(m.message)}</div>
      </div>`
    )
    .join("");

  const body = `
    ${adminSubnav(user, "contractor-apps")}
    <h1 style="font-size:22px;margin-bottom:6px">Contractor department</h1>
    <p class="muted small" style="margin-bottom:16px">Application review and contractor-support messages — general customer-service messages live under Customer service instead.</p>
    <h2 style="font-size:16px;margin-bottom:10px">Pending applications</h2>
    ${pending.length === 0 ? `<div class="panel" style="margin-bottom:20px"><p class="muted">No pending applications.</p></div>` : `<div style="margin-bottom:20px">${rows}</div>`}
    <h2 style="font-size:16px;margin-bottom:10px">Contractor support inbox</h2>
    ${supportMessages.length === 0 ? `<div class="panel"><p class="muted">No messages yet.</p></div>` : supportRows}
  `;
  send(res, 200, await layout({ title: "Contractor department", activeNav: "admin-contractor-apps", user, body }));
}

// ---------------- Contractor auth (separate identity space) ----------------
export async function contractorLoginPage(req, res, query) {
  // Always render the login form itself — never silently redirect past it
  // into a remembered session, even if a 30-day contractor session cookie
  // is still active. That auto-login was surprising when switching accounts.
  const contractor = await currentContractor(req);
  const next = query.get("next") || "/contractor/ping";
  const err = query.get("err");
  const body = `
    <div class="form-card" style="max-width:420px;margin:0 auto">
      <h1 style="font-size:22px;margin-bottom:6px">Contractor log in</h1>
      <p class="small muted" style="margin-bottom:16px">Separate from buyer/seller accounts — this is the contractor portal.</p>
      ${
        contractor
          ? `<div class="panel-tint" style="margin-bottom:16px">
              <div class="small">You're already logged in as <strong>${escapeHtml(contractor.fullName)}</strong>.</div>
              <div style="display:flex;gap:8px;margin-top:10px">
                <a href="${escapeHtml(next)}" class="btn btn-primary btn-sm">Continue to portal</a>
                <form method="POST" action="/api/contractor-auth/logout"><button class="btn btn-outline btn-sm" type="submit">Log out</button></form>
              </div>
            </div>
            <p class="small muted" style="margin-bottom:10px">Or log in as a different contractor below:</p>`
          : ""
      }
      ${err ? `<div class="badge badge-orange" style="margin-bottom:16px;display:block;padding:10px">${escapeHtml(err)}</div>` : ""}
      <form method="POST" action="/api/contractor-auth/login">
        <input type="hidden" name="next" value="${escapeHtml(next)}" />
        <div class="field"><label>Email</label><input type="email" name="email" required /></div>
        <div class="field"><label>Password</label><input type="password" name="password" required /></div>
        <button class="btn btn-primary btn-block" type="submit">Log in</button>
      </form>
      <div class="divider"></div>
      <p class="small muted">New contractor? <a href="/contractor/signup?next=${encodeURIComponent(next)}" style="color:var(--orange)">Create an account →</a></p>
      <p class="small muted" style="margin-top:10px">Demo account: alex@thesigndepot.com.au / password123</p>
    </div>
  `;
  send(res, 200, await contractorLayout({ title: "Contractor log in", body }));
}

export async function contractorSignupPage(req, res, query) {
  const contractor = await currentContractor(req);
  const next = query.get("next") || "/contractor/apply";
  if (contractor) return redirect(res, next);
  const err = query.get("err");
  const body = `
    <div class="form-card" style="max-width:420px;margin:0 auto">
      <h1 style="font-size:22px;margin-bottom:6px">Create a contractor account</h1>
      <p class="small muted" style="margin-bottom:16px">Separate from buyer/seller sign-up — you'll apply for approval next.</p>
      ${err ? `<div class="badge badge-orange" style="margin-bottom:16px;display:block;padding:10px">${escapeHtml(err)}</div>` : ""}
      <form method="POST" action="/api/contractor-auth/signup">
        <input type="hidden" name="next" value="${escapeHtml(next)}" />
        <div class="field"><label>Full name</label><input name="fullName" required /></div>
        <div class="field"><label>Email</label><input type="email" name="email" required /></div>
        ${mobileFieldMarkup({ idPrefix: "csignup-mobile" })}
        ${passwordFieldsMarkup({ idPrefix: "csignup-pw" })}
        <button class="btn btn-primary btn-block" type="submit">Create account</button>
      </form>
      <div class="divider"></div>
      <p class="small muted">Already have an account? <a href="/contractor/login?next=${encodeURIComponent(next)}" style="color:var(--orange)">Log in →</a></p>
    </div>
  `;
  send(res, 200, await contractorLayout({ title: "Contractor sign up", body }));
}

export async function contractorAccountPage(req, res, query) {
  const contractor = await requireContractor(req, res, "/contractor/account");
  if (!contractor) return;
  const updated = query.get("updated");
  const body = `
    <h1 style="font-size:22px;margin-bottom:16px">Contractor account</h1>
    ${updated ? `<div class="badge badge-green" style="margin-bottom:16px;display:block;padding:10px">${escapeHtml(updated)} updated.</div>` : ""}
    <div class="panel" style="max-width:480px">
      <div class="stack">
        <div class="row-between"><span class="muted small">Name</span><strong>${escapeHtml(contractor.fullName)}</strong></div>
        <div class="row-between"><span class="muted small">Email</span><span>${escapeHtml(contractor.email)}</span></div>
        <div class="row-between"><span class="muted small">Mobile</span><span>${escapeHtml(contractor.mobile)}</span></div>
        <div class="row-between"><span class="muted small">Business</span><span>${escapeHtml(contractor.businessName || "—")}</span></div>
        <div class="row-between"><span class="muted small">Status</span><span>${
          contractor.isApprovedContractor ? `Approved (★ ${contractor.contractorRating})` : contractor.contractorApplicationStatus || "Not applied"
        }</span></div>
      </div>
    </div>
  `;
  send(res, 200, await contractorLayout({ title: "Contractor account", activeNav: "contractor-account", contractor, body }));
}

export async function contractorMessagesPage(req, res) {
  const contractor = await requireContractor(req, res, "/contractor/messages");
  if (!contractor) return;
  await db.markMessagesSeen(contractor.id);
  const threads = await db.getJobThreadsForUser(contractor.id);
  const rows = (
    await Promise.all(
      threads.map(async (t) => {
        const listing = await db.getListingById(t.listingId);
        return `<a class="job-row" href="/job/${t.jobOrderId}/chat" style="display:block">
        <div class="row-between">
          <div><strong>${escapeHtml(listing ? listing.title : t.listingId)}</strong><div class="small muted">Job ${t.jobOrderId}</div></div>
          <div class="small muted">${formatDate(t.lastAt)}</div>
        </div>
        <div class="small muted" style="margin-top:6px">${t.lastMessage ? escapeHtml(t.lastMessage) : "No messages yet"}</div>
      </a>`;
      })
    )
  ).join("");
  const body = `
    <h1 style="font-size:22px;margin-bottom:16px">Messages</h1>
    ${threads.length === 0 ? `<div class="panel"><p class="muted">No job chats yet.</p></div>` : `<div class="job-list">${rows}</div>`}
  `;
  send(res, 200, await contractorLayout({ title: "Messages", activeNav: "contractor-messages", contractor, body }));
}

// ---------------- Admin: staff & permissions ----------------
export async function adminStaffPage(req, res, query) {
  const user = await requireSuperAdmin(req, res, "/admin/staff");
  if (!user) return;

  const created = query.get("created");
  const users = await db.getAllUsers();

  const rows = users
    .map((u) => {
      const checkboxes = PERMISSIONS.map(
        (p) => `<label class="small" style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <input type="checkbox" name="${p.key}" value="1" ${u[p.key] ? "checked" : ""} />
          ${escapeHtml(p.label)}
        </label>`
      ).join("");
      return `<div class="job-row" style="margin-bottom:12px">
        <div class="row-between" style="margin-bottom:8px">
          <div><strong>${escapeHtml(u.fullName)}</strong><div class="small muted">${escapeHtml(u.email)}</div></div>
          ${u.isAdmin ? `<span class="badge badge-blue">SUPER-ADMIN</span>` : ""}
        </div>
        ${
          u.isAdmin
            ? `<div class="small muted">Super-admins automatically have every permission below.</div>`
            : `<form method="POST" action="/api/admin/users/${u.id}/permissions">${checkboxes}<button class="btn btn-outline btn-sm" type="submit">Save</button></form>`
        }
      </div>`;
    })
    .join("");

  const body = `
    ${adminSubnav(user, "staff")}
    <h1 style="font-size:22px;margin-bottom:6px">Manage staff</h1>
    <p class="muted small" style="margin-bottom:16px">Toggle department access per account. This is a lightweight stand-in for a real roles system — flags only, no audit trail.</p>
    ${created ? `<div class="badge badge-green" style="margin-bottom:16px;display:block;padding:10px">Staff account created.</div>` : ""}

    <div class="form-card" style="margin-bottom:24px">
      <h2 style="font-size:16px;margin-bottom:14px">Create staff account</h2>
      <form method="POST" action="/api/admin/staff">
        <div class="field"><label>Full name</label><input name="fullName" required /></div>
        <div class="field"><label>Email</label><input type="email" name="email" required /></div>
        <div class="field"><label>Mobile</label><input name="mobile" required /></div>
        <div class="field"><label>Temporary password</label><input type="password" name="password" required pattern="${PASSWORD_PATTERN}" title="${escapeHtml(PASSWORD_HINT)}" minlength="10" placeholder="At least 10 characters" /></div>
        <div class="small muted" style="margin-top:-8px;margin-bottom:14px">${escapeHtml(PASSWORD_HINT)}</div>
        ${PERMISSIONS.map(
          (p) => `<label class="small" style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
            <input type="checkbox" name="${p.key}" value="1" /> ${escapeHtml(p.label)}
          </label>`
        ).join("")}
        <button class="btn btn-primary btn-block" type="submit" style="margin-top:6px">Create account</button>
      </form>
    </div>

    <h2 style="font-size:16px;margin-bottom:10px">All accounts</h2>
    ${rows}
  `;
  send(res, 200, await layout({ title: "Manage staff", activeNav: "admin-staff", user, body }));
}

// ---------------- Account ----------------
export async function accountPage(req, res, query) {
  const user = await requireUser(req, res, "/account");
  if (!user) return;
  const updated = query.get("updated");
  const err = query.get("err");
  const connect = query.get("connect");
  const stripeConfigured = isStripeConfigured();

  const body = `
    <h1 style="font-size:22px;margin-bottom:16px">Account</h1>
    ${updated ? `<div class="badge badge-green" style="margin-bottom:16px;display:block;padding:10px">${escapeHtml(updated)} updated.</div>` : ""}
    ${err ? `<div class="badge badge-orange" style="margin-bottom:16px;display:block;padding:10px">${escapeHtml(err)}</div>` : ""}
    ${connect === "done" ? `<div class="badge badge-green" style="margin-bottom:16px;display:block;padding:10px">Stripe onboarding updated — check your payout status below.</div>` : ""}
    ${query.get("verified") ? `<div class="badge badge-green" style="margin-bottom:16px;display:block;padding:10px">Email verified — you're all set.</div>` : ""}
    ${
      isEmailConfigured() && !user.emailVerifiedAt
        ? `<div class="badge badge-orange" style="margin-bottom:16px;display:block;padding:10px">
            Your email isn't verified yet — listing a space and booking are locked until it is. Check your inbox for the link.
            <form method="POST" action="/api/account/resend-verification" style="display:inline;margin-left:8px"><button class="btn-link" style="color:var(--orange);text-decoration:underline">Resend email</button></form>
          </div>`
        : ""
    }

    <div class="form-card" style="margin-bottom:20px">
      <h2 style="font-size:16px;margin-bottom:14px">Contact info</h2>
      <form method="POST" action="/api/account/profile">
        <div class="field"><label>Full name</label><input name="fullName" required value="${escapeHtml(user.fullName)}" /></div>
        <div class="field"><label>Email</label><input type="email" name="email" required value="${escapeHtml(user.email)}" /></div>
        <div class="field"><label>Mobile</label><input name="mobile" required value="${escapeHtml(user.mobile)}" /></div>
        <div class="field"><label>Address</label><input name="address" value="${escapeHtml(user.address || "")}" /></div>
        <div class="field"><label>Google Business Profile URL (optional)</label><input name="googleBusinessUrl" value="${escapeHtml(user.googleBusinessUrl || "")}" placeholder="https://g.page/your-business" /></div>
        <button class="btn btn-primary btn-block" type="submit">Save contact info</button>
      </form>
    </div>

    <div class="form-card" style="margin-bottom:20px">
      <h2 style="font-size:16px;margin-bottom:14px">Password</h2>
      <form method="POST" action="/api/account/password">
        <div class="field"><label>Current password</label><input type="password" name="currentPassword" required /></div>
        <div class="field"><label>New password</label><input type="password" name="newPassword" id="acct-pw-new" required pattern="${PASSWORD_PATTERN}" title="${escapeHtml(PASSWORD_HINT)}" minlength="10" /></div>
        <div class="small muted" style="margin-top:-8px;margin-bottom:14px">${escapeHtml(PASSWORD_HINT)}</div>
        <div class="field"><label>Confirm new password</label><input type="password" name="confirmPassword" id="acct-pw-confirm" required /></div>
        <div class="small" id="acct-pw-hint" style="margin-top:-8px;margin-bottom:14px"></div>
        <button class="btn btn-outline btn-block" type="submit">Update password</button>
      </form>
      <script>
        (function () {
          var pw = document.getElementById("acct-pw-new");
          var cf = document.getElementById("acct-pw-confirm");
          var hint = document.getElementById("acct-pw-hint");
          function check() {
            if (!cf.value) { hint.textContent = ""; return; }
            if (pw.value === cf.value) { hint.textContent = "✓ Passwords match"; hint.style.color = "var(--green)"; }
            else { hint.textContent = "Passwords do not match"; hint.style.color = "var(--red)"; }
          }
          pw.addEventListener("input", check);
          cf.addEventListener("input", check);
        })();
      </script>
    </div>

    <div class="form-card">
      <h2 style="font-size:16px;margin-bottom:14px">Payouts</h2>
      ${
        stripeConfigured
          ? user.stripeConnectAccountId
            ? `<div class="small" style="color:var(--green);margin-bottom:10px">✓ Payout account connected via Stripe.</div>
               <p class="small muted" style="margin-bottom:10px">Update your bank details or finish any outstanding Stripe requirements.</p>
               <form method="POST" action="/api/account/connect-payouts"><button class="btn btn-outline btn-block" type="submit">Manage payout account</button></form>`
            : `<p class="small muted" style="margin-bottom:10px">Connect a Stripe payout account so we can send your lease payouts (minus Frontage's 15% fee). Stripe collects your bank details directly during onboarding.</p>
               <form method="POST" action="/api/account/connect-payouts"><button class="btn btn-primary btn-block" type="submit">Connect payout account</button></form>`
          : `<p class="small muted" style="margin-bottom:10px">Where seller payouts are sent (minus Frontage's 15% fee).</p>
             <form method="POST" action="/api/account/banking">
               <div class="field"><label>BSB</label><input name="bankBsb" value="${escapeHtml(user.bankBsb || "")}" placeholder="062-000" /></div>
               <div class="field"><label>Account number</label><input name="bankAccount" value="${escapeHtml(user.bankAccount || "")}" placeholder="12345678" /></div>
               <div class="field"><label>Account name</label><input name="bankAccountName" value="${escapeHtml(user.bankAccountName || "")}" /></div>
               <button class="btn btn-outline btn-block" type="submit">Save banking details</button>
             </form>`
      }
    </div>
  `;
  send(res, 200, await layout({ title: "Account", activeNav: "account", user, body }));
}

// ---------------- My leases ----------------
export async function myLeasesPage(req, res) {
  const user = await requireUser(req, res, "/account/leases");
  if (!user) return;
  const bookings = await db.getBookingsForUser(user.id);

  const badgeClass = { signed: "badge-blue", active: "badge-green", ending: "badge-orange", ended: "badge-steel" };

  const cards = (
    await Promise.all(
      bookings.map(async (b) => {
        const listing = await db.getListingById(b.listingId);
        const isBuyer = b.buyerId === user.id;
        const contract = await db.getContractByBookingId(b.id);
        const payment = await db.getPaymentByBookingId(b.id);
        const jobOrder = await db.getJobOrderByBookingId(b.id);
        const endIso = leaseEndIso(b.leaseStartDate, b.term);
        const remaining = endIso ? daysUntil(endIso) : null;
        const withinRenewalWindow = remaining !== null && remaining <= 30 && b.status === "active";

        const timeBlock = !b.leaseStartDate
          ? `Not started — awaiting install${jobOrder ? ` (job ${jobOrder.id}: ${STAGE_LABELS[jobOrder.status]})` : ""}`
          : remaining >= 0
          ? `${remaining} days remaining (ends ${formatDate(endIso)})`
          : `Term ended ${formatDate(endIso)}`;

        const paymentBlock = isBuyer
          ? payment
            ? `Paid ${money(payment.totalAmount)} total`
            : "—"
          : payment
          ? `Payout ${money(payment.payoutAmount)} (after 15% fee) — ${payment.payoutStatus === "released" ? "released" : "held until install confirmed"}`
          : "—";

        const actions =
          isBuyer && withinRenewalWindow
            ? `<div style="display:flex;gap:8px;margin-top:10px">
              <form method="POST" action="/api/bookings/${b.id}/renew"><input type="hidden" name="extraMonths" value="12" /><button class="btn btn-primary btn-sm" type="submit">Renew 12 months</button></form>
              <form method="POST" action="/api/bookings/${b.id}/end-lease"><button class="btn btn-outline btn-sm" type="submit">End at term end</button></form>
            </div>`
            : isBuyer && b.autoRenew === false
            ? `<div class="small muted" style="margin-top:8px">Set to end at term end — won't auto-renew.</div>`
            : "";

        return `<div class="panel" style="margin-bottom:16px">
        <div class="row-between" style="margin-bottom:8px">
          <div><strong>${escapeHtml(listing ? listing.title : b.listingId)}</strong><div class="small muted">${isBuyer ? "You're the buyer" : "You're the seller"} · ${b.term}mo term · ${money(b.monthlyRate)}/mo</div></div>
          <span class="badge ${badgeClass[b.status] || "badge-blue"}">${b.status.toUpperCase()}</span>
        </div>
        <div class="small" style="margin-bottom:6px">${timeBlock}</div>
        <div class="small muted" style="margin-bottom:6px">Signed by ${contract ? escapeHtml(contract.signedName) : "—"} on ${contract ? formatDate(contract.signedAt) : "—"} · <a href="/contract/${b.id}" style="color:var(--orange)">View signed contract →</a></div>
        <div class="small muted">${paymentBlock}</div>
        ${actions}
      </div>`;
      })
    )
  ).join("");

  const body = `<h1 style="font-size:22px;margin-bottom:16px">My leases</h1>${bookings.length === 0 ? `<div class="panel"><p class="muted">No leases yet — book a space or list one to see it here.</p></div>` : cards}`;
  send(res, 200, await layout({ title: "My leases", activeNav: "account-leases", user, body }));
}

function leaseTermsBlock(booking, listing) {
  return `<p style="line-height:1.6">
    <strong>1. Space.</strong> ${listing ? `${formatMm(listing.sizeW)} × ${formatMm(listing.sizeH)} at ${escapeHtml(listing.venue)}` : "—"}, as listed.<br/>
    <strong>2. Term.</strong> ${booking.term} months, commencing ${booking.leaseStartDate ? formatDate(booking.leaseStartDate) : "on install completion (not yet started)"}. ${booking.autoRenew ? "Auto-renews monthly unless cancelled with 30 days' notice." : "Set to end at term expiry — will not auto-renew."}<br/>
    <strong>3. Rate.</strong> ${money(booking.monthlyRate)} per month.<br/>
    <strong>4. Install &amp; removal.</strong> Engaged and paid to a Frontage-network contractor directly, separate from this lease.<br/>
    <strong>5. Platform fee.</strong> Frontage deducts 15% from the seller's payout on each payment.<br/>
    <strong>6. Early termination.</strong> Ending this lease early incurs a break fee equal to one month's rent${listing ? ` (${money(listing.price)})` : ""}.<br/>
    <strong>7. Content &amp; conduct.</strong> Advertising content must be lawful and meet the standards in the <a href="/terms" style="color:var(--orange)">Terms &amp; Conditions</a>, which both parties accepted at signing. The seller warrants authority over the listed space.<br/>
    <strong>8. Breach &amp; liability.</strong> A party in breach is liable for the other party's resulting losses. Frontage facilitates this marketplace and is not a party to the lease; each party indemnifies Frontage against claims arising from their own breach.
  </p>`;
}

export async function contractViewPage(req, res, id) {
  const user = await requireUser(req, res, `/contract/${id}`);
  if (!user) return;
  const booking = await db.getBookingById(id);
  if (!booking || (booking.buyerId !== user.id && booking.sellerId !== user.id)) {
    return send(res, 404, await layout({ title: "Not found", user, body: "<p>Contract not found.</p>" }));
  }
  const listing = await db.getListingById(booking.listingId);
  const contract = await db.getContractByBookingId(booking.id);
  const body = `
    <a href="/account/leases" class="small muted">← Back to my leases</a>
    <div class="panel" style="margin-top:14px;max-width:640px">
      <h1 style="font-size:20px;margin-bottom:4px">Lease agreement — ${escapeHtml(listing ? listing.title : booking.listingId)}</h1>
      <div class="small muted" style="margin-bottom:16px">Booking ${booking.id} · Signed by ${escapeHtml(contract ? contract.signedName : "—")} on ${formatDate(contract ? contract.signedAt : null)}</div>
      ${leaseTermsBlock(booking, listing)}
      <div class="signature" style="margin-top:12px">${escapeHtml(contract ? contract.signedName : "")}</div>
    </div>
  `;
  send(res, 200, await layout({ title: "Lease contract", activeNav: "account-leases", user, body }));
}

// ---------------- Admin: customer service ----------------
export async function adminDealsPage(req, res) {
  const user = await requirePermission(req, res, "canAccessSupport", "/admin/deals");
  if (!user) return;

  const bookings = await db.getAllBookingsAdmin();
  const rows = (
    await Promise.all(
      bookings.map(async (b) => {
        const listing = await db.getListingById(b.listingId);
        const buyer = await db.getUserById(b.buyerId);
        const seller = await db.getUserById(b.sellerId);
        const payment = await db.getPaymentByBookingId(b.id);
        return `<a class="job-row" href="/admin/deals/${b.id}" style="display:block">
        <div class="row-between">
          <div><strong>${escapeHtml(listing ? listing.title : b.listingId)}</strong><div class="small muted">${escapeHtml(buyer ? buyer.fullName : b.buyerId)} → ${escapeHtml(seller ? seller.fullName : b.sellerId)}</div></div>
          <span class="badge badge-blue">${b.status.toUpperCase()}</span>
        </div>
        <div class="small muted" style="margin-top:6px">${payment ? `${money(payment.totalAmount)} · payout ${payment.payoutStatus}` : "—"} · ${formatDate(b.createdAt)}</div>
      </a>`;
      })
    )
  ).join("");

  const contactMessages = (await db.getContactMessages("general")).slice(0, 10);
  const contactRows = contactMessages
    .map(
      (m) => `<div class="job-row" style="margin-bottom:8px">
        <div class="row-between"><strong>${escapeHtml(m.name)}</strong><span class="small muted">${formatDate(m.createdAt)}</span></div>
        <div class="small muted">${escapeHtml(m.email)}</div>
        <div class="small" style="margin-top:6px">${escapeHtml(m.message)}</div>
      </div>`
    )
    .join("");

  const body = `
    ${adminSubnav(user, "deals")}
    <h1 style="font-size:22px;margin-bottom:6px">Customer service — all deals</h1>
    <p class="muted small" style="margin-bottom:16px">Every booking on the platform, with its contract, payment/payout status, job order stage, and both parties' chat history.</p>
    <h2 style="font-size:16px;margin-bottom:10px">All deals</h2>
    ${bookings.length === 0 ? `<div class="panel" style="margin-bottom:20px"><p class="muted">No bookings yet.</p></div>` : `<div class="job-list" style="margin-bottom:24px">${rows}</div>`}
    <h2 style="font-size:16px;margin-bottom:10px">General contact messages</h2>
    ${contactMessages.length === 0 ? `<div class="panel"><p class="muted">No messages yet.</p></div>` : contactRows}
  `;
  send(res, 200, await layout({ title: "Deals — customer service", activeNav: "admin-deals", user, body }));
}

export async function adminListingsPage(req, res) {
  const user = await requirePermission(req, res, "canAccessSupport", "/admin/listings");
  if (!user) return;

  const listings = await db.getAllListingsAdmin();
  const rows = (
    await Promise.all(
      listings.map(async (l) => {
        const owner = l.ownerId ? await db.getUserById(l.ownerId) : null;
        const statusBadge =
          l.status === "removed"
            ? `<span class="badge badge-orange">REMOVED</span>`
            : l.status === "unclaimed"
            ? `<span class="badge badge-blue">UNCLAIMED</span>`
            : l.status === "leased"
            ? `<span class="badge badge-blue">LEASED</span>`
            : `<span class="badge badge-green">LIVE</span>`;
        let action = "";
        if (l.status === "live") {
          action = `<form method="POST" action="/api/admin/listings/${l.id}/remove" style="display:flex;gap:6px;margin-top:8px">
          <input name="reason" placeholder="Reason for removal" required class="mono" style="font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--border);flex:1" />
          <button class="btn btn-outline btn-sm" type="submit">Remove</button>
        </form>`;
        } else if (l.status === "removed") {
          action = `<div class="small muted" style="margin-top:6px">Removed ${formatDate(l.removedAt)}: "${escapeHtml(l.removedReason || "")}"</div>
          <form method="POST" action="/api/admin/listings/${l.id}/restore" style="margin-top:6px"><button class="btn btn-dark btn-sm" type="submit">Restore</button></form>`;
        }
        return `<div class="job-row" style="margin-bottom:12px">
        <div class="row-between">
          <div><strong>${escapeHtml(l.title)}</strong><div class="small muted">${escapeHtml(l.venue)} · ${escapeHtml(owner ? owner.fullName : l.status === "unclaimed" ? "not yet claimed" : "owner not found")} · <a href="/listing/${l.id}" style="color:var(--orange)">view →</a></div></div>
          ${statusBadge}
        </div>
        ${action}
      </div>`;
      })
    )
  ).join("");

  const body = `
    ${adminSubnav(user, "listings")}
    <h1 style="font-size:22px;margin-bottom:6px">Listings moderation</h1>
    <p class="muted small" style="margin-bottom:16px">Every listing on the platform. Removing one with a reason takes it off browse and its direct URL immediately.</p>
    ${listings.length === 0 ? `<div class="panel"><p class="muted">No listings yet.</p></div>` : rows}
  `;
  send(res, 200, await layout({ title: "Listings moderation", activeNav: "admin-listings", user, body }));
}

export async function adminDealDetailPage(req, res, id) {
  const user = await requirePermission(req, res, "canAccessSupport", `/admin/deals/${id}`);
  if (!user) return;

  const booking = await db.getBookingById(id);
  if (!booking) return send(res, 404, await layout({ title: "Not found", user, body: "<p>Booking not found.</p>" }));

  const listing = await db.getListingById(booking.listingId);
  const buyer = await db.getUserById(booking.buyerId);
  const seller = await db.getUserById(booking.sellerId);
  const contract = await db.getContractByBookingId(booking.id);
  const payment = await db.getPaymentByBookingId(booking.id);
  const jobOrder = await db.getJobOrderByBookingId(booking.id);

  const jobMessages = jobOrder ? await db.getMessagesForThread("job", jobOrder.id) : [];
  const listingMessages = await db.getMessagesForThread("listing", `${booking.listingId}:${booking.buyerId}`);
  const jobOrderContractor = jobOrder && jobOrder.contractorId ? await db.getUserById(jobOrder.contractorId) : null;

  const body = `
    <a href="/admin/deals" class="small muted">← Back to all deals</a>
    <h1 style="font-size:22px;margin:10px 0 4px">${escapeHtml(listing ? listing.title : booking.listingId)}</h1>
    <div class="small muted" style="margin-bottom:16px">Booking ${booking.id} · Buyer: ${escapeHtml(buyer ? `${buyer.fullName} (${buyer.email})` : booking.buyerId)} · Seller: ${escapeHtml(seller ? `${seller.fullName} (${seller.email})` : booking.sellerId)}</div>

    <div class="panel" style="margin-bottom:16px">
      <h2 style="font-size:15px;margin-bottom:8px">Contract</h2>
      <div class="small muted" style="margin-bottom:8px">Signed by ${escapeHtml(contract ? contract.signedName : "—")} on ${formatDate(contract ? contract.signedAt : null)}</div>
      ${leaseTermsBlock(booking, listing)}
    </div>

    <div class="panel" style="margin-bottom:16px">
      <h2 style="font-size:15px;margin-bottom:8px">Payment &amp; payout</h2>
      ${
        payment
          ? `<div class="row-between small"><span class="muted">Total charged</span><span class="mono">${money(payment.totalAmount)}</span></div>
             <div class="row-between small" style="margin-top:6px"><span class="muted">Platform fee (15%)</span><span class="mono">${money(payment.feeAmount)}</span></div>
             <div class="row-between small" style="margin-top:6px"><span class="muted">Seller payout</span><span class="mono">${money(payment.payoutAmount)} — ${payment.payoutStatus}${payment.payoutReleasedAt ? ` (${formatDate(payment.payoutReleasedAt)})` : ""}</span></div>
             ${payment.payoutBlockedReason ? `<div class="small" style="color:var(--orange);margin-top:8px">⚠ ${escapeHtml(payment.payoutBlockedReason)}</div>` : ""}`
          : `<p class="muted small">No payment on file.</p>`
      }
    </div>

    <div class="panel" style="margin-bottom:16px">
      <h2 style="font-size:15px;margin-bottom:8px">Job order</h2>
      ${
        jobOrder
          ? `<div class="small muted">Job ${jobOrder.id} · Status: ${STAGE_LABELS[jobOrder.status]}${jobOrder.contractorId ? ` · Contractor: ${escapeHtml((jobOrderContractor || {}).fullName || jobOrder.contractorId)}` : ""}</div>`
          : `<p class="muted small">No job order on file.</p>`
      }
    </div>

    <div class="panel" style="margin-bottom:16px">
      <h2 style="font-size:15px;margin-bottom:8px">Job order chat — read-only</h2>
      <div class="chat-thread">${await renderChatBubbles(jobMessages, "")}</div>
    </div>

    <div class="panel">
      <h2 style="font-size:15px;margin-bottom:8px">Listing enquiry chat — read-only</h2>
      <div class="chat-thread">${await renderChatBubbles(listingMessages, "")}</div>
    </div>
  `;
  send(res, 200, await layout({ title: "Deal detail — customer service", activeNav: "admin-deals", user, body }));
}

// ---------------- Marketing pages ----------------
export async function aboutPage(req, res) {
  const user = await currentUser(req);
  const body = `
    <div class="panel" style="max-width:640px;margin:0 auto">
      <h1 style="font-size:22px;margin-bottom:10px">About Frontage</h1>
      <p style="margin-bottom:12px">Frontage connects businesses with spare wall, window, or fence space to advertisers who want to lease it — and to a network of vetted contractors who print, install, and remove the ads.</p>
      <p style="margin-bottom:12px">Sellers list a space in minutes. Buyers browse, sign a lease, and pay online. A contractor picks up the print/install job and keeps everyone updated until it's live on the wall.</p>
      <p class="small muted">This is a working demo build — see the footer for what's real today and what's still on the roadmap.</p>
    </div>
  `;
  send(res, 200, await layout({ title: "About", activeNav: "about", user, body }));
}

export async function howItWorksPage(req, res) {
  const user = await currentUser(req);
  const body = `
    <div class="panel" style="max-width:640px;margin:0 auto">
      <h1 style="font-size:22px;margin-bottom:14px">How it works</h1>
      <h3 style="font-size:14px;margin-bottom:6px">For sellers</h3>
      <p class="small muted" style="margin-bottom:14px">List a wall, window, or fence space with its size and a monthly rate. Once a buyer books it, you confirm an access window for the contractor and get paid monthly, minus a 15% platform fee.</p>
      <h3 style="font-size:14px;margin-bottom:6px">For buyers</h3>
      <p class="small muted" style="margin-bottom:14px">Browse spaces by category or suburb, sign a lease online, and pay for the term up front. A Frontage-network contractor handles print, install, and eventual removal — billed to you separately with an estimate shown before you pay.</p>
      <h3 style="font-size:14px;margin-bottom:6px">For contractors</h3>
      <p class="small muted">Apply with your business number, company registration, and proof of insurance. Once approved, claim broadcast job orders, send a quote, schedule the install, and mark it complete — the lease clock starts the moment you do.</p>
    </div>
  `;
  send(res, 200, await layout({ title: "How it works", activeNav: "how-it-works", user, body }));
}

export async function termsPage(req, res) {
  const user = await currentUser(req);
  const body = `
    <div class="panel" style="max-width:720px;margin:0 auto">
      <h1 style="font-size:22px;margin-bottom:4px">Terms &amp; Conditions</h1>
      <p class="small muted" style="margin-bottom:18px">These terms govern every account, listing, lease, and job order on Frontage. By using the platform you agree to them.</p>

      <h3 style="font-size:14px;margin-bottom:6px">1. What Frontage is</h3>
      <p class="small muted" style="margin-bottom:14px">Frontage is a marketplace that connects owners of physical advertising space ("sellers"), advertisers who lease that space ("buyers"), and independent contractors who print, install, and remove advertising. Frontage facilitates introductions, contracts, and payments — it is not a party to the lease between buyer and seller, nor to the service agreement between a buyer and a contractor.</p>

      <h3 style="font-size:14px;margin-bottom:6px">2. Accounts</h3>
      <p class="small muted" style="margin-bottom:14px">You must provide accurate account information and keep your login credentials secure. You are responsible for all activity under your account. Accounts may be suspended or closed for breach of these terms.</p>

      <h3 style="font-size:14px;margin-bottom:6px">3. Listings</h3>
      <p class="small muted" style="margin-bottom:14px">By listing a space, the seller warrants that they own the space or hold clear authority to lease it for advertising, that the listing details (size, location, exposure) are accurate, and that displaying advertising there does not breach any law, lease, strata rule, or council requirement. Misrepresented listings may be removed and any held payouts withheld.</p>

      <h3 style="font-size:14px;margin-bottom:6px">4. Leases &amp; payments</h3>
      <p class="small muted" style="margin-bottom:14px">Leases run for a fixed term of 6 or 12 months, starting when installation is confirmed complete, and auto-renew monthly thereafter unless cancelled with 30 days' notice. The buyer pays the full term up front. Frontage holds the seller's payout until installation is confirmed, then releases it minus the 15% platform fee. Early termination by the buyer incurs a break fee of one month's rent.</p>

      <h3 style="font-size:14px;margin-bottom:6px">5. Contractors</h3>
      <p class="small muted" style="margin-bottom:14px">Contractors are vetted before accessing job orders but act as independent businesses, not employees or agents of Frontage. Print, install, and removal work is quoted, agreed, and paid between the buyer and the contractor directly.</p>

      <h3 style="font-size:14px;margin-bottom:6px">6. Prohibited conduct</h3>
      <p class="small muted" style="margin-bottom:14px">The following are breaches of these terms by any user: misrepresenting a listing, account, or credentials; displaying unlawful, misleading, or offensive advertising content; damaging, obscuring, or removing installed advertising before term end without agreement; circumventing Frontage to avoid platform fees on a connection made through the platform; and any fraudulent or unlawful use of the platform.</p>

      <h3 style="font-size:14px;margin-bottom:6px">7. Consequences of breach</h3>
      <p class="small muted" style="margin-bottom:14px">Frontage may suspend or terminate accounts, remove listings, cancel job orders, and withhold pending payouts connected to a breach while it is investigated. <strong>A party who breaches these terms or a lease is responsible for the losses their breach causes to the other party.</strong> Frontage may recover from the breaching party any costs, fees, or losses Frontage itself incurs because of the breach.</p>

      <h3 style="font-size:14px;margin-bottom:6px">8. Liability &amp; indemnity</h3>
      <p class="small muted" style="margin-bottom:14px">To the maximum extent permitted by law, Frontage is not liable for loss arising from the conduct of buyers, sellers, or contractors — including misrepresentation, breach of lease, defective installation, or property damage. Each user indemnifies Frontage against claims, losses, and costs arising from that user's own breach of these terms, their listings or advertising content, or their dealings with other users. Nothing in these terms excludes rights that cannot be excluded under applicable consumer law.</p>

      <h3 style="font-size:14px;margin-bottom:6px">9. Changes</h3>
      <p class="small muted" style="margin-bottom:14px">Frontage may update these terms; material changes will be notified via the platform. Continued use after a change is acceptance of the updated terms.</p>

      <h3 style="font-size:14px;margin-bottom:6px">10. Governing law</h3>
      <p class="small muted">These terms are governed by the laws of New South Wales, Australia.</p>
    </div>
  `;
  send(res, 200, await layout({ title: "Terms & Conditions", activeNav: "terms", user, body }));
}

export async function investorsPage(req, res) {
  const user = await currentUser(req);
  const body = `
    <div class="panel" style="max-width:640px;margin:0 auto">
      <h1 style="font-size:22px;margin-bottom:10px">Investors</h1>
      <p style="margin-bottom:12px">Frontage is building the marketplace for physical advertising space — turning idle walls, windows, and fences at gyms, cafés, offices, and homes into measurable, bookable ad inventory.</p>
      <p style="margin-bottom:12px">The platform handles the full transaction end to end: listing and discovery, lease contracts and payment, a vetted contractor network for print and installation, and escrow-style payouts that release only once an ad is confirmed live on the wall.</p>
      <p style="margin-bottom:18px">We're currently raising and would love to talk. Reach out for a deck and a walkthrough of the live product.</p>
      <a href="mailto:teeyaam@gmail.com?subject=Frontage%20investor%20enquiry" class="btn btn-primary">Contact us — teeyaam@gmail.com</a>
    </div>
  `;
  send(res, 200, await layout({ title: "Investors", activeNav: "investors", user, body }));
}

export async function contactPage(req, res, query) {
  const user = await currentUser(req);
  const sent = query.get("sent");
  const body = `
    <div class="form-card" style="max-width:560px;margin:0 auto">
      <h1 style="font-size:22px;margin-bottom:10px">Contact us</h1>
      ${sent ? `<div class="badge badge-green" style="margin-bottom:16px;display:block;padding:10px">Thanks — we'll get back to you.</div>` : ""}
      <form method="POST" action="/api/contact">
        <div class="field"><label>Name</label><input name="name" required value="${escapeHtml(user ? user.fullName : "")}" /></div>
        <div class="field"><label>Email</label><input type="email" name="email" required value="${escapeHtml(user ? user.email : "")}" /></div>
        <div class="field"><label>Message</label><textarea name="message" rows="4" required></textarea></div>
        <button class="btn btn-primary btn-block" type="submit">Send message</button>
      </form>
    </div>
  `;
  send(res, 200, await layout({ title: "Contact", activeNav: "contact", user, body }));
}

export async function contractorSupportPage(req, res, query) {
  const user = await currentUser(req);
  const sent = query.get("sent");
  const body = `
    <div class="form-card" style="max-width:560px;margin:0 auto">
      <h1 style="font-size:22px;margin-bottom:6px">Contractor support</h1>
      <p class="small muted" style="margin-bottom:14px">Questions about your application, onboarding, or the contractor side of Frontage go here — separate from general customer support.</p>
      ${sent ? `<div class="badge badge-green" style="margin-bottom:16px;display:block;padding:10px">Thanks — the contractor team will get back to you.</div>` : ""}
      <form method="POST" action="/api/contact">
        <input type="hidden" name="topic" value="contractor" />
        <div class="field"><label>Name</label><input name="name" required value="${escapeHtml(user ? user.fullName : "")}" /></div>
        <div class="field"><label>Email</label><input type="email" name="email" required value="${escapeHtml(user ? user.email : "")}" /></div>
        <div class="field"><label>Message</label><textarea name="message" rows="4" required placeholder="e.g. a question about my application status, insurance requirements, onboarding..."></textarea></div>
        <button class="btn btn-primary btn-block" type="submit">Send to contractor support</button>
      </form>
    </div>
  `;
  send(res, 200, await layout({ title: "Contractor support", activeNav: "contractor-support", user, body }));
}

export { send, redirect, requireUser };
