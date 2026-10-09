// Frontage — plain Node.js http server (no framework).
// A classifieds marketplace for advertising space: listings + messaging,
// with every deal done off-platform. Persistence is Postgres (lib/db.js),
// photo uploads go to S3/R2 (lib/upload.js). Requires DATABASE_URL.
// The v1 transactional app is archived in archive/v1-transactional/.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import "dotenv/config";
import * as pages from "./routes/pages.js";
import * as messages from "./routes/messages.js";
import * as api from "./routes/api.js";
import * as db from "./lib/db.js";
import { parseCookies, cookieSecureFlag } from "./lib/auth.js";
import { readBody } from "./lib/body.js";
import { appBaseUrl } from "./lib/email.js";
import { startJobs } from "./lib/jobs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = process.env.PORT || 3000;
const isHttps = /^https:/i.test(process.env.APP_BASE_URL || "");

const STATIC_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".ico": "image/x-icon",
};
const STATIC_FILES = new Set(["/logo-mark.svg", "/style.css", "/client.js", "/browse.js", "/listing.js", "/listing-form.js", "/chat.js", "/listing-map.js", "/admin-examples.js", "/favicon.svg", "/og-default.png"]);

function serveStatic(req, res, pathname) {
  const filePath = path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return false;
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return false;
  }
  if (stat.isDirectory()) return false;
  const isUpload = pathname.startsWith("/uploads/");
  res.writeHead(200, {
    "Content-Type": STATIC_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": isUpload ? "public, max-age=31536000, immutable" : "public, max-age=600",
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

// ---------- Security headers (every response) ----------
function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (isHttps) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

// ---------- Cross-site POST protection ----------
// Browsers send Origin (or at least Referer) on form posts. A POST whose
// origin isn't this site is rejected; the session cookie is also
// SameSite=Lax, so this is a second layer. Requests with neither header
// (curl, server-to-server) carry no browser cookies to abuse.
function isSameOriginPost(req) {
  const source = req.headers.origin || req.headers.referer;
  if (!source) return true;
  let host;
  try {
    host = new URL(source).host;
  } catch {
    return false;
  }
  const allowed = new Set([req.headers.host]);
  try {
    allowed.add(new URL(appBaseUrl()).host);
  } catch {}
  return allowed.has(host);
}

// ---------- Private mode ----------
// Set SITE_PASSCODE to lock the whole site behind one shared passcode
// (staging, or pre-launch review). Remove it to go public.
function gateHash() {
  return crypto.createHash("sha256").update(process.env.SITE_PASSCODE).digest("hex");
}
function gatePage(res, wrong) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><meta name="robots" content="noindex, nofollow"/><title>Frontage — private preview</title></head>
<body style="margin:0;background:#EDEBE6;color:#1B2A3D;font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
  <form method="POST" action="/gate" style="background:#fff;border:1px solid #DAD6CC;border-radius:12px;padding:32px;max-width:340px;text-align:center">
    <div style="font-weight:bold;font-size:18px;letter-spacing:.02em">FRONTAGE</div>
    <p style="font-size:13px;color:#5B6472">This site is in private preview. Enter the access code to continue.</p>
    ${wrong ? `<p style="font-size:13px;color:#C4574B">That code isn't right — try again.</p>` : ""}
    <input type="password" name="passcode" aria-label="Access code" autofocus style="width:100%;box-sizing:border-box;padding:11px;border-radius:8px;border:1px solid #DAD6CC;margin-bottom:12px" />
    <button type="submit" style="width:100%;background:#1B2A3D;color:#fff;border:none;padding:11px;border-radius:8px;font-weight:bold;cursor:pointer">Enter</button>
  </form>
</body></html>`);
}
async function handleGate(req, res, pathname) {
  if (!process.env.SITE_PASSCODE) return false;
  if (pathname === "/healthz" || pathname === "/robots.txt") return false;
  if (parseCookies(req)["frontage_gate"] === gateHash()) return false;
  if (req.method === "POST" && pathname === "/gate") {
    const b = await readBody(req);
    const given = Buffer.from(String(b.passcode || ""));
    const expected = Buffer.from(process.env.SITE_PASSCODE);
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
      res.writeHead(302, { Location: "/", "Set-Cookie": `frontage_gate=${gateHash()}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${cookieSecureFlag()}` });
      res.end();
    } else {
      gatePage(res, true);
    }
    return true;
  }
  gatePage(res, false);
  return true;
}

// ---------- Retired v1 URLs → 301 ----------
function retiredRedirect(pathname) {
  let m;
  if ((m = pathname.match(/^\/book\/([^/]+)$/))) return `/listing/${m[1]}`;
  if ((m = pathname.match(/^\/listing\/([^/]+)\/chat$/))) return `/listing/${m[1]}`;
  if (pathname === "/plan" || pathname === "/account/leases" || pathname === "/seller/inquiries" || pathname === "/seller/jobs" || pathname.startsWith("/job/"))
    return "/account/messages";
  if (pathname === "/sell/insights" || pathname.startsWith("/sell/insights/")) return "/sell";
  if (pathname.startsWith("/contractor") || pathname === "/admin/contractor-applications" || pathname === "/sell/bdr-new" || pathname.startsWith("/claim/") || pathname.startsWith("/order/") || pathname.startsWith("/contract/"))
    return "/";
  if (pathname === "/terms/buyer" || pathname === "/terms/seller" || pathname === "/terms/non-discrimination") return "/terms";
  if (pathname === "/investors") return "/about";
  if (pathname === "/rent-out-your-wall") return "/earn-from-your-vehicle";
  if (pathname === "/find-advertising-space") return "/advertise-on-vehicles";
  if (pathname === "/check-zoning") return "/";
  return null;
}

// ---------- robots.txt + sitemap.xml ----------
// "Selective openness": search engines and AI search/answer bots may crawl
// (traffic and citations); AI training crawlers are refused. Google-Extended
// is deliberately NOT blocked: it also controls Gemini grounding (citing the
// site in Gemini answers), not just training. Private pages
// stay out of results through their noindex tags, not robots.txt.
const ROBOTS_TXT = `# ALLOW TRADITIONAL & AI SEARCH BOTS (For Traffic & Citations)
User-agent: *
Allow: /

User-agent: Googlebot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

# BLOCK AI TRAINING BOTS (Protecting data from passive scraping)
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: CCBot
Disallow: /

Sitemap: ${appBaseUrl()}/sitemap.xml
`;

function robotsTxt(res) {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  // A staging copy (NOINDEX) or passcode-gated site stays fully closed.
  if (process.env.NOINDEX === "1" || process.env.NOINDEX === "true" || process.env.SITE_PASSCODE) return res.end("User-agent: *\nDisallow: /\n");
  res.end(ROBOTS_TXT);
}
async function sitemapXml(res) {
  const base = appBaseUrl();
  const fixed = ["/", "/about", "/how-it-works", "/earn-from-your-vehicle", "/advertise-on-vehicles", "/pricing-guide", "/safety", "/sell/welcome", "/terms", "/privacy", "/contact"];
  const listings = (await db.getListings()).filter((l) => !l.exampleKey);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const urls = [
    ...fixed.map((p) => `<url><loc>${esc(base + p)}</loc></url>`),
    ...listings.map((l) => `<url><loc>${esc(`${base}/listing/${l.id}`)}</loc><lastmod>${esc(String(l.updatedAt || l.createdAt).slice(0, 10))}</lastmod></url>`),
  ];
  res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
}

function serverError(req, res, err) {
  const ref = crypto.randomBytes(4).toString("hex");
  console.error(`[error ${ref}] ${req.method} ${req.url}`, err);
  if (res.headersSent) return res.end();
  const tooLarge = err && err.code === "BODY_TOO_LARGE";
  const wantsJson = String(req.headers.accept || "").includes("application/json");
  const message = tooLarge ? "That was too much data to send at once." : "Something went wrong on our side. Please try again.";
  const status = tooLarge ? 413 : 500;
  if (wantsJson) {
    res.writeHead(status, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: message, ref }));
  }
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Frontage</title><link rel="stylesheet" href="/style.css"/></head>
<body><main class="site-main"><div class="panel empty-state"><h1>${tooLarge ? "Too much data" : "Sorry — something went wrong"}</h1><p class="muted">${message} (ref ${ref})</p><a class="btn btn-primary" href="/">Back to Frontage</a></div></main></body></html>`);
}

