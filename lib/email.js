// Email via Resend (resend.com)'s plain HTTPS API — no npm dependency.
//
//   RESEND_API_KEY  — from the Resend dashboard
//   EMAIL_FROM      — e.g. "Frontage <hello@frontage.world>" (the domain
//                     must be verified in Resend first)
//   CONTACT_EMAIL   — where contact-form messages and new reports go; also
//                     the default reply-to, so replies reach a real inbox
//   APP_BASE_URL    — absolute origin for links, e.g. https://frontage.world
//
// Without RESEND_API_KEY/EMAIL_FROM every send is a logged no-op. Sending is
// best-effort: a failed email never fails the action that triggered it.

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function appBaseUrl() {
  return (process.env.APP_BASE_URL || "https://frontage.world").replace(/\/$/, "");
}

export async function sendEmail({ to, subject, html, replyTo }) {
  if (!to) return { skipped: true };
  if (!isEmailConfigured()) {
    console.log(`[email skipped — not configured] subject="${subject}"`);
    return { skipped: true };
  }
  // A plain-text part and a working reply-to both help keep mail out of
  // spam folders (HTML-only mail from a no-reply address scores badly).
  const payload = { from: process.env.EMAIL_FROM, to: [to], subject, html, text: htmlToText(html) };
  const reply = replyTo || process.env.CONTACT_EMAIL;
  if (reply) payload.reply_to = reply;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Resend API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// Emails must never fail the user action that triggered them.
export async function trySend(email) {
  try {
    await sendEmail(email);
  } catch (err) {
    console.error("Email send failed:", err.message);
  }
}

// Plain-text version of an email built by shell(): links become
// "label: url" so they still work in text-only mail clients.
export function htmlToText(html) {
  return String(html || "")
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, label) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      return text && text !== href ? `${text}: ${href}` : href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(title, bodyHtml, { footerNote = "" } = {}) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1B2A3D">
    <div style="font-weight:bold;font-size:18px;padding:16px 0;border-bottom:2px solid #FF6B35">FRONTAGE</div>
    <h2 style="font-size:17px;margin:18px 0 8px">${title}</h2>
    ${bodyHtml}
    <p style="font-size:12px;color:#5B6472;margin-top:28px;border-top:1px solid #DAD6CC;padding-top:12px">
      Frontage — list your vehicle for free and deal directly with advertisers. Frontage never handles payments between members.
      ${footerNote}
    </p>
  </div>`;
}

function button(href, label) {
  return `<p style="margin:18px 0"><a href="${esc(href)}" style="background:#FF6B35;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(label)}</a></p>`;
}

const firstName = (user) => esc(String(user.fullName || "").split(" ")[0] || "there");

// ---------------- The actual emails ----------------

export function verificationEmail(user, token) {
  const link = `${appBaseUrl()}/verify?token=${encodeURIComponent(token)}`;
  return {
    to: user.email,
    subject: "Verify your Frontage email",
    html: shell(
      `Welcome, ${firstName(user)}!`,
      `<p>Confirm this email address to start messaging vehicle owners and listing your own vehicle:</p>
       ${button(link, "Verify my email")}
       <p style="font-size:13px;color:#5B6472">If the button doesn't work, open this link:<br/>${esc(link)}</p>`
    ),
  };
}

export function passwordResetEmail(user, token) {
  const link = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    to: user.email,
    subject: "Reset your Frontage password",
    html: shell(
      "Reset your password",
      `<p>Hi ${firstName(user)}, someone (hopefully you) asked to reset the password for this Frontage account.</p>
       ${button(link, "Choose a new password")}
       <p style="font-size:13px;color:#5B6472">This link works once and expires in 1 hour. If you didn't ask for this, ignore this email — your password won't change.</p>`
    ),
  };
}

export function newMessageEmail(recipient, sender, conversation, messageBody) {
  const link = `${appBaseUrl()}/messages/${encodeURIComponent(conversation.id)}`;
  const preview = messageBody.length > 300 ? `${messageBody.slice(0, 300)}…` : messageBody;
  return {
    to: recipient.email,
    subject: `New message about “${conversation.listingTitle}”`,
    html: shell(
      `${esc(String(sender.fullName || "Someone").split(" ")[0])} sent you a message`,
      `<p style="margin:0 0 6px;font-size:13px;color:#5B6472">About your conversation on <strong>${esc(conversation.listingTitle)}</strong></p>
       <p style="white-space:pre-wrap;background:#EDEBE6;padding:14px;border-radius:8px">${esc(preview)}</p>
       ${button(link, "Reply on Frontage")}
       <p style="font-size:13px;color:#5B6472">Stay safe: keep the conversation on Frontage until you've seen the vehicle, and never pay by gift card, crypto or wire transfer to someone you haven't met.</p>`,
      { footerNote: `<br/>You'll get one email per new conversation activity, not one per message. <a href="${esc(appBaseUrl())}/account#notifications" style="color:#5B6472">Turn message emails off</a>.` }
    ),
  };
}

