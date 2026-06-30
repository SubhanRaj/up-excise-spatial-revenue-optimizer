-- Phase 1 raw collection table
CREATE TABLE IF NOT EXISTS phase1_raw_collection (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id           TEXT NOT NULL,
  district_name     TEXT NOT NULL,
  thana_name        TEXT NOT NULL,
  shop_name         TEXT NOT NULL,
  shop_type         TEXT NOT NULL,
  has_cl5cc         INTEGER NOT NULL DEFAULT 0,
  circle_name       TEXT,
  sector_name       TEXT,
  latitude_decimal  REAL,
  longitude_decimal REAL,
  license_fee_lf          INTEGER NOT NULL DEFAULT 0,
  mgr_amount              INTEGER NOT NULL DEFAULT 0,
  composite_lf_fl         INTEGER NOT NULL DEFAULT 0,
  composite_lf_beer       INTEGER NOT NULL DEFAULT 0,
  composite_mgr_fl        INTEGER NOT NULL DEFAULT 0,
  composite_mgr_beer      INTEGER NOT NULL DEFAULT 0,
  basic_license_fee_blf   INTEGER NOT NULL DEFAULT 0,
  consideration_fee       INTEGER NOT NULL DEFAULT 0,
  special_beer_lf         INTEGER NOT NULL DEFAULT 0,
  special_beer_mgr        INTEGER NOT NULL DEFAULT 0,
  mgq_quantity            INTEGER NOT NULL DEFAULT 0,
  total_revenue           INTEGER NOT NULL DEFAULT 0,
  adjacent_thanas         TEXT,
  deo_id            TEXT NOT NULL,
  uploaded_at       TEXT DEFAULT (datetime('now')),
  UNIQUE(shop_id, district_name)
);

CREATE INDEX IF NOT EXISTS idx_p1_district ON phase1_raw_collection(district_name);
CREATE INDEX IF NOT EXISTS idx_p1_thana ON phase1_raw_collection(thana_name);
CREATE INDEX IF NOT EXISTS idx_p1_shop_id ON phase1_raw_collection(shop_id);

-- Districts reference table
CREATE TABLE IF NOT EXISTS districts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  district_name       TEXT UNIQUE NOT NULL,
  division            TEXT,
  deo_name            TEXT,
  deo_email           TEXT,
  deo_id              TEXT,
  expected_vend_count INTEGER DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'not_started',
  submitted_at        TEXT,
  created_at          TEXT DEFAULT (datetime('now'))
);

-- District circles/sectors
CREATE TABLE IF NOT EXISTS district_circles_sectors (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  district_name TEXT NOT NULL,
  unit_name     TEXT NOT NULL,
  unit_type     TEXT NOT NULL DEFAULT 'circle',
  created_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(district_name, unit_name)
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT NOT NULL,
  district_name TEXT,
  deo_id      TEXT,
  detail      TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
