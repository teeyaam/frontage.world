// Browser-side Google Maps pieces. GOOGLE_MAPS_API_KEY is the *browser* key:
// visible to every visitor, so in Google Cloud it must be restricted by HTTP
// referrer (frontage.world/*, www, and localhost for dev) and to the Maps
// JavaScript, Places (New) and Maps Embed APIs only. The server's geocoding
// key (GOOGLE_MAPS_SERVER_KEY, lib/geo.js) is separate and never rendered.
//
// With no browser key, the site falls back to Leaflet + OpenStreetMap maps
// and a plain address box (the server geocodes it).

import { publicCoords, placesCountries } from "./geo.js";

export function browserMapsKey() {
  return process.env.GOOGLE_MAPS_API_KEY || "";
}

// Maps Embed API (free, unlimited). Exact listings pin the place itself;
// approximate ones show the suburb, never the street address.
export function mapsEmbedUrl(listing) {
  const key = browserMapsKey();
  if (!key) return null;
  let q;
  if (listing.showExactLocation) {
    q = listing.placeId ? `place_id:${listing.placeId}` : listing.lat != null ? `${listing.lat},${listing.lng}` : listing.address;
  } else {
    q = [[listing.suburb, listing.state].filter(Boolean).join(" "), listing.country].filter(Boolean).join(", ");
  }
  if (!q) return null;
  const params = new URLSearchParams({ key, q, zoom: listing.showExactLocation ? "16" : "13" });
  return `https://www.google.com/maps/embed/v1/place?${params}`;
}

// Script tag that loads the Maps JS API. `callback` is a global function
// name defined by the page's own script.
export function mapsScriptTag(callback) {
  const key = browserMapsKey();
  if (!key) return "";
  const params = new URLSearchParams({ key, callback, loading: "async", v: "weekly", region: (placesCountries()[0] || "au").toUpperCase() });
  return `<script async src="https://maps.googleapis.com/maps/api/js?${params}"></script>`;
}

export { publicCoords };
