-- M-101: one-time-use guard for the FY 2026-27 data cleanup. Set once when an admin clears a
-- district's wrongly-entered current-year shop data via /admin/fy-cleanup; a non-null value
-- greys out the action so a district can't be re-cleared after its DEO re-enters FY 2025-26 data.
ALTER TABLE districts ADD COLUMN fy_data_cleared_at INTEGER;