const server = http.createServer(async (req, res) => {
  try {
    setSecurityHeaders(res);
    const url = new URL(req.url, "http://localhost");
    const { pathname } = url;
    const query = url.searchParams;
    const method = req.method === "HEAD" ? "GET" : req.method;

    if (method === "GET" && pathname === "/healthz") {
      await db.ping();
      res.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      return res.end("ok");
    }

    if (method === "POST" && !isSameOriginPost(req)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      return res.end("Cross-site request blocked.");
    }

    if (await handleGate(req, res, pathname)) return;

    if (method === "GET" && (STATIC_FILES.has(pathname) || pathname.startsWith("/uploads/listings/"))) {
      if (serveStatic(req, res, pathname)) return;
    }
    if (method === "GET" && pathname === "/robots.txt") return robotsTxt(res);
    if (method === "GET" && pathname === "/sitemap.xml") return await sitemapXml(res);

    if (method === "GET") {
      const to = retiredRedirect(pathname);
      if (to) {
        res.writeHead(301, { Location: to });
        return res.end();
      }
    }

    let m;
    // ---------- GET pages ----------
    if (method === "GET") {
      if (pathname === "/") return await pages.browsePage(req, res, query);
      if (pathname === "/api/listings/map") return await pages.listingsMapJson(req, res, query);
      if (pathname === "/onboarding") return await pages.onboardingPage(req, res, query);
      if (pathname === "/welcome") return await pages.welcomePage(req, res, query);
      if (pathname === "/verify") return await api.verifyEmailHandler(req, res, query);
      if (pathname === "/forgot-password") return await pages.forgotPasswordPage(req, res, query);
      if (pathname === "/reset-password") return await pages.resetPasswordPage(req, res, query);
      if (pathname === "/sell/welcome") return await pages.sellWelcomePage(req, res);
      if (pathname === "/sell") return await pages.myListingsPage(req, res, query);
      if (pathname === "/sell/new") return await pages.newListingPage(req, res);
      if (pathname === "/account") return await pages.accountPage(req, res, query);
      if (pathname === "/account/messages") return await messages.inboxPage(req, res);
      if (pathname === "/about") return await pages.aboutPage(req, res);
      if (pathname === "/earn-from-your-vehicle") return await pages.earnFromYourVehiclePage(req, res);
      if (pathname === "/advertise-on-vehicles") return await pages.advertiseOnVehiclesPage(req, res);
      if (pathname === "/how-it-works") return await pages.howItWorksPage(req, res);
      if (pathname === "/pricing-guide") return await pages.pricingGuidePage(req, res);
      if (pathname === "/safety") return await pages.safetyPage(req, res);
      if (pathname === "/terms") return await pages.termsPage(req, res);
      if (pathname === "/privacy") return await pages.privacyPage(req, res);
      if (pathname === "/contact") return await pages.contactPage(req, res, query);
      if (pathname === "/admin/reports") return await pages.adminReportsPage(req, res, query);
      if (pathname === "/admin/listings") return await pages.adminListingsPage(req, res, query);
      if (pathname === "/admin/users") return await pages.adminUsersPage(req, res, query);
      if (pathname === "/admin/staff") return await pages.adminStaffPage(req, res, query);
      if (pathname === "/admin/deals") return await pages.adminDealsPage(req, res);
      if (pathname === "/admin/examples") return await pages.adminExamplesPage(req, res, query);
      if (pathname === "/admin/examples/prompts.txt") return await pages.adminExamplePromptsText(req, res);
      if ((m = pathname.match(/^\/sell\/rented\/([^/]+)$/))) return await pages.markRentedPage(req, res, m[1]);
      if ((m = pathname.match(/^\/deal-check\/([^/]+)$/))) return await pages.dealCheckPage(req, res, m[1], query);
      if ((m = pathname.match(/^\/listing\/([^/]+)$/))) return await pages.listingDetailPage(req, res, m[1]);
      if ((m = pathname.match(/^\/listing\/([^/]+)\/report$/))) return await pages.reportListingPage(req, res, m[1], query);
      if ((m = pathname.match(/^\/sell\/edit\/([^/]+)$/))) return await pages.editListingPage(req, res, m[1]);
      if ((m = pathname.match(/^\/messages\/([^/]+)$/))) return await messages.conversationPage(req, res, m[1]);
      if ((m = pathname.match(/^\/messages\/([^/]+)\/report$/))) return await messages.reportConversationPage(req, res, m[1], query);
      if ((m = pathname.match(/^\/messages\/([^/]+)\/agreement$/))) return await messages.agreementFormHandler(req, res, m[1]);
      if ((m = pathname.match(/^\/messages\/([^/]+)\/agreement\/view$/))) return await messages.agreementViewHandler(req, res, m[1]);
      if ((m = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/))) return await messages.conversationMessagesJson(req, res, m[1], query);
      if ((m = pathname.match(/^\/admin\/conversations\/([^/]+)$/))) return await pages.adminConversationPage(req, res, m[1]);
    }

    // ---------- POST ----------
    if (method === "POST") {
      if (pathname === "/api/auth/signup") return await api.signup(req, res);
      if (pathname === "/api/auth/login") return await api.login(req, res);
      if (pathname === "/api/auth/logout") return await api.logout(req, res);
      if (pathname === "/api/auth/forgot-password") return await api.forgotPassword(req, res);
      if (pathname === "/api/auth/reset-password") return await api.resetPassword(req, res);
      if (pathname === "/api/account/profile") return await api.updateAccountProfile(req, res);
      if (pathname === "/api/account/password") return await api.updateAccountPassword(req, res);
      if (pathname === "/api/account/notifications") return await api.updateAccountNotifications(req, res);
      if (pathname === "/api/account/region") return await api.updateAccountRegion(req, res);
      if ((m = pathname.match(/^\/api\/listings\/([^/]+)\/renew$/))) return await api.renewListingHandler(req, res, m[1]);
      if ((m = pathname.match(/^\/api\/listings\/([^/]+)\/rented$/))) return await api.markRentedHandler(req, res, m[1]);
      if ((m = pathname.match(/^\/api\/deal-check\/([^/]+)$/))) return await api.dealCheckSubmit(req, res, m[1]);
      if ((m = pathname.match(/^\/api\/admin\/listings\/([^/]+)\/fix-currency$/))) return await api.fixListingCurrencyHandler(req, res, m[1]);
      if (pathname === "/api/admin/examples/create") return await api.createExamplesHandler(req, res);
      if (pathname === "/api/admin/examples/delete") return await api.deleteExamplesHandler(req, res);
      if ((m = pathname.match(/^\/api\/admin\/examples\/([A-Za-z0-9-]+)\/photo$/))) return await api.exampleListingPhotoHandler(req, res, m[1].toUpperCase());
      if (pathname === "/api/account/resend-verification") return await api.resendVerificationHandler(req, res);
      if (pathname === "/api/listings") return await api.createListingHandler(req, res);
      if (pathname === "/api/contact") return await api.contactSubmit(req, res);
      if (pathname === "/api/reports") return await api.createReportHandler(req, res);
      if (pathname === "/api/admin/staff") return await api.grantStaffHandler(req, res);
      if ((m = pathname.match(/^\/api\/listings\/([^/]+)\/update$/))) return await api.updateListingHandler(req, res, m[1]);
      if ((m = pathname.match(/^\/api\/listings\/([^/]+)\/delete$/))) return await api.deleteListingHandler(req, res, m[1]);
      if ((m = pathname.match(/^\/api\/listings\/([^/]+)\/messages$/))) return await messages.messageSellerHandler(req, res, m[1]);
      if ((m = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/))) return await messages.replyHandler(req, res, m[1]);
      if ((m = pathname.match(/^\/api\/conversations\/([^/]+)\/agreement$/))) return await messages.agreementSaveHandler(req, res, m[1]);
      if ((m = pathname.match(/^\/api\/admin\/reports\/([^/]+)\/resolve$/))) return await api.resolveReportHandler(req, res, m[1]);
      if ((m = pathname.match(/^\/api\/admin\/listings\/([^/]+)\/remove$/))) return await api.removeListingHandler(req, res, m[1]);
      if ((m = pathname.match(/^\/api\/admin\/listings\/([^/]+)\/restore$/))) return await api.restoreListingHandler(req, res, m[1]);
      if ((m = pathname.match(/^\/api\/admin\/users\/([^/]+)\/suspend$/))) return await api.suspendUserHandler(req, res, m[1]);
      if ((m = pathname.match(/^\/api\/admin\/users\/([^/]+)\/unsuspend$/))) return await api.unsuspendUserHandler(req, res, m[1]);
      if ((m = pathname.match(/^\/api\/admin\/users\/([^/]+)\/permissions$/))) return await api.updateUserPermissions(req, res, m[1]);
    }

    await pages.notFoundPage(req, res);
  } catch (err) {
    serverError(req, res, err);
  }
});

server.listen(PORT, () => {
  console.log(`Frontage running at http://localhost:${PORT}`);
  startJobs();
});
