// Clears test data from a v2 database before launch: every account except
// the owner's (which cascades to their listings, conversations, messages
// and reports), plus contact-form messages. By default the owner's own
// listings and conversations are removed too, so launch starts clean.
//
//   node scripts/purge-nonowner-data.mjs                  # dry run: counts only
//   node scripts/purge-nonowner-data.mjs --apply          # does it
//   node scripts/purge-nonowner-data.mjs --apply --keep-owner-listings
//
// OWNER_EMAIL defaults to teeyaam@gmail.com.

import "dotenv/config";
import pg from "pg";

const apply = process.argv.includes("--apply");
const keepOwnerListings = process.argv.includes("--keep-owner-listings");
const email = (process.env.OWNER_EMAIL || "teeyaam@gmail.com").toLowerCase();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
const count = async (sql, params = []) => (await pool.query(sql, params)).rows[0].n;

try {
  const owner = (await pool.query(`SELECT id FROM users WHERE lower(email) = $1`, [email])).rows[0];
  if (!owner) throw new Error(`Owner ${email} not found — refusing to purge (it would delete every account).`);
  const plan = {
    otherUsers: await count(`SELECT count(*)::int n FROM users WHERE id <> $1`, [owner.id]),
    listings: await count(keepOwnerListings ? `SELECT count(*)::int n FROM listings WHERE owner_id <> $1` : `SELECT count(*)::int n FROM listings`, keepOwnerListings ? [owner.id] : []),
    conversations: await count(`SELECT count(*)::int n FROM conversations`),
    reports: await count(`SELECT count(*)::int n FROM reports`),
    contactMessages: await count(`SELECT count(*)::int n FROM contact_messages`),
  };
  console.log(`Database: ${new URL(url).hostname}. Keeping ${owner.id} (${email}).`);
  console.log("Would delete:", plan, keepOwnerListings ? "(owner's listings kept)" : "");
  if (!apply) {
    console.log("Dry run only. Re-run with --apply to delete.");
  } else {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM users WHERE id <> $1`, [owner.id]);
      if (!keepOwnerListings) {
        await client.query(`DELETE FROM listings WHERE owner_id = $1`, [owner.id]);
        await client.query(`DELETE FROM reports`);
      }
      await client.query(`DELETE FROM contact_messages`);
      await client.query(`DELETE FROM sessions WHERE user_id <> $1`, [owner.id]);
      await client.query("COMMIT");
      console.log("Purged.");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
} catch (err) {
  console.error("Failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