export function listingRemovedEmail(owner, listing, reason) {
  return {
    to: owner.email,
    subject: `Your listing “${listing.title}” was removed`,
    html: shell(
      "Your listing was removed",
      `<p>Hi ${firstName(owner)}, our moderators removed <strong>${esc(listing.title)}</strong> from Frontage.</p>
       ${reason ? `<p><strong>Reason:</strong> ${esc(reason)}</p>` : ""}
       <p>If you think this was a mistake, reply via our contact page and tell us the listing ID (${esc(listing.id)}).</p>
       ${button(`${appBaseUrl()}/contact`, "Contact Frontage")}`
    ),
  };
}

export function reportAlertEmail(report, reporter, summary) {
  return {
    to: process.env.CONTACT_EMAIL,
    subject: `[Frontage report] ${report.reason} — ${summary}`,
    html: shell(
      "New report",
      `<p><strong>${esc(report.reason)}</strong> — ${esc(summary)}</p>
       ${report.details ? `<p style="white-space:pre-wrap;background:#EDEBE6;padding:14px;border-radius:8px">${esc(report.details)}</p>` : ""}
       <p style="font-size:13px;color:#5B6472">Reported by ${esc(reporter.fullName)} (${esc(reporter.id)}).</p>
       ${button(`${appBaseUrl()}/admin/reports`, "Open the reports queue")}`
    ),
  };
}

export function contactForwardEmail(name, fromEmail, topic, message) {
  return {
    to: process.env.CONTACT_EMAIL,
    replyTo: fromEmail,
    subject: `[Frontage ${topic}] message from ${String(name).slice(0, 80)}`,
    html: shell(
      `New ${esc(topic)} message`,
      `<p><strong>From:</strong> ${esc(name)} &lt;${esc(fromEmail)}&gt;</p>
       <p style="white-space:pre-wrap;background:#EDEBE6;padding:14px;border-radius:8px">${esc(message)}</p>
       <p style="font-size:13px;color:#5B6472">Reply to this email to answer them directly.</p>`
    ),
  };
}

// ---------------- Listing lifecycle + deal check-in (lib/jobs.js) ----------------

export function expiryReminderEmail(listing) {
  const days = Math.max(1, Math.ceil((new Date(listing.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  return {
    to: listing.ownerEmail,
    subject: `Is “${listing.title}” still available?`,
    html: shell(
      "Still available?",
      `<p>Hi ${firstName({ fullName: listing.ownerName })}, your listing <strong>${esc(listing.title)}</strong> comes down from Frontage in ${days} day${days === 1 ? "" : "s"}.</p>
       <p>If your vehicle is still available, renew it in one click to keep it in front of advertisers for another 60 days. If it's been rented, mark it as rented instead — thanks for letting us know how it went.</p>
       ${button(`${appBaseUrl()}/sell`, "Renew or mark as rented")}`
    ),
  };
}

export function listingExpiredEmail(listing) {
  return {
    to: listing.ownerEmail,
    subject: `Your listing “${listing.title}” has expired`,
    html: shell(
      "Your listing has expired",
      `<p>Hi ${firstName({ fullName: listing.ownerName })}, <strong>${esc(listing.title)}</strong> has been on Frontage for 60 days, so it's now hidden from browse.</p>
       <p>Still available? Renew it and it goes straight back up — photos, messages and all.</p>
       ${button(`${appBaseUrl()}/sell`, "Renew my listing")}`
    ),
  };
}

export function buyerFollowupEmail(conversation, buyer) {
  const base = `${appBaseUrl()}/deal-check/${encodeURIComponent(conversation.buyerFollowupToken)}`;
  const link = (answer, label, primary) =>
    `<a href="${esc(`${base}?answer=${answer}`)}" style="display:inline-block;margin-right:8px;${primary ? "background:#FF6B35;color:#fff;" : "background:#fff;color:#1B2A3D;border:1px solid #1B2A3D;"}padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:bold">${label}</a>`;
  return {
    to: buyer.email,
    subject: `Did you end up advertising on “${conversation.listingTitle}”?`,
    html: shell(
      "How did it go?",
      `<p>Hi ${firstName(buyer)}, a few weeks ago you messaged about <strong>${esc(conversation.listingTitle)}</strong> on Frontage.</p>
       <p>Did you end up advertising there? One click tells us — it helps us bring more vehicles like it.</p>
       <p style="margin:20px 0">${link("yes", "Yes", true)}${link("no", "No", false)}</p>`,
      { footerNote: "<br/>We only ask once per conversation." }
    ),
  };
}
