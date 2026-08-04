// Lease-expiry reminders — emails buyers whose active lease ends within 30
// days, once per lease (bookings.reminder_sent_at guards against repeats).
// Run daily via a scheduler, e.g. a Render Cron Job with the command:
//
//   node scripts/send-lease-reminders.mjs
//
// Safe to run as often as you like — it only ever sends one reminder per
// booking, and does nothing at all until the email service is configured.

import "dotenv/config";
import pg from "pg";
import { sendEmail, leaseReminderEmail, isEmailConfigured } from "../lib/email.js";
import { leaseEndIso, daysUntil } from "../lib/format.js";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
if (!isEmailConfigured()) {
  console.log("Email service not configured (RESEND_API_KEY/EMAIL_FROM) — nothing to send.");
  process.exit(0);
}

const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

async function main() {
  const { rows } = await pool.query(
    `SELECT b.id, b.term, b.lease_start_date, b.buyer_id, b.listing_id
     FROM bookings b
     WHERE b.status = 'active' AND b.lease_start_date IS NOT NULL AND b.reminder_sent_at IS NULL`
  );

  let sent = 0;
  for (const row of rows) {
    const endIso = leaseEndIso(new Date(row.lease_start_date).toISOString(), row.term);
    const remaining = endIso ? daysUntil(endIso) : null;
    if (remaining === null || remaining > 30 || remaining < 0) continue;

    const buyerRes = await pool.query(`SELECT id, full_name, email FROM users WHERE id = $1`, [row.buyer_id]);
    const listingRes = await pool.query(`SELECT id, title, venue FROM listings WHERE id = $1`, [row.listing_id]);
    const buyer = buyerRes.rows[0];
    const listing = listingRes.rows[0];
    if (!buyer || !listing) continue;

    try {
      await sendEmail(
        leaseReminderEmail(
          { email: buyer.email, fullName: buyer.full_name },
          { title: listing.title, venue: listing.venue },
          { term: row.term },
          remaining
        )
      );
      await pool.query(`UPDATE bookings SET reminder_sent_at = now() WHERE id = $1`, [row.id]);
      sent++;
      console.log(`Reminder sent for booking ${row.id} (${remaining} days left) -> ${buyer.email}`);
    } catch (err) {
      console.error(`Failed for booking ${row.id}:`, err.message);
    }
  }
  console.log(`Done — ${sent} reminder(s) sent, ${rows.length - sent} skipped/not due.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Reminder run failed:", err);
  process.exit(1);
});
