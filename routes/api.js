import fs from "node:fs";
import path from "node:path";
import { readBody } from "../lib/body.js";
import * as db from "../lib/db.js";
import {
  hashPassword,
  verifyPassword,
  currentUser,
  currentContractor,
  sessionCookieHeader,
  clearCookieHeader,
  contractorSessionCookieHeader,
  clearContractorCookieHeader,
  parseCookies,
  CONTRACTOR_SESSION_COOKIE,
  isStrongPassword,
  PASSWORD_HINT,
} from "../lib/auth.js";
import { runUpload, uploadContractorDocs, uploadListingPhotos, CONTRACTOR_DOCS_DIR, getContractorDocUrl, isS3Configured, photoPublicUrl } from "../lib/upload.js";
import { isValidCategory } from "../lib/categories.js";
import { estimateEyes } from "../lib/format.js";
import { PERMISSIONS, hasPermission } from "../lib/permissions.js";
import { approximateCoords } from "../lib/geo.js";
import { isStripeConfigured, createPaymentIntent, retrievePaymentIntent, constructWebhookEvent, createConnectAccount, createConnectOnboardingLink } from "../lib/payments.js";
import {
  isEmailConfigured,
  sendEmail,
  verificationEmail,
  bookingSellerEmail,
  bookingBuyerEmail,
  jobUpdateEmail,
  contactForwardEmail,
} from "../lib/email.js";
import crypto from "node:crypto";

// Emails are best-effort — a provider outage must never fail the user
// action that triggered the email (booking, signup, etc.).
async function trySend(email) {
  try {
    await sendEmail(email);
  } catch (err) {
    console.error("Email send failed:", err.message);
  }
}

function redirect(res, location, cookie) {
  const headers = { Location: location };
  if (cookie) headers["Set-Cookie"] = cookie;
  res.writeHead(302, headers);
  res.end();
}

function badRequest(res, message) {
  res.writeHead(400, { "Content-Type": "text/plain" });
  res.end(message);
}

// ---------------- Auth ----------------
export async function signup(req, res) {
  const body = await readBody(req);
  const { fullName, email, mobile, password, confirmPassword, next } = body;

  // Every rejection carries the non-secret fields back so the form repopulates
  // — retyping name/email/mobile because the password was weak is needless
  // friction. Passwords are deliberately never echoed back into the URL.
  const reject = (msg) => {
    const params = new URLSearchParams({ next: next || "/", err: msg });
    if (fullName) params.set("fullName", fullName);
    if (email) params.set("email", email);
    if (mobile) params.set("mobile", mobile);
    return redirect(res, `/onboarding?${params.toString()}`);
  };

  if (!fullName || !email || !mobile || !password) return reject("Please fill every field.");
  if (!isStrongPassword(password)) return reject("Password too weak — " + PASSWORD_HINT);
  if (password !== confirmPassword) return reject("Password and confirmation don't match.");
  if (await db.getUserByEmail(email)) return reject("An account with that email already exists — try logging in instead.");
  const { hash, salt } = hashPassword(password);
  const user = await db.createUser({ fullName, email, mobile, passwordHash: hash, passwordSalt: salt });
  // Email verification: new accounts get a token and a verify link. When the
  // email service isn't configured yet, accounts are auto-verified so the
  // flow never dead-ends (nothing could deliver the link).
  let sentVerification = false;
  if (isEmailConfigured()) {
    const token = crypto.randomBytes(24).toString("hex");
    await db.updateUser(user.id, { emailVerifyToken: token });
    await trySend(verificationEmail(user, token));
    sentVerification = true;
  } else {
    await db.updateUser(user.id, { emailVerifiedAt: new Date().toISOString() });
  }
  const session = await db.createSession(user.id);
  // Land on an explicit "check your inbox" confirmation rather than silently
  // dropping the new user back on the browse page wondering what happened.
  // With no email service configured there's nothing to check, so skip it.
  const dest = sentVerification ? `/welcome?next=${encodeURIComponent(next || "/")}` : next || "/";
  redirect(res, dest, sessionCookieHeader(session.token));
}

// GET /verify?token=... — the link from the verification email.
export async function verifyEmailHandler(req, res, query) {
  const user = await db.getUserByVerifyToken(query.get("token"));
  if (!user) return badRequest(res, "This verification link is invalid or has already been used.");
  await db.updateUser(user.id, { emailVerifiedAt: new Date().toISOString(), emailVerifyToken: null });
  redirect(res, "/account?verified=1");
}

export async function resendVerificationHandler(req, res) {
  const user = await currentUser(req);
  if (!user) return redirect(res, "/onboarding?next=/account");
  if (user.emailVerifiedAt) return redirect(res, "/account");
  const token = user.emailVerifyToken || crypto.randomBytes(24).toString("hex");
  await db.updateUser(user.id, { emailVerifyToken: token });
  await trySend(verificationEmail(user, token));
  redirect(res, "/account?updated=Verification email resent — check your inbox. Email");
}

// Listing a space and paying for a lease are gated on a verified email once
// the email service exists — before that there's no way to deliver the link,
// so the gate stays open (see signup above).
function emailUnverified(user) {
  return isEmailConfigured() && !user.emailVerifiedAt;
}

