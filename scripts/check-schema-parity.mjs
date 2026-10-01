// Confirms the database DATABASE_URL points at has exactly the columns
// scripts/schema.sql defines (names, types, nullability): it builds the
// schema fresh in a throwaway Postgres schema, compares, then drops it.
// Read-only as far as your real tables go.
//
//   node scripts/check-schema-parity.mjs

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url || "") ? false : { rejectUnauthorized: false } });
const temp = `parity_${crypto.randomBytes(4).toString("hex")}`;
const TABLES = ["users", "sessions", "listings", "conversations", "messages", "reports", "contact_messages", "deals", "agreements"];

async function columns(client, schema) {
  const { rows } = await client.query(
    `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = ANY($2) ORDER BY table_name, column_name`,
    [schema, TABLES]
  );
  return new Map(rows.map((r) => [`${r.table_name}.${r.column_name}`, `${r.data_type}${r.is_nullable === "NO" ? " NOT NULL" : ""}`]));
}

const client = await pool.connect();
try {
  await client.query(`CREATE SCHEMA ${temp}`);
  await client.query(`SET search_path TO ${temp}`);
  await client.query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  await client.query(`SET search_path TO public`);
  const expected = await columns(client, temp);
  const actual = await columns(client, "public");
  const problems = [];
  for (const [col, def] of expected) {
    if (!actual.has(col)) problems.push(`missing   ${col} (${def})`);
    else if (actual.get(col) !== def) problems.push(`differs   ${col}: db has "${actual.get(col)}", schema.sql says "${def}"`);
  }
  for (const col of actual.keys()) if (!expected.has(col)) problems.push(`extra     ${col} (in the database, not in schema.sql)`);
  if (problems.length) {
    console.log(`Schema drift on ${new URL(url).hostname}:\n  ${problems.join("\n  ")}`);
    process.exitCode = 1;
  } else {
    console.log(`OK — ${expected.size} columns across ${TABLES.length} tables match scripts/schema.sql.`);
  }
} catch (err) {
  console.error("Parity check failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.query(`DROP SCHEMA IF EXISTS ${temp} CASCADE`).catch(() => {});
  client.release();
  await pool.end();
}
