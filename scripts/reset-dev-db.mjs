// Wipes a DEVELOPMENT database and rebuilds it from scripts/schema.sql.
// Destructive by design, so it refuses to run unless you name the exact
// database host you mean to wipe:
//
//   CONFIRM_RESET_DB_HOST=<host from DATABASE_URL> node scripts/reset-dev-db.mjs
//
// It also refuses any host listed in PROTECTED_DB_HOSTS (comma-separated
// substrings — put the production and v1-archive hosts there in .env).
// Afterwards, copy your own account in with scripts/bootstrap-owner.mjs.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const host = new URL(url).hostname;
const protectedHosts = (process.env.PROTECTED_DB_HOSTS || "").split(",").map((s) => s.trim()).filter(Boolean);

if (protectedHosts.some((p) => host.includes(p))) {
  console.error(`Refusing: ${host} matches PROTECTED_DB_HOSTS. This script only wipes development databases.`);
  process.exit(1);
}
if (process.env.CONFIRM_RESET_DB_HOST !== host) {
  console.error(`Refusing: set CONFIRM_RESET_DB_HOST to exactly "${host}" to confirm you want to WIPE that database.`);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("DROP SCHEMA public CASCADE");
  await client.query("CREATE SCHEMA public");
  await client.query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  await client.query("COMMIT");
  console.log(`Reset ${host}: empty v2 schema applied.`);
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Reset failed, nothing changed:", err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