export async function login(req, res) {
  const body = await readBody(req);
  const { email, password, next } = body;
  const user = await db.getUserByEmail(email || "");
  if (!user || !verifyPassword(password || "", user.passwordHash, user.passwordSalt)) {
    return redirect(res, `/onboarding?next=${encodeURIComponent(next || "/")}&err=${encodeURIComponent("Incorrect email or password.")}`);
  }
  const session = await db.createSession(user.id);
  redirect(res, next || "/", sessionCookieHeader(session.token));
}

export async function logout(req, res) {
  const cookies = parseCookies(req);
  const token = cookies["frontage_session"];
  if (token) await db.destroySession(token);
  redirect(res, "/", clearCookieHeader());
}

// ---------------- Contractor auth (fully separate identity space) ----------------
export async function contractorSignup(req, res) {
  const body = await readBody(req);
  const { fullName, email, mobile, password, confirmPassword, next } = body;
  if (!fullName || !email || !mobile || !password) {
    return redirect(res, `/contractor/signup?next=${encodeURIComponent(next || "/contractor/apply")}&err=${encodeURIComponent("Please fill every field.")}`);
  }
  if (!isStrongPassword(password)) {
    return redirect(res, `/contractor/signup?next=${encodeURIComponent(next || "/contractor/apply")}&err=${encodeURIComponent("Password too weak — " + PASSWORD_HINT)}`);
  }
  if (password !== confirmPassword) {
    return redirect(res, `/contractor/signup?next=${encodeURIComponent(next || "/contractor/apply")}&err=${encodeURIComponent("Password and confirmation don't match.")}`);
  }
  if (await db.getContractorByEmail(email)) {
    return redirect(res, `/contractor/signup?next=${encodeURIComponent(next || "/contractor/apply")}&err=${encodeURIComponent("An account with that email already exists — try logging in instead.")}`);
  }
  const { hash, salt } = hashPassword(password);
  const contractor = await db.createContractorAccount({ fullName, email, mobile, passwordHash: hash, passwordSalt: salt });
  const session = await db.createContractorSession(contractor.id);
  redirect(res, next || "/contractor/apply", contractorSessionCookieHeader(session.token));
}

export async function contractorLogin(req, res) {
  const body = await readBody(req);
  const { email, password, next } = body;
  const contractor = await db.getContractorByEmail(email || "");
  if (!contractor || !verifyPassword(password || "", contractor.passwordHash, contractor.passwordSalt)) {
    return redirect(res, `/contractor/login?next=${encodeURIComponent(next || "/contractor/ping")}&err=${encodeURIComponent("Incorrect email or password.")}`);
  }
  const session = await db.createContractorSession(contractor.id);
  redirect(res, next || "/contractor/ping", contractorSessionCookieHeader(session.token));
}

export async function contractorLogout(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[CONTRACTOR_SESSION_COOKIE];
  if (token) await db.destroyContractorSession(token);
  redirect(res, "/contractor/login", clearContractorCookieHeader());
}

// ---------------- Listings ----------------
export async function createListingHandler(req, res) {
  const user = await currentUser(req);
  if (!user) return redirect(res, "/onboarding?next=/sell/new");
  if (emailUnverified(user)) return redirect(res, `/sell/new?err=${encodeURIComponent("Please verify your email before listing a space — check your inbox, or resend the link from your Account page.")}`);
  const ok = await runUpload(req, res, uploadListingPhotos, {
    onError: (message) => redirect(res, `/sell/new?err=${encodeURIComponent(message)}`),
  });
  if (!ok) return;
  const b = req.body || {};
  const sizeW = parseInt(b.sizeW, 10);
  const sizeH = parseInt(b.sizeH, 10);
  const price = parseFloat(b.price);
  if (!b.title || !b.venue || !b.suburb || !b.address || !sizeW || !sizeH || !price || sizeW <= 0 || sizeH <= 0 || price <= 0) {
    return badRequest(res, "Missing required listing fields, or width/height/price must be greater than zero.");
  }
  const category = isValidCategory(b.category) ? b.category : "gym";

  const patch = { businessName: user.businessName || b.venue, address: user.address || b.address };
  if (!user.bankAccount) {
    if (!b.bankBsb || !b.bankAccount || !b.bankAccountName) {
      return badRequest(res, "Payout details are required the first time you list.");
    }
    patch.bankBsb = b.bankBsb;
    patch.bankAccount = b.bankAccount;
    patch.bankAccountName = b.bankAccountName;
  }
  await db.updateUser(user.id, patch);

  // Uploaded files land wherever lib/upload.js is configured to put them
  // (S3/R2 public bucket in production, local disk in zero-config dev) —
  // photoPublicUrl resolves the right public URL either way.
  const photos = (req.files || []).map((f) => photoPublicUrl(f));
  const estimatedEyesPerDay = parseInt(b.estimatedEyesPerDay, 10) || estimateEyes({ category, sizeW, sizeH });
  const manualLat = parseFloat(b.lat);
  const manualLng = parseFloat(b.lng);
  const coords =
    Number.isFinite(manualLat) && Number.isFinite(manualLng) ? { lat: manualLat, lng: manualLng } : await approximateCoords(b.suburb, b.country);

  await db.createListing({
    ownerId: user.id,
    title: b.title,
    venue: b.venue,
    category,
    subtype: b.subtype || null,
    suburb: b.suburb,
    postcode: b.postcode || null,
    country: b.country || null,
    address: b.address,
    sizeW,
    sizeH,
    price,
    desc: b.desc || "",
    photos,
    estimatedEyesPerDay,
    lat: coords.lat,
    lng: coords.lng,
  });

  redirect(res, "/sell/new?created=1");
}

