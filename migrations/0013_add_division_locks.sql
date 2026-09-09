-- M-103: division-level lock. A Deputy Excise Commissioner locks their division once every
-- district in it is DEO-verified and the deputy has signed off "ok" on each. Only state HQ
-- (an admin) can unlock a division after that. When all 18 divisions are locked the state's
-- data collection is closed (derived, not stored).
CREATE TABLE division_locks (
  division   TEXT PRIMARY KEY,
  locked_at  INTEGER NOT NULL,
  locked_by  TEXT NOT NULL,   -- the deputy's display name at lock time
  note       TEXT
);
