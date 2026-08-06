// Postgres-backed datastore (was a JSON file — see git history / DEPLOYMENT.md
// for the migration notes). Every other file only talks to the functions
// exported here, never to the database directly, so that discipline is what
// made this swap possible without touching a single call site's *shape* —
// only "add await" changed outside this file.
//
// Row <-> object mapping: Postgres columns are snake_case, every JS object
// everywhere else in the app is camelCase (with two long-standing
// exceptions: the `desc` field maps to the `description` column, since
// DESC is a reserved word, and `__seq` maps to the `seq` column, kept only
// for insertion-order sorting — nothing outside this file reads it).

import pg from "pg";
import crypto from "node:crypto";
import { estimateJobFee, gstOn, round2 } from "./format.js";
import { charge, payout } from "./payments.js";

const { Pool } = pg;

// NUMERIC and BIGINT come back from node-pg as strings by default (to avoid
// silent precision loss) — this app's amounts/ids fit safely in JS numbers,
// so parse them here once instead of at every call site. TIMESTAMPTZ is
// parsed to a proper ISO string so every function keeps returning exactly
// the string shape the JSON-file version always did.
pg.types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val))); // numeric
pg.types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10))); // bigint
pg.types.setTypeParser(1184, (val) => (val === null ? null : new Date(val).toISOString())); // timestamptz

const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || "");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

function cryptoRandomToken() {
  return crypto.randomBytes(24).toString("hex");
}

