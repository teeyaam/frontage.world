// Password hashing + cookie sessions using only Node's built-in crypto.
// Session tokens are stored hashed (see lib/db.js#createSession).

import crypto from "node:crypto";
import * as db from "./db.js";

const SESSION_COOKIE = "frontage_session";

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
// digit, and a symbol — enforced server-side wherever a password is set.
// The client-side <input pattern> mirrors this exactly.
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
    try {
      out[key] = decodeURIComponent(pair.slice(idx + 1).trim());
    } catch {
      // Malformed cookie value — ignore it rather than 500 the request.
    }
  });
  return out;
}

// `Secure` whenever the site is served over https (always in production,
// behind Render's TLS). Local http://localhost dev omits it so the cookie
// still sets.
export function cookieSecureFlag() {
  return /^https:/i.test(process.env.APP_BASE_URL || "") ? "; Secure" : "";
}

export function sessionCookieHeader(token) {
  const maxAge = 60 * 60 * 24 * 30;
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${cookieSecureFlag()}`;
}

export function clearCookieHeader() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${cookieSecureFlag()}`;
}

// Reads the session cookie and returns the logged-in user, or null. A
// suspended user is treated as logged out (their sessions are also deleted
// at suspension time — this covers any race).
export async function currentUser(req) {
  if (req.__currentUser !== undefined) return req.__currentUser;
  const token = parseCookies(req)[SESSION_COOKIE];
  let user = null;
  if (token) {
    const session = await db.getSession(token);
    if (session) {
      user = await db.getUserById(session.userId);
      if (user && user.suspendedAt) user = null;
    }
  }
  req.__currentUser = user;
  return user;
}

// Only same-site relative paths are allowed as a post-login destination —
// "/listing/L-1001" yes, "https://evil.example" or "//evil.example" no.
export function safeNext(next, fallback = "/") {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  return next;
}

export { SESSION_COOKIE };
