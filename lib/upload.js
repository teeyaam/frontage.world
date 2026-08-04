// Multipart file-upload handling (multer). Works directly against a plain
// http.createServer handler — call the configured instance as
// middleware(req, res, callback), no Express required.
//
// Two storage backends, chosen automatically at startup by whether S3/R2
// env vars are set (see isS3Configured below):
//   - S3/R2 (production): listing photos go to a public prefix and are
//     served directly from the bucket's public URL; contractor documents go
//     to a private prefix and are only ever handed out as short-lived
//     signed URLs (see getContractorDocUrl, used by
//     routes/api.js#downloadContractorDoc).
//   - Local disk (fallback — no S3 configured yet): same behavior this app
//     always had, so `node server.js` still works with zero cloud accounts
//     set up. Not suitable for real hosting — a deployed process's local
//     disk isn't persistent across deploys/restarts.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import multer from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LISTING_PHOTOS_DIR = path.join(__dirname, "..", "public", "uploads", "listings");
const CONTRACTOR_DOCS_DIR = path.join(__dirname, "..", "data", "uploads", "contractor-docs");

export function isS3Configured() {
  return Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_ENDPOINT);
}

export function uniqueName(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const safeBase = path
    .basename(file.originalname, ext)
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 40);
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safeBase}${ext}`;
}

// Promisifies a multer middleware call so route handlers can `await` it
// exactly like the existing `await readBody(req)` pattern.
export function runMiddleware(req, res, middleware) {
  return new Promise((resolve, reject) => {
    middleware(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

// 20MB accommodates modern phone camera output (a "Most Compatible" iPhone
// JPEG or a HEIC from a 48MP sensor can easily exceed the old 8MB cap) —
// too-small a limit here surfaces to the user as a crash, not a validation
// message, since multer throws before our own field validation ever runs.
const PHOTO_FILE_SIZE_LIMIT = 20 * 1024 * 1024;
const DOC_FILE_SIZE_LIMIT = 20 * 1024 * 1024;

let uploadListingPhotos;
let uploadContractorDocs;
let getContractorDocUrl;

if (isS3Configured()) {
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const multerS3 = (await import("multer-s3")).default;

  const s3 = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true, // required by R2 and most S3-compatible providers
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });

  uploadListingPhotos = multer({
    storage: multerS3({
      s3,
      bucket: process.env.S3_BUCKET,
      key: (req, file, cb) => cb(null, `listings/${uniqueName(file)}`),
      contentType: multerS3.AUTO_CONTENT_TYPE,
    }),
    limits: { fileSize: PHOTO_FILE_SIZE_LIMIT, files: 8 },
    fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
  }).array("photos", 8);

  uploadContractorDocs = multer({
    storage: multerS3({
      s3,
      bucket: process.env.S3_BUCKET,
      key: (req, file, cb) => cb(null, `contractor-docs/${uniqueName(file)}`),
      contentType: multerS3.AUTO_CONTENT_TYPE,
    }),
    limits: { fileSize: DOC_FILE_SIZE_LIMIT, files: 2 },
    fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith("image/") || file.mimetype === "application/pdf"),
  }).fields([
    { name: "insuranceDoc", maxCount: 1 },
    { name: "companyRegoDoc", maxCount: 1 },
  ]);

  // Contractor documents live in a private prefix — never served from a
  // public URL. This hands out a 5-minute signed URL on demand instead.
  getContractorDocUrl = async (key) => {
    const command = new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key });
    return getSignedUrl(s3, command, { expiresIn: 300 });
  };
} else {
  fs.mkdirSync(LISTING_PHOTOS_DIR, { recursive: true });
  fs.mkdirSync(CONTRACTOR_DOCS_DIR, { recursive: true });

  uploadListingPhotos = multer({
    storage: multer.diskStorage({
      destination: LISTING_PHOTOS_DIR,
      filename: (req, file, cb) => cb(null, uniqueName(file)),
    }),
    limits: { fileSize: PHOTO_FILE_SIZE_LIMIT, files: 8 },
    fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
  }).array("photos", 8);

  uploadContractorDocs = multer({
    storage: multer.diskStorage({
      destination: CONTRACTOR_DOCS_DIR,
      filename: (req, file, cb) => cb(null, uniqueName(file)),
    }),
    limits: { fileSize: DOC_FILE_SIZE_LIMIT, files: 2 },
    fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith("image/") || file.mimetype === "application/pdf"),
  }).fields([
    { name: "insuranceDoc", maxCount: 1 },
    { name: "companyRegoDoc", maxCount: 1 },
  ]);

  // Local-disk fallback has no bucket to sign a URL against — just point
  // straight at the private download route's underlying static path. Not
  // used in production (S3 configured there), only for zero-config local
  // dev, where "signed URL" isn't a meaningful concept anyway.
  getContractorDocUrl = async (key) => `/data/uploads/contractor-docs/${key}`;
}

export { uploadListingPhotos, uploadContractorDocs, getContractorDocUrl };

// Resolves the public URL for an uploaded listing photo file object,
// regardless of which storage backend handled it.
export function photoPublicUrl(file) {
  if (file.key) {
    const base = (process.env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");
    return `${base}/${file.key}`;
  }
  return `/uploads/listings/${file.filename}`;
}

// multer throws (rejects runMiddleware's promise) on oversized files, too
// many files, or a malformed multipart body. Route handlers call this
// instead of a bare `await runMiddleware(...)` so those errors become a
// friendly redirect/message instead of an unhandled-rejection 500 page.
export async function runUpload(req, res, middleware, { onError }) {
  try {
    await runMiddleware(req, res, middleware);
    return true;
  } catch (err) {
    const message =
      err && err.code === "LIMIT_FILE_SIZE"
        ? `One of your files is larger than the ${Math.round(PHOTO_FILE_SIZE_LIMIT / (1024 * 1024))}MB limit — please choose a smaller file or a lower photo quality.`
        : err && err.code === "LIMIT_FILE_COUNT"
        ? "Too many files selected — please upload fewer at once."
        : err && err.code === "LIMIT_UNEXPECTED_FILE"
        ? "That file wasn't expected for this form field."
        : "There was a problem processing your upload — please try again with fewer or smaller files.";
    onError(message);
    return false;
  }
}

export { LISTING_PHOTOS_DIR, CONTRACTOR_DOCS_DIR };
