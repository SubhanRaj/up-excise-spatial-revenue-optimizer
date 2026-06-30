-- Remove on_premises_consumption_fee column (it's a fixed constant, not a DB field)
-- SQLite doesn't support DROP COLUMN directly in older versions; this is a no-op since
-- the column was never added to prod. The constant ON_PREMISES_CONSUMPTION_FEE = 300000
-- is defined in packages/schema/src/constants.ts.
SELECT 1; -- no-op placeholder
