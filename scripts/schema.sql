-- Frontage — Postgres schema.
--
-- One table per collection that used to live in data/db.json. Column names
-- are the snake_case form of the same fields (see data/seed.json), and every
-- id keeps its existing "PREFIX-1000+n" string format — that format is
-- produced in application code (lib/db.js) from a per-prefix SEQUENCE here,
-- so no id anywhere else in the app ever needs to change shape.
--
-- Run once against a fresh database:
--   psql "$DATABASE_URL" -f scripts/schema.sql
-- Then seed demo data with:
--   node scripts/seed-db.mjs

-- ---------- id sequences (one per prefix used by lib/db.js nextId) ----------
CREATE SEQUENCE IF NOT EXISTS users_seq;
CREATE SEQUENCE IF NOT EXISTS contractors_seq;
CREATE SEQUENCE IF NOT EXISTS listings_seq;
CREATE SEQUENCE IF NOT EXISTS bookings_seq;
CREATE SEQUENCE IF NOT EXISTS contracts_seq;
CREATE SEQUENCE IF NOT EXISTS payments_seq;
CREATE SEQUENCE IF NOT EXISTS job_orders_seq;
CREATE SEQUENCE IF NOT EXISTS contractor_applications_seq;
CREATE SEQUENCE IF NOT EXISTS messages_seq;
CREATE SEQUENCE IF NOT EXISTS contact_messages_seq;

-- ---------- users (buyers/sellers — separate identity space from contractors) ----------
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  mobile TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  business_name TEXT,
  address TEXT,
  bank_bsb TEXT,
  bank_account TEXT,
  bank_account_name TEXT,
  card_last4 TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  google_business_url TEXT,
  can_approve_contractors BOOLEAN NOT NULL DEFAULT FALSE,
  can_access_support BOOLEAN NOT NULL DEFAULT FALSE,
  can_create_bdr_listings BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_connect_account_id TEXT,
  last_messages_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL -- epoch ms, matches Date.now()-based comparisons in lib/db.js
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- ---------- contractors (wholly separate identity space) ----------
CREATE TABLE IF NOT EXISTS contractors (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  mobile TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  business_name TEXT,
  address TEXT,
  contractor_application_status TEXT,
  is_approved_contractor BOOLEAN NOT NULL DEFAULT FALSE,
  contractor_rating NUMERIC,
  last_messages_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contractor_sessions (
  token TEXT PRIMARY KEY,
  contractor_id TEXT NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contractor_sessions_contractor_id ON contractor_sessions(contractor_id);

-- ---------- listings ----------
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL, -- null while status='unclaimed' (BDR draft)
  title TEXT NOT NULL,
  venue TEXT NOT NULL,
  category TEXT NOT NULL,
  subtype TEXT,
  suburb TEXT NOT NULL,
  address TEXT NOT NULL,
  size_w INTEGER NOT NULL,
  size_h INTEGER NOT NULL,
  price NUMERIC NOT NULL,
  rating NUMERIC NOT NULL DEFAULT 5.0,
  reviews INTEGER NOT NULL DEFAULT 0,
  footfall TEXT,
  description TEXT DEFAULT '',
  photos JSONB NOT NULL DEFAULT '[]',
  estimated_eyes_per_day INTEGER,
  status TEXT NOT NULL DEFAULT 'live', -- live | unclaimed | removed
  claim_token TEXT,
  claimed_at TIMESTAMPTZ,
  created_by_bdr_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  bdr_contact_name TEXT,
  bdr_contact_email TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  lat NUMERIC,
  lng NUMERIC,
  removed_reason TEXT,
  removed_at TIMESTAMPTZ,
  removed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_listings_owner_id ON listings(owner_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_claim_token ON listings(claim_token);

-- ---------- bookings / contracts / payments / job orders ----------
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  seller_id TEXT REFERENCES users(id),
  term INTEGER NOT NULL,
  monthly_rate NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'signed', -- signed -> active -> ending/ended
  lease_start_date TIMESTAMPTZ,
  auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookings_buyer_id ON bookings(buyer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_seller_id ON bookings(seller_id);
CREATE INDEX IF NOT EXISTS idx_bookings_listing_id ON bookings(listing_id);

CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  signed_name TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contracts_booking_id ON contracts(booking_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  total_amount NUMERIC NOT NULL,
  fee_amount NUMERIC NOT NULL,
  payout_amount NUMERIC NOT NULL,
  status TEXT NOT NULL, -- paid (stub/real charge outcome)
  paid_at TIMESTAMPTZ,
  payout_status TEXT NOT NULL DEFAULT 'held', -- held -> released
  payout_released_at TIMESTAMPTZ,
  payout_blocked_reason TEXT,
  stripe_payment_intent_id TEXT,
  stripe_transfer_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);

CREATE TABLE IF NOT EXISTS job_orders (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  listing_id TEXT NOT NULL REFERENCES listings(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  seller_id TEXT REFERENCES users(id),
  contractor_id TEXT REFERENCES contractors(id),
  status TEXT NOT NULL DEFAULT 'broadcast', -- broadcast -> new -> site_confirmed -> quote_sent -> quote_accepted -> scheduled -> installed
  estimate NUMERIC,
  quote JSONB,
  install_window TEXT,
  install_date TIMESTAMPTZ,
  seller_access_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_orders_booking_id ON job_orders(booking_id);
CREATE INDEX IF NOT EXISTS idx_job_orders_contractor_id ON job_orders(contractor_id);
CREATE INDEX IF NOT EXISTS idx_job_orders_seller_id ON job_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_job_orders_status ON job_orders(status);

-- ---------- contractor applications ----------
CREATE TABLE IF NOT EXISTS contractor_applications (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  contractor_id TEXT NOT NULL REFERENCES contractors(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending -> approved | rejected
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  business_number TEXT NOT NULL,
  company_name TEXT NOT NULL,
  company_registration_number TEXT,
  insurance_expiry TEXT,
  insurance_doc_path TEXT NOT NULL,
  company_rego_doc_path TEXT
);
CREATE INDEX IF NOT EXISTS idx_contractor_applications_contractor_id ON contractor_applications(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_applications_status ON contractor_applications(status);

-- ---------- messages (one table for both listing-inquiry and job-order chat) ----------
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  thread_type TEXT NOT NULL, -- 'job' | 'listing'
  thread_id TEXT NOT NULL,   -- jobOrderId, or "listingId:buyerId" composite
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_type, thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- ---------- contact / support messages ----------
CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_messages_topic ON contact_messages(topic);
