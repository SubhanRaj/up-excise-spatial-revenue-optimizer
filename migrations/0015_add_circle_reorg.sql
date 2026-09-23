-- Circle Reorganization Proposal (Additional Excise Commissioner, 2026-09-23) — static reference
-- data, same pattern as district_thanas (0012) and phase1_prior_year_snapshot (0014): loaded once
-- by scripts/load-circle-reorg.ts from the Commissioner's own already-computed proposal, never
-- written by the app at runtime. Read-only admin viewer + export, no write-back to
-- district_circles_sectors or phase1_raw_collection. See CLAUDE.md's "Circle Reorganization
-- Proposal" section and roadmap.md §7 for the 6 conditions this proposal was built against.
--
-- Holds no shop-level rows — a proposed circle assignment is joined against the
-- live phase1_raw_collection at read/export time via (district_name, thana_key), since
-- condition 4 (a thana lies wholly within one proposed circle) makes that join exact.

CREATE TABLE circle_reorg_districts (
  district_name TEXT PRIMARY KEY,
  current_circle_count INTEGER NOT NULL,
  proposed_circle_count INTEGER NOT NULL,
  current_deviation REAL NOT NULL,   -- max circle revenue deviation from the district mean, current scheme (fraction, e.g. 0.43 = 43%)
  proposed_deviation REAL NOT NULL,  -- same, proposed scheme — condition 6 is proposed_deviation < current_deviation
  optimized TEXT NOT NULL,           -- 'Yes' | 'No' — whether the Commissioner's process found an improving rearrangement for this district
  basis TEXT NOT NULL,
  shops_moved INTEGER NOT NULL DEFAULT 0,
  shops_stay_fraction REAL NOT NULL DEFAULT 0,
  no_location_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE circle_reorg_circles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_name TEXT NOT NULL,
  name TEXT NOT NULL,               -- matches district_circles_sectors.name convention ("Circle 2 - Kirawali", "Sector - 1")
  status TEXT NOT NULL,             -- 'kept' | 'new' | 'abolished'
  current_revenue INTEGER,          -- null when status = 'new' (didn't exist under the current scheme)
  proposed_revenue INTEGER,         -- null when status = 'abolished' (doesn't exist under the proposal)
  current_boundary TEXT,            -- GeoJSON Polygon/MultiPolygon, null when status = 'new'
  proposed_boundary TEXT,           -- GeoJSON Polygon/MultiPolygon, null when status = 'abolished'
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX crc_district_name_uq ON circle_reorg_circles (district_name, name);
CREATE INDEX crc_district_idx ON circle_reorg_circles (district_name);

CREATE TABLE circle_reorg_thanas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_name TEXT NOT NULL,
  thana_name TEXT NOT NULL,
  thana_key TEXT NOT NULL,          -- normalizeThanaName(thana_name) — join key against phase1_raw_collection.thana_name
  revenue INTEGER NOT NULL DEFAULT 0,
  shop_count INTEGER NOT NULL DEFAULT 0,
  current_circle_names TEXT NOT NULL, -- JSON string array — a thana may currently span >1 circle (the exact imbalance condition 4 fixes)
  proposed_circle_name TEXT NOT NULL, -- always exactly one, per condition 4
  boundary TEXT,                      -- GeoJSON Polygon/MultiPolygon, nullable
  label_lat REAL,
  label_lon REAL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX crt_district_thana_uq ON circle_reorg_thanas (district_name, thana_name);
CREATE INDEX crt_lookup_idx ON circle_reorg_thanas (district_name, thana_key);
