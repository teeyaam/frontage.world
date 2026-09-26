// Shared query-param filtering for listings — used by the browse page
// (routes/pages.js#browsePage) and the map data endpoint
// (routes/api.js#listingsMapJson) so a category/search/price filter narrows
// the map pins the same way it narrows the list/grid, instead of the map
// silently showing every listing regardless of the active filters.
export function filterListings(allListings, query) {
  const cat = query.get("category");
  const q = (query.get("q") || "").toLowerCase();
  const countryFilter = (query.get("country") || "").toLowerCase();
  const cityFilter = (query.get("city") || "").toLowerCase();
  const clampNonNegative = (n) => (Number.isFinite(n) && n >= 0 ? n : NaN);
  const minPrice = clampNonNegative(parseFloat(query.get("minPrice")));
  const maxPrice = clampNonNegative(parseFloat(query.get("maxPrice")));
  const minArea = clampNonNegative(parseFloat(query.get("minArea")));
  const minEyes = clampNonNegative(parseInt(query.get("minEyes"), 10));

  let listings = allListings;
  if (cat && cat !== "all") listings = listings.filter((l) => l.category === cat);
  if (q) listings = listings.filter((l) => `${l.title} ${l.venue} ${l.suburb} ${l.postcode || ""} ${l.country || ""}`.toLowerCase().includes(q));
  if (countryFilter) listings = listings.filter((l) => (l.country || "").toLowerCase().includes(countryFilter));
  if (cityFilter) listings = listings.filter((l) => (l.suburb || "").toLowerCase().includes(cityFilter));
  if (Number.isFinite(minPrice)) listings = listings.filter((l) => l.price >= minPrice);
  if (Number.isFinite(maxPrice)) listings = listings.filter((l) => l.price <= maxPrice);
  if (Number.isFinite(minArea)) listings = listings.filter((l) => (l.sizeW * l.sizeH) / 1e6 >= minArea);
  if (Number.isFinite(minEyes)) listings = listings.filter((l) => (l.estimatedEyesPerDay || 0) >= minEyes);
  return listings;
}
