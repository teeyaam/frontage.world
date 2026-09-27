// Messaging: one inbox, one conversation per listing + buyer. Buyers start
// conversations from a listing page; either side replies. The client polls
// for new messages (public/chat.js); there are no websockets.

import { layout, escapeHtml } from "../lib/layout.js";
import { currentUser } from "../lib/auth.js";
import * as db from "../lib/db.js";
import { readBody } from "../lib/body.js";
import { priceLabel, timeAgo } from "../lib/format.js";
import { checkMessageAllowed, MESSAGE_MAX_LENGTH } from "../lib/rateLimit.js";
import { trySend, newMessageEmail } from "../lib/email.js";
import { send, redirect, requireUser, notFoundPage, coverPhoto, reportFormMarkup, viewerContext } from "./pages.js";

function wantsJson(req) {
  return String(req.headers.accept || "").includes("application/json");
}
function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function firstName(name) {
  return String(name || "").split(" ")[0] || "Someone";
}

// Loads the conversation and confirms the current user is one of its two
// parties. Anyone else gets a 404 (never a hint that it exists).
async function loadOwnConversation(req, id) {
  const user = await currentUser(req);
  if (!user) return { user: null };
  const conversation = await db.getConversationById(id);
  const role = db.conversationRole(conversation, user.id);
  if (!role) return { user, conversation: null };
  return { user, conversation, role };
}

// ---------------- Inbox ----------------
export async function inboxPage(req, res) {
  const user = await requireUser(req, res, "/account/messages");
  if (!user) return;
  const conversations = await db.getConversationsForUser(user.id);
  const rows = conversations
    .map((c) => {
      const role = db.conversationRole(c, user.id);
      const other = role === "buyer" ? c.sellerName : c.buyerName;
      const unread = db.isConversationUnread(c, user.id);
      const photo = coverPhoto(c);
      const youSent = c.lastSenderId === user.id;
      return `<a class="inbox-row${unread ? " is-unread" : ""}" href="/messages/${escapeHtml(c.id)}">
        <div class="inbox-thumb">${photo ? `<img src="${escapeHtml(photo)}" alt="" loading="lazy" />` : ""}</div>
        <div class="inbox-body">
          <div class="inbox-top"><span class="inbox-title">${escapeHtml(c.listingTitle)}</span><span class="small muted">${escapeHtml(timeAgo(c.lastMessageAt))}</span></div>
          <div class="small muted">${escapeHtml(firstName(other))} · ${role === "seller" ? "your listing" : "you're enquiring"}${c.listingStatus !== "live" ? " · listing no longer available" : ""}</div>
          <div class="inbox-preview">${youSent ? "You: " : ""}${escapeHtml(c.lastMessagePreview || "")}</div>
        </div>
        ${unread ? `<span class="unread-dot" aria-label="Unread"></span>` : ""}
      </a>`;
    })
    .join("");
  const body = `
    <h1 style="margin-bottom:18px">Messages</h1>
    ${
      conversations.length
        ? `<div class="inbox">${rows}</div>`
        : `<div class="panel empty-state"><p class="muted">No messages yet. When you message a seller — or someone messages you about your listing — the conversation shows up here.</p><a href="/" class="btn btn-primary">Browse spaces</a></div>`
    }`;
  send(res, 200, await layout({ title: "Messages", activeNav: "messages", user, body, noindex: true }));
}

