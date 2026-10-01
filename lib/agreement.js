// Advertising agreement template. A seller fills it from their listing in a
// conversation and shares it with that buyer; both print or save it as a
// PDF and sign it themselves. Frontage isn't a party to it and doesn't check
// it — the document says so at the top.
//
// OWNER REVIEW NEEDED: the clause wording in agreementHtml() is a plain-
// English starting point, not legal advice.

import { CATEGORY_LABEL } from "./categories.js";
import { sizeLabel, money, formatDate } from "./format.js";
import { countryName } from "./countries.js";

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const FEE_FREQUENCIES = { month: "per month", week: "per week", total: "for the whole term", once: "one-off" };
export const INSPECTIONS = { none: "No scheduled inspections", monthly: "Once a month", quarterly: "Once every 3 months", six_monthly: "Once every 6 months" };
export const PARTY = { advertiser: "The Advertiser", owner: "The Owner" };
// Agreements saved before insurance became free text stored one of these codes.
const LEGACY_INSURANCE = {
  advertiser: "The Advertiser holds public liability insurance that covers the Advertisement and its installation, and shows the Owner a certificate on request.",
  none: "",
};
export function insuranceText(value) {
  const v = String(value || "");
  return Object.prototype.hasOwnProperty.call(LEGACY_INSURANCE, v) ? LEGACY_INSURANCE[v] : v;
}

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};
const addMonths = (iso, n) => {
  const x = new Date(`${iso}T00:00:00`);
  x.setMonth(x.getMonth() + n);
  return x.toISOString().slice(0, 10);
};

// Starting values for a new agreement, from the listing and both members.
export function defaultTerms({ listing, seller, buyer }) {
  const start = addDays(new Date(), 14);
  const label = CATEGORY_LABEL[listing.category] || "Advertising space";
  return {
    ownerName: seller.businessName || seller.fullName || "",
    advertiserName: buyer.businessName || buyer.fullName || "",
    spaceDescription: `${listing.title} (${label.toLowerCase()})`,
    spaceAddress: listing.address || "",
    spaceSize: sizeLabel(listing, seller.units || "m"),
    fee: Number(listing.price) > 0 ? String(Number(listing.price)) : "",
    feeFrequency: "month",
    paymentTerms: "Paid in advance by bank transfer at the start of each period.",
    startDate: start,
    endDate: addMonths(start, 3),
    inspection: "quarterly",
    inspectionNoticeDays: "2",
    artworkBy: "advertiser",
    installBy: "advertiser",
    approvalsBy: "advertiser",
    insurance: "",
    removalDays: "14",
    noticeDays: "30",
    specialConditions: "",
  };
}

