// Shared query-param filtering for listings — used by the browse page and
// the map data endpoint, so the map pins narrow exactly like the grid.
export function filterListings(allListings, query) {
  const cat = query.get("category");
  const q = (query.get("q") || "").trim().toLowerCase();
  const where = (query.get("where") || "").trim().toLowerCase();
  const clampNonNegative = (n) => (Number.isFinite(n) && n >= 0 ? n : NaN);
  const minPrice = clampNonNegative(parseFloat(query.get("minPrice")));
  const maxPrice = clampNonNegative(parseFloat(query.get("maxPrice")));

  let listings = allListings;
  if (cat && cat !== "all") listings = listings.filter((l) => l.category === cat);
  if (q) listings = listings.filter((l) => `${l.title} ${l.description} ${l.suburb || ""} ${l.state || ""} ${l.postcode || ""}`.toLowerCase().includes(q));
  if (where) listings = listings.filter((l) => `${l.suburb || ""} ${l.state || ""} ${l.postcode || ""}`.toLowerCase().includes(where));
  // A "price on request" ($0) listing isn't excluded by a price filter —
  // its price is unknown, not free.
  if (Number.isFinite(minPrice)) listings = listings.filter((l) => !(l.price > 0) || l.price >= minPrice);
  if (Number.isFinite(maxPrice)) listings = listings.filter((l) => !(l.price > 0) || l.price <= maxPrice);
  return listings;
}
