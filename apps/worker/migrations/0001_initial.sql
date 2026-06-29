-- Phase 1 initial schema migration
-- Applied via: wrangler d1 migrations apply phase1-dev --local
--              wrangler d1 migrations apply phase1-prod

CREATE TABLE IF NOT EXISTS districts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  division TEXT,
  deo_name TEXT,
  deo_email TEXT UNIQUE,
  deo_id TEXT,
  expected_vend_count INTEGER,
  bbox_min_lat REAL,
  bbox_max_lat REAL,
  bbox_min_lon REAL,
  bbox_max_lon REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS dist_name_idx ON districts(name);
CREATE INDEX IF NOT EXISTS dist_email_idx ON districts(deo_email);

CREATE TABLE IF NOT EXISTS district_circles_sectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_name TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  created_by_deo TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS dcs_district_idx ON district_circles_sectors(district_name);

CREATE TABLE IF NOT EXISTS phase1_raw_collection (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_name TEXT NOT NULL,
  circle_sector_name TEXT NOT NULL,
  thana_name TEXT NOT NULL,
  adjacent_thanas_raw TEXT,
  shop_id TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  shop_type TEXT NOT NULL
    CHECK (shop_type IN ('MODEL_SHOP','COMPOSITE_SHOP','BHANG_SHOP','PRV','COUNTRY_LIQUOR')),
  has_cl5cc INTEGER NOT NULL DEFAULT 0,
  latitude_dms TEXT,
  longitude_dms TEXT,
  latitude_decimal REAL,
  longitude_decimal REAL,
  license_fee_lf INTEGER DEFAULT 0,
  premises_consideration_fee INTEGER DEFAULT 0,
  basic_license_fee_blf INTEGER DEFAULT 0,
  mgr_amount INTEGER DEFAULT 0,
  composite_lf_fl INTEGER DEFAULT 0,
  composite_lf_beer INTEGER DEFAULT 0,
  composite_mgr_fl INTEGER DEFAULT 0,
  composite_mgr_beer INTEGER DEFAULT 0,
  mgq_quantity INTEGER DEFAULT 0,
  consideration_fee INTEGER DEFAULT 0,
  special_beer_lf INTEGER DEFAULT 0,
  special_beer_mgr INTEGER DEFAULT 0,
  total_revenue INTEGER NOT NULL DEFAULT 0,
  uploaded_by_deo TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS p1_district_idx ON phase1_raw_collection(district_name);
CREATE INDEX IF NOT EXISTS p1_thana_idx ON phase1_raw_collection(thana_name);
CREATE INDEX IF NOT EXISTS p1_shop_idx ON phase1_raw_collection(shop_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  deo_id TEXT NOT NULL,
  district_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS al_deo_idx ON audit_log(deo_id);
CREATE INDEX IF NOT EXISTS al_created_at_idx ON audit_log(created_at);
