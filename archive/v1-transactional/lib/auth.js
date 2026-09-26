// Password hashing + cookie sessions using only Node's built-in crypto.
// A real deployment should use a battle-tested auth provider instead of
// hand-rolled session cookies — this is deliberately minimal.

import crypto from "node:crypto";
import * as db from "./db.js";

const SESSION_COOKIE = "frontage_session";
// Contractors are a fully separate identity space from buyer/seller users —
// their own cookie/session, so the two logins never collide or share state.
const CONTRACTOR_SESSION_COOKIE = "frontage_contractor_session";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(check, "hex"), Buffer.from(hash, "hex"));
}

// At least 10 characters with an uppercase letter, a lowercase letter, a
// digit, and a symbol — enforced server-side wherever a password is set
// (signup, contractor signup, account password change, staff creation).
// The client-side <input pattern> below mirrors this exactly so a rejected
// password never reaches the server as a surprise.
export const PASSWORD_PATTERN = "(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{10,}";
const PASSWORD_REGEX = new RegExp(`^${PASSWORD_PATTERN}$`);
export function isStrongPassword(password) {
  return typeof password === "string" && PASSWORD_REGEX.test(password);
}
export const PASSWORD_HINT = "At least 10 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.";

export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = decodeURIComponent(pair.slice(idx + 1).trim());
    out[key] = val;
  });
  return out;
}

export function sessionCookieHeader(token) {
  const maxAge = 60 * 60 * 24 * 30;
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function clearCookieHeader() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

// Reads the session cookie off a request and returns the logged-in user,
// or null. Use this at the top of any page/API handler that needs auth.
// Async now that lib/db.js talks to Postgres — every caller awaits this.
export async function currentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = await db.getSession(token);
  if (!session) return null;
  return db.getUserById(session.userId);
}

export function contractorSessionCookieHeader(token) {
  const maxAge = 60 * 60 * 24 * 30;
  return `${CONTRACTOR_SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function clearContractorCookieHeader() {
  return `${CONTRACTOR_SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

// Mirrors currentUser(req) but reads the separate contractor identity space.
export async function currentContractor(req) {
  const cookies = parseCookies(req);
  const token = cookies[CONTRACTOR_SESSION_COOKIE];
  if (!token) return null;
  const session = await db.getContractorSession(token);
  if (!session) return null;
  return db.getContractorById(session.contractorId);
}

export { SESSION_COOKIE, CONTRACTOR_SESSION_COOKIE };
