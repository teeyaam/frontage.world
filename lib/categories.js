// Single source of truth for listing categories — used by the browse filter
// chips, the sell/new category select, and server-side validation on listing
// creation so an unknown category can never sneak into the datastore.
export const CATEGORIES = ["gym", "cafe", "office", "studio", "retail", "residential"];

export const CATEGORY_LABEL = {
  gym: "Gym",
  cafe: "Café",
  office: "Office",
  studio: "Studio",
  retail: "Retail",
  residential: "Residential",
};

export function isValidCategory(category) {
  return CATEGORIES.includes(category);
}
