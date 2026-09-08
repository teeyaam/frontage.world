// Tiered cancellation & make-good (New Style Assets/03-AD-SPACE-TRANSLATION.md
// §5 §5): a cancelled hotel night is just refunded; a cancelled campaign may
// already have printed artwork (a sunk cost) or be interrupted mid-flight.
// Three tiers, keyed off state this app already tracks (the content-approval
// workflow's artworkStatus from Phase 4, and the booking's own status):
//
//   pre_production               — artwork not yet approved, nothing's been
//                                   printed. No fee.
//   post_production_pre_install  — artwork approved (so printing/production
//                                   has likely started or is imminent) but
//                                   not yet installed. One month's rent —
//                                   the figure the Terms have always quoted.
//   during_flight                — the lease is already active (installed
//                                   and live). Charges the rent remaining on
//                                   the term, since the space owner has
//                                   already committed the space for that
//                                   period and can't easily re-let it
//                                   mid-flight.
//
// A make-good (extend the flight, or offer an alternate site) is recorded
// as an alternative resolution a human (seller/admin) agrees to after the
// fact — choosing one doesn't change the fee this module computes, but
// zeroes what's actually collected (see routes/api.js#endLeaseHandler).
// This module only computes the tier and the fee; it does not itself charge
// anything — see the module doc note in endLeaseHandler for why.

import { round2 } from "./format.js";

export const CANCELLATION_TIERS = ["pre_production", "post_production_pre_install", "during_flight"];
export const CANCELLATION_TIER_LABEL = {
  pre_production: "Before production — artwork not yet approved",
  post_production_pre_install: "After production, before install",
  during_flight: "During the live flight",
};

export const MAKE_GOOD_TYPES = ["none", "extend_flight", "alternate_site"];
export const MAKE_GOOD_TYPE_LABEL = {
  none: "No make-good — fee applies as calculated",
  extend_flight: "Extend the flight to cover the disruption",
  alternate_site: "Offer an alternate site for the remaining term",
};

export function determineCancellationTier({ jobOrder, booking }) {
  if (booking && booking.status === "active") return "during_flight";
  if (!jobOrder || jobOrder.artworkStatus !== "approved") return "pre_production";
  return "post_production_pre_install";
}

// Whole calendar months remaining on the term, based on campaign_end_date
// (Phase 3) if the booking has one, else falling back to the full term —
// a pre-Phase-3 booking has no campaign_end_date to measure against.
function remainingMonths(booking) {
  if (!booking.campaignEndDate) return booking.term;
  const end = new Date(booking.campaignEndDate);
  const now = new Date();
  const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
  return Math.max(0, months);
}

export function computeCancellationFee({ tier, booking }) {
  const monthlyRate = Number(booking.monthlyRate) || 0;
  if (tier === "pre_production") return 0;
  if (tier === "post_production_pre_install") return round2(monthlyRate);
  return round2(monthlyRate * remainingMonths(booking));
}
