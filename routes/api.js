import crypto from "node:crypto";
import { readBody } from "../lib/body.js";
import * as db from "../lib/db.js";
import { hashPassword, verifyPassword, currentUser, sessionCookieHeader, clearCookieHeader, parseCookies, SESSION_COOKIE, isStrongPassword, PASSWORD_HINT, safeNext } from "../lib/auth.js";
import { runUpload, uploadListingPhotos, photoPublicUrl } from "../lib/upload.js";
import { LISTING_MIN_PHOTOS, LISTING_MAX_PHOTOS } from "../lib/categories.js";
import { parseListingInput } from "../lib/listingInput.js";
import { PERMISSIONS, hasPermission } from "../lib/permissions.js";
import { formLimit } from "../lib/rateLimit.js";
import { isEmailConfigured, trySend, verificationEmail, passwordResetEmail, contactForwardEmail, listingRemovedEmail, reportAlertEmail } from "../lib/email.js";
import { REPORT_REASONS } from "./pages.js";
import { parseMobile } from "../lib/countries.js";

function redirect(res, location, cookie) {
  const headers = { Location: location };
  if (cookie) headers["Set-Cookie"] = cookie;
  res.writeHead(302, headers);
  res.end();
}
function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function wantsJson(req) {
  return String(req.headers.accept || "").includes("application/json");
}
function withParam(path, key, value) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

// Listing and messaging are gated on a verified email once the email
// service exists — before that, nothing could deliver the link.
function emailUnverified(user) {
  return isEmailConfigured() && !user.emailVerifiedAt;
}

async function startVerification(user) {
  const token = crypto.randomBytes(24).toString("hex");
  await db.updateUser(user.id, { emailVerifyToken: token });
  await trySend(verificationEmail({ ...user }, token));
}

// ---------------- Auth ----------------
export async function signup(req, res) {
  const b = await readBody(req);
  const next = safeNext(b.next);
  const fullName = clean(b.fullName, 80);
  const email = clean(b.email, 200).toLowerCase();
  const mobileCountry = clean(b.mobileCountry, 4);
  const mobileNumber = clean(b.mobileNumber, 20);

  // Rejections carry the non-secret fields back so the form refills.
  const reject = (msg) => {
    const params = new URLSearchParams({ next, err: msg });
    if (fullName) params.set("fullName", fullName);
    if (email) params.set("email", email);
    if (mobileCountry) params.set("mobileCountry", mobileCountry);
    if (mobileNumber) params.set("mobileNumber", mobileNumber);
    return redirect(res, `/onboarding?${params}`);
  };

  if (!formLimit(req, "signup").allowed) return reject("Too many sign-ups from your connection — please try again later.");
  if (!fullName || !email || !b.password) return reject("Please fill in your name, email and a password.");
  if (!EMAIL_RE.test(email)) return reject("That email address doesn't look right.");
  const mobile = parseMobile(mobileCountry, mobileNumber);
  if (mobile.error) return reject(mobile.error);
  if (!isStrongPassword(b.password)) return reject(`Password too weak — ${PASSWORD_HINT}`);
  if (b.password !== b.confirmPassword) return reject("Password and confirmation don't match.");
  if (!b.agreeTerms) return reject("Please agree to the Terms and Privacy Policy.");
  if (await db.getUserByEmail(email)) return reject("An account with that email already exists — try logging in instead.");

  const { hash, salt } = hashPassword(b.password);
  const user = await db.createUser({ fullName, email, mobile: mobile.value, passwordHash: hash, passwordSalt: salt });
  let sentVerification = false;
  if (isEmailConfigured()) {
    await startVerification(user);
    sentVerification = true;
  } else {
    await db.updateUser(user.id, { emailVerifiedAt: new Date().toISOString() });
  }
  const session = await db.createSession(user.id);
  redirect(res, sentVerification ? `/welcome?next=${encodeURIComponent(next)}` : next, sessionCookieHeader(session.token));
}

// GET /verify?token=...
export async function verifyEmailHandler(req, res, query) {
  const user = await db.getUserByVerifyToken(query.get("token"));
  if (!user) return redirect(res, withParam("/account", "err", "That verification link is invalid or has already been used."));
  await db.updateUser(user.id, { emailVerifiedAt: new Date().toISOString(), emailVerifyToken: null });
  redirect(res, "/account?verified=1");
}

