// Messaging: one inbox, one conversation per listing + buyer. Buyers start
// conversations from a listing page; either side replies. The client polls
// for new messages (public/chat.js); there are no websockets.

import { layout, escapeHtml } from "../lib/layout.js";
import { currentUser } from "../lib/auth.js";
import * as db from "../lib/db.js";
import { readBody } from "../lib/body.js";
import { priceLabel, timeAgo } from "../lib/format.js";
import { defaultTerms, parseTerms, agreementHtml, insuranceText, FEE_FREQUENCIES, INSPECTIONS, PARTY } from "../lib/agreement.js";
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
  const agreement = await db.getAgreementByConversation(conversation.id);
  const agreementBox = agreement
    ? `<div class="agreement-box"><span>📄 <strong>Advertising agreement</strong> <span class="small muted">· updated ${escapeHtml(timeAgo(agreement.updatedAt))}</span></span>
        <span><a class="link" href="/messages/${escapeHtml(conversation.id)}/agreement/view">View &amp; print</a>${role === "seller" ? ` · <a class="link" href="/messages/${escapeHtml(conversation.id)}/agreement">Edit</a>` : ""}</span></div>`
    : role === "seller" && listingLive
    ? `<div class="agreement-box"><span class="small">Ready to make it official?</span> <a class="link" href="/messages/${escapeHtml(conversation.id)}/agreement">Prepare an agreement from your listing →</a></div>`
    : "";

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
      ${agreementBox}
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
          ? `${quickRepliesMarkup(role, "chat-body", conversation.id)}
            <form method="POST" action="/api/conversations/${escapeHtml(conversation.id)}/messages" class="chat-composer" id="chat-form">
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

// Tap-to-insert message starters (public/client.js fills the textarea; the
// member can edit before sending).
export const QUICK_REPLIES = {
  buyer: [
    "Hi, is this space still available?",
    "What's the minimum term?",
    "Could I see the space in person before we agree?",
    "Is the price negotiable?",
    "Can you arrange printing and installation, or do I supply that?",
  ],
  seller: [
    "Yes, it's still available.",
    "When would you like to start, and for how long?",
    "Could you send me your artwork or brand details?",
    "Happy to arrange a site visit — what time suits you?",
    "Do you need any council or landlord approvals for your ad?",
  ],
};
export function quickRepliesMarkup(role, textareaId, conversationId) {
  const chips = (QUICK_REPLIES[role] || [])
    .map((t) => `<button type="button" class="chip-pill quick-reply" data-quick="${escapeHtml(t)}">${escapeHtml(t)}</button>`)
    .join("");
  const agreementChip = role === "seller" && conversationId ? `<a class="chip-pill quick-reply quick-agreement" href="/messages/${escapeHtml(conversationId)}/agreement">📄 Send an agreement</a>` : "";
  return `<div class="quick-replies" data-target="${escapeHtml(textareaId)}" aria-label="Quick messages">${agreementChip}${chips}</div>`;
}

// ---------------- Agreement ----------------
async function loadAgreementContext(req, id) {
  const ctx = await loadOwnConversation(req, id);
  if (!ctx.user || !ctx.conversation) return ctx;
  const listing = await db.getListingById(ctx.conversation.listingId);
  const agreement = await db.getAgreementByConversation(ctx.conversation.id);
  return { ...ctx, listing, agreement };
}

function agreementFormPage({ conversation, listing, terms, errors = {}, isNew }) {
  const v = (k) => escapeHtml(terms[k] == null ? "" : terms[k]);
  const err = (k) => (errors[k] ? `<div class="field-error">${escapeHtml(errors[k])}</div>` : "");
  const select = (name, options, label) => `<div class="field"><label for="ag-${name}">${label}</label><select id="ag-${name}" name="${name}">${Object.entries(options)
    .map(([k, l]) => `<option value="${k}"${terms[name] === k ? " selected" : ""}>${escapeHtml(l)}</option>`)
    .join("")}</select></div>`;
  const input = (name, label, attrs = "", hint = "") => `<div class="field"><label for="ag-${name}">${label}</label><input id="ag-${name}" name="${name}" value="${v(name)}" ${attrs} />${hint ? `<div class="small muted">${hint}</div>` : ""}${err(name)}</div>`;
  return `
    <a href="/messages/${escapeHtml(conversation.id)}" class="small muted back-link">← Back to the conversation</a>
    <div class="form-card">
      <h1>${isNew ? "Prepare an agreement" : "Edit the agreement"}</h1>
      <p class="muted small">We've filled this in from your listing. Check every detail, then share it — ${escapeHtml(String(conversation.buyerName || "the advertiser").split(" ")[0])} gets a message with a link, and you can both print it or save it as a PDF to sign. It's a template, not legal advice, and Frontage isn't a party to it.</p>
      <form method="POST" action="/api/conversations/${escapeHtml(conversation.id)}/agreement" data-single-submit>
        <h2 class="form-section">Who and what</h2>
        ${input("ownerName", "Owner (you, or your business)", 'maxlength="120" required')}
        ${input("advertiserName", "Advertiser", 'maxlength="120" required')}
        ${input("spaceDescription", "The space", 'maxlength="200"')}
        ${input("spaceAddress", "Where it is", 'maxlength="300" required', "The full address is only shown to this advertiser.")}
        ${input("spaceSize", "Size", 'maxlength="60"')}
        <h2 class="form-section">Money and dates</h2>
        <div class="form-row">
          ${input("fee", `Fee (${escapeHtml(listing.currency || "AUD")})`, 'inputmode="decimal" required')}
          ${select("feeFrequency", FEE_FREQUENCIES, "Charged")}
        </div>
        ${input("paymentTerms", "How and when it's paid", 'maxlength="300"')}
        <div class="form-row">
          ${input("startDate", "Start date", 'type="date" required')}
          ${input("endDate", "End date", 'type="date" required')}
        </div>
        <h2 class="form-section">Looking after the space</h2>
        <div class="form-row">
          ${select("inspection", INSPECTIONS, "Site inspections")}
          ${input("inspectionNoticeDays", "Notice before an inspection (days)", 'inputmode="numeric"')}
        </div>
        <div class="form-row">
          ${select("artworkBy", PARTY, "Who supplies the artwork")}
          ${select("installBy", PARTY, "Who installs and removes it")}
        </div>
        ${select("approvalsBy", PARTY, "Who gets council / landlord approvals")}
        <div class="field"><label for="ag-insurance">Insurance <span class="muted">(optional)</span></label><textarea id="ag-insurance" name="insurance" rows="3" maxlength="1000" placeholder="e.g. The Advertiser holds public liability insurance covering the ad and its installation, and shows a certificate on request.">${escapeHtml(insuranceText(terms.insurance))}</textarea><div class="small muted">Leave blank if you haven't agreed anything about insurance.</div></div>
        <div class="form-row">
          ${input("removalDays", "Days to remove the ad after the end", 'inputmode="numeric"')}
          ${input("noticeDays", "Notice to end early (days)", 'inputmode="numeric"')}
        </div>
        <div class="field"><label for="ag-specialConditions">Special conditions <span class="muted">(optional)</span></label><textarea id="ag-specialConditions" name="specialConditions" rows="4" maxlength="2000" placeholder="e.g. Ad must be family-friendly. Lights on the wall stay on until 10pm.">${v("specialConditions")}</textarea></div>
        <button class="btn btn-accent btn-block" type="submit">${isNew ? "Save and share with the advertiser" : "Save changes"}</button>
      </form>
    </div>`;
}

// GET /messages/:id/agreement — the seller's form.
export async function agreementFormHandler(req, res, id) {
  const { user, conversation, role, listing, agreement } = await loadAgreementContext(req, id);
  if (!user) return redirect(res, `/onboarding?next=${encodeURIComponent(`/messages/${id}/agreement`)}`);
  if (!conversation || !listing) return notFoundPage(req, res, "This conversation doesn't exist.");
  if (role !== "seller") return redirect(res, agreement ? `/messages/${conversation.id}/agreement/view` : `/messages/${conversation.id}`);
  const buyer = await db.getUserById(conversation.buyerId);
  const terms = agreement ? agreement.terms : defaultTerms({ listing, seller: user, buyer: buyer || {} });
  send(res, 200, await layout({ title: "Agreement", activeNav: "messages", user, body: agreementFormPage({ conversation, listing, terms, isNew: !agreement }), noindex: true }));
}

// POST /api/conversations/:id/agreement — save, and tell the buyer.
export async function agreementSaveHandler(req, res, id) {
  const { user, conversation, role, listing } = await loadAgreementContext(req, id);
  if (!user) return redirect(res, "/onboarding");
  if (!conversation || !listing || role !== "seller") return notFoundPage(req, res, "This conversation doesn't exist.");
  const b = await readBody(req, { limit: 32 * 1024 });
  const { terms, errors } = parseTerms(b);
  if (Object.keys(errors).length) {
    return send(res, 422, await layout({ title: "Agreement", activeNav: "messages", user, body: agreementFormPage({ conversation, listing, terms, errors, isNew: !(await db.getAgreementByConversation(conversation.id)) }), noindex: true }));
  }
  const { created } = await db.saveAgreement(conversation, terms);
  const text = created
    ? "I've prepared a draft advertising agreement for this space. Open it from the agreement box in our conversation — let me know if anything needs changing."
    : "I've updated the agreement — open it from the agreement box in our conversation to see the latest version.";
  await db.createMessage(conversation, user.id, text);
  await maybeNotify(conversation, user, text);
  redirect(res, `/messages/${conversation.id}/agreement/view?saved=1`);
}

// GET /messages/:id/agreement/view — printable, for both parties.
export async function agreementViewHandler(req, res, id) {
  const { user, conversation, role, listing, agreement } = await loadAgreementContext(req, id);
  if (!user) return redirect(res, `/onboarding?next=${encodeURIComponent(`/messages/${id}/agreement/view`)}`);
  if (!conversation || !agreement) return notFoundPage(req, res, "There's no agreement for this conversation yet.");
  const saved = new URL(req.url, "http://localhost").searchParams.get("saved");
  const body = `
    <div class="no-print">
      <a href="/messages/${escapeHtml(conversation.id)}" class="small muted back-link">← Back to the conversation</a>
      ${saved ? `<div class="notice notice-green">Saved and shared — ${escapeHtml(String(conversation.buyerName || "the advertiser").split(" ")[0])} has been sent a message about it.</div>` : ""}
      <div class="agreement-actions">
        <button type="button" class="btn btn-accent" data-print>Print or save as PDF</button>
        ${role === "seller" ? `<a class="btn btn-outline" href="/messages/${escapeHtml(conversation.id)}/agreement">Edit</a>` : ""}
      </div>
    </div>
    ${agreementHtml(agreement.terms, { currency: (listing && listing.currency) || "AUD", countryCode: (listing && listing.countryCode) || "AU", updatedAt: agreement.updatedAt })}`;
  send(res, 200, await layout({ title: "Advertising agreement", activeNav: "messages", user, body, noindex: true }));
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
  if (listing.ownerId === user.id || listing.exampleKey) return redirect(res, `/listing/${listingId}`);
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
