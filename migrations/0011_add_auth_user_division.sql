-- M-102: Deputy Excise Commissioner portal. One auth_users row per division carries
-- role='deputy' and this column; it scopes /deputy (and every /api/admin/* read a deputy
-- session is allowed to make) to that single division. Null on every 'deo'/'admin' row.
ALTER TABLE auth_users ADD COLUMN division TEXT;