// ---------------- BDR: pre-built listings + claim link ----------------
export async function createBdrListingHandler(req, res) {
  const user = await currentUser(req);
  if (!user || !hasPermission(user, "canCreateBdrListings")) return badRequest(res, "Not authorized.");
  const ok = await runUpload(req, res, uploadListingPhotos, {
    onError: (message) => redirect(res, `/sell/bdr-new?err=${encodeURIComponent(message)}`),
  });
  if (!ok) return;
  const b = req.body || {};
  const sizeW = parseInt(b.sizeW, 10);
  const sizeH = parseInt(b.sizeH, 10);
  const price = parseFloat(b.price);
  if (!b.title || !b.venue || !b.suburb || !b.address || !sizeW || !sizeH || !price || sizeW <= 0 || sizeH <= 0 || price <= 0) {
    return badRequest(res, "Missing required listing fields, or width/height/price must be greater than zero.");
  }
  const category = isValidCategory(b.category) ? b.category : "gym";
  const photos = (req.files || []).map((f) => photoPublicUrl(f));
  const estimatedEyesPerDay = estimateEyes({ category, sizeW, sizeH });
  const coords = await approximateCoords(b.suburb, b.country);

  const listing = await db.createDraftListing({
    title: b.title,
    venue: b.venue,
    category,
    subtype: b.subtype || null,
    suburb: b.suburb,
    postcode: b.postcode || null,
    country: b.country || null,
    address: b.address,
    sizeW,
    sizeH,
    price,
    desc: b.desc || "",
    photos,
    estimatedEyesPerDay,
    lat: coords.lat,
    lng: coords.lng,
    createdByBdrId: user.id,
    bdrContactName: b.bdrContactName || null,
    bdrContactEmail: b.bdrContactEmail || null,
  });

  const claimUrl = `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}/claim/${listing.claimToken}`;
  redirect(res, `/sell/bdr-new?created=1&claimUrl=${encodeURIComponent(claimUrl)}`);
}

export async function listingsMapJson(req, res) {
  const listings = await Promise.all(
    (await db.getListings()).map(async (l) => {
      const owner = l.ownerId ? await db.getUserById(l.ownerId) : null;
      return {
        id: l.id,
        title: l.title,
        suburb: l.suburb,
        category: l.category,
        price: l.price,
        lat: l.lat,
        lng: l.lng,
        googleBusinessUrl: owner && owner.googleBusinessUrl ? owner.googleBusinessUrl : null,
      };
    })
  );
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ listings }));
}

export async function claimListingHandler(req, res, token) {
  const user = await currentUser(req);
  if (!user) return redirect(res, `/onboarding?next=${encodeURIComponent(`/claim/${token}`)}`);
  const claimed = await db.claimListing(token, user.id);
  if (!claimed) return badRequest(res, "This claim link is no longer valid.");
  redirect(res, `/listing/${claimed.id}`);
}

// ---------------- Listing management (owner: edit details / photos / delete) ----------------
async function requireOwnedListing(req, res, id) {
  const user = await currentUser(req);
  if (!user) {
    redirect(res, `/onboarding?next=${encodeURIComponent(`/sell/edit/${id}`)}`);
    return null;
  }
  const listing = await db.getListingById(id);
  if (!listing || listing.ownerId !== user.id) {
    badRequest(res, "Not your listing.");
    return null;
  }
  return listing;
}

export async function updateListingHandler(req, res, id) {
  const listing = await requireOwnedListing(req, res, id);
  if (!listing) return;
  const b = await readBody(req);
  const sizeW = parseInt(b.sizeW, 10);
  const sizeH = parseInt(b.sizeH, 10);
  const price = parseFloat(b.price);
  if (!b.title || !b.venue || !b.suburb || !b.address || !sizeW || !sizeH || !price || sizeW <= 0 || sizeH <= 0 || price <= 0) {
    return badRequest(res, "Missing required listing fields, or width/height/price must be greater than zero.");
  }
  const category = isValidCategory(b.category) ? b.category : listing.category;
  const estimatedEyesPerDay = parseInt(b.estimatedEyesPerDay, 10) || estimateEyes({ category, sizeW, sizeH });
  const manualLat = parseFloat(b.lat);
  const manualLng = parseFloat(b.lng);
  const locationChanged = b.suburb !== listing.suburb || (b.country || null) !== (listing.country || null);
  let coords;
  if (Number.isFinite(manualLat) && Number.isFinite(manualLng)) {
    coords = { lat: manualLat, lng: manualLng };
  } else if (locationChanged) {
    coords = await approximateCoords(b.suburb, b.country);
  } else {
    coords = { lat: listing.lat, lng: listing.lng };
  }

  await db.updateListing(id, {
    title: b.title,
    venue: b.venue,
    category,
    subtype: b.subtype || null,
    suburb: b.suburb,
    postcode: b.postcode || null,
    country: b.country || null,
    address: b.address,
    sizeW,
    sizeH,
    price,
    desc: b.desc || "",
    estimatedEyesPerDay,
    lat: coords.lat,
    lng: coords.lng,
  });
  redirect(res, `/sell/edit/${id}?updated=1`);
}

