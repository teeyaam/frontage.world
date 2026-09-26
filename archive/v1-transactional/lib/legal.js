// Shared legal-clause source for /terms, /terms/buyer, and /terms/seller
// (routes/pages.js) — previously TERMS_CLAUSES/termsSection lived inline in
// pages.js, and /terms (the general page) duplicated its own copy of every
// clause independently instead of drawing from them, so the three pages
// could silently drift out of sync. Extracted here as Phase 7 of the plan
// (C:\Users\teeya\.claude\plans\quizzical-marinating-wadler.md), and updated
// to reflect mechanics that now actually exist in the product rather than
// only ever being described in text: permits are a seller declaration, not
// something Frontage verifies (Phase 1); a campaign has a real chosen start
// date with lead time, not an install-triggered one (Phase 3); artwork goes
// through the owner's approval before print (Phase 4); and cancellation is
// tiered with a possible make-good, not a flat one-month fee that was never
// actually computed anywhere (Phase 5).
//
// These are still original drafts, not reviewed by a lawyer — see New Style
// Assets/legal/00-README.md for the specific business decisions (permit
// verification vs. declaration; payment-intermediary vs. merchant-of-record
// status) a solicitor needs to confirm before this is treated as final.

export function termsSection(id, heading, bodyHtml) {
  return `<h3 id="${id}" style="font-size:14px;margin-bottom:6px">${heading}</h3>
      <p class="small muted" style="margin-bottom:14px">${bodyHtml}</p>`;
}

export const TERMS_CLAUSES = {
  whatFrontageIs: `Frontage is a marketplace that connects owners of physical advertising space ("sellers"), advertisers who lease that space ("buyers"), and independent contractors who print, install, and remove advertising. Frontage facilitates introductions, contracts, and payments — it is not a party to the lease between buyer and seller, nor to the service agreement between a buyer and a contractor.`,
  accounts: `You must provide accurate account information and keep your login credentials secure. You are responsible for all activity under your account. Accounts may be suspended or closed for breach of these terms.`,
  gst: `All prices displayed on Frontage — listing rates, lease totals, and contractor estimates — are <strong>exclusive of GST</strong>. GST is calculated and added at checkout, and shown as a separate line on the tax invoice issued for every booking.`,
  campaignDates: `A booking has a chosen <strong>campaign start date</strong>, not an immediate one — every site needs lead time beforehand for artwork approval, printing, and installation, and the earliest date you can select already accounts for this. Your term runs from that start date, and a short removal window follows the end of the term before the site is available again.`,
  contentApproval: `Advertising content is reviewed by the space owner before anything is printed. Once you upload your artwork, the owner may approve it or decline it and ask for a revised version; a job cannot be scheduled for install until it's approved. This is in addition to, not instead of, your own responsibility for the lawfulness of your content under clause 7 (buyer terms) or the equivalent content-and-conduct clause, and Frontage's platform-wide <a href="/terms/non-discrimination" style="color:var(--orange)">Non-Discrimination Policy</a>.`,
  permits: `Where a listing states a planning or signage permit status, that status is the <strong>seller's own declaration</strong> — Frontage does not independently verify permits, council approvals, or compliance with local signage regulation. Sellers are solely responsible for ensuring their space may lawfully display advertising; buyers should satisfy themselves of this before booking, particularly for a long-term or high-value campaign. If a sign is ordered removed by a council or authority for lack of a valid permit, that is a matter between the seller and the relevant authority, and does not entitle either party to a refund from Frontage beyond what the cancellation clause otherwise provides.`,
  prohibited: `The following are breaches of these terms by any user: misrepresenting a listing, account, or credentials; displaying unlawful, misleading, offensive, or otherwise prohibited advertising content (see the <a href="/terms/non-discrimination" style="color:var(--orange)">Non-Discrimination Policy</a>); damaging, obscuring, or removing installed advertising before term end without agreement; circumventing Frontage to avoid platform fees on a connection made through the platform; and any fraudulent or unlawful use of the platform.`,
  breach: `Frontage may suspend or terminate accounts, remove listings, cancel job orders, and withhold pending payouts connected to a breach while it is investigated. <strong>A party who breaches these terms or a lease is responsible for the losses their breach causes to the other party.</strong> Frontage may recover from the breaching party any costs, fees, or losses Frontage itself incurs because of the breach.`,
  liability: `To the maximum extent permitted by law, Frontage is not liable for loss arising from the conduct of buyers, sellers, or contractors — including misrepresentation, breach of lease, defective installation, or property damage. Each user indemnifies Frontage against claims, losses, and costs arising from that user's own breach of these terms, their listings or advertising content, or their dealings with other users. Nothing in these terms excludes rights that cannot be excluded under applicable consumer law.`,
  changes: `Frontage may update these terms; material changes will be notified via the platform. Continued use after a change is acceptance of the updated terms.`,
  governingLaw: `These terms are governed by the laws of New South Wales, Australia.`,
};

// Buyer-facing cancellation clause — reflects the three tiers actually
// computed by lib/cancellation.js, replacing the flat "one month's rent"
// figure that clause used to quote without anything in the code ever
// enforcing it.
export const CANCELLATION_CLAUSE_BUYER = `Ending your lease early is charged in one of three tiers, based on how far your campaign has progressed when you cancel: <strong>no fee</strong> if your artwork hasn't yet been approved by the space owner (nothing has been produced); <strong>one month's rent</strong> if it has been approved but the campaign hasn't gone live; and <strong>the rent remaining on your term</strong> if the campaign is already live, since the owner has committed the space for that period. Frontage or the seller may instead offer a <strong>make-good</strong> — extending your flight or substituting an alternate site — in place of charging the fee, at the seller's discretion.`;
