# Security & Privacy Guidelines

This document outlines the security architecture and Personally Identifiable Information (PII) protections enforced in the **State Excise Portal — Spatial & Revenue Optimization System**.

## 1. Zero-Knowledge PII Storage (Email Hashing)

To protect the privacy of District Excise Officers (DEOs) and administrative users, **no plaintext emails are ever stored in the database or committed to the repository.**

### Database Schema Enforcement
- Tables such as `districts`, `auth_users`, and `auth_magic_links` explicitly store `email_hash` (or `deo_email_hash`) using SHA-256 encryption.
- Any new features that require email tracking must adhere to this rule. Never add a plaintext `email` column to D1.

### Magic Link & Login Flow
1. When a user types their email into the login portal, the frontend temporarily stores it in `sessionStorage` (so the UI can refer back to it if a resend is needed without querying the server).
2. The server action hashes the inputted email on the fly, checks D1 for the matching `email_hash`, and issues the magic link to the *in-memory* plaintext email.
3. The plaintext email is then instantly discarded from server memory and is never persisted.

### CUG Number Hashing (Alternate Login)

- DEOs sign in with their department CUG mobile number instead of a magic-link email — this remains the default/primary DEO login path even though `RESEND_FROM_EMAIL`'s domain is now verified, since magic-link email is scoped to Admin/HQ login only. The raw 10-digit number is hashed with SHA-256 in the browser (`apps/web/src/lib/crypto-client.ts`) before it is ever transmitted; `POST /api/auth/verify-cug` only ever sees and stores the hash (`auth_users.deo_cug_hash`).
- `scripts/seed-deo-accounts.ts` bulk-populates this from department contact sheets. The source CSVs contain raw PII (mobile numbers, emails) and are gitignored — they must never be committed to the repository. The script hashes both the CUG number and the email before any value reaches D1.
- **CUG login mints only `deo` / `deputy` sessions (`verify-cug` role gate).** From M-17 (when CUG login was added) until M-102, `POST /api/auth/verify-cug` would issue an `admin` session for a `role: 'admin'` row with a `deo_cug_hash`, and a `superadmin` session for the `SUPERADMIN_EMAIL_HASH` row if it carried one — it explicitly computed `effectiveRole` and redirected such logins to `/admin`. Not exploitable with the data that has ever been in prod (no admin/superadmin row has ever had a `deo_cug_hash` — `seed-deo-accounts.ts` and `/api/admin/users` never set one), but a design gap: it routed the strongest privilege level through the weakest credential (a static 10-digit number vs. a one-time magic link). Closed in M-102 — the route now refuses any lookup resolving to `admin`, `superadmin`, or the `SUPERADMIN_EMAIL_HASH` row, with the uniform `401` (no oracle). `/admin` and `/api/admin/*` are email-authenticated only; see §2.

## 2. Superadmin Configuration

