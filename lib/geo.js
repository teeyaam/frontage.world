// Approximate suburb-center coordinates for the map tab — no geocoding API
// or key needed. New listings snap to the center of their suburb; a seller
// can still override with manual lat/lng if they want precision.
const SUBURB_COORDS = {
  "castle hill": { lat: -33.7248, lng: 151.0046 },
  newtown: { lat: -33.8988, lng: 151.1795 },
  "north sydney": { lat: -33.8397, lng: 151.2073 },
  "bondi beach": { lat: -33.8908, lng: 151.2743 },
};

const SYDNEY_CBD = { lat: -33.8688, lng: 151.2093 };

export function approximateCoords(suburb) {
  const key = String(suburb || "").trim().toLowerCase();
  return SUBURB_COORDS[key] || SYDNEY_CBD;
}

export { SUBURB_COORDS, SYDNEY_CBD };
