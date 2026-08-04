// Transactional email seam — Resend (resend.com) via its plain HTTPS API,
// so no extra npm dependency is needed. Env-driven like every other
// external service in this app:
//
//   RESEND_API_KEY  — from the Resend dashboard
//   EMAIL_FROM      — e.g. "Frontage <hello@frontage.world>" (the domain
//                     must be verified in Resend first)
//   CONTACT_EMAIL   — where contact-form submissions get forwarded
//   APP_BASE_URL    — absolute origin used in email links,
//                     e.g. https://frontage.world
//
// When RESEND_API_KEY/EMAIL_FROM aren't set, every send becomes a logged
// no-op — the app keeps working, emails just don't go out yet. Callers
// treat sending as best-effort: a failed email never fails the user action
// that triggered it (see the try/catch at each call site).

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function appBaseUrl() {
  return (process.env.APP_BASE_URL || "https://frontage.world").replace(/\/$/, "");
}

export async function sendEmail({ to, subject, html }) {
  if (!isEmailConfigured()) {
    console.log(`[email skipped — not configured] to=${to} subject="${subject}"`);
    return { skipped: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
  return res.json();
}

// Shared wrapper so every email gets the same minimal, readable shell.
function shell(title, bodyHtml) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1B2A3D">
    <div style="font-weight:bold;font-size:18px;padding:16px 0;border-bottom:2px solid #FF6B35">FRONTAGE</div>
    <h2 style="font-size:17px;margin:18px 0 8px">${title}</h2>
    ${bodyHtml}
    <p style="font-size:12px;color:#8B9199;margin-top:28px;border-top:1px solid #DAD6CC;padding-top:12px">
      Frontage — free space, free money. This email was sent from an unmonitored address.
    </p>
  </div>`;
}

function button(href, label) {
  return `<p style="margin:18px 0"><a href="${href}" style="background:#FF6B35;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${label}</a></p>`;
}

// ---------------- The actual emails ----------------

export function verificationEmail(user, token) {
  const link = `${appBaseUrl()}/verify?token=${encodeURIComponent(token)}`;
  return {
    to: user.email,
    subject: "Verify your Frontage email",
    html: shell(
      `Welcome, ${user.fullName.split(" ")[0]}!`,
      `<p>Thanks for creating a Frontage account. Confirm this email address to unlock listing spaces and booking leases:</p>
       ${button(link, "Verify my email")}
       <p style="font-size:13px;color:#8B9199">If the button doesn't work, open this link:<br/>${link}</p>`
    ),
  };
}

export function bookingSellerEmail(seller, listing, booking) {
  return {
    to: seller.email,
    subject: `Your space "${listing.title}" has been booked 🎉`,
    html: shell(
      "Your space has been booked",
      `<p><strong>${listing.title}</strong> at ${listing.venue} has been leased for a ${booking.term}-month term at $${listing.price}/month.</p>
       <p>Next step: a contractor will pick up the install job — once they do, you'll be asked to confirm an access window for the install. Your payout is held until the install is confirmed complete.</p>
       ${button(`${appBaseUrl()}/seller/jobs`, "View the job order")}`
    ),
  };
}

export function bookingBuyerEmail(buyer, listing, booking) {
  return {
    to: buyer.email,
    subject: `Booking confirmed — ${listing.title}`,
    html: shell(
      "Booking confirmed",
      `<p>You've leased <strong>${listing.title}</strong> at ${listing.venue} for ${booking.term} months at $${listing.price}/month.</p>
       <p>A Frontage-network contractor will pick up the print & install job and send you a quote — watch your leases page for updates.</p>
       ${button(`${appBaseUrl()}/account/leases`, "View my lease")}`
    ),
  };
}

export function jobUpdateEmail(recipient, listing, jobOrder, whatHappened) {
  return {
    to: recipient.email,
    subject: `Update on ${listing.title} — ${whatHappened}`,
    html: shell(
      "Lease update",
      `<p>Job order <strong>${jobOrder.id}</strong> for <strong>${listing.title}</strong>: ${whatHappened}.</p>
       ${button(`${appBaseUrl()}/account/leases`, "View details")}`
    ),
  };
}

export function contactForwardEmail(name, fromEmail, topic, message) {
  return {
    to: process.env.CONTACT_EMAIL,
    subject: `[Frontage ${topic}] message from ${name}`,
    html: shell(
      `New ${topic} message`,
      `<p><strong>From:</strong> ${name} &lt;${fromEmail}&gt;</p>
       <p style="white-space:pre-wrap;background:#EDEBE6;padding:14px;border-radius:8px">${message}</p>
       <p style="font-size:13px;color:#8B9199">Reply directly to this person at ${fromEmail}.</p>`
    ),
  };
}

export function leaseReminderEmail(buyer, listing, booking, daysLeft) {
  return {
    to: buyer.email,
    subject: `Your lease on "${listing.title}" ends in ${daysLeft} days`,
    html: shell(
      "Your lease is ending soon",
      `<p>Your ${booking.term}-month lease on <strong>${listing.title}</strong> at ${listing.venue} ends in <strong>${daysLeft} days</strong>.</p>
       <p>From your leases page you can renew for another term, or set it to end — if you do nothing it auto-renews monthly.</p>
       ${button(`${appBaseUrl()}/account/leases`, "Renew or end my lease")}`
    ),
  };
}
