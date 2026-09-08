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
// A generous ceiling for a single physical surface Frontage lists — well
// above even a large billboard face (~14m x 4m) or a building-wall wrap.
// Exists because nothing previously stopped an accidental typo (e.g. metres
// typed into the millimetres field) from producing an unrealistic size that
// then fed estimateJobFee's area-based install-cost estimate and produced
// an absurd number — a real one slipped through as 10m x 1200m.
export const LISTING_MAX_DIMENSION_MM = 20000;
