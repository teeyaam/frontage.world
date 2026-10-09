// Single source of truth for listing categories — since October 2026
// Frontage lists vehicles only. Used by the browse chips, the listing form,
// and server-side validation so an unknown category never reaches the
// database.
export const CATEGORIES = ["car", "ute", "van", "truck", "semi_trailer", "caravan", "trailer", "other_vehicle"];

export const CATEGORY_LABEL = {
  car: "Car (sedan, hatch or SUV)",
  ute: "Ute or pickup",
  van: "Van",
  truck: "Truck",
  semi_trailer: "Semi-trailer",
  caravan: "Caravan or campervan",
  trailer: "Trailer",
  other_vehicle: "Other vehicle",
  // Earlier space types — no longer listable, kept so old records display.
  wall: "Wall",
  fence: "Fence",
  window: "Window",
  billboard: "Billboard",
  digital_screen: "Digital screen",
  vehicle: "Vehicle",
  indoor: "Indoor space",
  other: "Other",
};

// Short plural labels for the browse chips.
export const CATEGORY_CHIP = {
  car: "Cars",
  ute: "Utes",
  van: "Vans",
  truck: "Trucks",
  semi_trailer: "Semi-trailers",
  caravan: "Caravans",
  trailer: "Trailers",
  other_vehicle: "Other",
};

export function isValidCategory(category) {
  return CATEGORIES.includes(category);
}

// Where on the vehicle an ad can go.
export const PANELS = {
  doors: "Doors",
  boot: "Boot, tailgate or rear doors",
  sides: "Side panels or box sides",
  rear_window: "Rear window",
  curtains: "Curtain sides",
  full_wrap: "Full wrap",
  magnets: "Magnetic signs (removable)",
};

// Passenger cars can't have the rear window covered: glazing behind the
// driver must still let at least 35% of light through (national vehicle
// standards, rule 44). Goods vehicles, buses and trailers have no minimum
// behind the driver (TfNSW VSI.03).
export const NO_REAR_WINDOW = new Set(["car"]);

// What every vehicle owner confirms before listing.
export const VEHICLE_CONFIRMATIONS = {
  confirmRideshare: "It isn't used for rideshare (Uber and others don't allow advertising on rideshare cars).",
  confirmInsurer: "I'll tell my insurer about any advertising before it goes on.",
  confirmOwner: "I own the vehicle, or I have the lender's or owner's permission to put advertising on it.",
  confirmDriven: "It's driven regularly — it won't be parked just to show an ad.",
};

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
