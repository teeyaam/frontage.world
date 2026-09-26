// Single source of truth for listing categories (the type of space) — used by
// the browse chips, the listing form, and server-side validation so an
// unknown category can never reach the database.
export const CATEGORIES = ["wall", "fence", "window", "billboard", "digital_screen", "vehicle", "indoor", "other"];

export const CATEGORY_LABEL = {
  wall: "Wall",
  fence: "Fence",
  window: "Window",
  billboard: "Billboard",
  digital_screen: "Digital screen",
  vehicle: "Vehicle",
  indoor: "Indoor space",
  other: "Other",
};

export function isValidCategory(category) {
  return CATEGORIES.includes(category);
}

// Listing-form limits, shared between the form (maxlength attributes, the
// photo count check) and the server-side validation in lib/listingInput.js.
export const LISTING_TITLE_MAX_LENGTH = 80;
export const LISTING_DESC_MAX_LENGTH = 3000;
export const LISTING_PRICE_NOTE_MAX_LENGTH = 60;
export const LISTING_MIN_PHOTOS = 1;
export const LISTING_MAX_PHOTOS = 10;
export const LISTING_MAX_PRICE = 10_000_000;
// A generous ceiling for one physical surface — well above a large
// billboard face (~14m x 4m) or a building wrap. Catches typos like
// millimetres entered as metres.
export const LISTING_MAX_DIMENSION_M = 100;
