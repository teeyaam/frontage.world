// One validator for the listing form, shared by create and edit
// (routes/api.js). Returns { values, fieldErrors }. The caller only saves
// when fieldErrors is empty. Location is resolved here too (async), because
// "we couldn't find that address" is a field error like any other.

import {
  isValidCategory,
  PANELS,
  NO_REAR_WINDOW,
  VEHICLE_CONFIRMATIONS,
  LISTING_TITLE_MAX_LENGTH,
  LISTING_DESC_MAX_LENGTH,
  LISTING_PRICE_NOTE_MAX_LENGTH,
  LISTING_MAX_PRICE,
  LISTING_MAX_DIMENSION_M,
} from "./categories.js";
import { parseYouTubeId } from "./youtube.js";
import { geocodeAddress, geocodePlaceId } from "./geo.js";
import { isMarket, currencyFor, countryName } from "./countries.js";
import { FEET_PER_METRE } from "./format.js";

const clean = (v, max = 10000) => String(v == null ? "" : v).replace(/\r\n/g, "\n").trim().slice(0, max);

export async function parseListingInput(body, { existing = null, defaultCountry = "AU" } = {}) {
  const b = body || {};
  const fieldErrors = {};
  const values = {};

  // Country decides currency (always automatic — sellers can't pick one
  // that doesn't match) and which country the address must be in.
  const country = clean(b.countryCode, 2).toUpperCase() || (existing && existing.countryCode) || defaultCountry;
  if (!isMarket(country)) fieldErrors.countryCode = "Frontage isn't available in that country yet.";
  values.countryCode = country;
  values.currency = currencyFor(country);

  values.title = clean(b.title, LISTING_TITLE_MAX_LENGTH + 1);
  if (!values.title) fieldErrors.title = "Give your listing a title.";
  else if (values.title.length > LISTING_TITLE_MAX_LENGTH) fieldErrors.title = `Keep the title to ${LISTING_TITLE_MAX_LENGTH} characters or fewer.`;

  const priceRaw = clean(b.price).replace(/[$,\s]/g, "");
  const price = priceRaw === "" ? 0 : Number(priceRaw);
  if (!Number.isFinite(price) || price < 0) fieldErrors.price = "Enter a price in dollars, or 0 for “price on request”.";
  else if (price > LISTING_MAX_PRICE) fieldErrors.price = "That price looks too high — check for extra zeros.";
  else values.price = Math.round(price * 100) / 100;

  values.priceNote = clean(b.priceNote, LISTING_PRICE_NOTE_MAX_LENGTH + 1) || null;
  if (values.priceNote && values.priceNote.length > LISTING_PRICE_NOTE_MAX_LENGTH) {
    fieldErrors.priceNote = `Keep price details to ${LISTING_PRICE_NOTE_MAX_LENGTH} characters or fewer.`;
  }

  if (!isValidCategory(b.category)) fieldErrors.category = "Choose the type of vehicle.";
  else values.category = b.category;

  // ---- The vehicle ----
  const panelsRaw = Array.isArray(b.panels) ? b.panels : b.panels ? [b.panels] : [];
  const panels = [...new Set(panelsRaw.map(String))].filter((p) => Object.prototype.hasOwnProperty.call(PANELS, p));
  if (!panels.length) fieldErrors.panels = "Choose where the ad can go.";
  else if (panels.includes("rear_window") && NO_REAR_WINDOW.has(values.category)) {
    fieldErrors.panels = "Passenger cars can't have the rear window covered — windows behind the driver must still let light through. Offer the doors, boot or magnetic signs instead.";
  } else values.vehiclePanels = panels.join(",");

  values.vehicleArea = clean(b.vehicleArea, 200);
  if (!values.vehicleArea) fieldErrors.vehicleArea = "Say where the vehicle is usually driven — suburbs, routes or cities.";

  const kmRaw = clean(b.vehicleKmWeek).replace(/[,\s]/g, "");
  if (kmRaw === "") values.vehicleKmWeek = null;
  else if (!/^\d{1,5}$/.test(kmRaw) || Number(kmRaw) > 20000) fieldErrors.vehicleKmWeek = "Enter a rough number of kilometres a week, or leave it blank.";
  else values.vehicleKmWeek = Number(kmRaw);

  const missing = Object.keys(VEHICLE_CONFIRMATIONS).filter((k) => !(b[k] === "1" || b[k] === "on"));
  if (missing.length) fieldErrors.confirm = "Please confirm all four statements about the vehicle.";
  else values.vehicleConfirmedAt = (existing && existing.vehicleConfirmedAt) || new Date().toISOString();

  values.description = clean(b.description, LISTING_DESC_MAX_LENGTH + 1);
  if (!values.description) fieldErrors.description = "Describe the vehicle — what it is, where and when it's driven, and anything an advertiser should know.";
  else if (values.description.length > LISTING_DESC_MAX_LENGTH) fieldErrors.description = `Keep the description to ${LISTING_DESC_MAX_LENGTH} characters or fewer.`;

  const ytRaw = clean(b.youtubeUrl, 500);
  if (ytRaw) {
    const id = parseYouTubeId(ytRaw);
    if (!id) fieldErrors.youtubeUrl = "That doesn't look like a YouTube link — paste the link from the video's Share button.";
    else values.youtubeId = id;
  } else {
    values.youtubeId = null;
  }

  // Size is optional, but if one dimension is given both are needed.
  // Typed in the seller's units (sizeUnit = m | ft), stored in metres.
  const perUnit = b.sizeUnit === "ft" ? 1 / FEET_PER_METRE : 1;
  const w = clean(b.widthM) === "" ? null : Number(clean(b.widthM)) * perUnit;
  const h = clean(b.heightM) === "" ? null : Number(clean(b.heightM)) * perUnit;
  if (w === null && h === null) {
    values.widthM = null;
    values.heightM = null;
  } else if (!(w > 0) || !(h > 0)) {
    fieldErrors.size = "Enter both width and height in metres, or leave both blank.";
  } else if (w > LISTING_MAX_DIMENSION_M || h > LISTING_MAX_DIMENSION_M) {
    fieldErrors.size = b.sizeUnit === "ft" ? `Each side must be ${Math.round(LISTING_MAX_DIMENSION_M * FEET_PER_METRE)} ft or less.` : `Each side must be ${LISTING_MAX_DIMENSION_M}m or less — sizes are in metres, not millimetres.`;
  } else {
    values.widthM = Math.round(w * 100) / 100;
    values.heightM = Math.round(h * 100) / 100;
  }

  // A vehicle's base is usually the owner's home, so only the suburb and an
  // approximate area are ever shown.
  values.showExactLocation = false;

  // ---- Location ----
  const address = clean(b.address, 300);
  const placeId = clean(b.placeId, 300) || null;
  if (!address) {
    fieldErrors.address = "Enter where the vehicle is based. Advertisers only see the suburb, never the address.";
  } else if (existing && address === existing.address && (placeId || null) === (existing.placeId || null) && country === existing.countryCode) {
    // Unchanged on edit — keep what was resolved last time.
    Object.assign(values, pickLocation(existing));
  } else {
    let loc = placeId ? await geocodePlaceId(placeId) : null;
    if (!loc) loc = clientLocation(b, address, placeId);
    if (!loc) loc = await geocodeAddress(address, country);
    if (!loc) fieldErrors.address = `We couldn't find that address in ${countryName(country)}. Pick it from the suggestions as you type, or check the spelling and country.`;
    else if (loc.countryCode && loc.countryCode !== country) fieldErrors.address = `That address is in ${countryName(loc.countryCode)}, not ${countryName(country)}. Change the country above or pick another address.`;
    else Object.assign(values, { ...pickLocation(loc), address: loc.formattedAddress || address });
  }

  return { values, fieldErrors };
}

function pickLocation(l) {
  return {
    address: l.address || l.formattedAddress,
    suburb: l.suburb || null,
    state: l.state || null,
    postcode: l.postcode || null,
    country: l.country || null,
    placeId: l.placeId || null,
    lat: l.lat,
    lng: l.lng,
  };
}

// When the browser picked a place from Google's autocomplete but the server
// has no geocoding key of its own, the coordinates and parts it posted are
// the best information available.
function clientLocation(b, address, placeId) {
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!placeId || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    lat,
    lng,
    formattedAddress: address,
    suburb: clean(b.suburb, 100) || null,
    state: clean(b.state, 50) || null,
    postcode: clean(b.postcode, 20) || null,
    country: clean(b.country, 100) || null,
    countryCode: clean(b.countryIso, 2).toUpperCase() || null,
    placeId,
  };
}
