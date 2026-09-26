// Checks the photo storage settings end to end: uploads a tiny test file
// with the S3_* credentials, fetches it back through S3_PUBLIC_BASE_URL,
// then deletes it. Run it wherever the real env vars are (Render shell, or
// locally with .env).
//
//   node scripts/check-storage.mjs

import "dotenv/config";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const need = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_ENDPOINT", "S3_PUBLIC_BASE_URL"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing: ${missing.join(", ")}`);
  process.exit(1);
}

const s3 = new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
});
const key = `listings/_storage-check-${Date.now()}.txt`;
const publicUrl = `${process.env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;

try {
  await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: "frontage storage check", ContentType: "text/plain" }));
  console.log("✓ Upload with S3_* credentials works");
} catch (err) {
  console.error(`✗ Upload failed: ${err.name}: ${err.message}`);
  console.error("  Check the R2 API token (Object Read & Write, scoped to this bucket) and S3_ENDPOINT.");
  process.exit(1);
}
try {
  const res = await fetch(publicUrl);
  if (res.ok) console.log(`✓ Public URL serves it: ${publicUrl}`);
  else console.error(`✗ Public URL returned ${res.status}: ${publicUrl} — check the bucket's custom domain / public access.`);
} catch (err) {
  console.error(`✗ Couldn't fetch the public URL: ${err.message}`);
} finally {
  await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })).catch(() => {});
}
