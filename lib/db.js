// Postgres datastore. Every other file talks to the functions exported
// here, never to the database directly.
//
// Row <-> object mapping: Postgres columns are snake_case and every JS object
// elsewhere in the app is camelCase. `__seq` maps to the `seq` column, which
// is kept only for insertion-order sorting.

import pg from "pg";
import crypto from "node:crypto";

const { Pool } = pg;

// NUMERIC and BIGINT come back from node-pg as strings by default. This
// app's amounts and ids fit safely in JS numbers, so parse them once here.
// TIMESTAMPTZ becomes an ISO string, and DATE stays the plain "YYYY-MM-DD"
// string Postgres sends (node-pg's default builds a local-timezone Date,
// which shifts the day when the server isn't on UTC).
pg.types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val))); // numeric
pg.types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10))); // bigint
pg.types.setTypeParser(1184, (val) => (val === null ? null : new Date(val).toISOString())); // timestamptz
pg.types.setTypeParser(1082, (val) => val); // date

const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || "");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}
function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

// ---------- row <-> object key mapping ----------
function snakeToCamelKey(k) {
  if (k === "seq") return "__seq";
  return k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function camelToSnakeKey(k) {
  if (k === "__seq") return "seq";
  return k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
}
function rowToObj(row) {
  if (!row) return null;
  const obj = {};
  for (const [k, v] of Object.entries(row)) obj[snakeToCamelKey(k)] = v;
  return obj;
}

// photos is a jsonb column. node-pg doesn't serialize JS arrays to JSON for
// query params, so it needs an explicit JSON.stringify going in (jsonb comes
// back already parsed).
const JSON_COLS = new Set(["photos"]);
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

// Used by /healthz — proves the process can still reach the database.
export async function ping() {
  await pool.query("SELECT 1");
}

// ---------- Users ----------
export async function getUserById(id) {
  if (!id) return null;
  return getRowById("users", id);
}
export async function getUserByEmail(email) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE lower(email) = lower($1)`, [email]);
  return rowToObj(rows[0]);
}
export async function searchUsers(term, limit = 100) {
  const q = `%${String(term || "").trim()}%`;
  const { rows } = await pool.query(
    `SELECT u.*, (SELECT count(*)::int FROM listings l WHERE l.owner_id = u.id AND l.status = 'live') AS live_listing_count
       FROM users u
      WHERE $1 = '%%' OR u.full_name ILIKE $1 OR u.email ILIKE $1 OR u.id ILIKE $1
      ORDER BY u.seq DESC LIMIT $2`,
    [q, limit]
  );
  return rows.map(rowToObj);
}
export async function createUser({ fullName, email, mobile = null, passwordHash, passwordSalt }) {
  const { id, __seq } = await nextId("users_seq", "U");
  return insertRow("users", { id, __seq, fullName, email, mobile, passwordHash, passwordSalt, createdAt: new Date().toISOString() });
}
export async function updateUser(id, patch) {
  return updateRow("users", id, patch);
}
export async function getUserByVerifyToken(token) {
  if (!token) return null;
  const { rows } = await pool.query(`SELECT * FROM users WHERE email_verify_token = $1`, [token]);
  return rowToObj(rows[0]);
}

// Password reset: only the sha256 of the emailed token is stored, and it
// expires. Returns the raw token for the email link.
export async function createPasswordReset(userId, ttlMinutes = 60) {
  const token = randomToken();
  await updateRow("users", userId, {
    passwordResetTokenHash: sha256(token),
    passwordResetExpiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
  });
  return token;
}
export async function getUserByResetToken(token) {
  if (!token) return null;
  const { rows } = await pool.query(`SELECT * FROM users WHERE password_reset_token_hash = $1 AND password_reset_expires_at > now()`, [sha256(token)]);
  return rowToObj(rows[0]);
}

// Suspension hides the user's listings from browse (see getListings), blocks
// them from messaging, and logs them out everywhere.
export async function suspendUser(id, reason) {
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
  return updateRow("users", id, { suspendedAt: new Date().toISOString(), suspendedReason: reason || null });
}
export async function unsuspendUser(id) {
  return updateRow("users", id, { suspendedAt: null, suspendedReason: null });
}

// ---------- Sessions ----------
// The cookie holds the raw token; the table only ever stores its hash.
export async function createSession(userId) {
  const token = randomToken();
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30;
  await pool.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [sha256(token), userId, expiresAt]);
  return { token, userId, expiresAt };
}
export async function getSession(token) {
  if (!token) return null;
  const { rows } = await pool.query(`SELECT * FROM sessions WHERE token_hash = $1`, [sha256(token)]);
  const s = rowToObj(rows[0]);
  if (!s || s.expiresAt < Date.now()) return null;
  return s;
}
export async function destroySession(token) {
  await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [sha256(token)]);
}
export async function destroySessionsForUser(userId) {
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
}

// ---------- Listings ----------
// A listing stays up for this long after it's listed, edited or renewed.
export const LISTING_LIFETIME_DAYS = 60;
const LIFETIME = `interval '${LISTING_LIFETIME_DAYS} days'`;

// Publicly browsable: live, not expired, and the owner isn't suspended.
const PUBLIC_WHERE = `l.status = 'live' AND (l.expires_at IS NULL OR l.expires_at > now()) AND u.suspended_at IS NULL`;
export async function getListings() {
  const { rows } = await pool.query(
    `SELECT l.* FROM listings l JOIN users u ON u.id = l.owner_id
      WHERE ${PUBLIC_WHERE}
      ORDER BY COALESCE(l.renewed_at, l.created_at) DESC, l.seq DESC`
  );
  return rows.map(rowToObj);
}
export async function getListingById(id) {
  return getRowById("listings", id);
}
// Same visibility rule as getListings, for a single listing page.
export async function getPublicListing(id) {
  const { rows } = await pool.query(`SELECT l.* FROM listings l JOIN users u ON u.id = l.owner_id WHERE l.id = $1 AND ${PUBLIC_WHERE}`, [id]);
  return rowToObj(rows[0]);
}
export function isExpired(listing) {
  return listing.status === "live" && listing.expiresAt && new Date(listing.expiresAt) <= new Date();
}

// Renewing (or relisting a rented space) puts it back up for another
// lifetime and re-arms the reminder emails.
export async function renewListing(id) {
  const { rows } = await pool.query(
    `UPDATE listings SET status = 'live', renewed_at = now(), expires_at = now() + ${LIFETIME}, rented_at = NULL,
            expiry_reminder_sent_at = NULL, expired_notice_sent_at = NULL, updated_at = now()
      WHERE id = $1 AND status IN ('live', 'rented') RETURNING *`,
    [id]
  );
  return rowToObj(rows[0]);
}
export async function markListingRented(id) {
  const { rows } = await pool.query(
    `UPDATE listings SET status = 'rented', rented_at = now(), updated_at = now() WHERE id = $1 AND status = 'live' RETURNING *`,
    [id]
  );
  return rowToObj(rows[0]);
}
export async function fixListingCurrency(id, currency) {
  return updateRow("listings", id, { currency, updatedAt: new Date().toISOString() });
}

// ---------- Scheduled emails (lib/jobs.js) ----------
// Each "claim" stamps the row first and returns only rows it stamped, so an
// email is sent at most once even if two processes run the job together.
export async function claimExpiryReminders() {
  const { rows } = await pool.query(
    `UPDATE listings l SET expiry_reminder_sent_at = now()
       FROM users u
      WHERE u.id = l.owner_id AND u.suspended_at IS NULL AND l.status = 'live'
        AND l.expires_at > now() AND l.expires_at <= now() + interval '7 days'
        AND l.expiry_reminder_sent_at IS NULL
      RETURNING l.*, u.email AS owner_email, u.full_name AS owner_name`
  );
  return rows.map(rowToObj);
}
export async function claimExpiredNotices() {
  const { rows } = await pool.query(
    `UPDATE listings l SET expired_notice_sent_at = now()
       FROM users u
      WHERE u.id = l.owner_id AND u.suspended_at IS NULL AND l.status = 'live'
        AND l.expires_at <= now() AND l.expired_notice_sent_at IS NULL
      RETURNING l.*, u.email AS owner_email, u.full_name AS owner_name`
  );
  return rows.map(rowToObj);
}
// Buyers who started a conversation 3–8 weeks ago and haven't been asked yet.
export async function claimBuyerFollowups(limit = 50) {
  const { rows } = await pool.query(
    `SELECT c.id FROM conversations c
      WHERE c.buyer_followup_sent_at IS NULL AND c.last_message_at IS NOT NULL
        AND c.created_at <= now() - interval '21 days' AND c.created_at > now() - interval '56 days'
      ORDER BY c.created_at LIMIT $1`,
    [limit]
  );
  const claimed = [];
  for (const { id } of rows) {
    const token = randomToken();
    const res = await pool.query(
      `UPDATE conversations SET buyer_followup_sent_at = now(), buyer_followup_token = $2 WHERE id = $1 AND buyer_followup_sent_at IS NULL RETURNING id`,
      [id, token]
    );
    if (res.rows.length) claimed.push({ ...(await getConversationById(id)), buyerFollowupToken: token });
  }
  return claimed;
}
export async function getConversationByFollowupToken(token) {
  if (!token || String(token).length < 32) return null;
  const { rows } = await pool.query(`${CONVERSATION_SELECT} WHERE c.buyer_followup_token = $1`, [token]);
  return rowToObj(rows[0]);
}

// ---------- Deals (reported, never processed) ----------
export async function createDeal(fields) {
  const { id, __seq } = await nextId("deals_seq", "D");
  return insertRow("deals", { id, __seq, createdAt: new Date().toISOString(), ...fields });
}
// A buyer's check-in can be answered more than once (Yes, then details);
// keep one row per conversation and update it.
export async function upsertBuyerDeal(conversation, fields) {
  const { rows } = await pool.query(`SELECT id FROM deals WHERE conversation_id = $1 AND reported_by = 'buyer'`, [conversation.id]);
  if (rows[0]) return updateRow("deals", rows[0].id, fields);
  return createDeal({ listingId: conversation.listingId, conversationId: conversation.id, reportedBy: "buyer", reporterId: conversation.buyerId, ...fields });
}
export async function getDeals() {
  const { rows } = await pool.query(
    `SELECT d.*, l.title AS listing_title, l.suburb AS listing_suburb, l.country_code AS listing_country, u.full_name AS reporter_name
       FROM deals d
       LEFT JOIN listings l ON l.id = d.listing_id
       LEFT JOIN users u ON u.id = d.reporter_id
      ORDER BY d.created_at DESC LIMIT 500`
  );
  return rows.map(rowToObj);
}
export async function getListingConversationBuyers(listingId) {
  const { rows } = await pool.query(
    `SELECT c.id, u.full_name AS buyer_name FROM conversations c JOIN users u ON u.id = c.buyer_id
      WHERE c.listing_id = $1 AND c.last_message_at IS NOT NULL ORDER BY c.last_message_at DESC`,
    [listingId]
  );
  return rows.map(rowToObj);
}
// The seller's own listings — everything except ones they deleted.
export async function getListingsByOwner(ownerId) {
  const { rows } = await pool.query(`SELECT * FROM listings WHERE owner_id = $1 AND status <> 'deleted' ORDER BY seq DESC`, [ownerId]);
  return rows.map(rowToObj);
}
function lifetimeFromNow() {
  return new Date(Date.now() + LISTING_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
export async function createListing(fields) {
  const { id, __seq } = await nextId("listings_seq", "L");
  const nowIso = new Date().toISOString();
  return insertRow("listings", { id, __seq, status: "live", viewCount: 0, createdAt: nowIso, updatedAt: nowIso, renewedAt: nowIso, expiresAt: lifetimeFromNow(), ...fields });
}
// A seller saving their live listing is also confirming it's still
// available, so it counts as a renewal.
export async function updateListing(id, patch) {
  return updateRow("listings", id, { ...patch, updatedAt: new Date().toISOString() });
}
export async function updateListingBySeller(listing, patch) {
  const nowIso = new Date().toISOString();
  const renew = listing.status === "live" ? { renewedAt: nowIso, expiresAt: lifetimeFromNow(), expiryReminderSentAt: null, expiredNoticeSentAt: null } : {};
  return updateRow("listings", listing.id, { ...patch, ...renew, updatedAt: nowIso });
}
export async function incrementListingView(id) {
  await pool.query(`UPDATE listings SET view_count = view_count + 1 WHERE id = $1`, [id]);
}
// A seller deleting their own listing is a distinct status from a moderator
// removing one, so an admin "restore" can never resurrect it.
export async function deleteListingByOwner(id) {
  return updateRow("listings", id, { status: "deleted", removedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
}

// ---------- Listing moderation ----------
export async function getAllListingsAdmin() {
  const { rows } = await pool.query(
    `SELECT l.*, u.full_name AS owner_name, u.email AS owner_email, u.suspended_at AS owner_suspended_at, (l.expires_at <= now()) AS is_expired
       FROM listings l JOIN users u ON u.id = l.owner_id
      ORDER BY l.seq DESC`
  );
  return rows.map(rowToObj);
}
export async function removeListing(id, reason, adminId) {
  const { rows } = await pool.query(
    `UPDATE listings SET status = 'removed', removed_reason = $2, removed_at = now(), removed_by_user_id = $3
      WHERE id = $1 AND status = 'live' RETURNING *`,
    [id, reason || null, adminId]
  );
  return rowToObj(rows[0]);
}
export async function restoreListing(id) {
  const { rows } = await pool.query(
    `UPDATE listings SET status = 'live', removed_reason = NULL, removed_at = NULL, removed_by_user_id = NULL
      WHERE id = $1 AND status = 'removed' RETURNING *`,
    [id]
  );
  return rowToObj(rows[0]);
}

// ---------- Conversations ----------
const CONVERSATION_SELECT = `
  SELECT c.*,
         l.title AS listing_title, l.photos AS listing_photos, l.price AS listing_price,
         l.price_note AS listing_price_note, l.status AS listing_status, l.currency AS listing_currency,
         ub.full_name AS buyer_name, us.full_name AS seller_name
    FROM conversations c
    JOIN listings l ON l.id = c.listing_id
    JOIN users ub ON ub.id = c.buyer_id
    JOIN users us ON us.id = c.seller_id`;

export async function getConversationById(id) {
  const { rows } = await pool.query(`${CONVERSATION_SELECT} WHERE c.id = $1`, [id]);
  return rowToObj(rows[0]);
}
export async function getConversationFor(listingId, buyerId) {
  const { rows } = await pool.query(`${CONVERSATION_SELECT} WHERE c.listing_id = $1 AND c.buyer_id = $2`, [listingId, buyerId]);
  return rowToObj(rows[0]);
}
// ON CONFLICT makes a double-click (or two tabs) converge on one row.
export async function getOrCreateConversation(listing, buyerId) {
  const existing = await getConversationFor(listing.id, buyerId);
  if (existing) return { conversation: existing, created: false };
  const { id, __seq } = await nextId("conversations_seq", "C");
  const { rows } = await pool.query(
    `INSERT INTO conversations (id, seq, listing_id, buyer_id, seller_id) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (listing_id, buyer_id) DO NOTHING RETURNING id`,
    [id, __seq, listing.id, buyerId, listing.ownerId]
  );
  return { conversation: await getConversationFor(listing.id, buyerId), created: rows.length > 0 };
}
// Inbox: every conversation the user is part of that has at least one
// message, newest activity first. Labelled by listing title in the UI.
export async function getConversationsForUser(userId) {
  const { rows } = await pool.query(
    `${CONVERSATION_SELECT}
      WHERE (c.buyer_id = $1 OR c.seller_id = $1) AND c.last_message_at IS NOT NULL
      ORDER BY c.last_message_at DESC`,
    [userId]
  );
  return rows.map(rowToObj);
}
// The 💬 badge: conversations with a message from the other person that
// arrived after this user last read that conversation.
export async function getUnreadConversationCount(userId) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM conversations
      WHERE last_message_at IS NOT NULL AND last_sender_id <> $1
        AND ((buyer_id = $1 AND (buyer_last_read_at IS NULL OR buyer_last_read_at < last_message_at))
          OR (seller_id = $1 AND (seller_last_read_at IS NULL OR seller_last_read_at < last_message_at)))`,
    [userId]
  );
  return rows[0].n;
}
export function conversationRole(conversation, userId) {
  if (!conversation) return null;
  if (conversation.buyerId === userId) return "buyer";
  if (conversation.sellerId === userId) return "seller";
  return null;
}
export function isConversationUnread(conversation, userId) {
  const role = conversationRole(conversation, userId);
  if (!role || !conversation.lastMessageAt || conversation.lastSenderId === userId) return false;
  const readAt = role === "buyer" ? conversation.buyerLastReadAt : conversation.sellerLastReadAt;
  return !readAt || new Date(readAt) < new Date(conversation.lastMessageAt);
}
export async function markConversationRead(conversationId, role) {
  const col = role === "buyer" ? "buyer_last_read_at" : "seller_last_read_at";
  await pool.query(`UPDATE conversations SET ${col} = now() WHERE id = $1`, [conversationId]);
}
export async function markConversationNotified(conversationId, role) {
  const col = role === "buyer" ? "buyer_last_notified_at" : "seller_last_notified_at";
  await pool.query(`UPDATE conversations SET ${col} = now() WHERE id = $1`, [conversationId]);
}

