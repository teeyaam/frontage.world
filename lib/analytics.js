// Google Analytics 4 + Meta Pixel — env-gated like every other integration:
// nothing loads unless GA4_MEASUREMENT_ID / META_PIXEL_ID is set.
//
// Neither script loads until the visitor accepts the cookie notice
// (public/client.js stores the choice). Before that, window.frontageTrack
// just queues events, which are sent once consent is given, or dropped.
//
// Events the site sends (see frontageTrack calls):
//   sign_up            — account created           (Meta: CompleteRegistration)
//   contact_seller     — first message to a seller (Meta: Lead)
//   view_listing       — listing page view         (Meta: ViewContent)
//   publish_listing    — a new listing goes live   (Meta: SubmitApplication)

export function isAnalyticsConfigured() {
  return Boolean(process.env.GA4_MEASUREMENT_ID || process.env.META_PIXEL_ID);
}

const safeId = (v) => String(v || "").replace(/[^A-Za-z0-9-]/g, "");

// Inline config for <head>. The actual loaders live in public/client.js.
export function analyticsHeadScript() {
  if (!isAnalyticsConfigured()) return "";
  const cfg = { ga4: safeId(process.env.GA4_MEASUREMENT_ID) || null, pixel: safeId(process.env.META_PIXEL_ID) || null };
  return `<script>window.FRONTAGE_ANALYTICS=${JSON.stringify(cfg)};window.__frontageQueue=window.__frontageQueue||[];window.frontageTrack=window.frontageTrack||function(n,p){window.__frontageQueue.push([n,p||{}]);};</script>`;
}

// Server-rendered pages queue an event on load: `trackOnLoad("view_listing", {...})`.
export function trackOnLoad(name, params = {}) {
  if (!isAnalyticsConfigured()) return "";
  return `<script>window.frontageTrack(${JSON.stringify(name)}, ${JSON.stringify(params).replace(/</g, "\\u003c")});</script>`;
}
