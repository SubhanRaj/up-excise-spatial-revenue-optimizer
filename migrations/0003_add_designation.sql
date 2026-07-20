-- Adds admin designation display (e.g. "Excise Commissioner") — see auth.ts.
ALTER TABLE auth_users ADD COLUMN designation TEXT;