// ---------------- Conversation page ----------------
export async function conversationPage(req, res, id) {
  const { user, conversation, role } = await loadOwnConversation(req, id);
  if (!user) return redirect(res, `/onboarding?next=${encodeURIComponent(`/messages/${id}`)}`);
  if (!conversation) return notFoundPage(req, res, "This conversation doesn't exist.");
  await db.markConversationRead(conversation.id, role);

  const messages = await db.getMessagesForConversation(conversation.id);
  const otherName = role === "buyer" ? conversation.sellerName : conversation.buyerName;
  const listingLive = conversation.listingStatus === "live";
  const photo = coverPhoto(conversation);
  const initial = serializeMessages(messages, conversation, user.id);
  const otherSuspended = (await db.getUserById(role === "buyer" ? conversation.sellerId : conversation.buyerId))?.suspendedAt;
  const sendError = new URL(req.url, "http://localhost").searchParams.get("err");

  const body = `
    <a href="/account/messages" class="small muted back-link">← All messages</a>
    <div class="chat-shell">
      <div class="chat-header">
        <a href="/listing/${escapeHtml(conversation.listingId)}" class="chat-listing">
          <span class="inbox-thumb">${photo ? `<img src="${escapeHtml(photo)}" alt="" />` : ""}</span>
          <span><strong>${escapeHtml(conversation.listingTitle)}</strong><br/><span class="small muted">${escapeHtml(
    priceLabel({ price: conversation.listingPrice, priceNote: conversation.listingPriceNote, currency: conversation.listingCurrency }, { viewerCurrency: viewerContext(req, user).currency })
  )}</span></span>
        </a>
        <div class="small muted">Chatting with <strong>${escapeHtml(firstName(otherName))}</strong>${role === "seller" ? " about your listing" : " (the seller)"}</div>
      </div>
      <details class="safety-strip">
        <summary>Frontage never handles payments — deal directly and safely. <span class="link">Tips</span></summary>
        <ul class="small">
          <li>See the space (or a live video) before you pay anything, and check who actually controls it.</li>
          <li>Never pay by gift card, crypto or wire transfer, or to someone other than the owner.</li>
          <li>Check council, landlord or strata rules before printing an ad.</li>
          <li>Keep chatting here until you're confident — it's your record if something goes wrong.</li>
        </ul>
      </details>
      <div class="chat-thread" id="chat-thread" data-conversation="${escapeHtml(conversation.id)}" data-me="${escapeHtml(user.id)}" aria-live="polite">
        ${initial.messages.length ? "" : `<div class="small muted chat-empty">No messages yet.</div>`}
      </div>
      <div class="chat-seen small muted" id="chat-seen" hidden>Seen</div>
      ${
        listingLive && !otherSuspended
          ? `<form method="POST" action="/api/conversations/${escapeHtml(conversation.id)}/messages" class="chat-composer" id="chat-form">
              <label for="chat-body" class="visually-hidden">Message</label>
              <textarea id="chat-body" name="body" rows="2" maxlength="${MESSAGE_MAX_LENGTH}" required placeholder="Write a message…"></textarea>
              <button class="btn btn-accent" type="submit">Send</button>
            </form>
            <div class="field-error" id="chat-error" role="alert"${sendError ? "" : " hidden"}>${escapeHtml(sendError || "")}</div>`
          : `<div class="notice notice-orange">${otherSuspended ? "This member's account is no longer active." : "This listing is no longer available, so the conversation is closed."}</div>`
      }
      <div class="small" style="text-align:right;margin-top:10px"><a href="/messages/${escapeHtml(conversation.id)}/report" class="muted link-quiet">Report this conversation</a></div>
    </div>
    <script>window.FRONTAGE_CHAT = ${JSON.stringify(initial).replace(/</g, "\\u003c")};</script>
    <script src="/chat.js" defer></script>`;
  send(res, 200, await layout({ title: `Messages — ${conversation.listingTitle}`, activeNav: "messages", user, body, noindex: true }));
}

function serializeMessages(messages, conversation, meId) {
  const role = db.conversationRole(conversation, meId);
  const otherReadAt = role === "buyer" ? conversation.sellerLastReadAt : conversation.buyerLastReadAt;
  const names = { [conversation.buyerId]: firstName(conversation.buyerName), [conversation.sellerId]: firstName(conversation.sellerName) };
  return {
    messages: messages.map((m) => ({ id: m.id, mine: m.senderId === meId, name: names[m.senderId] || "", body: m.body, at: m.createdAt })),
    otherReadAt: otherReadAt || null,
  };
}

// GET /api/conversations/:id/messages — polled while the chat is open.
// Polling while the tab is visible counts as reading (?visible=1).
export async function conversationMessagesJson(req, res, id, query) {
  const { user, conversation, role } = await loadOwnConversation(req, id);
  if (!user || !conversation) return json(res, 404, { error: "Not found" });
  if (query.get("visible") === "1") await db.markConversationRead(conversation.id, role);
  const messages = await db.getMessagesForConversation(conversation.id);
  json(res, 200, serializeMessages(messages, conversation, user.id));
}

