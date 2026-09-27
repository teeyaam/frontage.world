// Countries: the 30 markets Frontage operates in (listings, browsing,
// address search), plus a few extra calling codes so people elsewhere can
// still sign up with their mobile.
//
// digits = expected national-number length range for the mobile field
// (loose on purpose — lengths vary by carrier; UI guidance, not a strict
// validator). currency = ISO 4217 code a listing in that country is priced
// in (always set automatically). units = default size units.

export const COUNTRIES = [
  // ---- Markets ----
  { iso: "AU", dial: "+61", name: "Australia", digits: [9, 9], currency: "AUD", units: "m", market: true },
  { iso: "AT", dial: "+43", name: "Austria", digits: [10, 13], currency: "EUR", units: "m", market: true },
  { iso: "BE", dial: "+32", name: "Belgium", digits: [8, 9], currency: "EUR", units: "m", market: true },
  { iso: "BR", dial: "+55", name: "Brazil", digits: [10, 11], currency: "BRL", units: "m", market: true },
  { iso: "CA", dial: "+1", name: "Canada", digits: [10, 10], currency: "CAD", units: "m", market: true },
  { iso: "DK", dial: "+45", name: "Denmark", digits: [8, 8], currency: "DKK", units: "m", market: true },
  { iso: "FI", dial: "+358", name: "Finland", digits: [9, 10], currency: "EUR", units: "m", market: true },
  { iso: "FR", dial: "+33", name: "France", digits: [9, 9], currency: "EUR", units: "m", market: true },
  { iso: "DE", dial: "+49", name: "Germany", digits: [10, 11], currency: "EUR", units: "m", market: true },
  { iso: "HK", dial: "+852", name: "Hong Kong", digits: [8, 8], currency: "HKD", units: "m", market: true },
  { iso: "IN", dial: "+91", name: "India", digits: [10, 10], currency: "INR", units: "m", market: true },
  { iso: "IE", dial: "+353", name: "Ireland", digits: [9, 9], currency: "EUR", units: "m", market: true },
  { iso: "IT", dial: "+39", name: "Italy", digits: [9, 10], currency: "EUR", units: "m", market: true },
  { iso: "JP", dial: "+81", name: "Japan", digits: [10, 10], currency: "JPY", units: "m", market: true },
  { iso: "MX", dial: "+52", name: "Mexico", digits: [10, 10], currency: "MXN", units: "m", market: true },
  { iso: "NL", dial: "+31", name: "Netherlands", digits: [9, 9], currency: "EUR", units: "m", market: true },
  { iso: "NZ", dial: "+64", name: "New Zealand", digits: [8, 9], currency: "NZD", units: "m", market: true },
  { iso: "NO", dial: "+47", name: "Norway", digits: [8, 8], currency: "NOK", units: "m", market: true },
  { iso: "PL", dial: "+48", name: "Poland", digits: [9, 9], currency: "PLN", units: "m", market: true },
  { iso: "PT", dial: "+351", name: "Portugal", digits: [9, 9], currency: "EUR", units: "m", market: true },
  { iso: "SG", dial: "+65", name: "Singapore", digits: [8, 8], currency: "SGD", units: "m", market: true },
  { iso: "ZA", dial: "+27", name: "South Africa", digits: [9, 9], currency: "ZAR", units: "m", market: true },
  { iso: "KR", dial: "+82", name: "South Korea", digits: [9, 10], currency: "KRW", units: "m", market: true },
  { iso: "ES", dial: "+34", name: "Spain", digits: [9, 9], currency: "EUR", units: "m", market: true },
  { iso: "SE", dial: "+46", name: "Sweden", digits: [7, 9], currency: "SEK", units: "m", market: true },
  { iso: "CH", dial: "+41", name: "Switzerland", digits: [9, 9], currency: "CHF", units: "m", market: true },
  { iso: "TW", dial: "+886", name: "Taiwan", digits: [9, 9], currency: "TWD", units: "m", market: true },
  { iso: "AE", dial: "+971", name: "United Arab Emirates", digits: [9, 9], currency: "AED", units: "m", market: true },
  { iso: "GB", dial: "+44", name: "United Kingdom", digits: [10, 10], currency: "GBP", units: "m", market: true },
  { iso: "US", dial: "+1", name: "United States", digits: [10, 10], currency: "USD", units: "ft", market: true },
  // ---- Calling codes only (not markets yet) ----
  { iso: "CN", dial: "+86", name: "China", digits: [11, 11] },
  { iso: "FJ", dial: "+679", name: "Fiji", digits: [7, 7] },
  { iso: "ID", dial: "+62", name: "Indonesia", digits: [9, 12] },
  { iso: "MY", dial: "+60", name: "Malaysia", digits: [9, 10] },
  { iso: "PH", dial: "+63", name: "Philippines", digits: [10, 10] },
  { iso: "TH", dial: "+66", name: "Thailand", digits: [9, 9] },
  { iso: "VN", dial: "+84", name: "Vietnam", digits: [9, 10] },
];

