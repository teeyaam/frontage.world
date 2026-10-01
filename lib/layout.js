// Shared HTML document shell: <head> (meta, social preview tags,
// analytics), header/nav and footer.

import { SOCIAL_ICON_PATHS } from "./socialIcons.js";
import * as db from "./db.js";
import { hasPermission, hasAnyPermission } from "./permissions.js";
import { analyticsHeadScript } from "./analytics.js";
import { appBaseUrl } from "./email.js";

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const SITE_TAGLINE = "List your wall, window or fence — or find the spot where your business can really be seen.";
const DEFAULT_DESCRIPTION =
  "Frontage is the marketplace for advertising space. List a wall, fence, window or screen for free, or find a spot for your business's ad — message the owner and deal directly.";

// Staging (the .onrender.com URL) sets NOINDEX=1 so search engines never
// index a second copy of the site.
function isNoindex() {
  return process.env.NOINDEX === "1" || process.env.NOINDEX === "true";
}

function navLink(href, label, active, extra = "") {
  return `<a href="${href}" class="navlink${active ? " active" : ""}">${label}${extra}</a>`;
}

const STAFF_GROUP = ["admin-reports", "admin-listings", "admin-users", "admin-deals", "admin-staff"];

async function staffDropdown(activeNav, user) {
  if (!hasAnyPermission(user)) return "";
  const items = [];
  if (hasPermission(user, "canAccessSupport")) {
    const open = await db.countOpenReports();
    items.push(navLink("/admin/reports", "Reports", activeNav === "admin-reports", open ? ` <span class="count-pill">${open}</span>` : ""));
    items.push(navLink("/admin/listings", "Listings", activeNav === "admin-listings"));
    items.push(navLink("/admin/users", "Users", activeNav === "admin-users"));
    items.push(navLink("/admin/deals", "Deals", activeNav === "admin-deals"));
  }
  if (user.isAdmin) items.push(navLink("/admin/staff", "Staff access", activeNav === "admin-staff"));
  return `<details class="nav-dropdown">
    <summary class="navlink${STAFF_GROUP.includes(activeNav) ? " active" : ""}">Staff ▾</summary>
    <div class="nav-dropdown-menu">${items.join("")}</div>
  </details>`;
}

// The Frontage mark: a dashed frame with L-shaped corners (the owner's
// design, redrawn as a vector — public/logo-mark.svg is the standalone copy).
const LOGO_PATH =
  "M10 10h17.6v3.3H10zM10 10h3.3v14H10zM33.8 10h13.1v3.3H33.8zM52.9 10h13.5v3.3H52.9zM72.4 10H90v3.3H72.4zM86.7 10H90v14h-3.3zM10 28.7h3.3v10.8H10zM10 44.2h3.3v11.1H10zM10 60h3.3v10.8H10zM86.7 28.7H90v10.8h-3.3zM86.7 44.2H90v11.1h-3.3zM86.7 60H90v10.8h-3.3zM10 75.7h3.3V90H10zM10 86.7h10.4V90H10zM25.8 86.7h12.4V90H25.8zM43.9 86.7h12.4V90H43.9zM62 86.7h12.4V90H62zM79.6 86.7H90V90H79.6zM86.7 75.7H90V90h-3.3z";

function brandMark({ showTagline = true } = {}) {
  return `<a href="/" class="brand" aria-label="Frontage home">
      <svg class="brand-mark" width="24" height="24" viewBox="6 6 88 88" aria-hidden="true"><path fill="var(--ink)" d="${LOGO_PATH}" /></svg>
      <span>FRONTAGE</span>
      ${showTagline ? `<span class="brand-tagline">${escapeHtml(SITE_TAGLINE)}</span>` : ""}
    </a>`;
}

// Structured data for the homepage: tells search engines the site is called
// "Frontage" (site name in results, brand panel) and how to search it.
// Frontage's official social profiles — linked in the footer and listed as
// sameAs so search engines connect the brand to this site.
export const SOCIAL_PROFILES = [
  { label: "LinkedIn", icon: "linkedin", url: "https://www.linkedin.com/company/frontage-world" },
  { label: "YouTube", icon: "youtube", url: "https://www.youtube.com/channel/UCZoI2Rij6fyUq3dhiiQOD_Q" },
  { label: "Instagram", icon: "instagram", url: "https://www.instagram.com/frontage.world/" },
  { label: "X", icon: "x", url: "https://x.com/frontageworld" },
  { label: "TikTok", icon: "tiktok", url: "https://www.tiktok.com/@frontage.world" },
  { label: "Facebook", icon: "facebook", url: "https://www.facebook.com/profile.php?id=61594703944703" },
];