// ---------- Messages ----------
// Inserts the message and updates the conversation's last-message fields in
// one transaction. Sending also counts as reading, for the sender.
export async function createMessage(conversation, senderId, body) {
  const role = conversationRole(conversation, senderId);
  const readCol = role === "buyer" ? "buyer_last_read_at" : "seller_last_read_at";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const n = (await client.query(`SELECT nextval('messages_seq') AS n`)).rows[0].n;
    const { rows } = await client.query(
      `INSERT INTO messages (id, seq, conversation_id, sender_id, body) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [`M-${1000 + n}`, n, conversation.id, senderId, body]
    );
    const message = rowToObj(rows[0]);
    await client.query(
      `UPDATE conversations SET last_message_at = $2, last_message_preview = $3, last_sender_id = $4, ${readCol} = $2 WHERE id = $1`,
      [conversation.id, message.createdAt, body.slice(0, 140), senderId]
    );
    await client.query("COMMIT");
    return message;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
export async function getMessagesForConversation(conversationId) {
  const { rows } = await pool.query(`SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC, seq ASC`, [conversationId]);
  return rows.map(rowToObj);
}
// Rate-limit helpers (lib/rateLimit.js).
export async function countMessagesBySenderSince(senderId, sinceIso) {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM messages WHERE sender_id = $1 AND created_at > $2`, [senderId, sinceIso]);
  return rows[0].n;
}
export async function countConversationsStartedSince(buyerId, sinceIso) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM conversations WHERE buyer_id = $1 AND created_at > $2 AND last_message_at IS NOT NULL`,
    [buyerId, sinceIso]
  );
  return rows[0].n;
}
export async function getRecentMessageBodiesBySender(senderId, sinceIso) {
  const { rows } = await pool.query(`SELECT body FROM messages WHERE sender_id = $1 AND created_at > $2`, [senderId, sinceIso]);
  return rows.map((r) => r.body);
}

// ---------- Reports ----------
export async function createReport(fields) {
  const { id, __seq } = await nextId("reports_seq", "R");
  return insertRow("reports", { id, __seq, status: "open", createdAt: new Date().toISOString(), ...fields });
}
export async function getReports(status) {
  const { rows } = await pool.query(
    `SELECT r.*, ur.full_name AS reporter_name, ur.email AS reporter_email,
            uu.full_name AS reported_user_name, uu.suspended_at AS reported_user_suspended_at,
            l.title AS listing_title, l.status AS listing_status
       FROM reports r
       JOIN users ur ON ur.id = r.reporter_id
       LEFT JOIN users uu ON uu.id = r.reported_user_id
       LEFT JOIN listings l ON l.id = r.listing_id
      WHERE ($1::text IS NULL OR r.status = $1)
      ORDER BY r.created_at DESC LIMIT 200`,
    [status || null]
  );
  return rows.map(rowToObj);
}
export async function getReportById(id) {
  return getRowById("reports", id);
}
export async function resolveReport(id, { status, resolvedBy, resolutionNote }) {
  return updateRow("reports", id, { status, resolvedBy, resolutionNote: resolutionNote || null, resolvedAt: new Date().toISOString() });
}
export async function countOpenReports() {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM reports WHERE status = 'open'`);
  return rows[0].n;
}
// One open report per reporter per target, so repeat clicks don't flood
// the queue. Conversation reports also carry listing_id, so the target is
// matched by type.
export async function hasOpenReportFrom(reporterId, targetType, targetId) {
  const col = targetType === "conversation" ? "conversation_id" : "listing_id";
  const { rows } = await pool.query(
    `SELECT 1 FROM reports WHERE reporter_id = $1 AND status = 'open' AND target_type = $2 AND ${col} = $3 LIMIT 1`,
    [reporterId, targetType, targetId]
  );
  return rows.length > 0;
}

// ---------- Contact messages ----------
export async function createContactMessage({ name, email, message, topic }) {
  const { id, __seq } = await nextId("contact_messages_seq", "CM");
  return insertRow("contact_messages", { id, __seq, name, email, message, topic: topic || "general", createdAt: new Date().toISOString() });
}