export const MARKETS = COUNTRIES.filter((c) => c.market);
export const DEFAULT_COUNTRY = "AU";

export function findCountry(iso) {
  return COUNTRIES.find((c) => c.iso === iso) || COUNTRIES[0];
}
export function isMarket(iso) {
  return MARKETS.some((c) => c.iso === iso);
}
export function marketOrDefault(iso) {
  return isMarket(iso) ? iso : DEFAULT_COUNTRY;
}
export function currencyFor(iso) {
  return (MARKETS.find((c) => c.iso === iso) || MARKETS[0]).currency;
}
export function countryName(iso) {
  const c = COUNTRIES.find((x) => x.iso === iso);
  return c ? c.name : iso || "";
}
export function defaultUnitsFor(iso) {
  return (MARKETS.find((c) => c.iso === iso) || MARKETS[0]).units;
}

// Best guess at a visitor's country from their browser's Accept-Language
// ("en-GB,en;q=0.9" → GB). Only markets count; otherwise null.
export function countryFromAcceptLanguage(header) {
  for (const part of String(header || "").split(",")) {
    const m = /^[a-z]{2,3}-([A-Z]{2})\b/i.exec(part.trim());
    if (m && isMarket(m[1].toUpperCase())) return m[1].toUpperCase();
  }
  return null;
}

// Country select + local number → "+61 412345678". A leading trunk "0"
// (how Australians usually write mobiles: 0412 345 678) is dropped.
// Returns { value } or { error }.
export function parseMobile(iso, number) {
  const country = COUNTRIES.find((c) => c.iso === iso);
  if (!country) return { error: "Choose your country code." };
  let digits = String(number || "").replace(/\D/g, "");
  if (!digits) return { error: "Enter your mobile number." };
  if (digits.length === country.digits[1] + 1 && digits.startsWith("0")) digits = digits.slice(1);
  const [min, max] = country.digits;
  if (digits.length < min || digits.length > max) {
    return { error: `That doesn't look like a valid mobile number for ${country.name} (${min === max ? min : `${min}–${max}`} digits after ${country.dial}).` };
  }
  return { value: `${country.dial} ${digits}` };
}

// "+61 412345678" → { iso: "AU", number: "412345678" }, to refill the form.
// "+1" is shared by the US and Canada; the account's country breaks the tie.
export function splitMobile(stored, preferIso) {
  const s = String(stored || "").trim();
  const m = /^(\+\d{1,4})\s*(\d+)$/.exec(s.replace(/[^\d+\s]/g, ""));
  if (!m) return { iso: preferIso || DEFAULT_COUNTRY, number: s.replace(/\D/g, "") };
  const matches = COUNTRIES.filter((c) => c.dial === m[1]);
  const country = matches.find((c) => c.iso === preferIso) || matches[0];
  return { iso: country ? country.iso : DEFAULT_COUNTRY, number: m[2] };
}
