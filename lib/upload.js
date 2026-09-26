// Listing photo uploads (multer), usable directly from a plain
// http.createServer handler — no Express required.
//
// Storage is chosen at startup by whether the S3/R2 env vars are set:
//   - S3/R2 (production): photos go to the bucket's `listings/` prefix and
//     are served from S3_PUBLIC_BASE_URL (e.g. https://media.frontage.world).
//   - Local disk (fallback): public/uploads/listings, for zero-config local
//     dev only. A hosted process's disk isn't kept across deploys.
//
// The listing form (public/listing-form.js) shrinks photos in the browser
// before upload, so real uploads are usually well under 1MB; the limit
// below only has to cover the no-JS / un-resizable (e.g. HEIC) case.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { LISTING_MAX_PHOTOS } from "./categories.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LISTING_PHOTOS_DIR = path.join(__dirname, "..", "public", "uploads", "listings");

// No SVG: an uploaded SVG can carry script.
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/avif"]);
const EXT_FOR_TYPE = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/heic": ".heic", "image/heif": ".heif", "image/avif": ".avif" };
const PHOTO_FILE_SIZE_LIMIT = 15 * 1024 * 1024;

export function isS3Configured() {
  return Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_ENDPOINT);
}

// Random names only — the uploader's original filename never reaches the
// public URL (it can contain their name, a date, a street).
function uniqueName(file) {
  return `${Date.now()}-${crypto.randomBytes(9).toString("hex")}${EXT_FOR_TYPE[file.mimetype] || ".jpg"}`;
}

function fileFilter(req, file, cb) {
  if (ALLOWED_TYPES.has(file.mimetype)) return cb(null, true);
  const err = new Error("UNSUPPORTED_TYPE");
  err.code = "UNSUPPORTED_TYPE";
  cb(err);
}

const limits = { fileSize: PHOTO_FILE_SIZE_LIMIT, files: LISTING_MAX_PHOTOS, fields: 40, fieldSize: 64 * 1024 };

let uploadListingPhotos;
let s3Client = null;

if (isS3Configured()) {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const multerS3 = (await import("multer-s3")).default;
  s3Client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true, // required by R2 and most S3-compatible providers
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  });
  uploadListingPhotos = multer({
    storage: multerS3({
      s3: s3Client,
      bucket: process.env.S3_BUCKET,
      key: (req, file, cb) => cb(null, `listings/${uniqueName(file)}`),
      contentType: multerS3.AUTO_CONTENT_TYPE,
      cacheControl: "public, max-age=31536000, immutable",
    }),
    limits,
    fileFilter,
  }).array("photos", LISTING_MAX_PHOTOS);
} else {
  fs.mkdirSync(LISTING_PHOTOS_DIR, { recursive: true });
  uploadListingPhotos = multer({
    storage: multer.diskStorage({ destination: LISTING_PHOTOS_DIR, filename: (req, file, cb) => cb(null, uniqueName(file)) }),
    limits,
    fileFilter,
  }).array("photos", LISTING_MAX_PHOTOS);
}

export { uploadListingPhotos, s3Client };

// Public URL for an uploaded photo, whichever backend stored it.
export function photoPublicUrl(file) {
  if (file.key) {
    const base = (process.env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");
    return `${base}/${file.key}`;
  }
  return `/uploads/listings/${file.filename}`;
}

function runMiddleware(req, res, middleware) {
  return new Promise((resolve, reject) => {
    middleware(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

// Runs the upload and turns multer's errors into a friendly message.
// Resolves to null on success, or the message on failure.
export async function runUpload(req, res, middleware) {
  try {
    await runMiddleware(req, res, middleware);
    return null;
  } catch (err) {
    const code = err && err.code;
    if (code === "LIMIT_FILE_SIZE") return `One of your photos is larger than ${Math.round(PHOTO_FILE_SIZE_LIMIT / (1024 * 1024))}MB — choose a smaller one.`;
    if (code === "LIMIT_FILE_COUNT" || code === "LIMIT_UNEXPECTED_FILE") return `You can add up to ${LISTING_MAX_PHOTOS} photos.`;
    if (code === "UNSUPPORTED_TYPE") return "Photos must be JPEG, PNG, WebP, GIF, AVIF or HEIC images.";
    console.error("Upload failed:", err);
    return "We couldn't upload your photos just now — please try again.";
  }
}
