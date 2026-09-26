// Spam and abuse limits.
//
// Short bursts (per minute) use an in-memory sliding window. That's enough
// for one web instance; a restart just resets the windows. Daily messaging
// caps are counted from the database, so they survive restarts.

import * as db from "./db.js";
import { isEmailConfigured } from "./email.js";

const buckets = new Map(); // key -> array of hit timestamps (ms)

// Records a hit and reports whether it's within `limit` per `windowMs`.
export function hit(key, limit, windowMs) {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return { allowed: false, retryAfterSec: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { allowed: true, retryAfterSec: 0 };
}

// Drop idle keys every 10 minutes so the map can't grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of buckets) {
    if (!hits.length || now - hits[hits.length - 1] > 24 * 60 * 60 * 1000) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref();

// Render (and most hosts) put the real client IP first in X-Forwarded-For.
export function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket.remoteAddress || "unknown";
}

// Per-IP limits for the unauthenticated forms.
const FORM_LIMITS = {
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
  signup: { limit: 5, windowMs: 60 * 60 * 1000 },
  forgot: { limit: 5, windowMs: 60 * 60 * 1000 },
  contact: { limit: 5, windowMs: 60 * 60 * 1000 },
  report: { limit: 10, windowMs: 60 * 60 * 1000 },
  resendVerification: { limit: 3, windowMs: 60 * 60 * 1000 },
};
export function formLimit(req, name) {
  const cfg = FORM_LIMITS[name];
  return hit(`${name}:${clientIp(req)}`, cfg.limit, cfg.windowMs);
}

// ---------- Messaging ----------
export const MESSAGE_MAX_LENGTH = 2000;
const PER_MINUTE = 8;
const PER_DAY = 200;
const NEW_CONVERSATIONS_PER_DAY = 20;
const NEW_CONVERSATIONS_PER_DAY_NEW_ACCOUNT = 5;
const DUPLICATE_LIMIT = 3; // identical messages per hour, across all chats

// Returns null if the message may be sent, or a user-facing reason why not.
export async function checkMessageAllowed(user, { body, startsConversation }) {
  if (isEmailConfigured() && !user.emailVerifiedAt) {
    return "Please verify your email before sending messages — check your inbox, or resend the link from your Account page.";
  }
  if (!hit(`msg:${user.id}`, PER_MINUTE, 60 * 1000).allowed) {
    return "You're sending messages very quickly — wait a minute and try again.";
  }
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if ((await db.countMessagesBySenderSince(user.id, dayAgo)) >= PER_DAY) {
    return "You've reached today's message limit. Try again tomorrow, or contact us if you need more.";
  }
  if (startsConversation) {
    const isNewAccount = Date.now() - new Date(user.createdAt).getTime() < 24 * 60 * 60 * 1000;
    const cap = isNewAccount ? NEW_CONVERSATIONS_PER_DAY_NEW_ACCOUNT : NEW_CONVERSATIONS_PER_DAY;
    if ((await db.countConversationsStartedSince(user.id, dayAgo)) >= cap) {
      return `You can message up to ${cap} new sellers a day${isNewAccount ? " while your account is new" : ""}. Try again tomorrow.`;
    }
  }
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const same = (await db.getRecentMessageBodiesBySender(user.id, hourAgo)).filter((b) => norm(b) === norm(body)).length;
  if (same >= DUPLICATE_LIMIT) {
    return "You've sent that exact message several times already. Write something specific to this listing instead.";
  }
  return null;
}
