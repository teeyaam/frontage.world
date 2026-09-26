// Site-specification enums for a listing — the OOH-specific fields an
// advertiser actually needs that Airbnb has no analogue for (audience,
// visibility, surface/mounting, illumination, access, legal/permit status).
// See New Style Assets/03-AD-SPACE-TRANSLATION.md §3. Same pattern as
// lib/categories.js: single source of truth for the wizard's <select>s,
// server-side validation, and display labels.

export const AUDIENCE_TYPES = ["pedestrian", "vehicle", "mixed"];
export const AUDIENCE_TYPE_LABEL = {
  pedestrian: "Pedestrian foot traffic",
  vehicle: "Vehicle traffic",
  mixed: "Mixed pedestrian & vehicle",
};

export const SURFACE_TYPES = ["brick", "render", "timber", "corrugated", "glass", "mesh", "existing_frame", "digital_panel", "other"];
export const SURFACE_TYPE_LABEL = {
  brick: "Brick",
  render: "Render",
  timber: "Timber",
  corrugated: "Corrugated metal",
  glass: "Glass",
  mesh: "Mesh / shade cloth",
  existing_frame: "Existing sign frame",
  digital_panel: "Digital panel",
  other: "Other",
};

// "none" is a real, common state (most spaces aren't lit) — not the same as
// "unknown", so it's a first-class option rather than a blank default.
export const ILLUMINATION_OPTIONS = ["none", "ambient", "floodlit", "backlit", "digital"];
export const ILLUMINATION_LABEL = {
  none: "Not illuminated",
  ambient: "Ambient light only",
  floodlit: "Floodlit",
  backlit: "Backlit",
  digital: "Digital / self-lit",
};

export const ACCESS_TYPES = ["ground_level", "ladder", "scaffold", "cherry_picker"];
export const ACCESS_TYPE_LABEL = {
  ground_level: "Ground level — no special access",
  ladder: "Ladder access",
  scaffold: "Scaffold required",
  cherry_picker: "Cherry-picker / EWP required",
};

// Declaration-based, not verified by Frontage — matches how the permit
// field is framed on the listing form and in the Terms (see Phase 7).
export const PERMIT_STATUSES = ["approved", "pending", "not_required", "unknown"];
export const PERMIT_STATUS_LABEL = {
  approved: "Approved — I hold a current permit",
  pending: "Application submitted, awaiting approval",
  not_required: "No permit required for this location",
  unknown: "Not sure / haven't checked",
};

export function isValidEnum(list, value) {
  return list.includes(value);
}

// Pulls the optional site-specification fields out of a form body, validating
// each enum and dropping anything invalid/absent rather than erroring — every
// one of these fields is optional until the Phase 2 wizard actually collects
// them, so a request with none of them (today's single-page form) still
// creates/updates a listing exactly as before. Shared by createListingHandler
// and updateListingHandler (routes/api.js) so the two flows can't drift.
export function parseListingSpecFields(b) {
  const fields = {};
  if (isValidEnum(AUDIENCE_TYPES, b.audienceType)) fields.audienceType = b.audienceType;
  const traffic = parseInt(b.dailyTrafficCount, 10);
  if (Number.isFinite(traffic) && traffic >= 0) fields.dailyTrafficCount = traffic;
  if (isValidEnum(SURFACE_TYPES, b.surfaceType)) fields.surfaceType = b.surfaceType;
  if (isValidEnum(ILLUMINATION_OPTIONS, b.illumination)) fields.illumination = b.illumination;
  if (isValidEnum(ACCESS_TYPES, b.accessType)) fields.accessType = b.accessType;
  if (b.accessNotes) fields.accessNotes = String(b.accessNotes).slice(0, 500);
  if (isValidEnum(PERMIT_STATUSES, b.permitStatus)) fields.permitStatus = b.permitStatus;
  if (b.permitReference) fields.permitReference = String(b.permitReference).slice(0, 200);
  if (b.permitExpiry) fields.permitExpiry = b.permitExpiry;
  const leadTime = parseInt(b.leadTimeDays, 10);
  if (Number.isFinite(leadTime) && leadTime >= 0) fields.leadTimeDays = leadTime;
  return fields;
}