export async function resendVerificationHandler(req, res) {
  const user = await currentUser(req);
  if (!user) return redirect(res, "/onboarding?next=/account");
  if (user.emailVerifiedAt) return redirect(res, "/account");
  if (!formLimit(req, "resendVerification").allowed) return redirect(res, withParam("/account", "err", "We've sent a few already — check your spam folder, or try again in an hour."));
  await startVerification(user);
  redirect(res, "/account?updated=Verification email sent. Your email");
}

export async function login(req, res) {
  const b = await readBody(req);
  const next = safeNext(b.next);
  const email = clean(b.email, 200);
  const fail = (msg) => redirect(res, `/onboarding?${new URLSearchParams({ tab: "login", next, err: msg, loginEmail: email })}`);
  if (!formLimit(req, "login").allowed) return fail("Too many login attempts — wait 15 minutes and try again, or reset your password.");
  const user = await db.getUserByEmail(email);
  if (!user || !verifyPassword(String(b.password || ""), user.passwordHash, user.passwordSalt)) return fail("Incorrect email or password.");
  if (user.suspendedAt) return fail("This account has been suspended. Contact us if you think this is a mistake.");
  const session = await db.createSession(user.id);
  redirect(res, next, sessionCookieHeader(session.token));
}

export async function logout(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) await db.destroySession(token);
  redirect(res, "/", clearCookieHeader());
}

// Always answers the same way, whether or not the email has an account,
// so the form can't be used to discover who's registered.
export async function forgotPassword(req, res) {
  const b = await readBody(req);
  if (!formLimit(req, "forgot").allowed) return redirect(res, withParam("/forgot-password", "err", "Too many requests — try again in an hour."));
  const user = await db.getUserByEmail(clean(b.email, 200));
  if (user && !user.suspendedAt) {
    const token = await db.createPasswordReset(user.id);
    await trySend(passwordResetEmail(user, token));
  }
  redirect(res, "/forgot-password?sent=1");
}

export async function resetPassword(req, res) {
  const b = await readBody(req);
  const token = String(b.token || "");
  const user = await db.getUserByResetToken(token);
  if (!user) return redirect(res, "/reset-password?token=expired");
  const back = (msg) => redirect(res, `/reset-password?${new URLSearchParams({ token, err: msg })}`);
  if (!isStrongPassword(b.password)) return back(`Password too weak — ${PASSWORD_HINT}`);
  if (b.password !== b.confirmPassword) return back("Password and confirmation don't match.");
  const { hash, salt } = hashPassword(b.password);
  // Reset links are single-use, and every existing session is logged out.
  // Clicking the emailed link also proves the address, so verify it.
  await db.updateUser(user.id, {
    passwordHash: hash,
    passwordSalt: salt,
    passwordResetTokenHash: null,
    passwordResetExpiresAt: null,
    emailVerifiedAt: user.emailVerifiedAt || new Date().toISOString(),
  });
  await db.destroySessionsForUser(user.id);
  const session = await db.createSession(user.id);
  redirect(res, "/account?updated=Password", sessionCookieHeader(session.token));
}

// ---------------- Listings ----------------
// Create and edit both arrive as multipart from public/listing-form.js.
// `photoOrder` lists the final photo order as "e:<i>" (the listing's
// existing photo i) and "n:<i>" (uploaded file i). Without it (no-JS),
// photos are the existing ones followed by the new ones.
function assemblePhotos(existingPhotos, files, photoOrderRaw) {
  const newUrls = (files || []).map((f) => photoPublicUrl(f));
  let order;
  try {
    order = photoOrderRaw ? JSON.parse(photoOrderRaw) : null;
  } catch {
    order = null;
  }
  if (!Array.isArray(order)) return [...existingPhotos, ...newUrls];
  const photos = [];
  for (const token of order.slice(0, LISTING_MAX_PHOTOS)) {
    const m = /^([en]):(\d+)$/.exec(String(token));
    if (!m) continue;
    const url = m[1] === "e" ? existingPhotos[Number(m[2])] : newUrls[Number(m[2])];
    if (url && !photos.includes(url)) photos.push(url);
  }
  return photos;
}

