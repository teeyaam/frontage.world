// Makes an existing account a super-admin (full moderation + staff access).
// The person must have signed up on the site first.
//
//   node scripts/grant-admin.mjs someone@example.com            # dry run
//   node scripts/grant-admin.mjs someone@example.com --apply
//
// Targets DATABASE_URL — point it at production explicitly when needed:
//   DATABASE_URL=$PRODUCTION_DATABASE_URL node scripts/grant-admin.mjs ...

import "dotenv/config";
import pg from "pg";

const email = (process.argv[2] || "").toLowerCase();
const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/grant-admin.mjs <email> [--apply]");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url || "") ? false : { rejectUnauthorized: false } });
try {
  const u = (await pool.query(`SELECT id, is_admin, email_verified_at IS NOT NULL AS verified FROM users WHERE lower(email) = $1`, [email])).rows[0];
  if (!u) throw new Error(`No account with ${email} on ${new URL(url).hostname} — they need to sign up first.`);
  console.log(`${email} is ${u.id} on ${new URL(url).hostname} (admin: ${u.is_admin}, email verified: ${u.verified}).`);
  if (!apply) console.log("Dry run only. Re-run with --apply.");
  else {
    await pool.query(`UPDATE users SET is_admin = TRUE, can_access_support = TRUE WHERE id = $1`, [u.id]);
    console.log(`Done: ${u.id} is now a super-admin.`);
  }
} catch (err) {
  console.error("Failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
