-- Per-IP brute-force counter for POST /api/auth/verify-cug — see the sibling
-- excise-revenue-recovery-portal project's SECURITY.md (H-01) for the finding this closes:
-- an unauthenticated request can otherwise guess CUG hashes with no throttling at all. One row
-- per IP (not per attempt), so a sustained brute-force run can't grow this table unbounded.
-- ip_hash is a SHA-256 of the request's CF-Connecting-IP, never the raw address.
CREATE TABLE login_attempts (
  ip_hash TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1
);