export async function addListingPhotosHandler(req, res, id) {
  const listing = await requireOwnedListing(req, res, id);
  if (!listing) return;
  const ok = await runUpload(req, res, uploadListingPhotos, {
    onError: (message) => redirect(res, `/sell/edit/${id}?err=${encodeURIComponent(message)}`),
  });
  if (!ok) return;
  const existingPhotos = listing.photos || [];
  const newPhotos = (req.files || []).map((f) => photoPublicUrl(f));
  if (existingPhotos.length + newPhotos.length > 8) {
    return badRequest(res, "A listing can have at most 8 photos — remove some before adding more.");
  }
  await db.updateListing(id, { photos: [...existingPhotos, ...newPhotos] });
  redirect(res, `/sell/edit/${id}?updated=1`);
}

export async function removeListingPhotoHandler(req, res, id, index) {
  const listing = await requireOwnedListing(req, res, id);
  if (!listing) return;
  const photos = (listing.photos || []).slice();
  const i = parseInt(index, 10);
  if (i >= 0 && i < photos.length) photos.splice(i, 1);
  await db.updateListing(id, { photos });
  redirect(res, `/sell/edit/${id}`);
}

export async function moveListingPhotoHandler(req, res, id, index, direction) {
  const listing = await requireOwnedListing(req, res, id);
  if (!listing) return;
  const photos = (listing.photos || []).slice();
  const i = parseInt(index, 10);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i >= 0 && i < photos.length && j >= 0 && j < photos.length) {
    [photos[i], photos[j]] = [photos[j], photos[i]];
  }
  await db.updateListing(id, { photos });
  redirect(res, `/sell/edit/${id}`);
}

// Reuses the same removeListing() the admin moderation tools call — a
// seller "deleting" their own listing and a customer-service rep removing
// one for cause both just take it off browse (status: "removed"), keeping
// booking/job-order history intact rather than a hard SQL delete (which
// would violate the FK from bookings/job_orders to listings anyway once
// a listing has ever been leased).
export async function deleteListingHandler(req, res, id) {
  const listing = await requireOwnedListing(req, res, id);
  if (!listing) return;
  await db.removeListing(id, "Removed by the listing owner.", listing.ownerId);
  redirect(res, "/sell/new?deleted=1");
}

// ---------------- Bookings ----------------
// Backs the embedded Stripe Elements card field on bookPage — creates a
// PaymentIntent for exactly this listing+term, without creating a booking
// yet (that only happens once the payment is verified, in
// createBookingHandler below).
export async function createBookingIntentHandler(req, res) {
  const user = await currentUser(req);
  if (!user) return forbiddenJson(res);
  if (emailUnverified(user)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Please verify your email before booking — check your inbox, or resend the link from your Account page." }));
  }
  const b = await readBody(req);
  const listing = await db.getListingById(b.listingId);
  if (!listing || listing.status !== "live") return badRequest(res, "Listing not found.");
  const term = parseInt(b.term, 10);
  if (![6, 12].includes(term)) return badRequest(res, "Lease terms are 6 or 12 months.");
  const amount = listing.price * term;
  const intent = await createPaymentIntent({
    amount,
    description: `Frontage lease — ${listing.title}`,
    metadata: { listingId: listing.id, buyerId: user.id, term: String(term) },
  });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ clientSecret: intent.clientSecret, paymentIntentId: intent.id }));
}

export async function createBookingHandler(req, res) {
  const user = await currentUser(req);
  if (!user) return redirect(res, "/onboarding?next=/");
  if (emailUnverified(user)) return badRequest(res, "Please verify your email before booking.");
  const b = await readBody(req);
  const listing = await db.getListingById(b.listingId);
  if (!listing || listing.status !== "live") return badRequest(res, "Listing not found.");
  const term = parseInt(b.term, 10);
  if (![6, 12].includes(term) || !b.signature) return badRequest(res, "Lease terms are 6 or 12 months, and a signature is required.");

  let paymentIntentId = null;
  if (isStripeConfigured()) {
    // Never trust the client's word that payment succeeded — re-fetch the
    // PaymentIntent from Stripe and check its status and amount ourselves
    // before a booking (and the seller's payout entitlement) is created.
    if (!b.paymentIntentId) return badRequest(res, "Payment was not completed.");
    const intent = await retrievePaymentIntent(b.paymentIntentId);
    const expectedTotal = listing.price * term;
    if (intent.status !== "succeeded" || Math.abs(intent.amount - expectedTotal) > 0.01) {
      return badRequest(res, "Payment could not be verified — please try again.");
    }
    paymentIntentId = b.paymentIntentId;
  } else {
    // Stub mode (no STRIPE_SECRET_KEY yet) — original plaintext-card flow.
    if (!user.cardLast4) {
      const digits = (b.cardNumber || "").replace(/\D/g, "");
      if (digits.length < 4) return badRequest(res, "A payment method is required the first time you book.");
      await db.updateUser(user.id, { cardLast4: digits.slice(-4) });
    }
  }

  const { booking } = await db.createBookingBundle({ listing, buyerId: user.id, term, signature: b.signature, paymentIntentId });

  const seller = listing.ownerId ? await db.getUserById(listing.ownerId) : null;
  if (seller) await trySend(bookingSellerEmail(seller, listing, booking));
  await trySend(bookingBuyerEmail(user, listing, booking));

  redirect(res, `/book/${listing.id}?confirmed=${booking.id}`);
}

