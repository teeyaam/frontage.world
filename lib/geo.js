// Approximate coordinates for the map tab — no paid geocoding API or key
// needed. A small hardcoded table covers the original Sydney demo suburbs
// instantly; anything else falls through to a free live lookup against
// OpenStreetMap's Nominatim search API (same free OSM ecosystem the
// Leaflet map already uses), so listings anywhere in the world still land
// roughly in the right place. A seller can always override with manual
// lat/lng if they want precision.
const SUBURB_COORDS = {
  "castle hill": { lat: -33.7248, lng: 151.0046 },
  newtown: { lat: -33.8988, lng: 151.1795 },
  "north sydney": { lat: -33.8397, lng: 151.2073 },
  "bondi beach": { lat: -33.8908, lng: 151.2743 },
};

const SYDNEY_CBD = { lat: -33.8688, lng: 151.2093 };

// Nominatim's usage policy caps this at ~1 request/second and requires a
// real identifying User-Agent — both fine for how infrequently a listing
// gets created (nowhere near that rate), and the app never geocodes on
// every page load, only once when a listing is created or edited without
// manual coordinates.
async function nominatimLookup(query) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "FrontageMarketplace/1.0 (contact: teeyaam@gmail.com)" },
    });
    if (!res.ok) return null;
    const results = await res.json();
    const first = results[0];
    if (!first) return null;
    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch (err) {
    console.error("Geocoding lookup failed:", err.message);
    return null;
  }
}

export async function approximateCoords(suburb, country) {
  const key = String(suburb || "").trim().toLowerCase();
  if (SUBURB_COORDS[key]) return SUBURB_COORDS[key];
  const query = [suburb, country].filter(Boolean).join(", ");
  if (query) {
    const found = await nominatimLookup(query);
    if (found) return found;
  }
  return SYDNEY_CBD;
}

export { SUBURB_COORDS, SYDNEY_CBD };
