// Creates the multi-site cart/orders tables (Phase 6) on an
// already-deployed database. scripts/schema.sql is the source of truth for
// a *fresh* database; this applies the same additions in place. Safe to
// re-run (IF NOT EXISTS throughout). Note orders must exist before the
// bookings.order_id column that references it.
//
//   node scripts/migrate-cart-orders.mjs

import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

const STATEMENTS = [
  `CREATE SEQUENCE IF NOT EXISTS orders_seq`,
  `CREATE SEQUENCE IF NOT EXISTS cart_items_seq`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    seq INTEGER NOT NULL,
    buyer_id TEXT NOT NULL REFERENCES users(id),
    total_amount NUMERIC NOT NULL,
    stripe_payment_intent_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id)`,
  `CREATE TABLE IF NOT EXISTS cart_items (
    id TEXT PRIMARY KEY,
    seq INTEGER NOT NULL,
    buyer_id TEXT NOT NULL REFERENCES users(id),
    listing_id TEXT NOT NULL REFERENCES listings(id),
    term INTEGER NOT NULL,
    campaign_start_date DATE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cart_items_buyer_id ON cart_items(buyer_id)`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS order_id TEXT REFERENCES orders(id)`,
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