// ---------------- Chat ----------------
async function messagesJson(res, messages, currentPersonId) {
  const withNames = await Promise.all(
    messages.map(async (m) => {
      const sender = await db.getPersonById(m.senderId);
      return { ...m, senderName: (sender || {}).fullName || "Unknown" };
    })
  );
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ messages: withNames, currentUserId: currentPersonId }));
}
function forbiddenJson(res) {
  res.writeHead(403, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not authorized" }));
}
// A job order's two parties live in different identity spaces (seller is a
// `users` account, contractor is a `contractors` account) — this resolves
// whichever one is currently logged in for a given job, or null.
async function currentJobOrderParty(req, job) {
  const user = await currentUser(req);
  if (user && job.sellerId === user.id) return user;
  const contractor = await currentContractor(req);
  if (contractor && job.contractorId === contractor.id) return contractor;
  return null;
}

export async function postJobOrderMessage(req, res, id) {
  const job = await db.getJobOrderById(id);
  const person = job && (await currentJobOrderParty(req, job));
  if (!job || !person) return badRequest(res, "Not authorized for this job order.");
  const b = await readBody(req);
  if (b.body && b.body.trim()) await db.createMessage({ threadType: "job", threadId: id, senderId: person.id, body: b.body.trim() });
  // Sent from either the inline chat block (seller/jobs, contractor/board)
  // or a standalone chat page (/job/:id/chat, /contractor/messages) — bounce
  // back to whichever it was.
  const referer = req.headers.referer;
  if (referer && referer.includes(`/job/${id}/chat`)) return redirect(res, `/job/${id}/chat`);
  redirect(res, job.sellerId === person.id ? "/seller/jobs" : "/contractor/board");
}

export async function getJobOrderMessagesJson(req, res, id) {
  const job = await db.getJobOrderById(id);
  const person = job && (await currentJobOrderParty(req, job));
  if (!job || !person) return forbiddenJson(res);
  await messagesJson(res, await db.getMessagesForThread("job", id), person.id);
}

export async function postListingMessage(req, res, listingId) {
  const user = await currentUser(req);
  if (!user) return redirect(res, `/onboarding?next=/listing/${listingId}`);
  const listing = await db.getListingById(listingId);
  if (!listing) return badRequest(res, "Listing not found.");
  const b = await readBody(req);
  const isOwner = listing.ownerId === user.id;
  const buyerId = isOwner ? b.buyerId : user.id;
  if (!buyerId) return badRequest(res, "Missing buyer.");
  if (isOwner && (await db.getMessagesForThread("listing", `${listingId}:${buyerId}`)).length === 0) {
    return badRequest(res, "No existing thread with that buyer.");
  }
  if (b.body && b.body.trim()) await db.createMessage({ threadType: "listing", threadId: `${listingId}:${buyerId}`, senderId: user.id, body: b.body.trim() });
  redirect(res, isOwner ? `/listing/${listingId}/chat?buyer=${encodeURIComponent(buyerId)}` : `/listing/${listingId}/chat`);
}

export async function getListingMessagesJson(req, res, listingId, query) {
  const user = await currentUser(req);
  const listing = await db.getListingById(listingId);
  if (!user || !listing) return forbiddenJson(res);
  const isOwner = listing.ownerId === user.id;
  const buyerId = isOwner ? query.get("buyer") : user.id;
  if (!buyerId) return forbiddenJson(res);
  await messagesJson(res, await db.getMessagesForThread("listing", `${listingId}:${buyerId}`), user.id);
}

// ---------------- Leases ----------------
export async function renewBookingHandler(req, res, id) {
  const user = await currentUser(req);
  const booking = await db.getBookingById(id);
  if (!user || !booking || booking.buyerId !== user.id) return badRequest(res, "Not your lease.");
  const b = await readBody(req);
  const extraMonths = parseInt(b.extraMonths, 10) || 12;
  await db.renewBooking(id, extraMonths);
  redirect(res, "/account/leases");
}

export async function endLeaseHandler(req, res, id) {
  const user = await currentUser(req);
  const booking = await db.getBookingById(id);
  if (!user || !booking || booking.buyerId !== user.id) return badRequest(res, "Not your lease.");
  await db.setBookingAutoRenew(id, false);
  redirect(res, "/account/leases");
}

// ---------------- Job orders ----------------
export async function jobOrderAccess(req, res, id) {
  const user = await currentUser(req);
  if (!user) return redirect(res, "/onboarding?next=/seller/jobs");
  const job = await db.getJobOrderById(id);
  if (!job || job.sellerId !== user.id) return badRequest(res, "Not your job order.");
  const b = await readBody(req);
  await db.updateJobOrder(id, { sellerAccessConfirmed: true, installWindow: b.installWindow || job.installWindow || "12–16 Aug" });
  redirect(res, "/seller/jobs");
}

export async function jobOrderClaim(req, res, id) {
  const contractor = await currentContractor(req);
  if (!contractor) return redirect(res, "/contractor/login?next=/contractor/ping");
  if (!contractor.isApprovedContractor) return redirect(res, "/contractor/ping");
  const job = await db.getJobOrderById(id);
  if (!job || job.status !== "broadcast") return redirect(res, "/contractor/ping");
  await db.updateJobOrder(id, { contractorId: contractor.id, status: "new" });
  const listing = await db.getListingById(job.listingId);
  const seller = job.sellerId ? await db.getUserById(job.sellerId) : null;
  if (seller && listing) await trySend(jobUpdateEmail(seller, listing, job, `${contractor.businessName || contractor.fullName} has accepted the install job — please confirm an access window from your job orders page`));
  redirect(res, "/contractor/board");
}

export async function jobOrderConfirmSite(req, res, id) {
  const contractor = await currentContractor(req);
  const job = await db.getJobOrderById(id);
  if (!contractor || !job || job.contractorId !== contractor.id) return badRequest(res, "Not your job order.");
  await db.updateJobOrder(id, { status: "site_confirmed" });
  redirect(res, "/contractor/board");
}

export async function jobOrderQuote(req, res, id) {
  const contractor = await currentContractor(req);
  const job = await db.getJobOrderById(id);
  if (!contractor || !job || job.contractorId !== contractor.id) return badRequest(res, "Not your job order.");
  const b = await readBody(req);
  const quote = { print: Math.max(0, Number(b.print) || 0), install: Math.max(0, Number(b.install) || 0), uninstall: Math.max(0, Number(b.uninstall) || 0) };
  await db.updateJobOrder(id, { status: "quote_sent", quote });
  redirect(res, "/contractor/board");
}

export async function jobOrderSimulateBuyerAccept(req, res, id) {
  const contractor = await currentContractor(req);
  const job = await db.getJobOrderById(id);
  if (!contractor || !job || job.contractorId !== contractor.id) return badRequest(res, "Not your job order.");
  await db.updateJobOrder(id, { status: "quote_accepted" });
  redirect(res, "/contractor/board");
}

export async function jobOrderSchedule(req, res, id) {
  const contractor = await currentContractor(req);
  const job = await db.getJobOrderById(id);
  if (!contractor || !job || job.contractorId !== contractor.id) return badRequest(res, "Not your job order.");
  const b = await readBody(req);
  // The install_date column is a real timestamp — validate before it ever
  // reaches Postgres so a malformed date is a friendly message, not a crash.
  const parsed = new Date(b.installDate);
  if (!b.installDate || isNaN(parsed.getTime())) return badRequest(res, "Please pick a valid install date from the date picker.");
  await db.updateJobOrder(id, { status: "scheduled", installDate: parsed.toISOString() });
  const listing = await db.getListingById(job.listingId);
  if (listing) {
    const seller = job.sellerId ? await db.getUserById(job.sellerId) : null;
    const buyer = job.buyerId ? await db.getUserById(job.buyerId) : null;
    const when = parsed.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
    if (seller) await trySend(jobUpdateEmail(seller, listing, job, `install scheduled for ${when}`));
    if (buyer) await trySend(jobUpdateEmail(buyer, listing, job, `install scheduled for ${when}`));
  }
  redirect(res, "/contractor/board");
}

export async function jobOrderComplete(req, res, id) {
  const contractor = await currentContractor(req);
  const job = await db.getJobOrderById(id);
  if (!contractor || !job || job.contractorId !== contractor.id) return badRequest(res, "Not your job order.");
  await db.updateJobOrder(id, { status: "installed" });
  const listing = await db.getListingById(job.listingId);
  if (listing) {
    const seller = job.sellerId ? await db.getUserById(job.sellerId) : null;
    const buyer = job.buyerId ? await db.getUserById(job.buyerId) : null;
    if (seller) await trySend(jobUpdateEmail(seller, listing, job, "install confirmed complete — your payout has been released and the lease is now active"));
    if (buyer) await trySend(jobUpdateEmail(buyer, listing, job, "your ad is installed and live — the lease clock has started"));
  }
  redirect(res, "/contractor/board");
}

// ---------------- Contact ----------------
export async function contactSubmit(req, res) {
  const b = await readBody(req);
  if (!b.name || !b.email || !b.message) return badRequest(res, "Name, email, and message are required.");
  const topic = b.topic === "contractor" ? "contractor" : "general";
  await db.createContactMessage({ name: b.name, email: b.email, message: b.message, topic });
  // Also forward to the CONTACT_EMAIL inbox (env-configured) so submissions
  // reach a real mailbox, not just the admin dashboard.
  if (process.env.CONTACT_EMAIL) await trySend(contactForwardEmail(b.name, b.email, topic, b.message));
  redirect(res, topic === "contractor" ? "/contractor/support?sent=1" : "/contact?sent=1");
}

// ---------------- Account ----------------
export async function updateAccountProfile(req, res) {
  const user = await currentUser(req);
  if (!user) return redirect(res, "/onboarding?next=/account");
  const b = await readBody(req);
  if (!b.fullName || !b.email || !b.mobile) {
    return redirect(res, `/account?err=${encodeURIComponent("Name, email, and mobile are required.")}`);
  }
  const existing = await db.getUserByEmail(b.email);
  if (existing && existing.id !== user.id) {
    return redirect(res, `/account?err=${encodeURIComponent("Another account already uses that email.")}`);
  }
  await db.updateUser(user.id, {
    fullName: b.fullName,
    email: b.email,
    mobile: b.mobile,
    address: b.address || null,
    googleBusinessUrl: b.googleBusinessUrl || null,
  });
  redirect(res, "/account?updated=Contact info");
}

export async function updateAccountPassword(req, res) {
  const user = await currentUser(req);
  if (!user) return redirect(res, "/onboarding?next=/account");
  const b = await readBody(req);
  if (!verifyPassword(b.currentPassword || "", user.passwordHash, user.passwordSalt)) {
    return redirect(res, `/account?err=${encodeURIComponent("Current password is incorrect.")}`);
  }
  if (!isStrongPassword(b.newPassword)) {
    return redirect(res, `/account?err=${encodeURIComponent("Password too weak — " + PASSWORD_HINT)}`);
  }
  if (b.newPassword !== b.confirmPassword) {
    return redirect(res, `/account?err=${encodeURIComponent("New password and confirmation don't match.")}`);
  }
  const { hash, salt } = hashPassword(b.newPassword);
  await db.updateUser(user.id, { passwordHash: hash, passwordSalt: salt });
  redirect(res, "/account?updated=Password");
}

export async function updateAccountBanking(req, res) {
  const user = await currentUser(req);
  if (!user) return redirect(res, "/onboarding?next=/account");
  const b = await readBody(req);
  if (!b.bankBsb || !b.bankAccount || !b.bankAccountName) {
    return redirect(res, `/account?err=${encodeURIComponent("BSB, account number, and account name are all required.")}`);
  }
  await db.updateUser(user.id, { bankBsb: b.bankBsb, bankAccount: b.bankAccount, bankAccountName: b.bankAccountName });
  redirect(res, "/account?updated=Banking details");
}

// ---------------- Contractor applications ----------------
export async function contractorApplyHandler(req, res) {
  const contractor = await currentContractor(req);
  if (!contractor) return redirect(res, "/contractor/login?next=/contractor/apply");
  const ok = await runUpload(req, res, uploadContractorDocs, {
    onError: (message) => redirect(res, `/contractor/apply?err=${encodeURIComponent(message)}`),
  });
  if (!ok) return;
  const b = req.body || {};
  const files = req.files || {};
  const insuranceFile = files.insuranceDoc && files.insuranceDoc[0];
  const regoFile = files.companyRegoDoc && files.companyRegoDoc[0];
  if (!b.businessNumber || !b.companyName || !insuranceFile) {
    return badRequest(res, "Business number, company name, and a valid insurance document (image or PDF) are required.");
  }
  // insuranceFile.key is the S3/R2 object key (multer-s3) — the local-disk
  // fallback uses .filename instead. Either way this is a private-bucket
  // key, resolved to a signed URL on demand by downloadContractorDoc below.
  await db.createContractorApplication({
    contractorId: contractor.id,
    businessNumber: b.businessNumber,
    companyName: b.companyName,
    companyRegistrationNumber: b.companyRegistrationNumber || null,
    insuranceExpiry: b.insuranceExpiry || null,
    insuranceDocPath: insuranceFile.key || insuranceFile.filename,
    companyRegoDocPath: regoFile ? regoFile.key || regoFile.filename : null,
  });
  await db.updateContractor(contractor.id, { businessName: b.companyName, contractorApplicationStatus: "pending" });
  redirect(res, "/contractor/apply?submitted=1");
}

export async function adminApproveContractorApplication(req, res, id) {
  const user = await currentUser(req);
  if (!user || !hasPermission(user, "canApproveContractors")) return badRequest(res, "Not authorized.");
  await db.approveContractorApplication(id, user.id);
  redirect(res, "/admin/contractor-applications");
}

export async function adminRejectContractorApplication(req, res, id) {
  const user = await currentUser(req);
  if (!user || !hasPermission(user, "canApproveContractors")) return badRequest(res, "Not authorized.");
  const b = await readBody(req);
  await db.rejectContractorApplication(id, user.id, b.reason || "Not specified");
  redirect(res, "/admin/contractor-applications");
}

export async function downloadContractorDoc(req, res, id, field) {
  const user = await currentUser(req);
  const contractor = await currentContractor(req);
  const application = await db.getContractorApplicationById(id);
  if (!application) return badRequest(res, "Not found.");
  const isApplicant = contractor && application.contractorId === contractor.id;
  const isStaff = user && hasPermission(user, "canApproveContractors");
  if (!isApplicant && !isStaff) return badRequest(res, "Not authorized.");
  const key = field === "insuranceDoc" ? application.insuranceDocPath : field === "companyRegoDoc" ? application.companyRegoDocPath : null;
  if (!key) return badRequest(res, "No such document.");

  if (isS3Configured()) {
    // Private bucket — hand back a short-lived signed URL instead of
    // streaming the file through this process.
    const url = await getContractorDocUrl(key);
    res.writeHead(302, { Location: url });
    return res.end();
  }

  // Local-disk fallback (no S3/R2 configured — see lib/upload.js).
  const filePath = path.join(CONTRACTOR_DOCS_DIR, key);
  if (!filePath.startsWith(CONTRACTOR_DOCS_DIR) || !fs.existsSync(filePath)) return badRequest(res, "File not found.");
  res.writeHead(200, { "Content-Type": "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

// ---------------- Admin: staff & permissions ----------------
export async function createStaffUser(req, res) {
  const user = await currentUser(req);
  if (!user || !user.isAdmin) return badRequest(res, "Super-admin only.");
  const b = await readBody(req);
  if (!b.fullName || !b.email || !b.mobile || !b.password) {
    return badRequest(res, "Full name, email, mobile, and a password are all required.");
  }
  if (!isStrongPassword(b.password)) {
    return badRequest(res, "Password too weak — " + PASSWORD_HINT);
  }
  if (await db.getUserByEmail(b.email)) return badRequest(res, "An account with that email already exists.");
  const { hash, salt } = hashPassword(b.password);
  const newUser = await db.createUser({ fullName: b.fullName, email: b.email, mobile: b.mobile, passwordHash: hash, passwordSalt: salt });
  const patch = {};
  for (const p of PERMISSIONS) patch[p.key] = b[p.key] === "1";
  await db.updateUser(newUser.id, patch);
  redirect(res, "/admin/staff?created=1");
}

export async function updateUserPermissions(req, res, id) {
  const user = await currentUser(req);
  if (!user || !user.isAdmin) return badRequest(res, "Super-admin only.");
  const target = await db.getUserById(id);
  if (!target || target.isAdmin) return badRequest(res, "Cannot modify this account.");
  const b = await readBody(req);
  const patch = {};
  for (const p of PERMISSIONS) patch[p.key] = b[p.key] === "1";
  await db.updateUser(id, patch);
  redirect(res, "/admin/staff");
}

// ---------------- Stripe webhook (safety net) ----------------
// Source of truth for "did the buyer actually pay" in the rare case the
// client never completes the round trip back to createBookingHandler (e.g.
// the card is charged but the tab closes before the form re-submits). Reads
// the metadata attached to the PaymentIntent at creation
// (createBookingIntentHandler above) to finalize the booking from here
// alone if needed. Needs the raw request body — Stripe signs the exact
// bytes, so this does not go through lib/body.js's readBody().
export async function stripeWebhook(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks);
  const signature = req.headers["stripe-signature"];

  let event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    return res.end(`Webhook signature verification failed: ${err.message}`);
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const { listingId, buyerId, term } = intent.metadata || {};
    if (listingId && buyerId && term) {
      const existingPayment = await db.getPaymentByStripeIntentId(intent.id);
      if (!existingPayment) {
        const listing = await db.getListingById(listingId);
        if (listing && listing.status === "live") {
          await db.createBookingBundle({
            listing,
            buyerId,
            term: parseInt(term, 10),
            signature: "(confirmed via Stripe — see PaymentIntent " + intent.id + ")",
            paymentIntentId: intent.id,
          });
        }
      }
    }
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ received: true }));
}

