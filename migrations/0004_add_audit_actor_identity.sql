-- Captures admin-actor identity at write time (name + designation), so audit rows for
-- admin-initiated events (unlock, login, district master edits, provisioning) show who did
-- it instead of a blank deo_id column. Null for DEO-actor events — deo_id already identifies
-- those. See CLAUDE.md's "capture at write time, not resolved via a live join" pattern.
ALTER TABLE audit_log ADD COLUMN actor_name TEXT;
ALTER TABLE audit_log ADD COLUMN actor_designation TEXT;
