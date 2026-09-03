-- Cached vend count / total revenue on districts, populated once at final-verification time.
-- GET /api/admin/districts skips its GROUP BY scan over phase1_raw_collection (~30K rows) for
-- any district that is 'verified' and has these set — verified data never changes except via
-- Delete Shop Data (which nulls these back out), so recomputing the aggregate on every admin
-- page load/Sync All was pure wasted D1 read-row cost for data that can't have changed.
ALTER TABLE districts ADD COLUMN cached_vend_count INTEGER;
ALTER TABLE districts ADD COLUMN cached_total_revenue INTEGER;
