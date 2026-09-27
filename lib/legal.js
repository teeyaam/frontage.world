// Terms of Use, Privacy Policy and Safety content for the classifieds model.
//
// Approved by the owner on 27 September 2026 (draft 1). Structure modelled
// on the big marketplaces' published terms; wording is original. Still
// worth an Australian lawyer's review before ad spend scales.
//
// The operator's legal name and ABN come from LEGAL_ENTITY_NAME /
// LEGAL_ENTITY_ABN so they can be filled in without a code change.

import { escapeHtml } from "./layout.js";

export const LEGAL_UPDATED = "27 September 2026";

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
const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

export function termsHtml() {
  const op = operatorName();
  const mail = contactEmail();
  return [
    section(1, "Welcome to Frontage", `<p>These Terms of Use (“Terms”) are an agreement between you and ${op} (“Frontage”, “we”, “us”). They apply whenever you use frontage.world or any related service (the “Platform”). By creating an account or using the Platform you agree to these Terms and our <a href="/privacy" class="link">Privacy Policy</a>. If you don't agree, please don't use the Platform.</p>`),
    section(2, "What Frontage is — and isn't", ul([
      "Frontage is an online venue where people advertise physical advertising space — walls, fences, windows, billboards, screens, vehicles and similar (“Space”) — and other people contact them about it.",
      "We don't own, control, offer, inspect or manage any Space. We are not a party to any agreement between members, and we are not a real estate agent, broker, advertising agency, insurer or payment provider. We don't act as anyone's agent.",
      "We don't take, hold or process payments between members. Any deal is solely between the members involved.",
      "We don't verify members, listings, locations, traffic or audience figures, permits, or anything else members say, even where the Platform displays that information.",
    ])),
    section(3, "Your account", ul([
      "You must be at least 18 and able to enter a binding contract. If you use Frontage for a business, you confirm you're authorised to act for it.",
      "Give accurate, current information — including a mobile number you control — and keep it up to date.",
      "Keep your login secure. You're responsible for everything done through your account, and you must tell us promptly if you think it's been misused.",
      "Don't create an account for someone else without their authority, or a new account after we've suspended you.",
      "We may ask you to verify your identity or contact details and limit your access until you do.",
    ])),
    section(4, "Listings", `<p>When you list a Space, you confirm that:</p>${ul([
      "you own it, or you're authorised (for example by the owner, landlord, strata or body corporate) to offer it for advertising;",
      "the listing — photos, video, description, size, location and price — is accurate and not misleading, and you'll update it or remove it when it changes or is no longer available;",
      "you have the rights to everything you upload; and",
      "as far as you know, displaying advertising in the Space wouldn't breach any law, council or planning requirement, lease, strata by-law or other agreement.",
    ])}<p>We decide how listings are displayed, ordered and found, and we may show only an approximate location. Listing is currently free. If we introduce paid features, we'll tell you the price before you're charged.</p>`),
    section(5, "Dealing with other members", ul([
      "You alone decide whether to deal with another member, and you're responsible for the terms of any deal — price, dates, artwork, printing, installation, removal, insurance, permits, access and payment.",
      `We recommend you inspect the Space, confirm who controls it, and put the agreement in writing. See our <a href="/safety" class="link">Safety tips</a>.`,
      "You're responsible for your own taxes (including GST) and any licences or approvals your deal needs.",
      "Any dispute about a deal is between you and the other member. We may help, but we don't have to.",
    ])),
    section(6, "Messages and contacting you", ul([
      "Use messaging only for genuine enquiries about listings. We apply limits to prevent spam.",
      "We may review, filter or remove messages to run the Platform, prevent fraud and enforce these Terms.",
      "You agree we may contact you by email, SMS or phone about your account, your listings and your messages. You can turn off optional notifications in your account settings.",
    ])),
    section(7, "What you must not do", `<p>You must not use the Platform to:</p>${ul([
      "post anything unlawful, false, misleading, fraudulent or infringing, or offer Space you don't control;",
      "advertise anything other than advertising space (such as goods, jobs or property for sale), or post duplicate or spam listings;",
      "harass, threaten, abuse or discriminate against anyone, or post hateful, sexually explicit or violent content;",
      "ask for or take payment “through Frontage” (we never take payments), or impersonate Frontage or anyone else;",
      "collect other members' information, send unsolicited marketing, or use contact details for anything other than the deal they were shared for;",
      "scrape, copy, frame or data-mine the Platform, use bots, or interfere with its security or operation; or",
      "get around our moderation, limits or a suspension.",
    ])}`),
    section(8, "Content and intellectual property", ul([
      "You keep ownership of what you post. You give us a worldwide, non-exclusive, royalty-free, transferable and sublicensable licence to host, store, copy, adapt (for example resize or crop), publish and display it — including to promote Frontage — while it's on the Platform and for a reasonable time afterwards.",
      "We own the Platform, its design, software and brand. You may use them only as these Terms allow.",
      "Third-party features on the Platform, such as maps and embedded video, are subject to their providers' own terms.",
    ])),
    section(9, "Moderation, suspension and closing accounts", ul([
      "We may remove content or change how it's displayed, limit features, or suspend or close an account at any time if we reasonably believe the Terms have been breached, someone is at risk, we could face legal exposure, or the law requires it. Where appropriate, we'll tell you why.",
      "You can stop using the Platform and ask us to close your account at any time.",
      "Sections 8 and 10–16 continue to apply after your account closes.",
    ])),
    section(10, "Disclaimers", `<p>To the maximum extent permitted by law, the Platform and all content on it are provided “as is” and “as available”, without warranties of any kind. We don't guarantee that the Platform will be uninterrupted, secure or error-free, or that any listing, Space, member or deal will be as described, available, lawful or suitable for your purpose.</p>`),
    section(11, "Limitation of liability", `<p>To the maximum extent permitted by law, Frontage and its owners, officers, employees and contractors are not liable to you or anyone else — whether in contract, tort (including negligence), under statute or otherwise — for any loss, damage, cost or claim arising out of or connected with the Platform, any listing or content, any Space, any communication or dealing between members, or any advertising that is or isn't displayed. This includes loss of profit, revenue, business, data, goodwill or opportunity, and any indirect or consequential loss.</p>
      <p><strong>Australian Consumer Law.</strong> Nothing in these Terms excludes, restricts or modifies any guarantee, right or remedy you have under the Australian Consumer Law or any other law that cannot be excluded. Where our liability for failing to meet such a guarantee can be limited, it is limited, at our option, to supplying the services again or paying the cost of having them supplied again. If you live outside Australia, you may also have rights under your local consumer laws that can't be excluded — nothing in these Terms limits those rights.</p>`),
    section(12, "Indemnity", `<p>You agree to indemnify Frontage and its owners, officers, employees and contractors against any claim, loss, liability, cost or expense (including reasonable legal costs) arising from your content, your use of the Platform, your dealings with other members or any Space, or your breach of these Terms or the law.</p>`),
    section(13, "Release", `<p>To the maximum extent permitted by law, you release Frontage from all claims, demands and losses arising out of or connected with any dispute between you and another member.</p>`),
    section(14, "Disputes and governing law", `<p>If you have a problem with Frontage, contact us first and we'll try in good faith to resolve it informally. These Terms are governed by the laws of New South Wales, Australia, and you submit to the non-exclusive jurisdiction of its courts.</p>`),
    section(15, "Changes", `<p>We may change the Platform or these Terms. We'll post updated Terms with a new date and, for significant changes, give reasonable notice by email or on the Platform. If you keep using the Platform after a change takes effect, you accept the updated Terms.</p>`),
    section(16, "General", ul([
      "These Terms and our Privacy Policy are the whole agreement between you and us about the Platform.",
      "If any part is invalid or unenforceable, it's read down or severed, and the rest continues to apply.",
      "If we don't enforce a right straight away, we haven't waived it.",
      "We may transfer our rights and obligations under these Terms; you may not without our written consent.",
      "We may send notices to the email address on your account.",
      "Nothing in these Terms creates a partnership, employment, agency or joint venture between you and us.",
    ])),
    section(17, "Contact", `<p>Questions about these Terms: <a href="mailto:${mail}" class="link">${mail}</a></p>`),
  ].join("");
}

