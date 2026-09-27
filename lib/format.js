// ---------- Money ----------
// A listing is priced in its own country's currency (set automatically).
// When the viewer is in that same currency the short local symbol is shown
// ("$250" to an Australian looking at an Australian listing); otherwise a
// symbol that can't be mistaken ("A$250", "US$250", "€250").
const SYMBOL_INTL = {
  AUD: "A$", NZD: "NZ$", USD: "US$", CAD: "C$", SGD: "S$", HKD: "HK$", TWD: "NT$", MXN: "MX$", BRL: "R$",
  GBP: "£", EUR: "€", JPY: "¥", KRW: "₩", INR: "₹", CHF: "CHF ", SEK: "SEK ", NOK: "NOK ", DKK: "DKK ",
  PLN: "PLN ", AED: "AED ", ZAR: "R ",
};
const SYMBOL_LOCAL = {
  ...SYMBOL_INTL,
  AUD: "$", NZD: "$", USD: "$", CAD: "$", SGD: "$", HKD: "$", MXN: "$",
  SEK: "kr ", NOK: "kr ", DKK: "kr ", PLN: "zł ", CHF: "CHF ",
};
const ZERO_DECIMAL = new Set(["JPY", "KRW", "TWD"]);

export function money(amount, currency = "AUD", { viewerCurrency } = {}) {
  const num = Number(amount) || 0;
  const cur = currency || "AUD";
  const symbols = !viewerCurrency || viewerCurrency === cur ? SYMBOL_LOCAL : SYMBOL_INTL;
  const hasCents = !ZERO_DECIMAL.has(cur) && Math.round(num * 100) % 100 !== 0;
  const digits = num.toLocaleString("en-AU", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: hasCents ? 2 : 0 });
  return `${symbols[cur] || `${cur} `}${digits}`;
}

// Listing price as shown everywhere: "$250 · per month, negotiable", or
// "Price on request" for a 0 price. `viewerCurrency` decides whether the
// short or the unmistakable symbol is used.
export function priceLabel(listing, { withNote = true, viewerCurrency } = {}) {
  const base = Number(listing.price) > 0 ? money(listing.price, listing.currency || "AUD", { viewerCurrency }) : "Price on request";
  return withNote && listing.priceNote ? `${base} · ${listing.priceNote}` : base;
}

// ---------- Sizes ----------
// Stored in metres; shown in the viewer's units.
export const FEET_PER_METRE = 3.28084;
export function sizeLabel(listing, units = "m") {
  const w = Number(listing.widthM);
  const h = Number(listing.heightM);
  if (!(w > 0) || !(h > 0)) return "";
  if (units === "ft") {
    const f = (m) => `${parseFloat((m * FEET_PER_METRE).toFixed(1))} ft`;
    return `${f(w)} × ${f(h)}`;
  }
  const fmt = (m) => `${parseFloat(m.toFixed(2))}m`;
  return `${fmt(w)} × ${fmt(h)}`;
}
// A size in metres as the number to pre-fill a form field in `units`.
export function sizeForInput(metres, units = "m") {
  if (!(Number(metres) > 0)) return "";
  return String(units === "ft" ? parseFloat((metres * FEET_PER_METRE).toFixed(1)) : parseFloat(Number(metres).toFixed(2)));
}

// ---------- Dates ----------
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

export function listedAgo(iso) {
  return `Listed ${timeAgo(iso)}`;
}

// Whole days from now until `iso` (negative once it has passed).
export function daysUntil(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}
