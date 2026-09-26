// Creates the cancellations table (lib/cancellation.js) on an
// already-deployed database. scripts/schema.sql is the source of truth for
// a *fresh* database; this applies the same addition in place. Safe to
// re-run (IF NOT EXISTS throughout).
//
//   node scripts/migrate-cancellations.mjs

import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

const STATEMENTS = [
  `CREATE SEQUENCE IF NOT EXISTS cancellations_seq`,
  `CREATE TABLE IF NOT EXISTS cancellations (
    id TEXT PRIMARY KEY,
    seq INTEGER NOT NULL,
    booking_id TEXT NOT NULL REFERENCES bookings(id),
    tier TEXT NOT NULL,
    fee_amount NUMERIC NOT NULL DEFAULT 0,
    make_good_type TEXT NOT NULL DEFAULT 'none',
    make_good_details TEXT,
    reason TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cancellations_booking_id ON cancellations(booking_id)`,
];

async function main() {
  for (const sql of STATEMENTS) {
    await pool.query(sql);
    console.log("OK:", sql.split("\n")[0]);
  }
  await pool.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
