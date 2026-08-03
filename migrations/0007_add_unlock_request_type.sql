-- Distinguishes a pre-submission "units" unlock (approving deletes district_circles_sectors,
-- DEO re-registers circles/sectors from scratch) from a post-submission "data_correction"
-- unlock (approving only flips districts.status back to 'in_progress' — no rows deleted,
-- DEO re-uploads a corrected Excel which upserts by shop_id, then resubmits). Existing rows
-- default to 'units' since that was the only request type before this column existed.
ALTER TABLE district_unlock_requests ADD COLUMN request_type TEXT NOT NULL DEFAULT 'units';
