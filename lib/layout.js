// Shared HTML document shell: <head> (meta, social preview tags,
// analytics), header/nav and footer.

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

const STAFF_GROUP = ["admin-reports", "admin-listings", "admin-users", "admin-staff"];

async function staffDropdown(activeNav, user) {
  if (!hasAnyPermission(user)) return "";
  const items = [];
  if (hasPermission(user, "canAccessSupport")) {
    const open = await db.countOpenReports();
    items.push(navLink("/admin/reports", "Reports", activeNav === "admin-reports", open ? ` <span class="count-pill">${open}</span>` : ""));
    items.push(navLink("/admin/listings", "Listings", activeNav === "admin-listings"));
    items.push(navLink("/admin/users", "Users", activeNav === "admin-users"));
  }
  if (user.isAdmin) items.push(navLink("/admin/staff", "Staff access", activeNav === "admin-staff"));
  return `<details class="nav-dropdown">
    <summary class="navlink${STAFF_GROUP.includes(activeNav) ? " active" : ""}">Staff ▾</summary>
    <div class="nav-dropdown-menu">${items.join("")}</div>
  </details>`;
}

function brandMark() {
  return `<a href="/" class="brand">
      <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="3" y="3" width="16" height="16" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="3 2" />
        <line x1="3" y1="1" x2="3" y2="0" stroke="var(--orange)" stroke-width="1.5" />
      </svg>
      <span>FRONTAGE</span>
      <span class="brand-tagline">${escapeHtml(SITE_TAGLINE)}</span>
    </a>`;
}

function headMeta({ title, description, ogImage, canonicalPath, noindex }) {
  const base = appBaseUrl();
  const fullTitle = title ? `${title} — Frontage` : "Frontage — advertising space, direct from the owner";
  const desc = description || DEFAULT_DESCRIPTION;
  const url = canonicalPath ? `${base}${canonicalPath}` : null;
  const image = ogImage ? (/^https?:\/\//.test(ogImage) ? ogImage : `${base}${ogImage}`) : `${base}/og-default.png`;
  return `<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(desc)}" />
${noindex || isNoindex() ? `<meta name="robots" content="noindex, nofollow" />` : ""}
${url ? `<link rel="canonical" href="${escapeHtml(url)}" />` : ""}
<meta property="og:site_name" content="Frontage" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${escapeHtml(title || "Frontage")}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
${url ? `<meta property="og:url" content="${escapeHtml(url)}" />` : ""}
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:locale" content="en_AU" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title || "Frontage")}" />
<meta name="twitter:description" content="${escapeHtml(desc)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<meta name="theme-color" content="#FFFFFF" />`;
}

// Async because the unread badge and the sell switch hit Postgres — every
// call site does `send(res, 200, await layout({...}))`.
export async function layout({ title, activeNav = "", user = null, body = "", flash = "", description, ogImage, canonicalPath, noindex = false }) {
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
${headMeta({ title, description, ogImage, canonicalPath, noindex })}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/style.css" />
${analyticsHeadScript()}
</head>
<body>
<header class="site-header">
  <div class="site-header-inner">
    ${brandMark()}
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
    <a href="/about">About</a><a href="/how-it-works">How it works</a><a href="/pricing-guide">Pricing guide</a><a href="/safety">Safety</a><a href="/contact">Contact</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a>
  </div>
  <div>© ${new Date().getFullYear()} Frontage. Advertising space, direct from the people who own it. Frontage doesn't take part in or handle payments for deals between members.</div>
</footer>
<script src="/client.js"></script>
</body>
</html>`;
}