async function saveListing(req, res, { user, existing }) {
  const formPath = existing ? `/sell/edit/${existing.id}` : "/sell/new";
  const fail = (status, error, fieldErrors = {}) =>
    wantsJson(req) ? json(res, status, { error, fieldErrors }) : redirect(res, withParam(formPath, "err", error || Object.values(fieldErrors)[0]));

  const uploadError = await runUpload(req, res, uploadListingPhotos);
  if (uploadError) return fail(400, uploadError, { photos: uploadError });

  const { values, fieldErrors } = await parseListingInput(req.body, { existing });
  const photos = assemblePhotos(existing ? existing.photos || [] : [], req.files, (req.body || {}).photoOrder);
  if (photos.length < LISTING_MIN_PHOTOS) fieldErrors.photos = "Add at least one photo of the space.";
  if (photos.length > LISTING_MAX_PHOTOS) fieldErrors.photos = `You can add up to ${LISTING_MAX_PHOTOS} photos.`;
  if (Object.keys(fieldErrors).length) return fail(422, "Please fix the highlighted fields.", fieldErrors);

  let listing;
  if (existing) {
    listing = await db.updateListing(existing.id, { ...values, photos });
  } else {
    listing = await db.createListing({ ownerId: user.id, ...values, photos });
  }
  const dest = existing ? `/sell?updated=1` : `/sell?created=1`;
  if (wantsJson(req)) return json(res, 200, { ok: true, id: listing.id, redirect: dest });
  redirect(res, dest);
}

export async function createListingHandler(req, res) {
  const user = await currentUser(req);
  if (!user) return wantsJson(req) ? json(res, 401, { error: "Please log in again." }) : redirect(res, "/onboarding?next=/sell/new");
  if (emailUnverified(user)) {
    const error = "Please verify your email before listing — check your inbox, or resend the link from your Account page.";
    return wantsJson(req) ? json(res, 403, { error }) : redirect(res, withParam("/sell/new", "err", error));
  }
  await saveListing(req, res, { user, existing: null });
}

async function requireOwnedListing(req, res, id) {
  const user = await currentUser(req);
  if (!user) {
    wantsJson(req) ? json(res, 401, { error: "Please log in again." }) : redirect(res, `/onboarding?next=${encodeURIComponent(`/sell/edit/${id}`)}`);
    return {};
  }
  const listing = await db.getListingById(id);
  if (!listing || listing.ownerId !== user.id || listing.status === "deleted") {
    wantsJson(req) ? json(res, 404, { error: "Listing not found." }) : redirect(res, "/sell");
    return {};
  }
  return { user, listing };
}

export async function updateListingHandler(req, res, id) {
  const { user, listing } = await requireOwnedListing(req, res, id);
  if (!listing) return;
  await saveListing(req, res, { user, existing: listing });
}

// Status "deleted" (not "removed"), so moderators can't restore it.
export async function deleteListingHandler(req, res, id) {
  const { listing } = await requireOwnedListing(req, res, id);
  if (!listing) return;
  await db.deleteListingByOwner(listing.id);
  redirect(res, "/sell?deleted=1");
}

// ---------------- Account ----------------
export async function updateAccountProfile(req, res) {
  const user = await currentUser(req);
  if (!user) return redirect(res, "/onboarding?next=/account");
  const b = await readBody(req);
  const fullName = clean(b.fullName, 80);
  const email = clean(b.email, 200).toLowerCase();
  const back = (msg) => redirect(res, withParam("/account", "err", msg));
  if (!fullName || !email) return back("Name and email are required.");
  if (!EMAIL_RE.test(email)) return back("That email address doesn't look right.");
  const googleBusinessUrl = clean(b.googleBusinessUrl, 300) || null;
  if (googleBusinessUrl) {
    let ok = false;
    try {
      ok = new URL(googleBusinessUrl).protocol === "https:";
    } catch {}
    if (!ok) return back("The Google Business link must start with https://");
  }
  const mobile = parseMobile(clean(b.mobileCountry, 4), clean(b.mobileNumber, 20));
  if (mobile.error) return back(mobile.error);
  const existing = await db.getUserByEmail(email);
  if (existing && existing.id !== user.id) return back("Another account already uses that email.");
  const emailChanged = email !== String(user.email).toLowerCase();
  await db.updateUser(user.id, {
    fullName,
    email,
    mobile: mobile.value,
    businessName: clean(b.businessName, 100) || null,
    googleBusinessUrl,
    ...(emailChanged ? { emailVerifiedAt: isEmailConfigured() ? null : new Date().toISOString() } : {}),
  });
  if (emailChanged && isEmailConfigured()) {
    await startVerification({ ...user, fullName, email });
    return redirect(res, "/account?updated=Profile saved. Check your new inbox to verify it — your email");
  }
  redirect(res, "/account?updated=Personal info");
}

