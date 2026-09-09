-- Derived Thana master (soft checklist, never an enforced constraint). One row per distinct
-- (district, circle/sector, thana) the shop data has carried, built once from
-- phase1_raw_collection by scripts/build-district-thanas.ts. Thana is a stable entity — it
-- survives an FY-data clear (which only deletes shop rows), so this list stays valid.
--
-- Used district-level: GET /api/districts/[district]/thanas returns the distinct thana_key
-- set, and the DEO Verify page shows a non-blocking "not in this district's known list"
-- warning on a staged row whose thana_name normalises to something not in the set. Nothing
-- blocks submission. circle_sector_name is recorded for per-circle rollups, not for the check
-- (28% of thanas legitimately span more than one circle).
CREATE TABLE district_thanas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_name TEXT NOT NULL,
  circle_sector_name TEXT NOT NULL,
  thana_name TEXT NOT NULL,
  thana_key TEXT NOT NULL,          -- normalizeThanaName(thana_name): trimmed, whitespace-collapsed, lowercased
  shop_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX district_thanas_uq ON district_thanas (district_name, circle_sector_name, thana_name);
CREATE INDEX district_thanas_lookup_idx ON district_thanas (district_name, thana_key);