// Small icon links in the footer, one per profile.
function socialIconLinks() {
  return SOCIAL_PROFILES.map(
    (p) => `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener me" aria-label="Frontage on ${escapeHtml(p.label)}" title="${escapeHtml(p.label)}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="${SOCIAL_ICON_PATHS[p.icon]}" /></svg></a>`
  ).join("");
}

function siteStructuredData(base) {
  const sameAs = SOCIAL_PROFILES.map((p) => p.url);
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${base}/#organization`,
        name: "Frontage",
        alternateName: "Frontage.world",
        url: `${base}/`,
        logo: `${base}/logo-mark.svg`,
        description: DEFAULT_DESCRIPTION,
        sameAs,
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        name: "Frontage",
        alternateName: ["Frontage.world", "frontage.world"],
        url: `${base}/`,
        publisher: { "@id": `${base}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${base}/?country=all&q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

function headMeta({ title, fullTitle: titleOverride, description, ogImage, canonicalPath, noindex }) {
  const base = appBaseUrl();
  const fullTitle = titleOverride || (title ? `${title} — Frontage` : "Frontage — advertising space, direct from the owner");
  const desc = description || DEFAULT_DESCRIPTION;
  const url = canonicalPath ? `${base}${canonicalPath}` : null;
  const image = ogImage ? (/^https?:\/\//.test(ogImage) ? ogImage : `${base}${ogImage}`) : `${base}/og-default.png`;
  return `<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(desc)}" />
${noindex || isNoindex() ? `<meta name="robots" content="noindex, nofollow" />` : ""}
${url ? `<link rel="canonical" href="${escapeHtml(url)}" />` : ""}
<meta property="og:site_name" content="Frontage" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${escapeHtml(titleOverride ? "Frontage" : title || "Frontage")}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
${url ? `<meta property="og:url" content="${escapeHtml(url)}" />` : ""}
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:locale" content="en_AU" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(titleOverride ? "Frontage" : title || "Frontage")}" />
<meta name="twitter:description" content="${escapeHtml(desc)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<meta name="theme-color" content="#FFFFFF" />
${canonicalPath === "/" ? siteStructuredData(base) : ""}`;
}

// Async because the unread badge and the sell switch hit Postgres — every
// call site does `send(res, 200, await layout({...}))`.
export async function layout({ title, fullTitle, activeNav = "", user = null, body = "", flash = "", description, ogImage, canonicalPath, noindex = false, hideTagline = false }) {
  const nav = [navLink("/", "Browse", activeNav === "browse"), await staffDropdown(activeNav, user)].filter(Boolean).join("");

  let userArea;
  if (user) {
    const unread = await db.getUnreadConversationCount(user.id);
    const listingCount = (await db.getListingsByOwner(user.id)).length;
    userArea = `<a href="/account/messages" class="notif-bell${activeNav === "messages" ? " active" : ""}" title="Messages" aria-label="Messages${unread ? `, ${unread} unread` : ""}">💬${
      unread > 0 ? `<span class="notif-badge">${unread > 9 ? "9+" : unread}</span>` : ""
    }</a>
       <a href="${listingCount > 0 ? "/sell" : "/sell/welcome"}" class="btn-pill btn btn-sm${activeNav === "sell" ? " is-active" : ""}">${listingCount > 0 ? "My listings" : "List your space"}</a>
       <a href="/account" class="navlink${activeNav === "account" ? " active" : ""}">${escapeHtml(String(user.fullName || "").split(" ")[0] || "Account")}</a>
       <form method="POST" action="/api/auth/logout" style="display:inline"><button class="btn-link">Log out</button></form>`;
  } else {
    userArea = `<a href="/sell/welcome" class="navlink">List your space</a><a href="/onboarding" class="btn-cta-sm">Sign up / Log in</a>`;
  }

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${headMeta({ title, fullTitle, description, ogImage, canonicalPath, noindex })}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/style.css" />
${analyticsHeadScript()}
</head>
<body>
<header class="site-header">
  <div class="site-header-inner">
    ${brandMark({ showTagline: !hideTagline })}
    <nav class="nav">${nav}</nav>
    <div class="nav-user">${userArea}</div>
  </div>
</header>
${flash ? `<div class="flash">${flash}</div>` : ""}
<main class="site-main">
${body}
</main>
<footer class="site-footer">
  <div class="footer-links">
    <a href="/about">About</a><a href="/how-it-works">How it works</a><a href="/rent-out-your-wall">Rent out your wall</a><a href="/find-advertising-space">Find advertising space</a><a href="/pricing-guide">Pricing guide</a><a href="/safety">Safety</a><a href="/contact">Contact</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a>
  </div>
  <nav class="footer-social" aria-label="Frontage on social media">${socialIconLinks()}</nav>
  <div>© ${new Date().getFullYear()} Frontage. Advertising space, direct from the people who own it. Frontage doesn't take part in or handle payments for deals between members.</div>
</footer>
<script src="/client.js"></script>
</body>
</html>`;
}
