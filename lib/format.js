// Whole dollars unless there are cents ("$250", "$99.50").
export function money(n) {
  const num = Number(n) || 0;
  const hasCents = Math.round(num * 100) % 100 !== 0;
  return `$${num.toLocaleString("en-AU", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

// Listing price as shown everywhere: "$250 · per month, negotiable", or
// "Price on request" for a $0 listing.
export function priceLabel(listing, { withNote = true } = {}) {
  const base = Number(listing.price) > 0 ? money(listing.price) : "Price on request";
  return withNote && listing.priceNote ? `${base} · ${listing.priceNote}` : base;
}

// "2.4m × 1.2m", or "" when the seller didn't give a size.
export function sizeLabel(listing) {
  const w = Number(listing.widthM);
  const h = Number(listing.heightM);
  if (!(w > 0) || !(h > 0)) return "";
  const fmt = (m) => `${parseFloat(m.toFixed(2))}m`;
  return `${fmt(w)} × ${fmt(h)}`;
}

export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

// "just now", "5 min ago", "3 hours ago", "2 days ago", then a date.
export function timeAgo(iso) {
  if (!iso) return "";
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(iso);
}

// "Listed 3 days ago" style, for the listing page.
export function listedAgo(iso) {
  return `Listed ${timeAgo(iso)}`;
}
