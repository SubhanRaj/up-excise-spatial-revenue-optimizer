-- Custom HMAC magic-link auth tables (replaces Clerk)
CREATE TABLE IF NOT EXISTS auth_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'deo',
  deo_id        TEXT,
  district_name TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_magic_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL,
  token_hash  TEXT UNIQUE NOT NULL,
  expires_at  TEXT NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_magic_email ON auth_magic_links(email, created_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES auth_users(id),
  expires_at  TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);