// ---------------- Stripe Connect Express onboarding (seller payouts) ----------------
export async function connectPayoutsHandler(req, res) {
  const user = await currentUser(req);
  if (!user) return redirect(res, "/onboarding?next=/account");
  if (!isStripeConfigured()) return badRequest(res, "Stripe is not configured yet.");

  let accountId = user.stripeConnectAccountId;
  if (!accountId) {
    accountId = await createConnectAccount(user.email);
    await db.updateUser(user.id, { stripeConnectAccountId: accountId });
  }
  const proto = req.headers["x-forwarded-proto"] || "http";
  const base = `${proto}://${req.headers.host}`;
  const url = await createConnectOnboardingLink(accountId, {
    refreshUrl: `${base}/account?connect=refresh`,
    returnUrl: `${base}/account?connect=done`,
  });
  redirect(res, url);
}

// ---------------- Admin: listing moderation ----------------
export async function removeListingHandler(req, res, id) {
  const user = await currentUser(req);
  if (!user || !hasPermission(user, "canAccessSupport")) return badRequest(res, "Not authorized.");
  const b = await readBody(req);
  if (!b.reason) return badRequest(res, "A reason is required to remove a listing.");
  await db.removeListing(id, b.reason, user.id);
  redirect(res, "/admin/listings");
}

export async function restoreListingHandler(req, res, id) {
  const user = await currentUser(req);
  if (!user || !hasPermission(user, "canAccessSupport")) return badRequest(res, "Not authorized.");
  await db.restoreListing(id);
  redirect(res, "/admin/listings");
}
