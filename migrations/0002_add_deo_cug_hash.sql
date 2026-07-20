-- Adds CUG-hash login as an alternate credential to magic-link email (see auth.ts).
ALTER TABLE auth_users ADD COLUMN deo_cug_hash TEXT;
CREATE UNIQUE INDEX auth_users_deo_cug_hash_idx ON auth_users(deo_cug_hash);
