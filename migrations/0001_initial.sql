-- Consolidated schema — matches packages/schema/src/phase1.ts and auth.ts exactly.
-- Single source of truth; no incremental ALTERs. Safe to apply fresh (DROP + CREATE)
-- because no production campaign data exists yet — see project history.

DROP TABLE IF EXISTS phase1_raw_collection;
DROP TABLE IF EXISTS districts;
DROP TABLE IF EXISTS district_circles_sectors;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS auth_magic_links;
DROP TABLE IF EXISTS auth_users;

-- Phase 1 raw shop collection
CREATE TABLE phase1_raw_collection (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  district_name         TEXT NOT NULL,
  circle_sector_name    TEXT NOT NULL,
  thana_name            TEXT NOT NULL,
  adjacent_thanas_raw   TEXT,
  shop_id               TEXT NOT NULL,
  shop_name             TEXT NOT NULL,
  shop_type             TEXT NOT NULL,
  has_cl5cc             INTEGER NOT NULL DEFAULT 0,
  latitude_dms          TEXT,
  longitude_dms         TEXT,
  latitude_decimal      REAL,
  longitude_decimal     REAL,
  license_fee_lf        INTEGER DEFAULT 0,
  basic_license_fee_blf INTEGER DEFAULT 0,
  mgr_amount            INTEGER DEFAULT 0,
  composite_lf_fl       INTEGER DEFAULT 0,
  composite_lf_beer     INTEGER DEFAULT 0,
  composite_mgr_fl      INTEGER DEFAULT 0,
  composite_mgr_beer    INTEGER DEFAULT 0,
  mgq_quantity          INTEGER DEFAULT 0,
  consideration_fee     INTEGER DEFAULT 0,
  special_beer_lf       INTEGER DEFAULT 0,
  special_beer_mgr      INTEGER DEFAULT 0,
  total_revenue         INTEGER NOT NULL DEFAULT 0,
  uploaded_by_deo       TEXT NOT NULL,
  created_at            INTEGER NOT NULL,
  UNIQUE(shop_id, district_name)
);

CREATE INDEX p1_district_idx ON phase1_raw_collection(district_name);
CREATE INDEX p1_thana_idx ON phase1_raw_collection(thana_name);
CREATE INDEX p1_shop_idx ON phase1_raw_collection(shop_id);

-- Districts master / reference table (75 UP districts, 18 divisions)
CREATE TABLE districts (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT NOT NULL UNIQUE,
  division             TEXT,
  deo_name             TEXT,
  deo_email            TEXT UNIQUE,
  deo_id               TEXT,
  expected_vend_count  INTEGER,
  bbox_min_lat         REAL,
  bbox_max_lat         REAL,
  bbox_min_lon         REAL,
  bbox_max_lon         REAL,
  status               TEXT NOT NULL DEFAULT 'pending',
  submitted_at         INTEGER,
  created_at           INTEGER NOT NULL
);

CREATE INDEX dist_name_idx ON districts(name);
CREATE INDEX dist_email_idx ON districts(deo_email);

-- Circles / sectors registered per district by the DEO
CREATE TABLE district_circles_sectors (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  district_name   TEXT NOT NULL,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,
  created_by_deo  TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE INDEX dcs_district_idx ON district_circles_sectors(district_name);

-- 45-day rolling audit log
CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type    TEXT NOT NULL,
  deo_id        TEXT NOT NULL,
  district_name TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  metadata      TEXT,
  created_at    INTEGER NOT NULL
);

CREATE INDEX al_deo_idx ON audit_log(deo_id);
CREATE INDEX al_created_at_idx ON audit_log(created_at);

-- Custom HMAC magic-link auth tables
CREATE TABLE auth_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'deo',
  deo_id        TEXT,
  district_name TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE auth_magic_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL,
  token_hash  TEXT UNIQUE NOT NULL,
  expires_at  TEXT NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_magic_email ON auth_magic_links(email, created_at);

CREATE TABLE auth_sessions (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES auth_users(id),
  expires_at  TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);