export async function updateAccountPassword(req, res) {
  const user = await currentUser(req);
  if (!user) return redirect(res, "/onboarding?next=/account");
  const b = await readBody(req);
  const back = (msg) => redirect(res, withParam("/account#security", "err", msg));
  if (!verifyPassword(String(b.currentPassword || ""), user.passwordHash, user.passwordSalt)) return back("Current password is incorrect.");
  if (!isStrongPassword(b.newPassword)) return back(`Password too weak — ${PASSWORD_HINT}`);
  if (b.newPassword !== b.confirmPassword) return back("New password and confirmation don't match.");
  const { hash, salt } = hashPassword(b.newPassword);
  await db.updateUser(user.id, { passwordHash: hash, passwordSalt: salt });
  // Log out every other device, keep this one.
  await db.destroySessionsForUser(user.id);
  const session = await db.createSession(user.id);
  redirect(res, "/account?updated=Password", sessionCookieHeader(session.token));
}

export async function updateAccountNotifications(req, res) {
  const user = await currentUser(req);
  if (!user) return redirect(res, "/onboarding?next=/account");
  const b = await readBody(req);
  await db.updateUser(user.id, { notifyMessages: b.notifyMessages === "1" });
  redirect(res, "/account?updated=Notification settings");
}

// ---------------- Contact ----------------
export async function contactSubmit(req, res) {
  const b = await readBody(req);
  // Honeypot: bots fill every field, people never see this one.
  if (b.website) return redirect(res, "/contact?sent=1");
  const back = (msg) => redirect(res, withParam("/contact", "err", msg));
  const name = clean(b.name, 80);
  const email = clean(b.email, 200);
  const message = clean(b.message, 4000);
  if (!name || !email || !message) return back("Name, email and message are all required.");
  if (!EMAIL_RE.test(email)) return back("That email address doesn't look right.");
  if (!formLimit(req, "contact").allowed) return back("Too many messages from your connection — please try again later.");
  await db.createContactMessage({ name, email, message, topic: "general" });
  if (process.env.CONTACT_EMAIL) await trySend(contactForwardEmail(name, email, "general", message));
  redirect(res, "/contact?sent=1");
}

// ---------------- Reports ----------------
export async function createReportHandler(req, res) {
  const user = await currentUser(req);
  if (!user) return redirect(res, "/onboarding");
  const b = await readBody(req);
  const reason = REPORT_REASONS.some(([v]) => v === b.reason) ? b.reason : null;
  const details = clean(b.details, 2000) || null;
  let report;
  let backHref;
  let summary;

  if (b.targetType === "listing") {
    const listing = await db.getListingById(clean(b.listingId, 40));
    if (!listing || listing.status === "deleted") return redirect(res, "/");
    backHref = `/listing/${listing.id}/report`;
    if (!reason) return redirect(res, backHref);
    if (!formLimit(req, "report").allowed || (await db.hasOpenReportFrom(user.id, "listing", listing.id))) return redirect(res, `${backHref}?sent=1`);
    report = await db.createReport({ reporterId: user.id, targetType: "listing", listingId: listing.id, reportedUserId: listing.ownerId, reason, details });
    summary = `listing ${listing.id} “${listing.title}”`;
  } else if (b.targetType === "conversation") {
    const conversation = await db.getConversationById(clean(b.conversationId, 40));
    const role = db.conversationRole(conversation, user.id);
    if (!role) return redirect(res, "/account/messages");
    backHref = `/messages/${conversation.id}/report`;
    if (!reason) return redirect(res, backHref);
    if (!formLimit(req, "report").allowed || (await db.hasOpenReportFrom(user.id, "conversation", conversation.id))) return redirect(res, `${backHref}?sent=1`);
    report = await db.createReport({
      reporterId: user.id,
      targetType: "conversation",
      conversationId: conversation.id,
      listingId: conversation.listingId,
      reportedUserId: role === "buyer" ? conversation.sellerId : conversation.buyerId,
      reason,
      details,
    });
    summary = `conversation ${conversation.id} about “${conversation.listingTitle}”`;
  } else {
    return redirect(res, "/");
  }
  if (process.env.CONTACT_EMAIL) await trySend(reportAlertEmail(report, user, summary));
  redirect(res, `${backHref}?sent=1`);
}

