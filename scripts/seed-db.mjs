// One-time seeding script — inserts data/seed.json's demo data into a fresh
// Postgres database. Run once after applying scripts/schema.sql:
//
//   psql "$DATABASE_URL" -f scripts/schema.sql
//   node scripts/seed-db.mjs
//
// Safe to re-run against an empty database; will error on a duplicate key
// if run twice against the same populated database (that's intentional —
// it's not an upsert, just a seed).

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set — add it to your .env file first (see .env.example).");
  process.exit(1);
}

const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

function camelToSnakeKey(k) {
  if (k === "__seq") return "seq";
  if (k === "desc") return "description";
  return k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
}

const JSON_COLS = new Set(["photos", "quote"]);
function prepareValue(key, value) {
  if (JSON_COLS.has(key)) return value === null || value === undefined ? null : JSON.stringify(value);
  return value;
}

async function insertRows(table, rows) {
  if (!rows.length) return 0;
  for (const row of rows) {
    const keys = Object.keys(row);
    const cols = keys.map(camelToSnakeKey);
    const placeholders = keys.map((_, i) => `$${i + 1}`);
    const values = keys.map((k) => prepareValue(k, row[k]));
    await pool.query(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`, values);
  }
  return rows.length;
}

// Simple collection-name -> table-name map (most match directly).
const TABLE_MAP = {
  users: "users",
  sessions: "sessions",
  contractors: "contractors",
  contractorSessions: "contractor_sessions",
  listings: "listings",
  bookings: "bookings",
  contracts: "contracts",
  payments: "payments",
  jobOrders: "job_orders",
  contractorApplications: "contractor_applications",
  messages: "messages",
  contactMessages: "contact_messages",
};

// Sequences need to start after the highest __seq already used in the seed
// data, so ids created by the running app don't collide with seeded ids.
const SEQ_MAP = {
  users: "users_seq",
  contractors: "contractors_seq",
  listings: "listings_seq",
  bookings: "bookings_seq",
  contracts: "contracts_seq",
  payments: "payments_seq",
  jobOrders: "job_orders_seq",
  contractorApplications: "contractor_applications_seq",
  messages: "messages_seq",
  contactMessages: "contact_messages_seq",
};

async function main() {
  const seedPath = path.join(__dirname, "..", "data", "seed.json");
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));

  // Insert in FK-safe order: sessions/contractor_sessions reference
  // users/contractors, so seed those first; job_orders/payments/contracts
  // reference bookings, so bookings first; etc. seed.json's own key order
  // already matches this (users, sessions, contractors, ...).
  const order = ["users", "contractors", "sessions", "contractorSessions", "listings", "bookings", "contracts", "payments", "jobOrders", "contractorApplications", "messages", "contactMessages"];

  let total = 0;
  for (const collection of order) {
    const rows = seed[collection] || [];
    const table = TABLE_MAP[collection];
    if (!table) continue;
    const count = await insertRows(table, rows);
    if (count) console.log(`  ${table}: ${count} row(s)`);
    total += count;

    const maxSeq = rows.reduce((max, r) => Math.max(max, r.__seq || 0), 0);
    const seqName = SEQ_MAP[collection];
    if (seqName && maxSeq > 0) {
      await pool.query(`SELECT setval($1, $2)`, [seqName, maxSeq]);
    }
  }

  console.log(`Seeded ${total} row(s) total.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
