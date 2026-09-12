CREATE TABLE phase1_prior_year_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_name TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  shop_type TEXT NOT NULL,
  circle_sector_name TEXT NOT NULL,
  thana_name TEXT NOT NULL,
  total_revenue INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX pys_district_idx ON phase1_prior_year_snapshot (district_name);
CREATE INDEX pys_shop_idx ON phase1_prior_year_snapshot (shop_id);
