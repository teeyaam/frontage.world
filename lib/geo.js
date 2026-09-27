// Geocoding + location privacy.
//
// Server-side geocoding uses the Google Geocoding API when
// GOOGLE_MAPS_SERVER_KEY is set, and falls back to OpenStreetMap's free
// Nominatim search otherwise (or if Google fails). Nothing here ever
// invents a location: if neither service can place an address, callers get
// null and ask the seller to fix it, rather than dropping a wrong pin.
//
// Keys: GOOGLE_MAPS_SERVER_KEY is server-only (restricted to the Geocoding
// API, never sent to the browser). The browser key, GOOGLE_MAPS_API_KEY, is
// separate and domain-restricted — see lib/maps.js.

// Every lookup is scoped to one country (the listing's, or the visitor's
// browse country) — see lib/countries.js MARKETS.

export function isServerGeocodingConfigured() {
  return Boolean(process.env.GOOGLE_MAPS_SERVER_KEY);
}

function pickComponent(components, type, useShort = false) {
  const c = (components || []).find((x) => (x.types || []).includes(type));
  return c ? (useShort ? c.short_name : c.long_name) : null;
}

// A result that is only a country or state/province — what a geocoder falls
// back to when it can't find the street in the requested country. Fine for
// centring a map, never good enough as a listing address.
const COARSE_TYPES = ["country", "administrative_area_level_1", "state"];

// Normalised result shape shared by both providers.
function googleResultToLocation(r) {
  const comps = r.address_components || [];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    formattedAddress: r.formatted_address || null,
    suburb: pickComponent(comps, "locality") || pickComponent(comps, "sublocality") || pickComponent(comps, "postal_town"),
    state: pickComponent(comps, "administrative_area_level_1", true),
    postcode: pickComponent(comps, "postal_code"),
    country: pickComponent(comps, "country"),
    countryCode: pickComponent(comps, "country", true),
    placeId: r.place_id || null,
    coarse: (r.types || []).some((t) => COARSE_TYPES.includes(t)),
  };
}

async function googleGeocode(params, country) {
  const qs = new URLSearchParams({ ...params, key: process.env.GOOGLE_MAPS_SERVER_KEY });
  if (country && !params.place_id) {
    qs.set("components", `country:${country.toLowerCase()}`);
    qs.set("region", country.toLowerCase());
  }
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${qs}`);
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
  const data = await res.json();
  if (data.status === "ZERO_RESULTS") return null;
  if (data.status !== "OK") throw new Error(`Geocoding status ${data.status}${data.error_message ? `: ${data.error_message}` : ""}`);
  return googleResultToLocation(data.results[0]);
}

// Nominatim's usage policy: ~1 request/second and an identifying
// User-Agent. Listings are geocoded once at create/edit, never per page view.
async function nominatimGeocode(query, country) {
  const qs = new URLSearchParams({ format: "json", limit: "1", addressdetails: "1", q: query });
  if (country) qs.set("countrycodes", country.toLowerCase());
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, {
    headers: { "User-Agent": "FrontageMarketplace/2.0 (+https://frontage.world)" },
  });
  if (!res.ok) return null;
  const first = (await res.json())[0];
  if (!first) return null;
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const a = first.address || {};
  return {
    lat,
    lng,
    formattedAddress: first.display_name || null,
    suburb: a.suburb || a.town || a.city || a.village || null,
    state: a.state || null,
    postcode: a.postcode || null,
    country: a.country || null,
    countryCode: a.country_code ? a.country_code.toUpperCase() : null,
    placeId: null,
    coarse: COARSE_TYPES.includes(first.addresstype || first.type),
  };
}

// Address text → location within `country` (ISO code), or null if nothing
// could place it there.
export async function geocodeAddress(address, country) {
  const query = String(address || "").trim();
  if (!query) return null;
  if (isServerGeocodingConfigured()) {
    try {
      const found = await googleGeocode({ address: query }, country);
      if (found) return found.coarse ? null : found;
    } catch (err) {
      console.error("Google geocoding failed, trying OpenStreetMap:", err.message);
    }
  }
  try {
    const found = await nominatimGeocode(query, country);
    return found && !found.coarse ? found : null;
  } catch (err) {
    console.error("Nominatim geocoding failed:", err.message);
    return null;
  }
}

// Google place_id (from Places autocomplete in the browser) → location.
// Re-resolving it server-side means the stored coordinates and address
// parts come from Google, not from whatever the browser posted.
export async function geocodePlaceId(placeId) {
  if (!placeId || !isServerGeocodingConfigured()) return null;
  try {
    return await googleGeocode({ place_id: placeId });
  } catch (err) {
    console.error("Google place lookup failed:", err.message);
    return null;
  }
}

// Rough coordinates for a free-text place name (browse's "nearby suburbs"
// suggestion). Null when unknown — callers skip the feature then.
export async function approximateCoords(term, country) {
  const found = await geocodeAddress(term, country);
  return found ? { lat: found.lat, lng: found.lng } : null;
}

// ---------- Location privacy ----------
// Unless the seller opted to show the exact spot, the public only ever sees
// an approximate point: the coordinates rounded to a ~1km grid, then nudged
// by a fixed per-listing offset (from its id, never from the real
// position) so neighbouring listings don't stack on one pin.
function hashUnit(str, salt) {
  let h = 2166136261;
  for (const ch of `${salt}:${str}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000; // 0..1
}
export function publicCoords(listing) {
  if (listing.lat == null || listing.lng == null) return null;
  const lat = Number(listing.lat);
  const lng = Number(listing.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (listing.showExactLocation) return { lat, lng, exact: true };
  const round = (n) => Math.round(n * 100) / 100;
  const jitter = (salt) => (hashUnit(listing.id, salt) - 0.5) * 0.006; // ±~300m
  return { lat: round(lat) + jitter("lat"), lng: round(lng) + jitter("lng"), exact: false };
}

// "Castle Hill NSW 2154" — the public location line. The street address is
// only included when the seller chose to show the exact location.
export function publicLocationLine(listing) {
  const area = [listing.suburb, listing.state, listing.postcode].filter(Boolean).join(" ");
  if (listing.showExactLocation && listing.address) return listing.address;
  return area || (listing.country || "");
}

// Great-circle distance between two points, in kilometres.
export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