export function privacyHtml() {
  const op = operatorName();
  const mail = contactEmail();
  return [
    section(1, "About this policy", `<p>This policy explains how ${op} (“Frontage”, “we”, “us”) collects, uses and shares personal information when you use frontage.world (the “Platform”).</p>`),
    section(2, "What we collect", ul([
      "<strong>What you give us:</strong> your name, email address, mobile number, password (stored in protected form, never readable by us), business name and profile links; your listings, including photos, video links, description and the address and location of the Space; messages you send; reports; and anything you send us directly.",
      "<strong>What we collect automatically:</strong> information about your device and how you use the Platform, such as IP address, browser type, pages viewed, and approximate location derived from your IP address, collected through cookies and similar technologies.",
      "<strong>What others tell us:</strong> other members may give us information about you, for example in a message or a report.",
    ])),
    section(3, "How we use it", ul([
      "to provide and run the Platform, show listings and deliver messages and notifications;",
      "to keep accounts secure and verify contact details;",
      "to prevent and investigate fraud, spam and misuse, moderate content and enforce our Terms;",
      "to respond to you and provide support;",
      "to understand how the Platform is used and improve it;",
      "to market Frontage and measure our advertising (you can opt out of marketing at any time); and",
      "to comply with the law.",
    ])),
    section(4, "What other members can see", ul([
      "Listings are public, along with the seller's first name or business name.",
      "Unless you choose to show it, the exact address of a Space is hidden and only the suburb and an approximate area are shown.",
      "Messages are visible to the member you're messaging.",
      "Your email address and mobile number are never shown to other members unless you share them yourself.",
      "We try to remove location data embedded in photos you upload, but check what's visible in a photo before you post it.",
    ])),
    section(5, "Who we share it with", `${ul([
      "<strong>Other members</strong>, as described above.",
      "<strong>Service providers</strong> who help us run the Platform — for example hosting, storage, email delivery, maps and analytics — who may only use it to provide their services to us.",
      "<strong>Analytics and advertising partners</strong> such as Google and Meta, through cookies, if you accept them.",
      "<strong>Authorities and others</strong> where the law requires it, or where we believe it's needed to protect someone's safety or our rights.",
      "<strong>A buyer or successor</strong> if Frontage's business is sold or restructured.",
    ])}<p>We do not sell your personal information.</p>`),
    section(6, "Cookies and analytics", `<p>We use a necessary cookie to keep you logged in. Analytics and advertising cookies load only if you accept them in the cookie notice. You can change your choice by clearing this site's cookies, and most browsers let you block cookies altogether.</p>`),
    section(7, "Where your information is stored", `<p>Our service providers may store and process your information outside Australia.</p>`),
    section(8, "Security", `<p>We take reasonable steps to protect your information from misuse, loss and unauthorised access. No method of storage or transmission is completely secure.</p>`),
    section(9, "How long we keep it", `<p>We keep personal information for as long as we need it for the purposes above, or as the law requires, and then delete or de-identify it.</p>`),
    section(10, "Your choices", ul([
      "You can update most of your details in your account settings and turn off optional notifications.",
      "To ask for a copy of your information, have it corrected, or close your account and delete it, email us. We may need to confirm your identity first, and we may keep some information where the law requires it or to prevent fraud.",
    ])),
    section(11, "Children", `<p>The Platform is for people aged 18 and over. We don't knowingly collect information from anyone younger.</p>`),
    section(12, "Changes", `<p>We may update this policy and will post the new version here with a new date.</p>`),
    section(13, "Contact", `<p>Privacy questions or requests: <a href="mailto:${mail}" class="link">${mail}</a></p>`),
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
