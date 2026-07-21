-- DEO self-service unlock requests: a locked-out DEO submits a plaintext reason instead of
-- only contacting an Admin outside the app; an Admin approves (deletes the district's
-- district_circles_sectors rows, same as the existing manual DELETE /api/districts/[district]/units
-- unlock) or denies with a note. "Only one pending request per district" is enforced in
-- application code, not a DB constraint (same TOCTOU trade-off as the sibling
-- excise-revenue-recovery-portal project's unlock_requests table).
CREATE TABLE district_unlock_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by_deo TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT,
  admin_note TEXT
);
CREATE INDEX dur_district_idx ON district_unlock_requests(district_name);
CREATE INDEX dur_status_idx ON district_unlock_requests(status);
