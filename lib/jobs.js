// Hourly background job, run inside the web process (no separate cron
// service to pay for):
//   - listing expiry reminders (7 days before) and expired notices
//   - the buyer "did it work out?" check-in, 3 weeks after first message
// Each step claims rows in the database before emailing (lib/db.js), so an
// email goes out at most once even across restarts or two instances.
// Set JOBS_ENABLED=0 to switch it off (e.g. a local copy pointed at a
// database whose members shouldn't get email).

import * as db from "./db.js";
import { trySend, expiryReminderEmail, listingExpiredEmail, buyerFollowupEmail } from "./email.js";

const HOUR = 60 * 60 * 1000;

export async function runJobsOnce() {
  const summary = { reminders: 0, expired: 0, followups: 0 };
  for (const l of await db.claimExpiryReminders()) {
    await trySend(expiryReminderEmail(l));
    summary.reminders++;
  }
  for (const l of await db.claimExpiredNotices()) {
    await trySend(listingExpiredEmail(l));
    summary.expired++;
  }
  for (const c of await db.claimBuyerFollowups()) {
    const buyer = await db.getUserById(c.buyerId);
    if (buyer && !buyer.suspendedAt) {
      await trySend(buyerFollowupEmail(c, buyer));
      summary.followups++;
    }
  }
  return summary;
}

export function startJobs() {
  if (process.env.JOBS_ENABLED === "0" || process.env.JOBS_ENABLED === "false") return;
  const tick = async () => {
    try {
      const s = await runJobsOnce();
      if (s.reminders || s.expired || s.followups) console.log(`[jobs] reminders=${s.reminders} expired=${s.expired} followups=${s.followups}`);
    } catch (err) {
      console.error("[jobs] run failed:", err.message);
    }
  };
  setTimeout(tick, 60 * 1000).unref(); // a minute after boot, then hourly
  setInterval(tick, HOUR).unref();
}
