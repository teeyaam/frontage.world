// Adds the flight-calendar columns (lib/flightCalendar.js) to an
// already-deployed database. scripts/schema.sql is the source of truth for
// a *fresh* database; this applies the same additions in place. Every
// statement is IF NOT EXISTS, so re-running it is harmless.
//
//   node scripts/migrate-flight-calendar.mjs

import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

const STATEMENTS = [
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS campaign_start_date DATE`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS campaign_end_date DATE`,
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
