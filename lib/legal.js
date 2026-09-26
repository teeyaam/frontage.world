// Terms, Privacy Policy and Safety content for the classifieds model.
//
// DRAFTS — have an Australian lawyer review these before ad spend scales.
// The operator's legal name and ABN come from LEGAL_ENTITY_NAME /
// LEGAL_ENTITY_ABN so they can be filled in without a code change.

import { escapeHtml } from "./layout.js";

export const LEGAL_UPDATED = "26 September 2026";

export function operatorName() {
  const name = process.env.LEGAL_ENTITY_NAME || "Frontage";
  const abn = process.env.LEGAL_ENTITY_ABN;
  return escapeHtml(abn ? `${name} (ABN ${abn})` : name);
}

export function contactEmail() {
  return escapeHtml(process.env.CONTACT_EMAIL || "frontage.world@gmail.com");
}

function section(num, title, html) {
  return `<section class="legal-section"><h2>${num}. ${title}</h2>${html}</section>`;
}

export function termsHtml() {
  const op = operatorName();
  const mail = contactEmail();
  return [
    section(1, "About Frontage", `<p>Frontage (the “site”) is operated by ${op} (“we”, “us”). It is an online classifieds marketplace where people advertise physical advertising space — walls, fences, windows, billboards, screens, vehicles and similar — and other people contact them about it.</p>
      <p><strong>Frontage only hosts listings and messages.</strong> We are not a party to any agreement between members, we don't act as anyone's agent, and we don't take, hold or process payments between members. Any deal you make is solely between you and the other member.</p>`),
    section(2, "Your account", `<p>You must be at least 18 and able to form a binding contract. Give accurate details, keep your password secure, and don't share your account. You're responsible for everything done through it. One account can both list space and contact sellers.</p>`),
    section(3, "Listing a space", `<p>When you list a space you confirm that:</p>
      <ul><li>you own it, or have the authority to offer it for advertising (for example the owner's, landlord's or strata's permission);</li>
      <li>your listing — photos, description, size, location and price — is accurate and not misleading;</li>
      <li>the photos and video are yours to use; and</li>
      <li>displaying advertising there doesn't breach any law, lease, strata by-law, planning rule or council requirement you're aware of.</li></ul>
      <p>Listings are free. We may edit how a listing is displayed (for example, cropping photos or showing only the suburb) and may remove any listing at our discretion.</p>`),
    section(4, "Deals between members", `<p>Price, term, installation, artwork, permits, insurance, removal and payment are all for you and the other member to agree. We recommend putting the agreement in writing. You're each responsible for your own tax (including GST) on any deal.</p>
      <p>Signage often needs council approval, and some locations have rules about content, size, lighting or placement. Both parties are responsible for checking and complying with them.</p>`),
    section(5, "Messaging", `<p>Messages are for genuine enquiries about listings. Don't send spam, bulk or unsolicited commercial messages, and don't harass anyone. We apply limits to prevent spam. We may review messages that are reported to us, or that our systems flag, to keep the site safe.</p>`),
    section(6, "Prohibited listings and content", `<p>You must not list or send anything that:</p>
      <ul><li>is unlawful, fraudulent, misleading or a scam, or asks for payment for space you don't control;</li>
      <li>infringes someone else's intellectual property or privacy;</li>
      <li>is discriminatory, hateful, sexually explicit, violent, or promotes illegal activity;</li>
      <li>advertises something other than advertising space (for example goods, jobs or property for sale); or</li>
      <li>contains malware, or tries to take conversations off-site in order to defraud.</li></ul>`),
    section(7, "Moderation", `<p>We may, without notice, remove or hide a listing or message, limit features, or suspend or close an account if we reasonably believe these terms have been breached, if there's a risk to other members, or if the law requires it. You can report a listing or conversation using the “Report” links.</p>`),
    section(8, "Liability", `<p>We provide the site “as is”. We don't verify listings, members, locations, traffic figures or permits, and we don't guarantee that a space is available, lawful to advertise on, or suitable for your purpose. To the extent permitted by law, we're not liable for any loss arising from dealings between members, and our total liability to you is limited to AUD $100.</p>
      <p>Nothing in these terms excludes rights you have under the Australian Consumer Law that can't be excluded.</p>`),
    section(9, "Your content", `<p>You keep ownership of what you post. You give us a worldwide, royalty-free licence to host, display, reproduce and promote it (including in our own marketing and social media) while it's on the site and for a reasonable time afterwards.</p>`),
    section(10, "Changes and termination", `<p>We may change these terms. If a change is significant we'll give notice on the site or by email, and continuing to use the site means you accept the change. You can close your account at any time by contacting us.</p>`),
    section(11, "Governing law", `<p>These terms are governed by the laws of New South Wales, Australia, and you submit to the non-exclusive jurisdiction of its courts.</p>`),
    section(12, "Contact", `<p>Questions about these terms: <a href="mailto:${mail}">${mail}</a>.</p>`),
  ].join("");
}

