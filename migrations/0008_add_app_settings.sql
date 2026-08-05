-- Singleton settings row backing the state-wide final-verification round (M-60).
-- verification_phase_open gates whether submitted districts' DEOs see the read-only
-- final-review screen (confirm-or-request-unlock) instead of the normal workflow.
CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY,
  verification_phase_open INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER
);

INSERT INTO app_settings (id, verification_phase_open, updated_at) VALUES (1, 0, NULL);
