// Adds the password-reset columns to an already-deployed database.
//
// scripts/schema.sql is the source of truth for a *fresh* database, but the
// live one already exists — this applies the same additions in place. Every
// statement is IF NOT EXISTS, so re-running it is harmless.
//
//   node scripts/migrate-password-reset.mjs

import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

const STATEMENTS = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at BIGINT`,
  `CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token)`,
];

async function main() {
  for (const sql of STATEMENTS) {
    await pool.query(sql);
    console.log("OK:", sql);
  }
  await pool.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
