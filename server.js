// Frontage — plain Node.js http server (no framework).
// Persistence is Postgres (lib/db.js), file uploads go to S3/R2 (lib/upload.js),
// and payments are real Stripe (lib/payments.js) once their env vars are set —
// see .env.example and DEPLOYMENT.md. Requires DATABASE_URL to run at all.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";
import * as pages from "./routes/pages.js";
import * as api from "./routes/api.js";
import { layout } from "./lib/layout.js";
import { currentUser } from "./lib/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const STATIC_TYPES = { ".css": "text/css", ".js": "application/javascript", ".svg": "image/svg+xml" };

function serveStatic(req, res, pathname) {
  const filePath = path.join(__dirname, "public", pathname);
  if (!filePath.startsWith(path.join(__dirname, "public"))) return false;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": STATIC_TYPES[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

async function notFound(req, res) {
  const user = await currentUser(req);
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end(await layout({ title: "Not found", user, body: `<div class="panel"><h2>404</h2><p class="muted">That page doesn't exist. <a href="/" style="color:var(--orange)">Back to browse</a></p></div>` }));
}

function serverError(req, res, err) {
  console.error(err);
  res.writeHead(500, { "Content-Type": "text/plain" });
  res.end("Something went wrong: " + err.message);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;
    const query = url.searchParams;
    const method = req.method;

    // static assets
    if (method === "GET" && (pathname === "/style.css" || pathname === "/client.js" || pathname === "/wall-visualizer.js" || pathname === "/map.js" || pathname.startsWith("/uploads/listings/"))) {
      if (serveStatic(req, res, pathname)) return;
    }

    // ---------- GET pages ----------
    if (method === "GET" && pathname === "/") return await pages.browsePage(req, res, query);
    if (method === "GET" && pathname === "/api/listings/map") return await api.listingsMapJson(req, res);
    if (method === "GET" && pathname === "/onboarding") return await pages.onboardingPage(req, res, query, query.get("err"));
    if (method === "GET" && pathname === "/sell/new") return await pages.sellNewPage(req, res, query);
    if (method === "GET" && pathname === "/seller/jobs") return await pages.sellerJobsPage(req, res);
    if (method === "GET" && pathname === "/contractor/ping") return await pages.contractorPingPage(req, res);
    if (method === "GET" && pathname === "/contractor/board") return await pages.contractorBoardPage(req, res);
    if (method === "GET" && pathname === "/contractor/apply") return await pages.contractorApplyPage(req, res, query);
    if (method === "GET" && pathname === "/admin/contractor-applications") return await pages.adminContractorApplicationsPage(req, res);
    if (method === "GET" && pathname === "/admin/staff") return await pages.adminStaffPage(req, res, query);
    if (method === "GET" && pathname === "/admin/deals") return await pages.adminDealsPage(req, res);
    if (method === "GET" && pathname === "/admin/listings") return await pages.adminListingsPage(req, res);
    if (method === "GET" && pathname === "/sell/bdr-new") return await pages.bdrNewListingPage(req, res, query);
    if (method === "GET" && pathname === "/contractor/support") return await pages.contractorSupportPage(req, res, query);
    if (method === "GET" && pathname === "/contractor/login") return await pages.contractorLoginPage(req, res, query);
    if (method === "GET" && pathname === "/contractor/signup") return await pages.contractorSignupPage(req, res, query);
    if (method === "GET" && pathname === "/contractor/account") return await pages.contractorAccountPage(req, res, query);
    if (method === "GET" && pathname === "/contractor/messages") return await pages.contractorMessagesPage(req, res);
    if (method === "GET" && pathname === "/account") return await pages.accountPage(req, res, query);
    if (method === "GET" && pathname === "/account/leases") return await pages.myLeasesPage(req, res);
    if (method === "GET" && pathname === "/account/messages") return await pages.messagesInboxPage(req, res);
    if (method === "GET" && pathname === "/seller/inquiries") return await pages.sellerInquiriesPage(req, res);
    if (method === "GET" && pathname === "/about") return await pages.aboutPage(req, res);
    if (method === "GET" && pathname === "/how-it-works") return await pages.howItWorksPage(req, res);
    if (method === "GET" && pathname === "/contact") return await pages.contactPage(req, res, query);

    let m;
    if (method === "GET" && (m = pathname.match(/^\/listing\/([^/]+)$/))) return await pages.listingDetailPage(req, res, m[1]);
    if (method === "GET" && (m = pathname.match(/^\/listing\/([^/]+)\/chat$/))) return await pages.listingChatPage(req, res, m[1], query);
    if (method === "GET" && (m = pathname.match(/^\/job\/([^/]+)\/chat$/))) return await pages.jobChatPage(req, res, m[1]);
    if (method === "GET" && (m = pathname.match(/^\/sell\/insights\/([^/]+)$/))) return await pages.listingInsightsPage(req, res, m[1]);
    if (method === "GET" && (m = pathname.match(/^\/book\/([^/]+)$/))) return await pages.bookPage(req, res, m[1], query);
    if (method === "GET" && (m = pathname.match(/^\/contract\/([^/]+)$/))) return await pages.contractViewPage(req, res, m[1]);
    if (method === "GET" && (m = pathname.match(/^\/admin\/deals\/([^/]+)$/))) return await pages.adminDealDetailPage(req, res, m[1]);
    if (method === "GET" && (m = pathname.match(/^\/claim\/([^/]+)$/))) return await pages.claimListingPage(req, res, m[1]);
    if (method === "GET" && (m = pathname.match(/^\/sell\/edit\/([^/]+)$/))) return await pages.editListingPage(req, res, m[1], query);
    if (method === "GET" && (m = pathname.match(/^\/api\/contractor-applications\/([^/]+)\/doc\/([^/]+)$/))) return await api.downloadContractorDoc(req, res, m[1], m[2]);
    if (method === "GET" && (m = pathname.match(/^\/api\/joborders\/([^/]+)\/messages$/))) return await api.getJobOrderMessagesJson(req, res, m[1]);
    if (method === "GET" && (m = pathname.match(/^\/api\/listings\/([^/]+)\/messages$/))) return await api.getListingMessagesJson(req, res, m[1], query);

    // ---------- POST api ----------
    if (method === "POST" && pathname === "/api/auth/signup") return await api.signup(req, res);
    if (method === "POST" && pathname === "/api/auth/login") return await api.login(req, res);
    if (method === "POST" && pathname === "/api/auth/logout") return await api.logout(req, res);
    if (method === "POST" && pathname === "/api/contractor-auth/signup") return await api.contractorSignup(req, res);
    if (method === "POST" && pathname === "/api/contractor-auth/login") return await api.contractorLogin(req, res);
    if (method === "POST" && pathname === "/api/contractor-auth/logout") return await api.contractorLogout(req, res);
    if (method === "POST" && pathname === "/api/listings") return await api.createListingHandler(req, res);
    if (method === "POST" && pathname === "/api/bookings/create-intent") return await api.createBookingIntentHandler(req, res);
    if (method === "POST" && pathname === "/api/bookings") return await api.createBookingHandler(req, res);
    if (method === "POST" && pathname === "/api/bdr/listings") return await api.createBdrListingHandler(req, res);
    if (method === "POST" && (m = pathname.match(/^\/api\/claim\/([^/]+)$/))) return await api.claimListingHandler(req, res, m[1]);
    if (method === "POST" && (m = pathname.match(/^\/api\/listings\/([^/]+)\/update$/))) return await api.updateListingHandler(req, res, m[1]);
    if (method === "POST" && (m = pathname.match(/^\/api\/listings\/([^/]+)\/photos$/))) return await api.addListingPhotosHandler(req, res, m[1]);
    if (method === "POST" && (m = pathname.match(/^\/api\/listings\/([^/]+)\/photos\/([^/]+)\/remove$/))) return await api.removeListingPhotoHandler(req, res, m[1], m[2]);
    if (method === "POST" && (m = pathname.match(/^\/api\/listings\/([^/]+)\/photos\/([^/]+)\/move\/(up|down)$/))) return await api.moveListingPhotoHandler(req, res, m[1], m[2], m[3]);
    if (method === "POST" && (m = pathname.match(/^\/api\/listings\/([^/]+)\/delete$/))) return await api.deleteListingHandler(req, res, m[1]);
    if (method === "POST" && pathname === "/api/account/profile") return await api.updateAccountProfile(req, res);
    if (method === "POST" && pathname === "/api/account/password") return await api.updateAccountPassword(req, res);
    if (method === "POST" && pathname === "/api/account/banking") return await api.updateAccountBanking(req, res);
    if (method === "POST" && pathname === "/api/account/connect-payouts") return await api.connectPayoutsHandler(req, res);
    if (method === "POST" && pathname === "/api/stripe/webhook") return await api.stripeWebhook(req, res);
    if (method === "POST" && pathname === "/api/contact") return await api.contactSubmit(req, res);
    if (method === "POST" && pathname === "/api/contractor/apply") return await api.contractorApplyHandler(req, res);
    if (method === "POST" && (m = pathname.match(/^\/api\/admin\/contractor-applications\/([^/]+)\/approve$/))) return await api.adminApproveContractorApplication(req, res, m[1]);
    if (method === "POST" && (m = pathname.match(/^\/api\/admin\/contractor-applications\/([^/]+)\/reject$/))) return await api.adminRejectContractorApplication(req, res, m[1]);
    if (method === "POST" && pathname === "/api/admin/staff") return await api.createStaffUser(req, res);
    if (method === "POST" && (m = pathname.match(/^\/api\/admin\/users\/([^/]+)\/permissions$/))) return await api.updateUserPermissions(req, res, m[1]);
    if (method === "POST" && (m = pathname.match(/^\/api\/admin\/listings\/([^/]+)\/remove$/))) return await api.removeListingHandler(req, res, m[1]);
    if (method === "POST" && (m = pathname.match(/^\/api\/admin\/listings\/([^/]+)\/restore$/))) return await api.restoreListingHandler(req, res, m[1]);

    if (method === "POST" && (m = pathname.match(/^\/api\/joborders\/([^/]+)\/access$/))) return await api.jobOrderAccess(req, res, m[1]);
    if (method === "POST" && (m = pathname.match(/^\/api\/joborders\/([^/]+)\/claim$/))) return await api.jobOrderClaim(req, res, m[1]);
    if (method === "POST" && (m = pathname.match(/^\/api\/joborders\/([^/]+)\/confirm-site$/))) return await api.jobOrderConfirmSite(req, res, m[1]);
    if (method === "POST" && (m = pathname.match(/^\/api\/joborders\/([^/]+)\/quote$/))) return await api.jobOrderQuote(req, res, m[1]);
    if (method === "POST" && (m = pathname.match(/^\/api\/joborders\/([^/]+)\/simulate-buyer-accept$/))) return await api.jobOrderSimulateBuyerAccept(req, res, m[1]);
    if (method === "POST" && (m = pathname.match(/^\/api\/joborders\/([^/]+)\/schedule$/))) return await api.jobOrderSchedule(req, res, m[1]);
    if (method === "POST" && (m = pathname.match(/^\/api\/joborders\/([^/]+)\/complete$/))) return await api.jobOrderComplete(req, res, m[1]);

    if (method === "POST" && (m = pathname.match(/^\/api\/bookings\/([^/]+)\/renew$/))) return await api.renewBookingHandler(req, res, m[1]);
    if (method === "POST" && (m = pathname.match(/^\/api\/bookings\/([^/]+)\/end-lease$/))) return await api.endLeaseHandler(req, res, m[1]);

    if (method === "POST" && (m = pathname.match(/^\/api\/joborders\/([^/]+)\/messages$/))) return await api.postJobOrderMessage(req, res, m[1]);
    if (method === "POST" && (m = pathname.match(/^\/api\/listings\/([^/]+)\/messages$/))) return await api.postListingMessage(req, res, m[1]);

    await notFound(req, res);
  } catch (err) {
    serverError(req, res, err);
  }
});

server.listen(PORT, () => {
  console.log(`Frontage running at http://localhost:${PORT}`);
  console.log(`Demo accounts (password: password123):`);
  console.log(`  marco@castlehillbjj.com.au   — seller (log in at /onboarding)`);
  console.log(`  jordan@openhouserealty.com.au — buyer (log in at /onboarding)`);
  console.log(`  alex@thesigndepot.com.au     — contractor, pre-approved (log in at /contractor/login)`);
  console.log(`  admin@frontage.app           — super-admin (log in at /onboarding, then visit /admin/staff)`);
});