export function privacyHtml() {
  const op = operatorName();
  const mail = contactEmail();
  return [
    section(1, "Who we are", `<p>This policy explains how ${op} handles personal information on Frontage, in line with the <em>Privacy Act 1988</em> (Cth) and the Australian Privacy Principles.</p>`),
    section(2, "What we collect", `<ul>
      <li><strong>Account details:</strong> your name, email, password (stored only as a one-way hash), and optionally your mobile number, business name and Google Business link.</li>
      <li><strong>Listings:</strong> photos, descriptions, prices, the address and map location of the space, and any YouTube link you add.</li>
      <li><strong>Messages</strong> you send and receive on Frontage, and reports you make.</li>
      <li><strong>Technical information:</strong> IP address, browser type, pages viewed and similar logs. If you accept cookies, this also comes from Google Analytics and the Meta Pixel.</li></ul>`),
    section(3, "How we use it", `<p>We use your information to run the site: to show your listings, deliver messages and email notifications, keep accounts secure, prevent spam and fraud, moderate content, respond to you, and understand and improve how the site is used — including measuring our own advertising. We don't sell your personal information.</p>`),
    section(4, "What other members see", `<p>Your listings are public, along with your first name or business name as the seller. <strong>Unless you choose to show the exact location, the public only sees the suburb and an approximate map area.</strong> The member you're messaging sees your name and your messages. Your email and mobile number aren't shown to other members unless you share them in a message.</p>`),
    section(5, "Service providers and overseas storage", `<p>We use trusted providers to run Frontage, and your information may be stored or processed overseas, including in Singapore and the United States:</p>
      <ul><li>Render (hosting and database)</li><li>Cloudflare (photo storage and network security)</li><li>Resend (email delivery)</li><li>Google (maps, address search, and Google Analytics if you accept cookies)</li><li>Meta (the Meta Pixel, if you accept cookies)</li><li>YouTube (only when you choose to play a listing's video)</li></ul>
      <p>We take reasonable steps to make sure these providers protect your information.</p>`),
    section(6, "Cookies", `<p>We use a necessary cookie to keep you logged in. Analytics and advertising cookies (Google Analytics, the Meta Pixel) only load after you accept them in the cookie notice. You can change your mind by clearing this site's cookies.</p>`),
    section(7, "Keeping it secure", `<p>We use encryption in transit, hashed passwords and hashed session tokens, and limit who can access your information. No system is perfectly secure; if a data breach is likely to cause you serious harm, we'll tell you and the OAIC as the law requires.</p>`),
    section(8, "Access, correction and deletion", `<p>You can update most details from your Account page. To get a copy of your information, correct it, or close your account and delete it, email <a href="mailto:${mail}">${mail}</a>. We may keep some records where the law requires, or to deal with fraud or disputes.</p>`),
    section(9, "Complaints", `<p>If you have a privacy concern, contact us first at <a href="mailto:${mail}">${mail}</a> and we'll respond within 30 days. If you're not satisfied, you can complain to the Office of the Australian Information Commissioner (oaic.gov.au).</p>`),
  ].join("");
}

export const SAFETY_TIPS = [
  { title: "Frontage never handles payments", body: "Deals happen directly between you and the other member. Nobody from Frontage will ever ask you to pay through a link, and there's no “Frontage escrow” or “protected payment”." },
  { title: "See the space before you pay", body: "Visit it, or ask for a live video walk-through and recent photos. Check that the person you're dealing with actually controls it — the owner, or someone with the owner's written permission." },
  { title: "Keep the conversation on Frontage", body: "Until you're confident the deal is genuine, message through Frontage so there's a record — and so you can report it if something goes wrong." },
  { title: "Never pay with gift cards, crypto or wire transfers", body: "Be wary of anyone who pressures you, asks for a deposit to “hold” a space, or asks you to pay someone other than the owner." },
  { title: "Put it in writing", body: "Agree the price, term, dates, who prints and installs the ad, who removes it, and what happens if the space becomes unavailable." },
  { title: "Check permits and rules", body: "Many councils, landlords and strata schemes restrict signage. Confirm the space can legally carry your ad before you print anything." },
  { title: "Protect your personal details", body: "Don't share bank logins, ID documents or verification codes. Frontage will never ask for your password by email or message." },
];
