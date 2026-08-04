// Shared HTML document shell — header/nav + the Frontage design tokens as
// CSS variables, matching the color/type system used across the earlier
// React mockups (frontage-*.jsx) so this real app looks like the same product.
//
// Two distinct chrome modes live here: the marketplace shell (buyer/seller
// `user`) and the contractor-portal shell (`contractor`, a wholly separate
// identity space — see lib/auth.js currentContractor). A page passes exactly
// one of the two into layout(); never both.

import * as db from "./db.js";
import { hasPermission, hasAnyPermission } from "./permissions.js";

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function navLink(href, label, active) {
  return `<a href="${href}" class="navlink${active ? " active" : ""}">${label}</a>`;
}

// Staff dropdown — visible (not hidden-in-the-footer-only) so accounts with
// department permissions can actually find it. Only rendered for accounts
// that have at least one permission flag (or the super-admin isAdmin flag);
// a regular buyer/seller never sees it.
const STAFF_GROUP = ["admin-contractor-apps", "admin-deals", "admin-listings", "admin-staff", "bdr-new-listing"];

function staffDropdown(activeNav, user) {
  if (!hasAnyPermission(user)) return "";
  const items = [];
  if (hasPermission(user, "canApproveContractors")) items.push(navLink("/admin/contractor-applications", "Contractor department", activeNav === "admin-contractor-apps"));
  if (hasPermission(user, "canAccessSupport")) {
    items.push(navLink("/admin/deals", "Customer service", activeNav === "admin-deals"));
    items.push(navLink("/admin/listings", "Listings moderation", activeNav === "admin-listings"));
  }
  if (hasPermission(user, "canCreateBdrListings")) items.push(navLink("/sell/bdr-new", "Create BDR listing", activeNav === "bdr-new-listing"));
  if (user.isAdmin) items.push(navLink("/admin/staff", "Manage staff", activeNav === "admin-staff"));
  const open = STAFF_GROUP.includes(activeNav) ? " open" : "";
  return `<details class="nav-dropdown"${open}>
    <summary class="navlink${STAFF_GROUP.includes(activeNav) ? " active" : ""}">Staff ▾</summary>
    <div class="nav-dropdown-menu">${items.join("")}</div>
  </details>`;
}

function documentShell({ title, headerInner, body, flash, footerExtra = "" }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)} — Frontage</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&family=Caveat:wght@600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/style.css" />
</head>
<body>
<header class="site-header">
  <div class="site-header-inner">
    ${headerInner}
  </div>
</header>
${flash ? `<div class="flash">${flash}</div>` : ""}
<main class="site-main">
${body}
</main>
<footer class="site-footer">
  <div class="footer-links">
    <a href="/about">About</a><a href="/how-it-works">How it works</a><a href="/contact">Contact</a><a href="/terms">Terms</a><a href="/investors">Investors</a><a href="/contractor/login">Contractor login</a>${footerExtra}
  </div>
  <div>Frontage — working demo app, not a production build. Platform fee 15%, deducted from the seller's payout.</div>
</footer>
<script src="/client.js"></script>
</body>
</html>`;
}

function brandMark(tagline) {
  return `<a href="/" class="brand">
      <svg width="20" height="20" viewBox="0 0 22 22">
        <rect x="3" y="3" width="16" height="16" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="3 2" />
        <line x1="3" y1="1" x2="3" y2="0" stroke="var(--orange)" stroke-width="1.5" />
      </svg>
      <span>FRONTAGE</span>
      <span class="brand-tagline">${escapeHtml(tagline)}</span>
    </a>`;
}

// ---------------- Marketplace shell (buyer/seller `user`) ----------------
// Async now (getUnreadMessageCount hits Postgres) — every call site does
// `send(res, 200, await layout({...}))`.
export async function layout({ title, activeNav = "", user = null, body = "", flash = "" }) {
  const nav = [navLink("/", "Browse", activeNav === "browse"), navLink("/sell/new", "List a space", activeNav === "sell"), staffDropdown(activeNav, user)]
    .filter(Boolean)
    .join("");

  const unreadCount = user ? await db.getUnreadMessageCount(user.id) : 0;
  const messagesIcon = user
    ? `<a href="/account/messages" class="notif-bell" title="Messages">💬${unreadCount > 0 ? `<span class="notif-badge">${unreadCount > 9 ? "9+" : unreadCount}</span>` : ""}</a>`
    : "";

  const userArea = user
    ? `${messagesIcon}
       <a href="/account/leases" class="navlink${activeNav === "account-leases" ? " active" : ""}">My leases</a>
       <a href="/sell/new" class="navlink${activeNav === "sell" ? " active" : ""}">My listings</a>
       <a href="/account" class="navlink${activeNav === "account" ? " active" : ""}">${escapeHtml(user.fullName.split(" ")[0])}</a>
       <form method="POST" action="/api/auth/logout" style="display:inline"><button class="btn-link">Log out</button></form>`
    : `<a href="/onboarding" class="btn-cta-sm">Sign up / Log in</a>`;

  const headerInner = `${brandMark("Free space, free money.")}
    <nav class="nav">${nav}</nav>
    <div class="nav-user">${userArea}</div>`;

  return documentShell({ title, headerInner, body, flash });
}

// ---------------- Contractor portal shell (separate `contractor`) ----------------
export async function contractorLayout({ title, activeNav = "", contractor = null, body = "", flash = "" }) {
  const nav = contractor
    ? [
        navLink("/contractor/ping", "Job pings", activeNav === "contractor-ping"),
        navLink("/contractor/board", "Job board", activeNav === "contractor-board"),
        navLink("/contractor/messages", "Messages", activeNav === "contractor-messages"),
        navLink("/contractor/support", "Support", activeNav === "contractor-support"),
      ].join("")
    : "";

  const userArea = contractor
    ? `<a href="/contractor/account" class="navlink${activeNav === "contractor-account" ? " active" : ""}">${escapeHtml(contractor.fullName.split(" ")[0])}</a>
       <form method="POST" action="/api/contractor-auth/logout" style="display:inline"><button class="btn-link">Log out</button></form>`
    : `<a href="/contractor/login" class="btn-cta-sm">Contractor log in</a>`;

  const headerInner = `${brandMark("Contractor portal")}
    <nav class="nav">${nav}</nav>
    <div class="nav-user">${userArea}</div>`;

  return documentShell({ title, headerInner, body, flash });
}
