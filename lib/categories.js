// Single source of truth for listing categories — used by the browse filter
// chips, the sell/new category select, and server-side validation on listing
// creation so an unknown category can never sneak into the datastore.
export const CATEGORIES = ["gym", "cafe", "office", "studio", "retail", "residential", "other"];

export const CATEGORY_LABEL = {
  gym: "Gym",
  cafe: "Café",
  office: "Office",
  studio: "Studio",
  retail: "Retail",
  residential: "Residential",
  other: "Other",
};

export function isValidCategory(category) {
  return CATEGORIES.includes(category);
}

// Listing-form limits, shared between the client-side form (maxlength
// attributes, the min-photos check before submit) and the server-side
// validation that backs it up — see routes/pages.js#sellNewPage and
// routes/api.js#createListingHandler.
export const LISTING_TITLE_MAX_LENGTH = 70;
export const LISTING_DESC_MAX_LENGTH = 800;
export const LISTING_MIN_PHOTOS = 3;