// ---------------- Admin / moderation ----------------
async function requireModerator(req, res) {
  const user = await currentUser(req);
  if (!user || !hasPermission(user, "canAccessSupport")) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Not authorized.");
    return null;
  }
  return user;
}

async function removeListingAndNotify(listingId, reason, admin) {
  const removed = await db.removeListing(listingId, reason, admin.id);
  if (removed) {
    const owner = await db.getUserById(removed.ownerId);
    if (owner) await trySend(listingRemovedEmail(owner, removed, reason));
  }
  return removed;
}

export async function resolveReportHandler(req, res, id) {
  const admin = await requireModerator(req, res);
  if (!admin) return;
  const report = await db.getReportById(id);
  if (!report) return redirect(res, "/admin/reports");
  const b = await readBody(req);
  const note = clean(b.note, 500) || null;
  if (b.action === "remove_listing" && report.listingId) {
    await removeListingAndNotify(report.listingId, note || "Breach of the Frontage Terms of Use.", admin);
    await db.resolveReport(id, { status: "actioned", resolvedBy: admin.id, resolutionNote: `Listing removed${note ? `: ${note}` : ""}` });
  } else if (b.action === "suspend_user" && report.reportedUserId) {
    const target = await db.getUserById(report.reportedUserId);
    if (target && !target.isAdmin) await db.suspendUser(target.id, note || `Report ${id}`);
    await db.resolveReport(id, { status: "actioned", resolvedBy: admin.id, resolutionNote: `User suspended${note ? `: ${note}` : ""}` });
  } else if (b.action === "actioned") {
    await db.resolveReport(id, { status: "actioned", resolvedBy: admin.id, resolutionNote: note });
  } else if (b.action === "dismiss") {
    await db.resolveReport(id, { status: "dismissed", resolvedBy: admin.id, resolutionNote: note });
  }
  redirect(res, "/admin/reports?done=1");
}

export async function removeListingHandler(req, res, id) {
  const admin = await requireModerator(req, res);
  if (!admin) return;
  const b = await readBody(req);
  const reason = clean(b.reason, 500);
  if (!reason) return redirect(res, "/admin/listings");
  await removeListingAndNotify(id, reason, admin);
  redirect(res, "/admin/listings?done=1");
}

export async function restoreListingHandler(req, res, id) {
  const admin = await requireModerator(req, res);
  if (!admin) return;
  await db.restoreListing(id);
  redirect(res, "/admin/listings?done=1");
}

export async function suspendUserHandler(req, res, id) {
  const admin = await requireModerator(req, res);
  if (!admin) return;
  const target = await db.getUserById(id);
  if (target && !target.isAdmin && target.id !== admin.id) {
    const b = await readBody(req);
    await db.suspendUser(id, clean(b.reason, 500) || null);
  }
  redirect(res, `/admin/users?done=1&q=${encodeURIComponent(id)}`);
}

export async function unsuspendUserHandler(req, res, id) {
  const admin = await requireModerator(req, res);
  if (!admin) return;
  await db.unsuspendUser(id);
  redirect(res, `/admin/users?done=1&q=${encodeURIComponent(id)}`);
}

async function requireSuperAdmin(req, res) {
  const user = await currentUser(req);
  if (!user || !user.isAdmin) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Super-admin only.");
    return null;
  }
  return user;
}

// Grants moderation to an existing account, by email.
export async function grantStaffHandler(req, res) {
  if (!(await requireSuperAdmin(req, res))) return;
  const b = await readBody(req);
  const target = await db.getUserByEmail(clean(b.email, 200));
  if (!target) return redirect(res, withParam("/admin/staff", "err", "No account with that email — ask them to sign up first."));
  const patch = {};
  for (const p of PERMISSIONS) patch[p.key] = b[p.key] === "1";
  await db.updateUser(target.id, patch);
  redirect(res, "/admin/staff?done=1");
}

export async function updateUserPermissions(req, res, id) {
  if (!(await requireSuperAdmin(req, res))) return;
  const target = await db.getUserById(id);
  if (!target || target.isAdmin) return redirect(res, "/admin/staff");
  const b = await readBody(req);
  const patch = {};
  for (const p of PERMISSIONS) patch[p.key] = b[p.key] === "1";
  await db.updateUser(id, patch);
  redirect(res, "/admin/staff?done=1");
}
