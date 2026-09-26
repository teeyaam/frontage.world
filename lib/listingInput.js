// One validator for the listing form, shared by create and edit
// (routes/api.js). Returns { values, fieldErrors }. The caller only saves
// when fieldErrors is empty. Location is resolved here too (async), because
// "we couldn't find that address" is a field error like any other.

import {
  isValidCategory,
  LISTING_TITLE_MAX_LENGTH,
  LISTING_DESC_MAX_LENGTH,
  LISTING_PRICE_NOTE_MAX_LENGTH,
  LISTING_MAX_PRICE,
  LISTING_MAX_DIMENSION_M,
} from "./categories.js";
import { parseYouTubeId } from "./youtube.js";
import { geocodeAddress, geocodePlaceId } from "./geo.js";

const clean = (v, max = 10000) => String(v == null ? "" : v).replace(/\r\n/g, "\n").trim().slice(0, max);

export async function parseListingInput(body, { existing = null } = {}) {
  const b = body || {};
  const fieldErrors = {};
  const values = {};

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

  if (!isValidCategory(b.category)) fieldErrors.category = "Choose the type of space.";
  else values.category = b.category;

  values.description = clean(b.description, LISTING_DESC_MAX_LENGTH + 1);
  if (!values.description) fieldErrors.description = "Describe the space — where it is, who sees it, and anything a buyer should know.";
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
  const w = clean(b.widthM) === "" ? null : Number(clean(b.widthM));
  const h = clean(b.heightM) === "" ? null : Number(clean(b.heightM));
  if (w === null && h === null) {
    values.widthM = null;
    values.heightM = null;
  } else if (!(w > 0) || !(h > 0)) {
    fieldErrors.size = "Enter both width and height in metres, or leave both blank.";
  } else if (w > LISTING_MAX_DIMENSION_M || h > LISTING_MAX_DIMENSION_M) {
    fieldErrors.size = `Each side must be ${LISTING_MAX_DIMENSION_M}m or less — sizes are in metres, not millimetres.`;
  } else {
    values.widthM = Math.round(w * 100) / 100;
    values.heightM = Math.round(h * 100) / 100;
  }

  values.showExactLocation = b.showExactLocation === "1" || b.showExactLocation === "on";

  // ---- Location ----
  const address = clean(b.address, 300);
  const placeId = clean(b.placeId, 300) || null;
  if (!address) {
    fieldErrors.address = "Enter the address of the space. Unless you choose otherwise, buyers only see the suburb.";
  } else if (existing && address === existing.address && (placeId || null) === (existing.placeId || null)) {
    // Unchanged on edit — keep what was resolved last time.
    Object.assign(values, pickLocation(existing));
  } else {
    let loc = placeId ? await geocodePlaceId(placeId) : null;
    if (!loc) loc = clientLocation(b, address, placeId);
    if (!loc) loc = await geocodeAddress(address);
    if (!loc) fieldErrors.address = "We couldn't find that address. Pick it from the suggestions as you type, or check the spelling.";
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
    placeId,
  };
}
