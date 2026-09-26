// Adds the content-approval (artwork) columns to job_orders on an
// already-deployed database. scripts/schema.sql is the source of truth for
// a *fresh* database; this applies the same additions in place.
//
//   node scripts/migrate-content-approval.mjs

import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

const STATEMENTS = [
  `ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS artwork_url TEXT`,
  `ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS artwork_status TEXT NOT NULL DEFAULT 'not_submitted'`,
  `ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS artwork_rejected_reason TEXT`,
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
