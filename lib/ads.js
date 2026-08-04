// Display-ad seam (Google AdSense) — the same env-var-gated pattern as
// Stripe/S3/Maps/Email in this app: renders nothing at all until
// ADSENSE_CLIENT_ID is set, so there's no dead space or broken script tag
// while you're not yet approved/configured.
//
// Setup (once you have an AdSense account — see DEPLOYMENT.md):
//   ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXXXX
// Optional per-slot IDs (AdSense calls these "ad units"), else a shared
// "auto ads" unit is used everywhere:
//   ADSENSE_SLOT_BROWSE=XXXXXXXXXX
//   ADSENSE_SLOT_LISTING=XXXXXXXXXX

export function isAdsConfigured() {
  return Boolean(process.env.ADSENSE_CLIENT_ID);
}

// Script tag for <head> — loads AdSense's library once per page. Only ever
// included when ads are configured (see lib/layout.js#documentShell).
export function adsHeadScript() {
  if (!isAdsConfigured()) return "";
  return `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
    process.env.ADSENSE_CLIENT_ID
  )}" crossorigin="anonymous"></script>`;
}

// A single ad unit. `slotEnvVar` names the specific per-placement env var
// (e.g. "ADSENSE_SLOT_BROWSE") — falls back to a generic responsive unit
// with no explicit slot if that var isn't set, so a single AdSense "auto
// ads" unit can cover every placement if you don't want to configure each
// one individually.
export function adUnitMarkup(slotEnvVar, { label = "Advertisement" } = {}) {
  if (!isAdsConfigured()) return "";
  const slot = process.env[slotEnvVar];
  return `<div class="small muted" style="text-align:center;margin-bottom:4px">${label}</div>
    <ins class="adsbygoogle"
      style="display:block"
      data-ad-client="${escapeAttr(process.env.ADSENSE_CLIENT_ID)}"
      ${slot ? `data-ad-slot="${escapeAttr(slot)}"` : ""}
      data-ad-format="auto"
      data-full-width-responsive="true"></ins>
    <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>`;
}

function escapeAttr(str) {
  return String(str).replace(/"/g, "&quot;");
}
