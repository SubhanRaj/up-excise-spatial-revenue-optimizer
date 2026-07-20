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

- DEOs may sign in with their department CUG mobile number instead of a magic-link email — this is enforced whenever `RESEND_FROM_EMAIL`'s domain can't be relied on for delivery. The raw 10-digit number is hashed with SHA-256 in the browser (`apps/web/src/lib/crypto-client.ts`) before it is ever transmitted; `POST /api/auth/verify-cug` only ever sees and stores the hash (`auth_users.deo_cug_hash`).
- `scripts/seed-deo-accounts.ts` bulk-populates this from department contact sheets. The source CSVs contain raw PII (mobile numbers, emails) and are gitignored — they must never be committed to the repository. The script hashes both the CUG number and the email before any value reaches D1.

## 2. Superadmin Configuration

To allow for emergency maintenance and system testing without exposing access vectors:
- The Superadmin bypass is configured securely via the environment variable: `SUPERADMIN_EMAIL_HASH`.
- This hash must match the SHA-256 digest of the admin's email address.
- In production, this allows the admin to log in and instantly receive both the `superadmin` role and an assignment to the dummy `Demo District`, allowing them to view and test both the `/admin` HQ dashboard and the `/home` DEO portal safely.

## 3. Worker Edge Security

As defined in the primary architecture:
- All traffic is HTTPS-only.
- All administrative operations use HTTP POST with secure JSON bodies. No sensitive data is transmitted via URL queries.
- Cloudflare rate-limiting is enforced (e.g., maximum 3 magic link requests per 15 minutes per email hash).
- Content Security Policy (CSP) headers block `unsafe-inline` and `unsafe-eval` scripts.
- Session tokens use a two-cookie design (`excise-session` and `excise-role`) powered by HMAC-SHA256 signatures validated against D1 `auth_sessions`.
- Every API route (`withErrorHandling` in `apps/web/src/lib/with-error-handling.ts`) catches unhandled exceptions and returns a generic `{ error }` JSON 500 — internal error details (D1 errors, stack traces) are logged server-side only, never returned to the client.
- Multi-write routes use `db.batch()` or `db.transaction()` so a partial failure can never leave related rows (e.g. a district and its auth account) inconsistent.
