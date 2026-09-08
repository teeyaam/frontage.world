// Adds the site-specification columns (audience/traffic, surface,
// illumination, access, permit, lead time — see lib/listingSpecs.js) to an
// already-deployed database. scripts/schema.sql is the source of truth for a
// *fresh* database; this applies the same additions in place. Every
// statement is IF NOT EXISTS, so re-running it is harmless.
//
//   node scripts/migrate-listing-specs.mjs

import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

const STATEMENTS = [
  `ALTER TABLE listings ADD COLUMN IF NOT EXISTS audience_type TEXT`,
  `ALTER TABLE listings ADD COLUMN IF NOT EXISTS daily_traffic_count INTEGER`,
  `ALTER TABLE listings ADD COLUMN IF NOT EXISTS traffic_verified BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE listings ADD COLUMN IF NOT EXISTS surface_type TEXT`,
  `ALTER TABLE listings ADD COLUMN IF NOT EXISTS illumination TEXT`,
  `ALTER TABLE listings ADD COLUMN IF NOT EXISTS access_type TEXT`,
  `ALTER TABLE listings ADD COLUMN IF NOT EXISTS access_notes TEXT`,
  `ALTER TABLE listings ADD COLUMN IF NOT EXISTS permit_status TEXT NOT NULL DEFAULT 'unknown'`,
  `ALTER TABLE listings ADD COLUMN IF NOT EXISTS permit_reference TEXT`,
  `ALTER TABLE listings ADD COLUMN IF NOT EXISTS permit_expiry DATE`,
  `ALTER TABLE listings ADD COLUMN IF NOT EXISTS lead_time_days INTEGER`,
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
