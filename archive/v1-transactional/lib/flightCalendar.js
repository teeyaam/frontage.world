// The 3-phase flight-calendar model (New Style Assets/03-AD-SPACE-TRANSLATION.md
// §5's "breaks" §1): a campaign booking isn't a single block like an Airbnb
// night — there's a lead/production phase before the artwork is actually up,
// the live/flight phase (the part that maps to a "stay"), and a removal
// phase after the term ends before the site is free for the next booking.
//
// v1 scope: this computes the three phase boundaries as plain dates so the
// checkout page can show them and the buyer can pick a real start date no
// earlier than the site can actually be ready. It does not yet block a
// double-booking against another campaign's dates on the same listing —
// that's a calendar-availability feature for a later pass, not something
// the single-booking-per-listing model needs yet (a listing flips to
// status='leased' on booking today, so there is no concurrent-campaign case
// to guard against).

// Baseline days needed for artwork approval + printing, before an installer
// can even be scheduled — applies to every site regardless of access.
const BASE_LEAD_DAYS = 5;

// Extra lead time added when the access type itself takes longer to
// schedule (booking a cherry-picker/EWP or scaffold crew has its own lead
// time, separate from the print/approval baseline).
const ACCESS_LEAD_EXTRA_DAYS = { ground_level: 0, ladder: 1, scaffold: 4, cherry_picker: 4 };

// Teardown buffer after the flight ends before the site is free again.
const REMOVAL_PHASE_DAYS = 2;

export function computeLeadTimeDays(listing) {
  const explicit = parseInt(listing && listing.leadTimeDays, 10);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const extra = ACCESS_LEAD_EXTRA_DAYS[listing && listing.accessType] || 0;
  return BASE_LEAD_DAYS + extra;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
export function addMonths(date, months) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}
function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

// The earliest date a campaign could actually go live on this listing,
// given today's date and the site's lead time — "available" on the listing
// isn't the same as "bookable from" (03-AD-SPACE-TRANSLATION.md §5 §1).
export function earliestStartDate(listing, from = new Date()) {
  return addDays(from, computeLeadTimeDays(listing));
}

// Full phase breakdown for a chosen start date + term, as ISO date strings —
// used both to validate a submitted start date server-side and to render
// the checkout page's phase summary.
export function campaignPhases({ listing, startDate, termMonths }) {
  const start = new Date(startDate);
  const lead = computeLeadTimeDays(listing);
  const productionStart = addDays(start, -lead);
  const liveEnd = addMonths(start, termMonths);
  const removalEnd = addDays(liveEnd, REMOVAL_PHASE_DAYS);
  return {
    productionStart: toISODate(productionStart),
    liveStart: toISODate(start),
    liveEnd: toISODate(liveEnd),
    removalEnd: toISODate(removalEnd),
    leadDays: lead,
    removalDays: REMOVAL_PHASE_DAYS,
  };
}

// Validates a buyer-submitted start date: must parse, and can't be earlier
// than the listing's own earliest-bookable date (server-side re-check of
// the same constraint the checkout's date input's min= expresses).
export function isValidStartDate(listing, startDateStr) {
  const parsed = new Date(startDateStr);
  if (Number.isNaN(parsed.getTime())) return false;
  const earliest = earliestStartDate(listing);
  // Compare by date only (both normalized to UTC midnight) so "today" isn't
  // rejected for being a few hours short of a full 24h period.
  return toISODate(parsed) >= toISODate(earliest);
}
