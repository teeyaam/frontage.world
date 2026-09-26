// Copies ONE account (by default the owner's) from the v1 database into a
// v2 database, keeping its id and password, and makes it a verified
// super-admin. Nothing else is copied: no listings, no other users.
//
//   SOURCE_DATABASE_URL=<v1 db>  (reads only — never written)
//   DATABASE_URL=<v2 db>         (the target)
//   OWNER_EMAIL=teeyaam@gmail.com  (optional, this is the default)
//
//   node scripts/bootstrap-owner.mjs            # dry run: shows what it would do
//   node scripts/bootstrap-owner.mjs --apply    # does it
//
// Re-running is safe: an existing row with that id is updated, not duplicated.
// It also moves users_seq past the copied id, so new sign-ups never collide.

import "dotenv/config";
import pg from "pg";

const apply = process.argv.includes("--apply");
const email = (process.env.OWNER_EMAIL || "teeyaam@gmail.com").toLowerCase();
const src = process.env.SOURCE_DATABASE_URL;
const dst = process.env.DATABASE_URL;
if (!src || !dst) {
  console.error("Set both SOURCE_DATABASE_URL (v1, read-only) and DATABASE_URL (v2 target).");
  process.exit(1);
}
if (src === dst) {
  console.error("SOURCE_DATABASE_URL and DATABASE_URL are the same database — refusing.");
  process.exit(1);
}
const ssl = (u) => (/localhost|127\.0\.0\.1/.test(u) ? false : { rejectUnauthorized: false });
const source = new pg.Pool({ connectionString: src, ssl: ssl(src) });
const target = new pg.Pool({ connectionString: dst, ssl: ssl(dst) });

try {
  const { rows } = await source.query(
    `SELECT id, seq, full_name, email, mobile, password_hash, password_salt, business_name, google_business_url, email_verified_at, created_at
       FROM users WHERE lower(email) = $1`,
    [email]
  );
  const u = rows[0];
  if (!u) throw new Error(`No account with email ${email} in the source database.`);
  console.log(`Source account: ${u.id} (seq ${u.seq}), created ${new Date(u.created_at).toISOString().slice(0, 10)}.`);
  console.log(`Target: ${new URL(dst).hostname} — will upsert ${u.id} as a verified super-admin and set users_seq >= ${u.seq}.`);
  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write.");
  } else {
    await target.query(
      `INSERT INTO users (id, seq, full_name, email, mobile, password_hash, password_salt, business_name, google_business_url, is_admin, can_access_support, email_verified_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,TRUE,COALESCE($10, now()),$11)
       ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, mobile = EXCLUDED.mobile,
         password_hash = EXCLUDED.password_hash, password_salt = EXCLUDED.password_salt, business_name = EXCLUDED.business_name,
         google_business_url = EXCLUDED.google_business_url, is_admin = TRUE, can_access_support = TRUE,
         email_verified_at = COALESCE(users.email_verified_at, EXCLUDED.email_verified_at)`,
      [u.id, u.seq, u.full_name, u.email, u.mobile, u.password_hash, u.password_salt, u.business_name, u.google_business_url, u.email_verified_at, u.created_at]
    );
    await target.query(`SELECT setval('users_seq', GREATEST((SELECT COALESCE(MAX(seq), 1) FROM users), $1))`, [u.seq]);
    console.log(`Done: ${u.id} is a verified super-admin on the target.`);
  }
} catch (err) {
  console.error("Failed:", err.message);
  process.exitCode = 1;
} finally {
  await source.end();
  await target.end();
}