// ---------- row <-> object key mapping ----------
function snakeToCamelKey(k) {
  if (k === "seq") return "__seq";
  if (k === "description") return "desc";
  return k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function camelToSnakeKey(k) {
  if (k === "__seq") return "seq";
  if (k === "desc") return "description";
  return k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
}
function rowToObj(row) {
  if (!row) return null;
  const obj = {};
  for (const [k, v] of Object.entries(row)) obj[snakeToCamelKey(k)] = v;
  return obj;
}

// photos (listings) and quote (job_orders) are jsonb columns — node-pg
// doesn't auto-serialize JS arrays/objects to JSON for query params, so
// those two keys need an explicit JSON.stringify going in (jsonb comes back
// already parsed on the way out, no special-casing needed for reads).
const JSON_COLS = new Set(["photos", "quote"]);
function prepareValue(key, value) {
  if (JSON_COLS.has(key)) return value === null || value === undefined ? null : JSON.stringify(value);
  return value;
}

async function nextId(seqName, prefix) {
  const { rows } = await pool.query(`SELECT nextval($1) AS n`, [seqName]);
  const n = rows[0].n;
  return { id: `${prefix}-${1000 + n}`, __seq: n };
}

async function getRowById(table, id) {
  const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  return rowToObj(rows[0]);
}

async function insertRow(table, obj) {
  const keys = Object.keys(obj);
  const cols = keys.map(camelToSnakeKey);
  const placeholders = keys.map((_, i) => `$${i + 1}`);
  const values = keys.map((k) => prepareValue(k, obj[k]));
  const { rows } = await pool.query(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`, values);
  return rowToObj(rows[0]);
}

async function updateRow(table, id, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return getRowById(table, id);
  const setSql = keys.map((k, i) => `${camelToSnakeKey(k)} = $${i + 2}`).join(", ");
  const values = keys.map((k) => prepareValue(k, patch[k]));
  const { rows } = await pool.query(`UPDATE ${table} SET ${setSql} WHERE id = $1 RETURNING *`, [id, ...values]);
  return rowToObj(rows[0]);
}

// Wipes every table (for local dev / test resets). Does NOT repopulate demo
// data — run `node scripts/seed-db.mjs` afterward for that. Not called
// anywhere in the app today; kept for the same reason the JSON-file version
// exported it.
export async function resetToSeed() {
  await pool.query(
    `TRUNCATE TABLE messages, contact_messages, job_orders, payments, contracts, bookings, contractor_applications, listings, contractor_sessions, contractors, sessions, users`
  );
  for (const seq of [
    "users_seq",
    "contractors_seq",
    "listings_seq",
    "bookings_seq",
    "contracts_seq",
    "payments_seq",
    "job_orders_seq",
    "contractor_applications_seq",
    "messages_seq",
    "contact_messages_seq",
  ]) {
    await pool.query(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
  }
}

// ---------- Users ----------
export async function getUserById(id) {
  return getRowById("users", id);
}
export async function getUserByEmail(email) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE lower(email) = lower($1)`, [email]);
  return rowToObj(rows[0]);
}
export async function getAllUsers() {
  const { rows } = await pool.query(`SELECT * FROM users ORDER BY seq ASC`);
  return rows.map(rowToObj);
}
export async function createUser({ fullName, email, mobile, passwordHash, passwordSalt }) {
  const { id, __seq } = await nextId("users_seq", "U");
  return insertRow("users", {
    id,
    __seq,
    fullName,
    email,
    mobile,
    passwordHash,
    passwordSalt,
    businessName: null,
    address: null,
    bankBsb: null,
    bankAccount: null,
    bankAccountName: null,
    cardLast4: null,
    isAdmin: false,
    googleBusinessUrl: null,
    canApproveContractors: false,
    canAccessSupport: false,
    canCreateBdrListings: false,
    stripeConnectAccountId: null,
    emailVerifiedAt: null,
    emailVerifyToken: null,
    lastMessagesSeenAt: null,
    createdAt: new Date().toISOString(),
  });
}
export async function updateUser(id, patch) {
  return updateRow("users", id, patch);
}
export async function getUserByVerifyToken(token) {
  if (!token) return null;
  const { rows } = await pool.query(`SELECT * FROM users WHERE email_verify_token = $1`, [token]);
  return rowToObj(rows[0]);
}

// ---------- Sessions ----------
export async function createSession(userId) {
  const token = cryptoRandomToken();
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30;
  await pool.query(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`, [token, userId, expiresAt]);
  return { token, userId, expiresAt };
}
export async function getSession(token) {
  const { rows } = await pool.query(`SELECT * FROM sessions WHERE token = $1`, [token]);
  const s = rowToObj(rows[0]);
  if (!s) return null;
  if (s.expiresAt < Date.now()) return null;
  return s;
}
export async function destroySession(token) {
  await pool.query(`DELETE FROM sessions WHERE token = $1`, [token]);
}

// ---------- Contractors (separate identity space from users) ----------
export async function createContractorAccount({ fullName, email, mobile, passwordHash, passwordSalt }) {
  const { id, __seq } = await nextId("contractors_seq", "CX");
  return insertRow("contractors", {
    id,
    __seq,
    fullName,
    email,
    mobile,
    passwordHash,
    passwordSalt,
    businessName: null,
    address: null,
    contractorApplicationStatus: null,
    isApprovedContractor: false,
    contractorRating: null,
    lastMessagesSeenAt: null,
    createdAt: new Date().toISOString(),
  });
}
export async function getContractorById(id) {
  return getRowById("contractors", id);
}
export async function getContractorByEmail(email) {
  const { rows } = await pool.query(`SELECT * FROM contractors WHERE lower(email) = lower($1)`, [email]);
  return rowToObj(rows[0]);
}
export async function updateContractor(id, patch) {
  return updateRow("contractors", id, patch);
}
export async function createContractorSession(contractorId) {
  const token = cryptoRandomToken();
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30;
  await pool.query(`INSERT INTO contractor_sessions (token, contractor_id, expires_at) VALUES ($1, $2, $3)`, [token, contractorId, expiresAt]);
  return { token, contractorId, expiresAt };
}
export async function getContractorSession(token) {
  const { rows } = await pool.query(`SELECT * FROM contractor_sessions WHERE token = $1`, [token]);
  const s = rowToObj(rows[0]);
  if (!s) return null;
  if (s.expiresAt < Date.now()) return null;
  return s;
}
export async function destroyContractorSession(token) {
  await pool.query(`DELETE FROM contractor_sessions WHERE token = $1`, [token]);
}
// A message sender or job-order party can be a buyer/seller (users) or a
// contractor (contractors) — this looks in both without the caller needing
// to know which identity space the id belongs to.
export async function getPersonById(id) {
  return (await getUserById(id)) || (await getContractorById(id));
}

// ---------- Listings ----------
// Only "live" listings are publicly browsable — "unclaimed" is a BDR-created
// draft with no owner yet, only reachable via its secret claim link.
export async function getListings() {
  const { rows } = await pool.query(`SELECT * FROM listings WHERE status = 'live'`);
  return rows.map(rowToObj);
}
export async function getListingById(id) {
  return getRowById("listings", id);
}
export async function getListingsByOwner(ownerId) {
  const { rows } = await pool.query(`SELECT * FROM listings WHERE owner_id = $1`, [ownerId]);
  return rows.map(rowToObj);
}
export async function createListing(fields) {
  const { id, __seq } = await nextId("listings_seq", "L");
  return insertRow("listings", {
    id,
    __seq,
    rating: 5.0,
    reviews: 0,
    footfall: "New listing",
    desc: fields.desc || "",
    photos: fields.photos || [],
    subtype: fields.subtype || null,
    status: "live",
    claimToken: null,
    claimedAt: null,
    createdByBdrId: null,
    bdrContactName: null,
    bdrContactEmail: null,
    viewCount: 0,
    lat: null,
    lng: null,
    removedReason: null,
    removedAt: null,
    removedByUserId: null,
    ...fields,
  });
}
// Seller-initiated edits (details, photo add/remove/reorder) — shares the
// same underlying update as everything else touching a listing.
export async function updateListing(id, patch) {
  return updateRow("listings", id, patch);
}
export async function incrementListingView(id) {
  const { rows } = await pool.query(`UPDATE listings SET view_count = view_count + 1 WHERE id = $1 RETURNING *`, [id]);
  return rowToObj(rows[0]);
}

// ---------- Listing moderation (customer service) ----------
export async function getAllListingsAdmin() {
  const { rows } = await pool.query(`SELECT * FROM listings ORDER BY seq DESC`);
  return rows.map(rowToObj);
}
export async function removeListing(id, reason, adminId) {
  return updateRow("listings", id, {
    status: "removed",
    removedReason: reason || null,
    removedAt: new Date().toISOString(),
    removedByUserId: adminId,
  });
}
export async function restoreListing(id) {
  return updateRow("listings", id, { status: "live", removedReason: null, removedAt: null, removedByUserId: null });
}

// ---------- BDR draft listings + claim links ----------
export async function createDraftListing(fields) {
  const { id, __seq } = await nextId("listings_seq", "L");
  return insertRow("listings", {
    id,
    __seq,
    rating: 5.0,
    reviews: 0,
    footfall: "New listing",
    desc: fields.desc || "",
    photos: fields.photos || [],
    subtype: fields.subtype || null,
    viewCount: 0,
    lat: null,
    lng: null,
    removedReason: null,
    removedAt: null,
    removedByUserId: null,
    ...fields,
    ownerId: null,
    status: "unclaimed",
    claimToken: cryptoRandomToken(),
    claimedAt: null,
  });
}
export async function getListingByClaimToken(token) {
  const { rows } = await pool.query(`SELECT * FROM listings WHERE claim_token = $1`, [token]);
  return rowToObj(rows[0]);
}
export async function claimListing(token, userId) {
  const { rows } = await pool.query(
    `UPDATE listings SET owner_id = $1, status = 'live', claimed_at = $2 WHERE claim_token = $3 AND status = 'unclaimed' RETURNING *`,
    [userId, new Date().toISOString(), token]
  );
  return rowToObj(rows[0]);
}

// ---------- Bookings / Contracts / Payments ----------
// paymentIntentId is set when the buyer already paid via the embedded
// Stripe Elements flow (see routes/api.js#createBookingHandler, which
// verifies the PaymentIntent with Stripe before ever calling this) — in
// that case the charge already happened and this just records it. When
// Stripe isn't configured yet, paymentIntentId is null and this falls back
// to the original stub charge() call, same as before Stripe existed.
export async function createBookingBundle({ listing, buyerId, term, signature, paymentIntentId = null }) {
  const monthlyRate = listing.price;
  // Listing prices are GST-exclusive (B2B convention) — GST is added once
  // here, on the term total, and the buyer is charged the GST-inclusive
  // figure. The seller's 15% platform fee is calculated on the ex-GST
  // subtotal, since GST isn't the platform's revenue to take a cut of.
  const subtotal = round2(monthlyRate * term);
  const gstAmount = gstOn(subtotal);
  const total = round2(subtotal + gstAmount);
  const feeRate = 0.15;
  const feeAmount = round2(subtotal * feeRate);
  const payoutAmount = round2(subtotal - feeAmount);

  // Charging happens outside the SQL transaction below so a payment
  // processor call (network I/O) never holds a database transaction open.
  const paymentResult = paymentIntentId
    ? { status: "paid", paidAt: new Date().toISOString() }
    : await charge({ amount: total, description: `Frontage lease — ${listing.title}` });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const bSeq = (await client.query(`SELECT nextval('bookings_seq') AS n`)).rows[0].n;
    const bookingId = `BK-${1000 + bSeq}`;
    const nowIso = new Date().toISOString();
    const bookingRow = await client.query(
      `INSERT INTO bookings (id, seq, listing_id, buyer_id, seller_id, term, monthly_rate, status, lease_start_date, auto_renew, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'signed',NULL,TRUE,$8) RETURNING *`,
      [bookingId, bSeq, listing.id, buyerId, listing.ownerId, term, monthlyRate, nowIso]
    );
    const booking = rowToObj(bookingRow.rows[0]);

    const cSeq = (await client.query(`SELECT nextval('contracts_seq') AS n`)).rows[0].n;
    await client.query(`INSERT INTO contracts (id, seq, booking_id, signed_name, signed_at) VALUES ($1,$2,$3,$4,$5)`, [
      `CT-${1000 + cSeq}`,
      cSeq,
      booking.id,
      signature,
      nowIso,
    ]);

    const pSeq = (await client.query(`SELECT nextval('payments_seq') AS n`)).rows[0].n;
    await client.query(
      `INSERT INTO payments (id, seq, booking_id, total_amount, subtotal_amount, gst_amount, fee_amount, payout_amount, status, paid_at, payout_status, payout_released_at, payout_blocked_reason, stripe_payment_intent_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'held',NULL,NULL,$11)`,
      [`PM-${1000 + pSeq}`, pSeq, booking.id, total, subtotal, gstAmount, feeAmount, payoutAmount, paymentResult.status, paymentResult.paidAt, paymentIntentId]
    );

    const jSeq = (await client.query(`SELECT nextval('job_orders_seq') AS n`)).rows[0].n;
    const jobOrderRow = await client.query(
      `INSERT INTO job_orders (id, seq, booking_id, listing_id, buyer_id, seller_id, contractor_id, status, estimate, quote, install_window, install_date, seller_access_confirmed, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NULL,'broadcast',$7,NULL,NULL,NULL,FALSE,$8) RETURNING *`,
      [`FR-${1000 + jSeq}`, jSeq, booking.id, listing.id, buyerId, listing.ownerId, estimateJobFee(listing.sizeW, listing.sizeH), nowIso]
    );
    const jobOrder = rowToObj(jobOrderRow.rows[0]);

    // A booked space comes off the marketplace immediately — status "leased"
    // keeps it out of getListings()/browse/map (which only show "live")
    // without losing it from the seller's own listings or admin views.
    await client.query(`UPDATE listings SET status = 'leased' WHERE id = $1`, [listing.id]);

    await client.query("COMMIT");
    return { booking, jobOrder };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------- Job orders ----------
export async function getJobOrders() {
  const { rows } = await pool.query(`SELECT * FROM job_orders`);
  return rows.map(rowToObj);
}
export async function getJobOrderById(id) {
  return getRowById("job_orders", id);
}
export async function getBroadcastJobOrders() {
  const { rows } = await pool.query(`SELECT * FROM job_orders WHERE status = 'broadcast'`);
  return rows.map(rowToObj);
}
export async function getJobOrdersForContractor(contractorId) {
  const { rows } = await pool.query(`SELECT * FROM job_orders WHERE contractor_id = $1`, [contractorId]);
  return rows.map(rowToObj);
}
export async function getJobOrdersForSeller(sellerId) {
  const { rows } = await pool.query(`SELECT * FROM job_orders WHERE seller_id = $1`, [sellerId]);
  return rows.map(rowToObj);
}
// Fires when a job order reaches "installed" — releases the seller's held
// payout (see the payoutStatus fields set on the payment in
// createBookingBundle above). Runs after the status-change transaction,
// since it needs an async call to payments.payout() (a real Stripe Transfer
// call is a network round-trip, which must never happen inside an open
// database transaction).
async function releasePayoutForBooking(bookingId) {
  const booking = await getBookingById(bookingId);
  const payment = await getPaymentByBookingId(bookingId);
  if (!payment || payment.payoutStatus !== "held") return null;
  const seller = booking ? await getUserById(booking.sellerId) : null;
  const result = await payout({ amount: payment.payoutAmount, destinationAccountId: seller ? seller.stripeConnectAccountId : null });

  if (result.status === "blocked") {
    // Real Stripe is configured but this seller hasn't completed Connect
    // onboarding yet — leave the payout held rather than marking it
    // released with nothing to show for it.
    return updateRow("payments", payment.id, {
      payoutBlockedReason: "Seller hasn't connected a payout account yet (Stripe Connect) — payout stays held until they do.",
    });
  }

  return updateRow("payments", payment.id, {
    payoutStatus: "released",
    payoutReleasedAt: result.releasedAt,
    stripeTransferId: result.transferId || null,
    payoutBlockedReason:
      seller && (seller.stripeConnectAccountId || seller.bankAccount)
        ? null
        : "No payout account on file for the seller — payout marked released in this demo, but a real transfer would fail here.",
  });
}

export async function updateJobOrder(id, patch) {
  const client = await pool.connect();
  let jobOrder;
  try {
    await client.query("BEGIN");
    const keys = Object.keys(patch);
    const setSql = keys.map((k, i) => `${camelToSnakeKey(k)} = $${i + 2}`).join(", ");
    const values = keys.map((k) => prepareValue(k, patch[k]));
    const jRes = await client.query(`UPDATE job_orders SET ${setSql} WHERE id = $1 RETURNING *`, [id, ...values]);
    jobOrder = rowToObj(jRes.rows[0]);
    // Lease lifecycle decision: the lease clock starts the moment install is
    // marked complete, not on contract signing.
    if (jobOrder && patch.status === "installed") {
      const bRes = await client.query(`SELECT * FROM bookings WHERE id = $1`, [jobOrder.bookingId]);
      const booking = rowToObj(bRes.rows[0]);
      if (booking && !booking.leaseStartDate) {
        await client.query(`UPDATE bookings SET lease_start_date = $1, status = 'active' WHERE id = $2`, [new Date().toISOString(), booking.id]);
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  if (jobOrder && patch.status === "installed") {
    await releasePayoutForBooking(jobOrder.bookingId);
  }
  return jobOrder;
}

// ---------- Contractor applications ----------
export async function createContractorApplication(fields) {
  const { id, __seq } = await nextId("contractor_applications_seq", "CA");
  return insertRow("contractor_applications", {
    id,
    __seq,
    status: "pending", // pending -> approved | rejected
    rejectionReason: null,
    reviewedAt: null,
    reviewedBy: null,
    submittedAt: new Date().toISOString(),
    ...fields,
  });
}
export async function getContractorApplicationById(id) {
  return getRowById("contractor_applications", id);
}
export async function getContractorApplicationsByContractor(contractorId) {
  const { rows } = await pool.query(`SELECT * FROM contractor_applications WHERE contractor_id = $1`, [contractorId]);
  return rows.map(rowToObj);
}
export async function getPendingContractorApplications() {
  const { rows } = await pool.query(`SELECT * FROM contractor_applications WHERE status = 'pending'`);
  return rows.map(rowToObj);
}
export async function updateContractorApplication(id, patch) {
  return updateRow("contractor_applications", id, patch);
}
export async function approveContractorApplication(id, adminId) {
  const application = await updateRow("contractor_applications", id, {
    status: "approved",
    reviewedAt: new Date().toISOString(),
    reviewedBy: adminId,
  });
  if (!application) return null;
  const contractor = await getContractorById(application.contractorId);
  if (contractor) {
    await updateRow("contractors", contractor.id, {
      isApprovedContractor: true,
      contractorApplicationStatus: "approved",
      businessName: application.companyName || contractor.businessName || contractor.fullName,
      contractorRating: contractor.contractorRating || 5.0,
    });
  }
  return application;
}
export async function rejectContractorApplication(id, adminId, reason) {
  const application = await updateRow("contractor_applications", id, {
    status: "rejected",
    rejectionReason: reason || null,
    reviewedAt: new Date().toISOString(),
    reviewedBy: adminId,
  });
  if (!application) return null;
  const contractor = await getContractorById(application.contractorId);
  if (contractor) await updateRow("contractors", contractor.id, { contractorApplicationStatus: "rejected" });
  return application;
}

// ---------- Messages ----------
// One collection for both job-order chat and listing-inquiry chat,
// distinguished by threadType. threadId is the jobOrderId for "job" threads
// (one thread per job order) and a "listingId:buyerId" composite for
// "listing" threads (one private thread per prospective buyer).
export async function createMessage({ threadType, threadId, senderId, body }) {
  const { id, __seq } = await nextId("messages_seq", "MSG");
  return insertRow("messages", { id, __seq, threadType, threadId, senderId, body, createdAt: new Date().toISOString() });
}
export async function getMessagesForThread(threadType, threadId) {
  const { rows } = await pool.query(`SELECT * FROM messages WHERE thread_type = $1 AND thread_id = $2 ORDER BY created_at ASC`, [threadType, threadId]);
  return rows.map(rowToObj);
}
function listingThreadSummaries(messages) {
  const threads = new Map();
  for (const m of messages) {
    const [listingId, buyerId] = m.threadId.split(":");
    const existing = threads.get(m.threadId);
    if (!existing || new Date(m.createdAt) > new Date(existing.lastAt)) {
      threads.set(m.threadId, { threadId: m.threadId, listingId, buyerId, lastMessage: m.body, lastAt: m.createdAt });
    }
  }
  return Array.from(threads.values()).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}
export async function getListingThreadsForSeller(sellerId) {
  const { rows: listingRows } = await pool.query(`SELECT id FROM listings WHERE owner_id = $1`, [sellerId]);
  const sellerListingIds = new Set(listingRows.map((r) => r.id));
  const { rows: msgRows } = await pool.query(`SELECT * FROM messages WHERE thread_type = 'listing'`);
  const messages = msgRows.map(rowToObj).filter((m) => sellerListingIds.has(m.threadId.split(":")[0]));
  return listingThreadSummaries(messages);
}
export async function getListingThreadsForBuyer(buyerId) {
  const { rows: msgRows } = await pool.query(`SELECT * FROM messages WHERE thread_type = 'listing'`);
  const messages = msgRows.map(rowToObj).filter((m) => m.threadId.split(":")[1] === buyerId);
  return listingThreadSummaries(messages);
}
export async function getJobThreadsForUser(userId) {
  const { rows: jobRows } = await pool.query(`SELECT * FROM job_orders WHERE seller_id = $1 OR contractor_id = $1`, [userId]);
  const jobOrders = jobRows.map(rowToObj);
  const { rows: msgRows } = await pool.query(`SELECT * FROM messages WHERE thread_type = 'job'`);
  const messages = msgRows.map(rowToObj);
  return jobOrders
    .map((j) => {
      const msgs = messages.filter((m) => m.threadId === j.id);
      const last = msgs.length ? msgs.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b)) : null;
      return {
        jobOrderId: j.id,
        listingId: j.listingId,
        role: j.sellerId === userId ? "seller" : "contractor",
        lastMessage: last ? last.body : null,
        lastAt: last ? last.createdAt : j.createdAt,
        messageCount: msgs.length,
      };
    })
    .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}

// Unread badge: counts messages in any thread the user is party to, sent by
// someone else, since their last visit to the inbox (lastMessagesSeenAt).
export async function getUnreadMessageCount(userId) {
  const person = (await getUserById(userId)) || (await getContractorById(userId));
  if (!person) return 0;
  const since = person.lastMessagesSeenAt ? new Date(person.lastMessagesSeenAt) : new Date(0);
  const { rows: jobRows } = await pool.query(`SELECT id FROM job_orders WHERE seller_id = $1 OR contractor_id = $1`, [userId]);
  const jobIds = new Set(jobRows.map((r) => r.id));
  const { rows: listingRows } = await pool.query(`SELECT id FROM listings WHERE owner_id = $1`, [userId]);
  const sellerListingIds = new Set(listingRows.map((r) => r.id));
  const { rows: msgRows } = await pool.query(`SELECT * FROM messages WHERE sender_id != $1 AND created_at > $2`, [userId, since.toISOString()]);
  let count = 0;
  for (const row of msgRows) {
    const m = rowToObj(row);
    if (m.threadType === "job" && jobIds.has(m.threadId)) count++;
    else if (m.threadType === "listing") {
      const [listingId, buyerId] = m.threadId.split(":");
      if (buyerId === userId || sellerListingIds.has(listingId)) count++;
    }
  }
  return count;
}
export async function markMessagesSeen(userId) {
  const nowIso = new Date().toISOString();
  const uRes = await pool.query(`UPDATE users SET last_messages_seen_at = $1 WHERE id = $2 RETURNING *`, [nowIso, userId]);
  if (uRes.rows[0]) return rowToObj(uRes.rows[0]);
  const cRes = await pool.query(`UPDATE contractors SET last_messages_seen_at = $1 WHERE id = $2 RETURNING *`, [nowIso, userId]);
  return rowToObj(cRes.rows[0]);
}

// ---------- Contact messages ----------
export async function createContactMessage({ name, email, message, topic }) {
  const { id, __seq } = await nextId("contact_messages_seq", "CM");
  return insertRow("contact_messages", { id, __seq, name, email, message, topic: topic || "general", createdAt: new Date().toISOString() });
}
export async function getContactMessages(topic) {
  const { rows } = topic
    ? await pool.query(`SELECT * FROM contact_messages WHERE topic = $1 ORDER BY created_at DESC`, [topic])
    : await pool.query(`SELECT * FROM contact_messages ORDER BY created_at DESC`);
  return rows.map(rowToObj);
}

export async function getBookingById(id) {
  return getRowById("bookings", id);
}
export async function getPaymentByBookingId(bookingId) {
  const { rows } = await pool.query(`SELECT * FROM payments WHERE booking_id = $1`, [bookingId]);
  return rowToObj(rows[0]);
}
// Used by the Stripe webhook safety net (routes/api.js#stripeWebhook) to
// check whether a booking already exists for a given PaymentIntent before
// creating one — the normal path (createBookingHandler) usually wins the
// race, so this is almost always a no-op guard.
export async function getPaymentByStripeIntentId(paymentIntentId) {
  const { rows } = await pool.query(`SELECT * FROM payments WHERE stripe_payment_intent_id = $1`, [paymentIntentId]);
  return rowToObj(rows[0]);
}
export async function getContractByBookingId(bookingId) {
  const { rows } = await pool.query(`SELECT * FROM contracts WHERE booking_id = $1`, [bookingId]);
  return rowToObj(rows[0]);
}
export async function getBookingsForUser(userId) {
  const { rows } = await pool.query(`SELECT * FROM bookings WHERE buyer_id = $1 OR seller_id = $1`, [userId]);
  return rows.map(rowToObj);
}
export async function getBookingsForListing(listingId) {
  const { rows } = await pool.query(`SELECT * FROM bookings WHERE listing_id = $1`, [listingId]);
  return rows.map(rowToObj);
}
export async function getAllBookingsAdmin() {
  const { rows } = await pool.query(`SELECT * FROM bookings ORDER BY created_at DESC`);
  return rows.map(rowToObj);
}
export async function getJobOrderByBookingId(bookingId) {
  const { rows } = await pool.query(`SELECT * FROM job_orders WHERE booking_id = $1`, [bookingId]);
  return rowToObj(rows[0]);
}
export async function renewBooking(id, extraMonths) {
  const booking = await getBookingById(id);
  if (!booking) return null;
  return updateRow("bookings", id, { term: booking.term + extraMonths, autoRenew: true });
}
export async function setBookingAutoRenew(id, autoRenew) {
  const patch = { autoRenew };
  if (!autoRenew) patch.status = "ending";
  return updateRow("bookings", id, patch);
}