const clean = (v, max) => String(v == null ? "" : v).replace(/\r\n/g, "\n").trim().slice(0, max);
const pick = (v, options, fallback) => (Object.prototype.hasOwnProperty.call(options, v) ? v : fallback);
const days = (v, fallback, max = 365) => {
  const n = parseInt(String(v || "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n >= 0 && n <= max ? String(n) : fallback;
};
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !Number.isNaN(Date.parse(v)) ? v : "");

// Form body → { terms, errors }.
export function parseTerms(b) {
  const terms = {
    ownerName: clean(b.ownerName, 120),
    advertiserName: clean(b.advertiserName, 120),
    spaceDescription: clean(b.spaceDescription, 200),
    spaceAddress: clean(b.spaceAddress, 300),
    spaceSize: clean(b.spaceSize, 60),
    fee: clean(b.fee, 20).replace(/[^\d.]/g, ""),
    feeFrequency: pick(b.feeFrequency, FEE_FREQUENCIES, "month"),
    paymentTerms: clean(b.paymentTerms, 300),
    startDate: isoDate(b.startDate),
    endDate: isoDate(b.endDate),
    inspection: pick(b.inspection, INSPECTIONS, "quarterly"),
    inspectionNoticeDays: days(b.inspectionNoticeDays, "2", 30),
    artworkBy: pick(b.artworkBy, PARTY, "advertiser"),
    installBy: pick(b.installBy, PARTY, "advertiser"),
    approvalsBy: pick(b.approvalsBy, PARTY, "advertiser"),
    insurance: clean(b.insurance, 1000),
    removalDays: days(b.removalDays, "14", 90),
    noticeDays: days(b.noticeDays, "30", 365),
    specialConditions: clean(b.specialConditions, 2000),
  };
  const errors = {};
  if (!terms.ownerName) errors.ownerName = "Enter the owner's name.";
  if (!terms.advertiserName) errors.advertiserName = "Enter the advertiser's name.";
  if (!terms.spaceAddress) errors.spaceAddress = "Enter where the space is.";
  if (!(Number(terms.fee) > 0)) errors.fee = "Enter the fee.";
  if (!terms.startDate) errors.startDate = "Choose a start date.";
  if (!terms.endDate) errors.endDate = "Choose an end date.";
  else if (terms.startDate && terms.endDate < terms.startDate) errors.endDate = "The end date must be after the start date.";
  return { terms, errors };
}

// The agreement document, ready to print. `currency` and `countryCode`
// come from the listing, not the form.
export function agreementHtml(t, { currency, countryCode, updatedAt }) {
  const fee = `${money(Number(t.fee) || 0, currency)} ${esc(currency)} ${esc(FEE_FREQUENCIES[t.feeFrequency] || "")}`;
  const who = (k) => esc((PARTY[t[k]] || "The Advertiser"));
  const law = countryName(countryCode);
  const inspectionText =
    t.inspection === "none"
      ? `The Owner may inspect the Advertisement on reasonable notice if there's a concern about safety or damage.`
      : `The Owner may inspect the Space and the Advertisement ${esc((INSPECTIONS[t.inspection] || "").toLowerCase())}, after giving the Advertiser at least ${esc(t.inspectionNoticeDays)} day${t.inspectionNoticeDays === "1" ? "" : "s"}' notice, and at any time in an emergency.`;
  const section = (n, title, body) => `<section class="ag-section"><h2>${n}. ${title}</h2>${body}</section>`;
  return `
  <div class="agreement-doc">
    <p class="ag-disclaimer">This agreement was prepared with Frontage's template. Frontage isn't a party to it, hasn't checked it, and doesn't give legal advice. Read it carefully, change anything that doesn't suit you, and get advice if you're unsure — especially for longer or higher-value deals.</p>
    <h1>Advertising Space Agreement</h1>
    <p class="ag-meta">Version of ${esc(formatDate(updatedAt || new Date()))}</p>
    ${section(1, "The parties", `<p><strong>Owner:</strong> ${esc(t.ownerName)} (the person or business that controls the Space)<br/><strong>Advertiser:</strong> ${esc(t.advertiserName)}</p>`)}
    ${section(2, "The space", `<p>${t.spaceDescription ? `${esc(t.spaceDescription)}<br/>at ` : "At "}${esc(t.spaceAddress)}${t.spaceSize ? `<br/>Approximate size: ${esc(t.spaceSize)}` : ""}</p><p>The Owner confirms they have the right to let the Space be used for advertising.</p>`)}
    ${section(3, "Term", `<p>From <strong>${esc(formatDate(t.startDate))}</strong> to <strong>${esc(formatDate(t.endDate))}</strong>, unless ended earlier under clause 11.</p>`)}
    ${section(4, "Fee and payment", `<p>The Advertiser pays the Owner <strong>${fee}</strong>. ${esc(t.paymentTerms)}</p><p>Payment is made directly between the parties. Frontage doesn't collect or hold any money.</p>`)}
    ${section(5, "Artwork and installation", `<p>${who("artworkBy")} supplies the artwork. ${who("installBy")} installs the Advertisement, at their own cost, in a safe and workmanlike way. The Advertiser approves the final artwork before it's installed.</p>`)}
    ${section(6, "Content", `<p>The Advertiser is responsible for the Advertisement's content and makes sure it's lawful, not misleading, and doesn't infringe anyone's rights. The Owner may ask for content to be removed or changed if it's unlawful, offensive or breaches the rules in clause 8.</p>`)}
    ${section(7, "Access and inspections", `<p>${inspectionText} The Owner gives the Advertiser reasonable access to install, maintain and remove the Advertisement.</p>`)}
    ${section(8, "Permits and rules", `<p>${who("approvalsBy")} gets any council, planning, landlord, strata or other approvals the Advertisement needs before it goes up. Both parties follow any rules that apply to the Space.</p>`)}
    ${section(9, "Care of the space", `<p>The Advertiser keeps the Advertisement in good condition and repairs any damage to the Space caused by installing, maintaining or removing it. The Owner doesn't deliberately block the view of the Advertisement during the Term without good reason.</p>`)}
    ${section(10, "Insurance", insuranceText(t.insurance) ? `<p class="prewrap">${esc(insuranceText(t.insurance))}</p>` : `<p>The parties haven't agreed any insurance requirements. Each party is responsible for their own cover.</p>`)}
    ${section(11, "Ending early", `<p>Either party may end this agreement by giving the other at least <strong>${esc(t.noticeDays)} days'</strong> written notice. Either party may end it straight away by written notice if the other seriously breaches it and doesn't fix the breach within 7 days of being asked to. Any fee paid in advance for the period after the end date is refunded.</p>`)}
    ${section(12, "At the end", `<p>Within <strong>${esc(t.removalDays)} days</strong> after the agreement ends, ${who("installBy").replace("The ", "the ")} removes the Advertisement and leaves the Space as it was at the start (fair wear and tear excepted). If it isn't removed in time, the Owner may remove it and the Advertiser pays the reasonable cost.</p>`)}
    ${section(13, "Responsibility", `<p>Each party is responsible for their own acts and omissions under this agreement. Nothing in this agreement limits rights either party has under consumer law that can't be excluded.</p>`)}
    ${t.specialConditions ? section(14, "Special conditions", `<p class="prewrap">${esc(t.specialConditions)}</p>`) : ""}
    ${section(t.specialConditions ? 15 : 14, "General", `<p>This is the whole agreement between the parties about the Space. Changes must be agreed in writing (email or Frontage messages are fine). This agreement is governed by the law of the place where the Space is located, in ${esc(law)}.</p>`)}
    <div class="ag-signatures">
      ${["Owner", "Advertiser"]
        .map(
          (r) => `<div class="ag-sign"><strong>${r}</strong><div>Name: ${esc(r === "Owner" ? t.ownerName : t.advertiserName)}</div><div class="ag-line">Signature</div><div class="ag-line">Date</div></div>`
        )
        .join("")}
    </div>
  </div>`;
}