To allow for emergency maintenance and system testing without exposing access vectors:
- The Superadmin bypass is configured securely via the environment variable: `SUPERADMIN_EMAIL_HASH`.
- This hash must match the SHA-256 digest of the admin's email address.
- **`/admin` and every `/api/admin/*` route are email-authenticated only.** `POST /api/auth/verify-cug` (CUG login) refuses any lookup that resolves to `admin`, `superadmin`, or the `SUPERADMIN_EMAIL_HASH` row — an admin or superadmin session can only be created through the magic-link flow (`/api/auth/verify`), regardless of whether an `auth_users` row also carries a `deo_cug_hash`. The refusal is the uniform `401 { error: 'Invalid CUG number' }` (no oracle). CUG login mints only `deo` and `deputy` sessions.
- In production, this allows the admin to log in and instantly receive the `superadmin` role, giving them access to both the `/admin` HQ dashboard and the `/home` DEO portal (using whatever district, if any, is assigned to that account — the dummy `Demo District` this previously fell back to was deleted from prod D1 during go-live cleanup, see summary.md's M-22).

## 3. Worker Edge Security

As defined in the primary architecture:
- All traffic is HTTPS-only.
- All administrative operations use HTTP POST with secure JSON bodies. No sensitive data is transmitted via URL queries.
- Cloudflare rate-limiting is enforced (e.g., maximum 3 magic link requests per 15 minutes per email hash).
- `POST /api/auth/verify-cug` is rate-limited per IP (10 attempts / 5 minutes, `apps/web/src/lib/rate-limit.ts`'s `checkIpRateLimit()`, backed by the `login_attempts` table — one row per IP hash, not per attempt, so a sustained brute-force run can't grow it unbounded). Added after an audit of the sibling `excise-revenue-recovery-portal` project found its equivalent route had zero throttling and a publicly-leaked CUG-number prefix constant shrinking its search space; this project never leaked such a prefix, but had the same "no rate limiting at all" gap on this route, closed here. `LoginForm.tsx` also gets a 30-second client-side cooldown after 3 failed attempts — a UX nicety only, not the security boundary (an attacker skips the frontend and hits the API directly).
- `POST /api/auth/verify-cug` returns one indistinguishable failure for every rejected sign-in: a malformed hash is `400`, and an unknown hash, a rate-limit block aside, and a hash whose account holds a role other than the login tab's `expect` value are all `401 { error: 'Invalid CUG number' }` — same body, same status, same `login_attempts` increment. The tab check (added with the M-102 deputy portal, since the DEO and Deputy tabs share this endpoint) must not become an oracle: it must never tell a caller that a guessed number is registered, or what role it holds. Any future per-role branch here has to preserve that — no role-specific message, status, or timing-observable extra work on the reject path.
- Content Security Policy (CSP) headers block `unsafe-inline` and `unsafe-eval` scripts.
- Session tokens use a two-cookie design (`excise-session` and `excise-role`) powered by HMAC-SHA256 signatures validated against D1 `auth_sessions`.
- Every API route (`withErrorHandling` in `apps/web/src/lib/with-error-handling.ts`) catches unhandled exceptions and returns a generic `{ error }` JSON 500 — internal error details (D1 errors, stack traces) are logged server-side only, never returned to the client.
- Multi-write routes use `db.batch()` or `db.transaction()` so a partial failure can never leave related rows (e.g. a district and its auth account) inconsistent.

## 3a. Deputy Excise Commissioner Portal (M-102)

The `deputy` role (one `auth_users` row per division, CUG login only) can read a division-scoped cut of the admin data and record an audit-only "reviewed / flagged" sign-off per district. It cannot write to any DEO or admin route.

**Data scoping.** `districtScope(user)` in `apps/web/src/lib/auth.ts` is the single boundary: `admin`/`superadmin` → no filter, `deputy` with a non-empty `division` → that division, everything else → `null` (403). A deputy row with a null or blank `division` is a seeding error and resolves to 403, not to an unfiltered read. `GET /api/admin/districts` filters its list by it; `/api/admin/districts/[district]` and `.../shops` check the target district's own `division` with `isDistrictInScope()` **before** running that district's aggregates and 403 on a cross-division request — the division-level equivalent of the DEO routes' `user.districtName === district` guard. A deputy is locked to their division on every route exactly as a DEO is locked to their one district. `GET /api/admin/changed-districts` filters its result to the deputy's own division. `GET /api/admin/settings` returns only `cartoApiKey` to a deputy — the state-wide `submittedCount`/`totalDistricts` fields come back zeroed. Every mutating admin route (`PATCH`/`POST`/`DELETE`, including `clear-data` and `clear-fy-data`) still requires `['admin','superadmin']` or `superadmin` — `deputy` is never in those lists. Every `/api/districts/[district]/*` DEO route already checks `user.districtName === district`; a deputy's `districtName` is null, so all of them 403.

**Login tab check is not an oracle.** The DEO and Deputy tabs share `POST /api/auth/verify-cug` and pass `expect: 'deo' | 'deputy'`. A number whose account holds the other role gets the exact `401 { error: 'Invalid CUG number' }` returned for an unknown number — same body, status, and `login_attempts` increment (see §3). The check must never gain a role-specific message, status, or timing-observable branch.

**URL rewrite.** `middleware.ts` rewrites `/deputy-<slug>[/…]` onto the `/deputy` route group. Only the known route shapes (`/deputy-<div>`, `.../districts`, `.../districts/<name>`) are rewritten, and the destination is asserted to still be under `/deputy` before `NextResponse.rewrite` — a crafted `../` sub-path that the URL parser would normalise onto `/admin` is redirected to `/deputy` instead. The role gate (`role === 'deputy' || 'superadmin'`) runs before the rewrite.

**Shared-browser isolation.** Deputy caches live in a separate `excise-deputy` IndexedDB (never `excise-admin`), and every entry is additionally keyed by the division (`<divisionKey>` or `<divisionKey>:<district>`). A browser used by an admin then a deputy, or by two deputies of different divisions, never produces a cross-context cache hit; a miss falls through to the division-scoped API, which 403s anything out of scope. Session cookies are still `HttpOnly` and never in IndexedDB.

**Audit.** Deputy sign-in writes `login_cug` (actor = the deputy); the review sign-off writes `deputy_district_reviewed` with `metadata: { verdict, note }`, `note` capped at 1000 characters. Passive reads are not logged, the same as an admin browsing.