// ---------------- Sending ----------------
// Shared by "Message seller" on a listing page and replies in a chat.
async function deliver(req, res, { user, listing, conversation, body, startsConversation, backPath }) {
  const fail = (status, error) => (wantsJson(req) ? json(res, status, { error }) : redirect(res, `${backPath}${backPath.includes("?") ? "&" : "?"}err=${encodeURIComponent(error)}`));
  const text = String(body || "").replace(/\r\n/g, "\n").trim();
  if (!text) return fail(400, "Write a message first.");
  if (text.length > MESSAGE_MAX_LENGTH) return fail(400, `Messages can be up to ${MESSAGE_MAX_LENGTH} characters.`);
  if (listing.status !== "live") return fail(400, "This listing is no longer available.");
  const blocked = await checkMessageAllowed(user, { body: text, startsConversation });
  if (blocked) return fail(429, blocked);

  const message = await db.createMessage(conversation, user.id, text);
  await maybeNotify(conversation, user, text);

  if (wantsJson(req)) {
    const fresh = await db.getConversationById(conversation.id);
    return json(res, 200, { ok: true, message: { id: message.id }, ...serializeMessages(await db.getMessagesForConversation(conversation.id), fresh, user.id) });
  }
  redirect(res, `/messages/${conversation.id}${startsConversation ? "?started=1" : ""}`);
}

// One email per unread streak: only if the recipient has read the
// conversation since we last emailed them (or we never have), and they
// aren't looking at it right now (read within the last 2 minutes).
async function maybeNotify(conversation, sender, text) {
  const recipientRole = conversation.buyerId === sender.id ? "seller" : "buyer";
  const recipient = await db.getUserById(recipientRole === "buyer" ? conversation.buyerId : conversation.sellerId);
  if (!recipient || !recipient.notifyMessages || recipient.suspendedAt) return;
  const readAt = recipientRole === "buyer" ? conversation.buyerLastReadAt : conversation.sellerLastReadAt;
  const notifiedAt = recipientRole === "buyer" ? conversation.buyerLastNotifiedAt : conversation.sellerLastNotifiedAt;
  const activeNow = readAt && Date.now() - new Date(readAt).getTime() < 2 * 60 * 1000;
  const alreadyNotified = notifiedAt && (!readAt || new Date(notifiedAt) > new Date(readAt));
  if (activeNow || alreadyNotified) return;
  await db.markConversationNotified(conversation.id, recipientRole);
  await trySend(newMessageEmail(recipient, sender, conversation, text));
}

// POST /api/listings/:id/messages — "Message seller" on a listing page.
export async function messageSellerHandler(req, res, listingId) {
  const user = await currentUser(req);
  if (!user) return redirect(res, `/onboarding?next=${encodeURIComponent(`/listing/${listingId}`)}`);
  const b = await readBody(req, { limit: 16 * 1024 });
  const listing = await db.getPublicListing(listingId);
  if (!listing) return notFoundPage(req, res, "This listing is no longer available.");
  if (listing.ownerId === user.id) return redirect(res, `/listing/${listingId}`);
  const { conversation } = await db.getOrCreateConversation(listing, user.id);
  const startsConversation = !conversation.lastMessageAt;
  await deliver(req, res, { user, listing, conversation, body: b.body, startsConversation, backPath: `/listing/${listingId}` });
}

// POST /api/conversations/:id/messages — a reply from either side.
export async function replyHandler(req, res, id) {
  const { user, conversation } = await loadOwnConversation(req, id);
  if (!user) return redirect(res, `/onboarding?next=${encodeURIComponent(`/messages/${id}`)}`);
  if (!conversation) return notFoundPage(req, res);
  const b = await readBody(req, { limit: 16 * 1024 });
  const listing = await db.getPublicListing(conversation.listingId);
  const otherId = conversation.buyerId === user.id ? conversation.sellerId : conversation.buyerId;
  const other = await db.getUserById(otherId);
  if (!listing || !other || other.suspendedAt) {
    const error = "This conversation is closed.";
    return wantsJson(req) ? json(res, 400, { error }) : redirect(res, `/messages/${id}`);
  }
  await deliver(req, res, { user, listing, conversation, body: b.body, startsConversation: false, backPath: `/messages/${id}` });
}

// ---------------- Reporting a conversation ----------------
export async function reportConversationPage(req, res, id, query) {
  const { user, conversation, role } = await loadOwnConversation(req, id);
  if (!user) return redirect(res, `/onboarding?next=${encodeURIComponent(`/messages/${id}/report`)}`);
  if (!conversation) return notFoundPage(req, res);
  const otherName = role === "buyer" ? conversation.sellerName : conversation.buyerName;
  const body = reportFormMarkup({
    heading: `Report your conversation with ${firstName(otherName)}`,
    subject: conversation.listingTitle,
    action: "/api/reports",
    hidden: { targetType: "conversation", conversationId: conversation.id },
    backHref: `/messages/${conversation.id}`,
    sent: query.get("sent"),
  });
  send(res, 200, await layout({ title: "Report conversation", user, body, noindex: true }));
}
