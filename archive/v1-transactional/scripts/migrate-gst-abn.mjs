// Adds the GST/ABN columns to an already-deployed database.
//
// scripts/schema.sql is the source of truth for a *fresh* database, but the
// live one already exists — this applies the same additions in place. Every
// statement is IF NOT EXISTS, so re-running it is harmless.
//
//   node scripts/migrate-gst-abn.mjs

import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

const STATEMENTS = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS abn TEXT`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS gst_amount NUMERIC`,
];

async function main() {
  for (const sql of STATEMENTS) {
    await pool.query(sql);
    console.log("OK:", sql);
  }
  // Existing payments predate the GST split. Their total_amount was charged
  // with no GST added, so backfill subtotal = total and gst = 0 rather than
  // retroactively claiming GST was collected when it wasn't.
  const res = await pool.query(
    `UPDATE payments SET subtotal_amount = total_amount, gst_amount = 0
     WHERE subtotal_amount IS NULL`
  );
  console.log(`Backfilled ${res.rowCount} pre-GST payment row(s).`);
  await pool.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
