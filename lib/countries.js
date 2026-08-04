// Country calling codes for the mobile number field — dial code, display
// name, and the expected national-number digit range (min/max, loose on
// purpose since exact lengths vary by carrier/number type within a country;
// this is UI guidance, not a strict validator). Not exhaustive — the
// countries a small AU-based marketplace's users are actually likely to be
// in, with Australia first as the default.
export const COUNTRIES = [
  { iso: "AU", dial: "+61", name: "Australia", digits: [9, 9] },
  { iso: "NZ", dial: "+64", name: "New Zealand", digits: [8, 9] },
  { iso: "US", dial: "+1", name: "United States", digits: [10, 10] },
  { iso: "CA", dial: "+1", name: "Canada", digits: [10, 10] },
  { iso: "GB", dial: "+44", name: "United Kingdom", digits: [10, 10] },
  { iso: "IE", dial: "+353", name: "Ireland", digits: [9, 9] },
  { iso: "IN", dial: "+91", name: "India", digits: [10, 10] },
  { iso: "SG", dial: "+65", name: "Singapore", digits: [8, 8] },
  { iso: "MY", dial: "+60", name: "Malaysia", digits: [9, 10] },
  { iso: "ID", dial: "+62", name: "Indonesia", digits: [9, 12] },
  { iso: "PH", dial: "+63", name: "Philippines", digits: [10, 10] },
  { iso: "TH", dial: "+66", name: "Thailand", digits: [9, 9] },
  { iso: "VN", dial: "+84", name: "Vietnam", digits: [9, 10] },
  { iso: "CN", dial: "+86", name: "China", digits: [11, 11] },
  { iso: "HK", dial: "+852", name: "Hong Kong", digits: [8, 8] },
  { iso: "JP", dial: "+81", name: "Japan", digits: [10, 10] },
  { iso: "KR", dial: "+82", name: "South Korea", digits: [9, 10] },
  { iso: "AE", dial: "+971", name: "United Arab Emirates", digits: [9, 9] },
  { iso: "ZA", dial: "+27", name: "South Africa", digits: [9, 9] },
  { iso: "FR", dial: "+33", name: "France", digits: [9, 9] },
  { iso: "DE", dial: "+49", name: "Germany", digits: [10, 11] },
  { iso: "IT", dial: "+39", name: "Italy", digits: [9, 10] },
  { iso: "ES", dial: "+34", name: "Spain", digits: [9, 9] },
  { iso: "NL", dial: "+31", name: "Netherlands", digits: [9, 9] },
  { iso: "PT", dial: "+351", name: "Portugal", digits: [9, 9] },
  { iso: "SE", dial: "+46", name: "Sweden", digits: [7, 9] },
  { iso: "CH", dial: "+41", name: "Switzerland", digits: [9, 9] },
  { iso: "BR", dial: "+55", name: "Brazil", digits: [10, 11] },
  { iso: "MX", dial: "+52", name: "Mexico", digits: [10, 10] },
  { iso: "FJ", dial: "+679", name: "Fiji", digits: [7, 7] },
];

export function findCountry(iso) {
  return COUNTRIES.find((c) => c.iso === iso) || COUNTRIES[0];
}
