-- Frontage v2 (classifieds) — Postgres schema.
--
-- Listings plus messaging only; every deal happens off-platform. The v1
-- transactional schema (bookings, payments, contractors, job orders, cart)
-- is archived at archive/v1-transactional/scripts/schema-v1.sql.
--
-- Idempotent: every statement is IF NOT EXISTS, so it's safe to run on
-- every deploy (`node scripts/run-schema.mjs`). Ids keep the v1
-- "PREFIX-1000+n" string format, produced in lib/db.js from a per-prefix
-- SEQUENCE here.

CREATE SEQUENCE IF NOT EXISTS users_seq;
CREATE SEQUENCE IF NOT EXISTS listings_seq;
CREATE SEQUENCE IF NOT EXISTS conversations_seq;
CREATE SEQUENCE IF NOT EXISTS messages_seq;
CREATE SEQUENCE IF NOT EXISTS reports_seq;
CREATE SEQUENCE IF NOT EXISTS contact_messages_seq;
CREATE SEQUENCE IF NOT EXISTS deals_seq;

-- ---------- users (one account both buys and sells) ----------
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  mobile TEXT, -- optional
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  business_name TEXT,
  google_business_url TEXT, -- https only, validated in routes/api.js
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  can_access_support BOOLEAN NOT NULL DEFAULT FALSE, -- moderation: listings, reports, users
  email_verified_at TIMESTAMPTZ,
  email_verify_token TEXT,
  password_reset_token_hash TEXT, -- sha256 of the emailed token, never the token itself
  password_reset_expires_at TIMESTAMPTZ,
  notify_messages BOOLEAN NOT NULL DEFAULT TRUE, -- new-message email alerts
  country TEXT NOT NULL DEFAULT 'AU', -- one of lib/countries.js MARKETS: default browse + new-listing country
  units TEXT NOT NULL DEFAULT 'm', -- size units shown to this user: m | ft
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));

-- Session tokens are stored hashed (sha256), so a leaked database dump
-- can't be replayed as a login cookie.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL -- epoch ms
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- ---------- listings ----------
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL, -- lib/categories.js
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC NOT NULL DEFAULT 0, -- 0 shows as "Price on request"
  price_note TEXT, -- free-form, e.g. "per month, negotiable"
  photos JSONB NOT NULL DEFAULT '[]',
  youtube_id TEXT, -- just the 11-char video id (lib/youtube.js)

  -- Location, from Google Places autocomplete (or server-side geocoding).
  -- The exact address and pin are only shown publicly when the seller
  -- ticks show_exact_location; otherwise the public sees the suburb and an
  -- approximate area (lib/geo.js#publicCoords).
  address TEXT NOT NULL,
  suburb TEXT,
  state TEXT,
  postcode TEXT,
  country TEXT,
  place_id TEXT,
  lat NUMERIC,
  lng NUMERIC,
  show_exact_location BOOLEAN NOT NULL DEFAULT FALSE,
  country_code TEXT NOT NULL DEFAULT 'AU', -- market ISO code; the address must be in this country
  currency TEXT NOT NULL DEFAULT 'AUD', -- always the country's currency (lib/countries.js currencyFor)

  width_m NUMERIC, -- optional
  height_m NUMERIC, -- optional

  status TEXT NOT NULL DEFAULT 'live', -- live | rented (seller marked it taken) | removed (by moderation) | deleted (by the seller)
  expires_at TIMESTAMPTZ, -- a live listing drops out of browse after this until renewed (60 days)
  renewed_at TIMESTAMPTZ, -- last time the seller confirmed it's still available
  rented_at TIMESTAMPTZ,
  expiry_reminder_sent_at TIMESTAMPTZ,
  expired_notice_sent_at TIMESTAMPTZ,
  removed_reason TEXT,
  removed_at TIMESTAMPTZ,
  removed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_listings_owner_id ON listings(owner_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);

-- ---------- conversations (one per listing + buyer) ----------
-- Denormalised last-message fields and per-party read/notify timestamps
-- make the inbox, unread badge and email-alert throttle single queries.
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_sender_id TEXT,
  buyer_last_read_at TIMESTAMPTZ,
  seller_last_read_at TIMESTAMPTZ,
  buyer_last_notified_at TIMESTAMPTZ,
  seller_last_notified_at TIMESTAMPTZ,
  buyer_followup_token TEXT, -- one-click "did it work out?" email links (3 weeks after first message)
  buyer_followup_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_id)
);
CREATE INDEX IF NOT EXISTS idx_conversations_buyer ON conversations(buyer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_seller ON conversations(seller_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON messages(sender_id, created_at);

-- ---------- reports (moderation queue) ----------
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL, -- listing | conversation
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  reported_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- open | actioned | dismissed
  resolution_note TEXT,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

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

-- ---------- deals (reported by sellers and buyers; Frontage never sees payments) ----------
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  reported_by TEXT NOT NULL, -- seller | buyer
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  via_frontage TEXT NOT NULL, -- yes | no | unsure
  deal_value NUMERIC, -- optional, private
  currency TEXT,
  term_months INTEGER, -- optional, private
  ok_to_feature BOOLEAN NOT NULL DEFAULT FALSE, -- consent to a success story (never the price)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deals_listing ON deals(listing_id);

-- ---------- upgrades for databases created before these columns existed ----------
-- Idempotent: safe to run on every deploy.
ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'AU';
ALTER TABLE users ADD COLUMN IF NOT EXISTS units TEXT NOT NULL DEFAULT 'm';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'AU';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'AUD';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS renewed_at TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS rented_at TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS expiry_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS expired_notice_sent_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS buyer_followup_token TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS buyer_followup_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_listings_expires ON listings(expires_at);
CREATE INDEX IF NOT EXISTS idx_conversations_followup ON conversations(buyer_followup_token);
-- Live listings from before expiry existed get 60 days from when they were listed.
UPDATE listings SET expires_at = created_at + interval '60 days' WHERE expires_at IS NULL AND status = 'live';
