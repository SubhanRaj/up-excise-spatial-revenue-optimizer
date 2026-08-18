# CLAUDE.md — State Excise Portal: Spatial & Revenue Optimization System

> Rolling-session logic: this project DOES have it — a 7-day sliding renewal for admin/superadmin sessions via `maybeRenewAdminSession()` in `apps/web/src/lib/auth.ts` (DEO sessions stay a flat 24h, unrolled). See "Session lifetime is role-dependent" under Auth Facade below before concluding it's absent.

> This file is the authoritative context document for Claude Code when working in this repository.
> Read it fully before making any changes or suggestions.

---

## Working Agreement — Read Before Every Task

### Ask When Stuck. Do Not Shotgun.

If you cannot solve a problem with confidence after **one attempt**, stop and ask the user. Do not cycle through multiple approaches hoping one lands. Each failed attempt wastes build minutes, can break working code, and erodes trust.

**Past incident (do not repeat):** Claude loaded `cdn.tailwindcss.com` (Tailwind v3) instead of the pinned `@tailwindcss/browser@4` URL. DaisyUI 5 failed to style because it requires Tailwind v4. Instead of spotting the wrong URL and fixing it in one edit, Claude tried multiple workarounds across several sessions. The correct action: check the URL against this file, fix it, done. One edit.

**Rule of thumb:**
- **Act** when the fix is obvious and involves a small, reversible change to code.
- **Ask** when you are uncertain which approach is correct, when the fix would touch pinned versions or infrastructure, or when a first attempt did not work and you are unsure why.

### Mandatory Type Check Before Push
Before committing and pushing code to GitHub (which triggers the CI deployment), you **must** run `pnpm typecheck` locally and ensure it passes. Next.js App Router enforces strict typing in the build pipeline. Failing to type check locally will break the CI build and waste time. Always verify locally first.

This applies even in auto mode. A question asked once is far cheaper than three wrong fixes.

### Infrastructure Is Fully Provisioned — Do Not Re-Verify

All secrets, keys, and environment variables are confirmed set. Do not question, hedge, or add "make sure X is set" caveats about any of these:

**Cloudflare Worker Secrets** (`wrangler secret put --name up-excise-spatial-revenue-optimizer-web` — persisted in Cloudflare, survive redeploys):

| Variable | Status |
|---|---|
| `SESSION_SECRET` | ✓ Set |
| `API_SECRET` | ✓ Set |
| `RESEND_API_KEY` | ✓ Set |
| `RESEND_FROM_EMAIL` | ✓ Set |
| `SUPERADMIN_EMAIL_HASH` | ✓ Set |
| `DEMO_CUG` | ✓ Set — raw 10-digit test CUG number for the "Demo DEO Officer" account (`DEO-DEMO-001`); never write the raw value into source or docs, see TEST.md's "Manual CUG Login Test". As of 2026-07-20 the account itself was deleted from prod D1 (go-live cleanup, see M-22) — the secret is still valid whenever `pnpm seed:demo` re-creates the account for testing |

**GitHub Actions Secrets** (repo → Settings → Secrets → Actions — used at build/deploy time):

| Variable | Status |
|---|---|
| `CLOUDFLARE_API_TOKEN` | ✓ Set |
| `CLOUDFLARE_ACCOUNT_ID` | ✓ Set |

**Cloudflare D1** (bound to the single worker):

| Database | ID | Bound to |
|---|---|---|
| `up-excise-spatial-revenue-optimizer-prod` | `2955ce2d-8459-45b4-89f4-04afc9e42488` | `up-excise-spatial-revenue-optimizer-web` |

If something is broken, the cause is in the code, not missing infrastructure. Look at the code first.

### Cost Tier — Everything Is on Cloudflare's Free Plan

No Cloudflare product used by this project (Workers, D1, or otherwise) is on a paid plan. Do not assume, imply, or state that any paid tier is active. See "Cloudflare Free Tier" below for the specific limits the architecture is designed around, and roadmap.md §3.1 for the current usage-vs-limit assessment. Deploy frequency (pushes to `main` triggering the CI build+deploy) is never rate-limited or metered on either GitHub Actions (public repo = unlimited Actions minutes) or Cloudflare (Workers deployments are unlimited on the free plan) — only *runtime* usage (requests, CPU-ms, D1 reads/writes) counts against free-tier limits, and Phase 1's projected usage (75 DEOs uploading once each, plus admin browsing) stays well within all of them. If a paid plan is ever adopted, or if the project migrates to different infrastructure, update this section and the secrets table above accordingly — do not leave stale "paid plan" assumptions in this file.

### Pinned Versions and CDN URLs Are Deliberate

Every version in the Technology Stack table is tested and pinned. Do not change any CDN URL or version number, install CDN libraries as npm packages, or suggest "let's try the latest version." If a library is not rendering correctly, compare the URL in the code against this file — the URL here is correct; the code is wrong.

---

## Confirmed Past Mistakes — Read This Before Writing Any Code

These are real mistakes Claude made in previous sessions on this project. Every one of them had the correct rule written in this file already. The failure was not reading carefully enough. Read this list before touching anything.

### ❌ Mistake 1 — Wrong Tailwind CDN URL

**What happened:** Used `cdn.tailwindcss.com` (Tailwind v3) instead of the pinned `@tailwindcss/browser@4` URL from jsdelivr. DaisyUI 5 broke silently.

**The rule (already in this file):** `cdn.tailwindcss.com` serves Tailwind **v3**. DaisyUI 5 requires Tailwind **v4**. The only correct URL is `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4`. Check the CDN table in "Frontend CDN Stack" — those URLs are the source of truth, not your training data.

### ❌ Mistake 2 — Used CSV for exports instead of XLSX

**What happened:** Several export routes and download functions were written to generate CSV. `adjacent_thanas_raw` contains comma-separated values like "Kotwali, Hazratganj" which broke every column to the right when joined with `,`.

**The rule (already in this file):** **CSV is never acceptable.** All file I/O — imports, exports, templates, downloads — must use XLSX via ExcelJS (`window.ExcelJS`), the single spreadsheet library loaded on every page as a CDN global. There is no excuse to use CSV.

### ❌ Mistake 3 — Admin portal pages hit CF D1 directly on every render

**What happened:** All five admin pages that need districts data (`/admin`, `/admin/districts`, `/admin/divisions`, `/admin/divisions/[division]`, `/admin/provision`) were calling `fetch('/api/admin/districts')` directly inside `useEffect`. Every page load, every navigation, every remount triggered a fresh D1 query. This made the admin portal feel slow ("loading 1500 pages feels slow").

**The rule (already in this file):** **IndexedDB-first architecture applies to both portals — DEO and admin.** D1 is the source of truth but must never be polled on every render. The pattern is: read IndexedDB cache → if fresh (within TTL), use it → if stale/missing, fetch from API and store in IndexedDB. The `useAdminDistricts` hook (`apps/web/src/hooks/useAdminDistricts.ts`) implements this for districts data (5-min TTL, `excise-admin` Dexie DB). Similar wrapper objects (`adminMapCache`, `adminShopsCache`, `adminAuditCache`) exist in `apps/web/src/lib/db.ts` for other endpoints. Use them. Do not call direct `fetch` from any page component.

### How to avoid repeating these

Before writing any code that involves:
- A CDN `<script>` or `<link>` tag → check the exact URL in the "Frontend CDN Stack" table
- Any file download or data export → use ExcelJS XLSX, not CSV
- Any admin page that needs districts or state data → use `useAdminDistricts` hook, not a raw fetch

---

## Project Identity

| Field | Value |
|---|---|
| **Project** | State Excise Portal — Spatial & Revenue Optimization System |
| **Client** | Department of Excise, Government of Uttar Pradesh |
| **Consulting Firm** | SIBIN Tech Solutions |
| **Lead Engineer** | Subhan Raj |
| **AI Co-Author** | Claude Sonnet 4.6 (Anthropic) & Antigravity (Google DeepMind) |
| **Active Phase** | Phase 1 — Comprehensive Data Collection Pipeline |
| **Roadmap** | [roadmap.md](roadmap.md) — read this for full architectural and business-logic context |
| **Milestone/Delivery History** | [summary.md](summary.md) — every milestone's full Objective/Deliverables/Exit Criterion, backlog, and pre-campaign-blocker history |
| **App Flow Diagrams** | [docs/app-flow.md](docs/app-flow.md) — Mermaid diagrams: auth (email + CUG), DEO workflow, admin data loading, API error handling |

---

## Monorepo Structure

```
up-excise-spatial-revenue-optimizer/
├── apps/
│   └── web/          # Next.js frontend + all API routes — single CF Worker
│       └── app/
│           ├── (deo)/    # DEO portal routes — middleware enforces role: 'deo'
│           ├── (admin)/  # Admin/HQ portal routes — middleware enforces role: 'admin'
│           ├── login/    # Only public route
│           ├── auth/     # /auth/verify — magic link consumption (public)
│           └── api/      # All API route handlers (same worker, same D1 binding)
├── packages/
│   └── schema/       # Shared Drizzle ORM schema (D1/SQLite)
├── docs/
│   └── templates/    # Standardized DEO Excel upload templates
├── roadmap.md        # Technical/business-logic spec
├── summary.md        # Milestone delivery history (full write-ups)
└── CLAUDE.md         # This file
```

When files for any app or package do not exist yet, do not create them speculatively. Create them when a milestone is actively being worked on.

### Route Map — Authoritative (Frontend + API)

> **Rule:** Before creating any page file, derive the URL it will produce from the directory path and confirm it matches this table. Route groups `(deo)` and `(admin)` are stripped from URLs — they are layout wrappers only. Before adding an API route to the Worker, verify it belongs in this table and does not duplicate an existing route.

#### Frontend pages (`apps/web`)

| URL | File | Role |
|---|---|---|
| `/` | `app/page.tsx` | — redirects to `/login` |
| `/login` | `app/login/page.tsx` | public |
| `/auth/verify` | `app/auth/verify/page.tsx` | public — consumes magic-link token |
| `/home` | `app/(deo)/home/page.tsx` | `deo` |
| `/upload` | `app/(deo)/upload/page.tsx` | `deo` |
| `/verify` | `app/(deo)/verify/page.tsx` | `deo` |
| `/units` | `app/(deo)/units/page.tsx` | `deo` |
| `/admin` | `app/(admin)/admin/page.tsx` | `admin` |
| `/admin/districts` | `app/(admin)/admin/districts/page.tsx` | `admin` |
| `/admin/districts/[district]` | `app/(admin)/admin/districts/[district]/page.tsx` | `admin` |
| `/admin/divisions` | `app/(admin)/admin/divisions/page.tsx` | `admin` |
| `/admin/divisions/[division]` | `app/(admin)/admin/divisions/[division]/page.tsx` | `admin` |
| `/admin/provision` | `app/(admin)/admin/provision/page.tsx` | `superadmin` — nav label "District Master"; URL/file path unchanged, only the displayed label was renamed. Owner/superadmin-only (see "District Master page" below) — regular `admin` accounts get a restricted message client-side and a 403 from the underlying API routes |
| `/admin/users` | `app/(admin)/admin/users/page.tsx` | `superadmin` — nav label "Admin Users". Owner/superadmin-only, same restriction pattern as District Master — regular `admin` accounts get a restricted message client-side and a 403 from the underlying API routes |
| `/admin/unlock-requests` | `app/(admin)/admin/unlock-requests/page.tsx` | `admin` |
| `/admin/audit` | `app/(admin)/admin/audit/page.tsx` | `admin` |
| `/admin/export` | `app/(admin)/admin/export/page.tsx` | `admin` |
| `/admin/circles-sectors` | `app/(admin)/admin/circles-sectors/page.tsx` | `admin` — Circle & Sector Master, read-only, open to all admins (not owner/superadmin-gated) |

**How Next.js App Router derives URLs:** route groups `(name)` are stripped; every other folder becomes a URL segment; `[param]` is a dynamic segment.

**Past blunder:** `(admin)/provision/page.tsx` was created, producing URL `/provision` — navbar linked to `/admin/provision` → 404. The route group was stripped but `admin/` was never added. This table prevents repeating that.

#### Next.js API Route Handlers (`apps/web/app/api/`)

All API routes are Next.js Route Handlers inside the single `up-excise-spatial-revenue-optimizer-web` Worker. They access D1 via `getCloudflareContext()` and verify auth via the session cookie (`getSession()`). No separate API worker exists.

**Public:**

| Method | Path | File |
|---|---|---|
| `GET` | `/api/healthz` | `api/healthz/route.ts` |
| `GET` | `/api/auth/session` | `api/auth/session/route.ts` — returns `{ deoId, role, districtName, name }` |
| `POST` | `/api/auth/verify` | `api/auth/verify/route.ts` — verifies magic-link token, creates session, returns `{ redirect }` |
| `POST` | `/api/auth/verify-cug` | `api/auth/verify-cug/route.ts` — alternate login: browser hashes the DEO's 10-digit CUG mobile number (SHA-256), server looks it up against `auth_users.deo_cug_hash`, creates session, returns `{ redirect }`. Rate-limited per IP before the lookup (10/5min, `login_attempts` table, see SECURITY.md §3) — returns `429` past that. |
| `POST` | `/api/auth/logout` | `api/auth/logout/route.ts` |

**DEO (`role: deo`):**

| Method | Path | File |
|---|---|---|
| `POST` | `/api/upload/chunk` | `api/upload/chunk/route.ts` — 500-row batch insert via `db.batch()` |
| `GET` | `/api/districts` | `api/districts/route.ts` |
| `GET` | `/api/districts/[district]/units` | `api/districts/[district]/units/route.ts` |
| `POST` | `/api/districts/[district]/units` | `api/districts/[district]/units/route.ts` — **bulk-only**, one-shot: body is `{ circles: string[], sectors: string[] }`. Rejects (409) if the district already has any unit row — see "DEO Workflow" below. |
| `GET` | `/api/districts/[district]/template` | `api/districts/[district]/template/route.ts` |
| `GET` | `/api/districts/[district]/status` | `api/districts/[district]/status/route.ts` — also returns `verificationPhaseOpen` (M-60's global flag, read alongside `districtStatus` in the same request) |
| `GET` | `/api/districts/[district]/shops` | `api/districts/[district]/shops/route.ts` |
| `POST` | `/api/districts/[district]/submit` | `api/districts/[district]/submit/route.ts` — body `{ submittedByName: string }`, required (400 if missing/blank); stored in the `district_submitted` audit log entry's `metadata` JSON **and** written to `districts.deoName` (M-53) in the same atomic `db.batch` as the status/audit-log update — see "DEO Workflow" below |
| `GET` | `/api/districts/[district]/request-unlock` | `api/districts/[district]/request-unlock/route.ts` — the signed-in DEO's own latest unlock request (or `null`), for the `/units` locked-view pending banner |
| `POST` | `/api/districts/[district]/request-unlock` | `api/districts/[district]/request-unlock/route.ts` — self-service unlock request (409 if not locked yet, or if a pending request already exists); audit-logged as `unlock_requested` |
| `POST` | `/api/districts/[district]/verify` | `api/districts/[district]/verify/route.ts` — M-60 final-verification confirm: `{ submittedByName }`, 409 unless the state-wide verification round is open **and** the district is `'submitted'`; flips `districts.status` to `'verified'` and audit-logs `district_verified` |

**Admin (`role: admin`):**

| Method | Path | File |
|---|---|---|
| `GET` | `/api/admin/districts` | `api/admin/districts/route.ts` — 75-row aggregate |
| `GET` | `/api/admin/districts/[district]` | `api/admin/districts/[district]/route.ts` |
| `PATCH` | `/api/admin/districts/[district]` | `api/admin/districts/[district]/route.ts` — District Master inline edit (division, DEO identity, expected vend count, bbox); atomic `db.batch`, syncs `auth_users`. **Owner/superadmin-only** — 403 for a plain `admin` role |
| `GET` | `/api/admin/districts/[district]/shops` | `api/admin/districts/[district]/shops/route.ts` |
| `GET` | `/api/admin/districts/[district]/export` | `api/admin/districts/[district]/export/route.ts` |
| `GET` | `/api/admin/export/all` | `api/admin/export/all/route.ts` — returns `{ rows, units, hasMore }`: one 2000-row page of `phase1_raw_collection` (`?offset=`, ordered by `id`) plus every `district_circles_sectors` row (low hundreds, returned on the first page only) — paginated as of M-63, see the "Admin Data Loading" note below |
| `GET` | `/api/admin/changed-districts` | `api/admin/changed-districts/route.ts` — M-64: `{ districts: string[], at: number }`, a single indexed `audit_log` scan for `district_submitted`/`district_verified`/`units_unlocked`/`data_correction_unlocked` events after `?since=<epochMs>`. Tells Sync All exactly which districts' `export_cache` entries need re-fetching, replacing M-63's boolean-only `recent-district-lock` route |
| `GET` | `/api/admin/map-data` | `api/admin/map-data/route.ts` |
| `GET` | `/api/admin/search` | `api/admin/search/route.ts` |
| `POST` | `/api/admin/bulk-provision` | `api/admin/bulk-provision/route.ts` — **Owner/superadmin-only** (creates DEO accounts and sends real magic-link emails) — 403 for a plain `admin` role |
| `GET` | `/api/admin/users` | `api/admin/users/route.ts` — lists `auth_users` rows with `role: 'admin'` (name, designation, createdAt, whether the row is the owner/superadmin bypass account). **Owner/superadmin-only** — 403 for a plain `admin` role |
| `POST` | `/api/admin/users` | `api/admin/users/route.ts` — creates a new admin/HQ account (`{ name, email, designation? }`); 409 if the email is already in use. No email is sent — the new admin signs in with the existing magic-link flow whenever they use it. **Owner/superadmin-only** |
| `PATCH` | `/api/admin/users/[id]` | `api/admin/users/[id]/route.ts` — edits name/email/designation on a `role: 'admin'` row; 409 on email collision; rejects email changes on the row matching `SUPERADMIN_EMAIL_HASH` (that account's sign-in identity is fixed by server config, not editable in-app); changing email invalidates that user's outstanding magic links. **Owner/superadmin-only** |
| `DELETE` | `/api/admin/users/[id]` | `api/admin/users/[id]/route.ts` — deletes a `role: 'admin'` row plus its sessions and magic links atomically; refuses to delete the owner/superadmin row or the caller's own account (self-lockout guard). **Owner/superadmin-only** |
| `GET` | `/api/admin/audit-log` | `api/admin/audit-log/route.ts` |
| `GET` | `/api/admin/settings` | `api/admin/settings/route.ts` — `{ verificationPhaseOpen, submittedCount, totalDistricts }`. Open to any `admin`/`superadmin` (read-only progress display) |
| `POST` | `/api/admin/settings` | `api/admin/settings/route.ts` — `{ verificationPhaseOpen: boolean }`; flips the M-60 state-wide final-verification switch and audit-logs `verification_phase_toggled`. **Owner/superadmin-only** — 403 for a plain `admin` role |
| `GET` | `/api/admin/unlock-requests` | `api/admin/unlock-requests/route.ts` — all `district_unlock_requests` rows, newest first |
| `POST` | `/api/admin/unlock-requests/resolve` | `api/admin/unlock-requests/resolve/route.ts` — `{ id, action: 'approve'\|'deny', note }`; behavior branches on the request's `requestType` (M-54): for `'units'`, approve deletes that district's `district_circles_sectors` rows and audit-logs `units_unlocked`; for `'data_correction'`, approve only resets `districts.status` to `'in_progress'` (no rows deleted) and audit-logs `data_correction_unlocked`. Deny audit-logs `unlock_request_denied` either way. Open to plain `admin`, not owner/superadmin-only. This is the **only** route that can unlock a district — there is no admin override that doesn't go through a real `district_unlock_requests` row |

> **Note:** A dedicated cron trigger for audit log purge is not needed — `GET /api/admin/audit-log` opportunistically deletes rows older than 45 days on every read (the admin audit page is the only consumer of this table, so pruning right before the next read is equivalent to a scheduled job for this access pattern). This also sidesteps the single-worker limitation that a real cron trigger would hit: with @opennextjs/cloudflare v1, the generated worker.js does not expose a `scheduled` export hook.

---

## Technology Stack

> **Read this table before touching any dependency, CDN tag, or version number.**
> Every version here is pinned and deliberate. Do not substitute, upgrade, or replace without updating this table.

### Core Infrastructure

| Layer | Technology | Version / URL |
|---|---|---|
| Runtime | Node.js | **v24** — local and CI both. Do not use v20 or v22. |
| Package manager | pnpm | v11, monorepo workspace |
| Frontend framework | Next.js App Router | `next@15` — single app at `apps/web` |
| Frontend deploy adapter | `@opennextjs/cloudflare` | v1.20.1 — builds Next.js as a Cloudflare Worker (NOT Pages). **Never add `export const runtime = 'edge'`** to any file — OpenNext rejects it with a build error. CF bindings work in all server contexts without it. |
| Database | Cloudflare D1 (SQLite) | `db.batch()` for all multi-row writes; bound to `up-excise-spatial-revenue-optimizer-web` |
| ORM | Drizzle ORM | D1 adapter, schema at `packages/schema/src/phase1.ts` + `packages/schema/src/auth.ts` |
| Authentication | Custom HMAC magic-link | No external auth provider. Magic links via Resend → D1 sessions → session cookie auth |
| Email | Resend | Magic-link delivery, Admin/HQ-only (DEOs use CUG login — see "CUG-hashed login"). `mail.exciseup.in` verified in Resend; `RESEND_FROM_EMAIL` is `noreply@mail.exciseup.in`, reused across all UP Excise projects on the same Resend account. |
| Testing | Vitest + Playwright | unit tests for revenue calc + coord converter |

### Authentication Architecture

The portal uses a **two-cookie design** — no external auth provider, no separate API worker:

1. **Session cookie** (`excise-session`): `rawId.hmacSig` where `hmacSig = HMAC-SHA256(rawId, SESSION_SECRET)`. HttpOnly, Secure, SameSite=Lax. Set on `/auth/verify` after consuming a valid magic link (or `/api/auth/verify-cug` for DEOs). Stored as SHA-256 hash in D1 `auth_sessions`. Expiry is role-dependent — see "Session lifetime" below.

2. **Role cookie** (`excise-role`): `deo`, `admin`, or `superadmin` (set explicitly at login time — see `verifyToken()` in `api/auth/verify/route.ts` and its CUG equivalent — the superadmin bypass account's cookie carries `superadmin`, not `admin`). Client-readable, used by `middleware.ts` for routing (DEO routes vs admin routes). Not a security boundary — the security check is in server layouts via `requireAuth()` and in route handlers via `getSession()`.

All API routes are same-origin Next.js Route Handlers. The browser sends the session cookie automatically — no Bearer tokens, no API tokens. Route handlers call `getSession()` which verifies the HMAC and does a D1 lookup.

**Magic-link flow:**
1. User enters email on `/login` → server action `requestMagicLink()` validates email against `auth_users`, rate-limits (3/15min), generates UUID token, stores SHA-256 hash in `auth_magic_links`, sends link via Resend (`sendMagicLinkEmail()` in `apps/web/src/lib/email.ts`). The email's banner text is role-aware — "Admin / HQ Portal" for `role: 'admin'` recipients, "DEO Portal" only for the rare `role: 'deo'` recipient who has an email on file (see "CUG-hashed login" below); it is derived from the looked-up `auth_users.role`, not hardcoded, since in practice this channel is Admin/HQ-only.
2. DEO clicks link → `/auth/verify?token=xxx` → **client component** shows spinner, POSTs token to `POST /api/auth/verify` → route handler verifies hash, marks used, creates `auth_sessions` record, sets cookies, returns `{ redirect }` → client does `window.location.href = redirect` to `/home` or `/admin`.
   - **Why client component:** Next.js 15 forbids `cookies().set()` in Server Component pages. Cookie writes are only allowed in Route Handlers and Server Actions. The verify page is `'use client'`; the actual verification and session creation happen in the `/api/auth/verify` Route Handler.
3. Client pages call `/api/auth/session` on mount → route handler verifies session cookie → returns `{ deoId, name, role, districtName }`. No token issued.
4. Client calls all `/api/*` routes directly — session cookie authenticates automatically.

**CUG-hashed login (primary DEO credential):** a DEO signs in with their department CUG mobile number rather than email — this remains the primary/default DEO login path even with the domain now verified, since magic-link email is scoped to Admin/HQ only. The `/login` page has an Email/CUG toggle; the CUG path hashes the 10-digit number client-side (`apps/web/src/lib/crypto-client.ts`, Web Crypto SHA-256 — the raw number never leaves the browser) and POSTs `{ cugHash }` to `/api/auth/verify-cug`, which looks it up against `auth_users.deo_cug_hash`, creates the same session/cookie as the magic-link path, and returns `{ redirect }`. Both login paths are equally valid and interchangeable per account — a DEO with both an email and a CUG hash on file can use either. `scripts/seed-deo-accounts.ts` populates `deo_cug_hash` (and `deoEmailHash`) for real DEOs from department contact sheets — see "DEO Account Seeding" below.

**Admin name/designation:** `auth_users.designation` (nullable, e.g. "Excise Commissioner") is shown in the admin navbar next to the person's `name` — see `AdminIdentity` in `app/(admin)/layout.tsx`. Falls back to "Superadmin"/"Admin" (by role) when unset. **No email tooltip** — unlike a plaintext-email system, this project only ever stores `email_hash` (Zero-Knowledge PII), so there is no readable email available client-side to show on hover. `GET /api/auth/session` and `SessionUser`/`SessionInfo` (`src/lib/auth.ts`, `src/hooks/useSession.ts`) both carry `designation` through from D1. Multiple admin accounts (department officials, not just the one superadmin-bypass owner) are supported the same way DEOs are — a plain `auth_users` row with `role: 'admin'`, managed in-app on the Admin Users page (`/admin/users`, owner/superadmin-only — see "Admin Users page" below).

**Auth tables in D1** (`packages/schema/src/auth.ts`):
- `auth_users` — email hash, name, role, deoId, districtName (populated during bulk-provision or `seed-deo-accounts.ts`), designation (nullable, admin-only in practice), `deoCugHash` (SHA-256 of CUG mobile number, unique, nullable — alternate login credential)
- `auth_magic_links` — tokenHash, expiresAt, used flag
- `auth_sessions` — id=sha256(rawId), userId, expiresAt (24h)

**CF worker bindings required** (`up-excise-spatial-revenue-optimizer-web`):
- `DB` — D1 database
- `SESSION_SECRET` — for session cookie HMAC
- `API_SECRET` — reserved (used internally; not currently used for inter-service auth since single worker)
- `RESEND_API_KEY` — for magic link emails
- `RESEND_FROM_EMAIL` — sender address (`noreply@mail.exciseup.in`, verified custom domain)

### Frontend CDN Stack

> All CDN assets are loaded in `apps/web/app/layout.tsx` as `<script src="...">` and `<link>` tags in `<head>`. They are available as browser globals on every page before React hydration.
>
> **ExcelJS** (`window.ExcelJS`) is the single spreadsheet library for the whole app — reading uploaded DEO files (`parseExcelFile`, `readWorkbookRows`), generating downloadable templates (`generateTemplate`, `generateProvisionTemplate`), and every data export (`exportRowsToXlsx`), all in `apps/web/src/lib/excel.ts`. One library means every workbook gets the same freeze panes, print setup (landscape, fit-to-width, repeating header rows), cell styling, and dropdown data validation for free, with no second library doing the same job a different way.
> This project previously used SheetJS for reading/simple exports and hand-patched worksheet XML via JSZip to bolt data validation onto its writer — that patch produced invalid/corrupted `.xlsx` output because it never added the workbook-level `_xlnm.Print_Titles` defined name and was fragile to OOXML element ordering. SheetJS and JSZip were removed entirely; ExcelJS writes fully spec-compliant OOXML directly, for both reading and writing, so there is no manual XML editing anywhere in this codebase.
> CDN is the default. If the CDN is unavailable or a server-side route needs spreadsheet generation, installing `exceljs` as an npm package is acceptable. CSV is **never** acceptable for data with comma-containing fields (e.g. adjacent thanas); always use XLSX.
>
> **Minimum Excel version — 2013 or later.** Excel 2007/2010 don't reliably render this template's dropdown/validation rules, letting Inspectors type invalid data past them undetected. A warning is baked into the file itself (second line of the Data Entry title row, plus a banner row on the Instructions sheet — both bilingual, added in `generateTemplate()`), not just the web UI, since the people actually filling the file are often Inspectors who never open the portal. Also called out in the `/upload` page's HelpPanel.
>
> UI libraries (DaisyUI, Tailwind browser CDN, Dexie, SweetAlert2, Notyf, Chart.js, Leaflet) must remain CDN-only — they are not used server-side and bundling them into the Worker would increase cold-start size without benefit.

| Library | Version | CDN URL | Used in |
|---|---|---|---|
| **DaisyUI** | **5.6.3** | `https://cdn.jsdelivr.net/npm/daisyui@5.6.3/daisyui.css` | All pages |
| **Tailwind CSS** | **v4** (`@tailwindcss/browser`) | `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4` | All pages |
| **Dexie.js** | 4.0.10 | `https://cdn.jsdelivr.net/npm/dexie@4.0.10/dist/dexie.min.js` | All pages |
| **SweetAlert2** | 11.14.5 | `https://cdn.jsdelivr.net/npm/sweetalert2@11.14.5/dist/sweetalert2.all.min.js` | All pages |
| **Notyf** (JS + CSS) | 3.10.0 | `https://cdn.jsdelivr.net/npm/notyf@3.10.0/notyf.min.{js,css}` | All pages |
| **ExcelJS** | **4.4.0** | `https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js` | All pages — the only spreadsheet library; reads, writes, and exports |
| **Chart.js** | **4.4.7** | `https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js` | All pages |
| **Leaflet.js** (JS + CSS) | **1.9.4** | `https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.{js,css}` | All pages |

**Critical version constraints:**
- **DaisyUI 5 requires Tailwind v4.** Never pair DaisyUI 5 with Tailwind v3. They use incompatible layer architectures. `cdn.tailwindcss.com` serves Tailwind v3 — do not use that URL.
- **DaisyUI themes** must be built-in names: `light` or `dark`. Custom names silently produce no styling.
- **Tailwind utilities** (`flex`, `text-center`, `p-4`, etc.) come from the Tailwind v4 CDN script. DaisyUI color utilities (`bg-base-200`, `text-primary`) come from the DaisyUI CSS file.

**Theme system (dark/light mode, no flash):**
- An inline `<script>` in `apps/web/app/layout.tsx` runs before first paint: reads `localStorage.getItem('theme')` and resolves it to `'light'`/`'dark'` via `window.matchMedia('(prefers-color-scheme:dark)')` when the stored value is `'system'` or unset (first visit), then sets `data-theme` on `<html>`. This eliminates the white flash on dark-mode/system-preference load — the very first paint already reflects the resolved theme, with no dependency on `ViewPrefsPanel` having mounted yet.
- `data-theme` must only ever be set on `<html>` — **never on child `<div>` elements**. A `data-theme` attribute on any descendant overrides the root and breaks the anti-flash script.
- The `ViewPrefsPanel` component (`app/_components/ViewPrefsPanel.tsx`) is the only place that writes `data-theme` and `localStorage.theme`. It supports three modes: `light`, `dark`, and `system` (reads `window.matchMedia('(prefers-color-scheme: dark)')`). Internally calls `document.documentElement.setAttribute('data-theme', resolved)` where `resolved` is always `'light'` or `'dark'`. On mount it re-applies the persisted theme (not just its own button-highlight state) and attaches a `matchMedia` `change` listener that live-reapplies `'system'` resolution if the OS preference flips while `'system'` mode is active and no explicit `light`/`dark` choice has been stored. The `ThemeToggle` component is retired — do not re-add it.
- `localStorage.theme` holds one of `'light'`, `'dark'`, or `'system'`. `data-theme` on `<html>` is always the *resolved* value — only `'light'` or `'dark'`, never `'system'`.

### Icons & Fonts

| Layer | Technology | How to use |
|---|---|---|
| Icons | Tabler Icons | Inline SVG paths from [tabler.io/icons](https://tabler.io/icons). No icon libraries, no emoji as icons, ever. |
| Font | Inter (Google Fonts) | `<link>` in root `layout.tsx`. Never bundle. |

---

## Hard Constraints — Never Violate These

### Zero-Knowledge PII Storage (Email Hashing)

- **No plaintext emails are permitted in the database.** All tables (`districts`, `auth_users`, `auth_magic_links`) store SHA-256 hashes (`email_hash` / `deo_email_hash`).
- **Do not add new plaintext email columns.** Any new feature tracking users must rely on hashes.
- **In-memory hashing:** The frontend collects the plaintext email and can keep it in `sessionStorage`. The backend immediately hashes the input on receipt and discards the plaintext string after sending the magic link email.
- **Superadmin Configuration:** The developer's/superadmin's email string must never be hardcoded in the codebase. It is driven exclusively by the `SUPERADMIN_EMAIL_HASH` environment variable.

### Auth Facade — No Public Pages

- **Every route is behind auth** except `/login`, `/auth/verify`, and `/api/healthz`. Middleware redirects unauthenticated requests to `/login` with no `?redirect_url=` query param.
- **Public routes:** `/login` and `/auth/verify`. Every other route requires a valid session cookie.
- **Security boundary is `requireAuth()` in server layouts** — not middleware. Middleware only checks cookie presence and reads the `excise-role` cookie for routing. A server layout `requireAuth('deo')` call performs the full HMAC verification + D1 session lookup and redirects if invalid.
- **DEO routes (`/home`, `/units`, `/upload`, `/verify`) are deo-only** — `requireAuth('deo')` (`src/lib/auth.ts`) redirects any non-`deo` session (including `admin` and `superadmin`) to `/admin` instead of rendering, and `middleware.ts` does the same redirect at the routing layer for the same route group. There is no admin/superadmin bypass onto DEO routes. This was previously not the case — `requireAuth()` unconditionally passed a `superadmin` session through to any `minRole`, and middleware separately let both `admin` and `superadmin` roles reach DEO routes; an admin/superadmin landing on `/home` (e.g. a stale bookmark) rendered a broken DEO dashboard showing "Unknown District" and all-zero stats, since the admin/superadmin account has no `districtName`. Fixed by removing the bypass from both layers — an admin/superadmin visiting a DEO route is now sent straight to `/admin`, their own dashboard.
- **Session cookie is HttpOnly, Secure, SameSite=Lax.** Session credentials never touch `localStorage`, `sessionStorage`, or IndexedDB.
- **Sign-out** clears both `excise-session` and `excise-role` cookies via a server action that also deletes the D1 session row. The sign-out button in layouts calls a form action — there is no client-side Clerk hook.
- **Token in URL** — the magic-link token (`/auth/verify?token=xxx`) is consumed and marked used on first visit. Expired, used, or missing tokens show an error and redirect to `/login`. Tokens expire in 15 minutes.
- **Rate limit**: 3 magic-link requests per email per 15-minute window. Enforced in `requestMagicLink()` server action.
- **Session lifetime is role-dependent (as of 2026-08-04, M-59):** DEO sessions are 24 hours, unchanged — `expires_at = now + 24h` in D1 at login. Admin/superadmin sessions (magic-link login only) are a 7-day "remember me" window, `ADMIN_SESSION_TTL_MS` in `apps/web/src/lib/auth.ts`, with **sliding renewal**: `GET /api/auth/session` (already called once per tab by `useSession()`) calls `maybeRenewAdminSession()`, which re-issues both cookies and bumps the D1 row's `expiresAt` to a fresh 7 days whenever the existing session is within 24h of expiring. An admin who opens the portal at least once a week is never forced to re-authenticate — effectively indefinite for normal use, without an actually-infinite cookie. `requireAuth()`'s expiry check (`getSession()`, read-only, callable from Server Components) is unaffected by this — renewal only happens from the Route Handler, never a page render.

### Client-Side Session Hook

All client components that need the current user **must use the `useSession()` hook** from `apps/web/src/hooks/useSession.ts`. This hook:
1. Calls `/api/auth/session` once on mount (module-level cache — one fetch per tab, not per component).
2. Returns `{ session: SessionInfo | null }`.
3. `SessionInfo` = `{ deoId, name, role, districtName }`.

Do not fetch `/api/auth/session` directly from page components — always go through the hook. Client components call `/api/*` routes directly with `fetch('/api/...')` — no Authorization header needed (same-origin session cookie is sent automatically).

### Security

- **No data in URL query parameters.** All mutations use HTTP POST with JSON body. GET endpoints return only read-only reference data. No sensitive field ever appears in a URL. Exception: the magic-link token in `/auth/verify?token=xxx` — this is a one-time-use opaque random token (not user data).
- **No secrets in source.** All keys (`SESSION_SECRET`, `API_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`) are Cloudflare Worker Secrets set via `wrangler secret put --name up-excise-spatial-revenue-optimizer-web`. Nothing sensitive is in `.env`, `wrangler.jsonc`, or GitHub secrets beyond the CF deploy token.
- **Session credentials stay in cookies.** They never touch `localStorage`, `sessionStorage`, or IndexedDB.

### Admin Data Loading

> **IndexedDB-first applies here too.** The same architecture used for DEO data applies to the admin portal. Admin pages must never call `fetch` directly to load primary data — they must go through cache wrappers in `apps/web/src/lib/db.ts` or hooks like `useAdminDistricts` (`apps/web/src/hooks/useAdminDistricts.ts`), which serve from the `excise-admin` Dexie DB cache (typically 5-min TTL) and only hit D1 on cache miss. This is strictly enforced.
>
> **`invalidateAllAdminCaches()`** (`apps/web/src/lib/db.ts`, backing the navbar's "Sync All" button) is the one place D1 traffic is intentionally batched behind a single explicit click rather than lazy per-cache misses — it clears every TTL-based cache (districts, map, audit, unlock requests, settings) *and* actively re-fetches and re-populates the heavier `export_cache` (~30K shop rows + every circle/sector, state-wide — used by `/admin/export`, the overview's Statewide Shop-Type Breakdown card, and `/admin/circles-sectors`, M-61). The other caches don't need an active re-fetch here since each page's own hook refetches lazily on the next cache miss anyway; `export_cache` is the exception because nothing else ever refetches it automatically, and two everyday admin surfaces now depend on it — leaving it merely cleared (an earlier version of this fix) meant those two pages stayed stuck on an empty state right after the exact button admins already click to refresh everything.
>
> **M-63 — Sync All D1-read throttling (silent, no UI change):** with real campaign data live, repeated Sync All clicks were pushing D1 read rows toward the free-tier daily cap, mainly from re-pulling the entire `export_cache` dataset on every click regardless of whether the underlying shop data had actually changed. First guard, still in place: a **15-minute cooldown** (`admin-last-full-sync-at` in localStorage) — a click inside the cooldown window is a complete no-op, zero D1 reads of any kind, not even the cheap caches.
>
> **M-64 — per-district incremental export sync (silent, no UI change):** M-63's second guard was still all-or-nothing — any district locking recently meant a full ~25K-row `export_cache` repull. `GET /api/admin/changed-districts?since=<watermark>` (a single indexed `audit_log` scan, `al_created_at_idx`, for `district_submitted`/`district_verified`/`units_unlocked`/`data_correction_unlocked` events) now returns the *actual list* of district names that changed since this device's last export sync (`admin-export-sync-watermark` in localStorage), not just a boolean. `syncExportCache()` (`apps/web/src/lib/db.ts`) then re-fetches only those districts' rows (`GET /api/admin/districts/[district]/shops?pageSize=all`) and units (`GET /api/admin/districts/[district]`, already returns `units`) and splices them into the existing cached `{ rows, units }` in place — every other district's cached data is left untouched, never cleared. A district whose incremental fetch fails keeps its old cached data rather than being wiped, so a network blip never deletes good local data or surfaces an error to the portal UI. If more than 15 districts changed at once (only plausible if localStorage and IndexedDB fell out of sync independently), it falls back to one full paginated re-fetch instead of firing 15+ small requests. The very first sync on a device (no `export_cache` yet) still does the full paginated pull, same as before M-64 — this only changes every sync *after* that.
>
> **`GET /api/admin/export/all` itself is paginated (M-63)** — `?offset=` in 2000-row pages (`PAGE_SIZE` in that route, matching the existing server cap on `/api/admin/districts/[district]/shops`), ordered by `id`, `units` only returned on the first page. Before M-63 this route ran a single unbounded `SELECT *` over the whole table and serialized it in one Worker invocation — harmless against near-empty test data, but once real DEO uploads pushed `phase1_raw_collection` past 25,000 rows, that single invocation's JSON-serialization work exceeded the free-tier Worker CPU budget and surfaced as Cloudflare 1101/1102 error pages, seemingly at random (any of the three callers below could trigger it). `fetchFullExportData()` (`apps/web/src/lib/db.ts`) is the shared client-side pager — loops on `hasMore` and assembles the same `{ rows, units }` shape every caller already expected; `invalidateAllAdminCaches()`, `useAdminExportData().sync()`, and the `/admin/export` page's `refreshAndDownload()` all call it instead of duplicating a raw `fetch`.
>
> **M-65 — dead TTL fix + `makeKvCache` factory (silent, no UI change):** the small per-page caches (districts, map, shops, unlock requests, settings) all claimed a 5-min TTL in their comments but never actually checked `fetchedAt` against it in `.get()` — so a cache entry populated once could be served indefinitely, self-healing only via an explicit Sync All click, which itself has the 15-min cooldown described above and can silently no-op. This is why a district's status/verification-phase state could go stale on `/admin` (or any page reading these caches) for an unbounded period after a real change, even though the district's own detail page — which reads `GET /api/admin/districts/[district]` directly, no cache — always showed the correct state. All five now enforce the TTL on read. Since every one of these caches was the exact same shape (one Dexie table, `{ key, data, fetchedAt }`, optional TTL), they're now generated by one `makeKvCache<T>(table, { fixedKey?, ttlMs? })` factory in `apps/web/src/lib/db.ts` instead of six independently-hand-written objects — the TTL check now lives in exactly one place, so this bug class can't be reintroduced by a future cache forgetting to copy it. `export_cache` is deliberately not part of this factory — its shape (`{ rows, units }`, ~30K rows, patched incrementally per-district by `syncExportCache()`) doesn't fit a generic key-value cache. No caller code changed; every cache's `.get()`/`.set()`/`.invalidate()` signature is unchanged.
>
> **District detail shop table column-width jitter (M-65):** the `/admin/districts/[district]` shop table used `table-layout: auto` (DaisyUI's `.table` doesn't set `table-layout`), so column widths were recomputed from whichever rows happened to be in the DOM. Filtering to one shop type (or a smaller page size) changed which rows were rendered, which shifted the width distribution — columns like Adjacent Thanas (unbounded flex-wrap badges) and the `whitespace-nowrap` columns (Shop ID, Coordinates, Uploaded By) could absorb a disproportionate share of the table's 100% width, in turn changing row heights (badge wrapping) enough to trigger the `overflow-auto` wrapper's vertical scrollbar even at low row counts. Fixed by giving the table `table-fixed` with an explicit `<colgroup>` (percentage widths, one `<col>` per column) so widths are stable regardless of which subset of rows is visible.

**Overview page (`/admin`):**
- Default view **never loads shop rows**. Calls `GET /api/admin/districts` (one request, 75 aggregate rows) and `GET /api/admin/map-data`.
- District table on the overview shows **top 10 by revenue only**, with a "View all 75 districts →" link to `/admin/districts`.
- A **divisions grid** below the charts groups districts by `division` field client-side — 18 division cards each showing district count, submission progress bar, and total revenue. Cards link to `/admin/divisions/[name]`.
- The state totals aggregate is **pre-computed server-side** on each `district_submitted` event and **cached in admin IndexedDB** (`admin_state_totals`, 15-min TTL). The summary page never runs a fresh full-table aggregate within the TTL window.
- **"Total Circles & Sectors" stat card** (M-61) — a 4th state-totals card, summing `unitCount` (already present on every row from `GET /api/admin/districts`) client-side. Free: no new query, no new cache, reuses data every overview visit already loads.
- **"Shop Type Breakdown — Statewide" card** (M-61) — the state-wide equivalent of the district detail page's per-district shop-type breakdown bar. Sourced from `useAdminExportData()` (`apps/web/src/hooks/useAdminExportData.ts`), which wraps the **same `export_cache` IndexedDB entry the `/admin/export` page already populates** (`GET /api/admin/export/all` — every shop row + every `district_circles_sectors` row, state-wide). This card never triggers that fetch itself on mount — the navbar's **"Sync All" button populates this cache too** (see `invalidateAllAdminCaches()` below), the same explicit click an admin already makes to refresh everything else. The card just doesn't render at all until that data exists on this device — no separate sync prompt or button of its own; an admin who hasn't clicked Sync All yet simply doesn't see the card, rather than being shown an empty-state explanation of an IndexedDB cache they have no reason to know about.
- **"Final Verification Round" card** — see the "State-wide final verification round" note under DEO Workflow above.

**Districts page (`/admin/districts`):**
- Full 75-district table. Fetches from the same `GET /api/admin/districts` endpoint (75 aggregate rows — no shop data). The endpoint also returns `deoEmail`, `deoId`, a bbox-midpoint `centerLat`/`centerLon` per district (computed server-side from `districts.bboxMinLat/MaxLat/MinLon/MaxLon`), and `unitCount` (a third grouped `COUNT` against `district_circles_sectors`, added alongside the existing `phase1_raw_collection` vend-count/revenue aggregate — same single request, still fully served from the `excise-admin` IndexedDB cache on repeat visits, no extra D1 hit per page load).
- **Circles/Sectors column** shows the real registered-unit count per district (sortable) — added because it was previously only visible by opening each district's own detail page.
- Client-side search (matches district, division, DEO name, DEO email — `deoEmail` is matched but not rendered, see below), division filter, status filter, and sortable columns. No additional API calls.
- **Read-only view.** DEO name, email, and coordinates are displayed for browsing only — there is no edit UI on this page. The DEO email column itself is **not rendered** (only DEO name) to keep the table uncluttered; all district/DEO editing happens on the District Master page (`/admin/provision`), described below.
- Division badge in each row links to `/admin/divisions/[division]`.

**Divisions page (`/admin/divisions`):**
- 18 division cards derived client-side from `GET /api/admin/districts`. Shows district count, submission progress, and revenue per division.

**Division detail page (`/admin/divisions/[division]`):**
- Fetches `GET /api/admin/districts`, filters client-side by division. Shows districts in that division as a sortable table.

**District Master page (`/admin/provision`, nav label "District Master"):**
- **Owner/superadmin-only.** This page reassigns any district's DEO identity and bulk-provisions DEO accounts (sending real magic-link emails), so — unlike every other admin page — it is restricted to the `superadmin` role, not open to all `admin` accounts. Its link lives in the profile dropdown (`ProfileMenu`, `apps/web/src/components/ProfileMenu.tsx`), not the main navbar — owner-only settings pages don't belong in the top-level nav that every admin sees, matching the sibling `excise-revenue-recovery-portal` project's "DEO Provisioning" link placement in its own `ProfileMenu.tsx`. The dropdown link (and the equivalent mobile-drawer entry) render only for `role: 'superadmin'`; direct navigation to `/admin/provision` renders a restricted message instead of the page content; and the two underlying routes (`PATCH /api/admin/districts/[district]`, `POST /api/admin/bulk-provision`) independently 403 for anything but `role: 'superadmin'` — the client-side hide is UX only, the server check is the actual boundary. Every edit and every bulk-provision run is audit-logged (`district_master_updated`, `bulk_provision` — see "Audit Log" below) with the acting superadmin's name/designation.
- Single page for both inline editing and bulk Excel provisioning of the 75-row `districts` table.
- **Inline edit:** the page fetches `GET /api/admin/districts` and renders all 75 districts in a table. The list table's own columns are District, Division, DEO, **Circles/Sectors** (real registered-unit count, replacing the unreliable **Expected Vends** column as of M-52 — Expected Vend Count is rarely set in practice, see Pre-Campaign Blocker #4, so a real count is more useful at a glance), Uploaded (real vend count), and Status. Clicking the edit icon on a row opens a right-side drawer (`EditDrawer`) with fields: Division (`<select>` populated from `UP_DIVISIONS` in `packages/schema/src/constants.ts`), DEO Name, DEO Email, DEO Identifier, Expected Vend Count, and the four bbox coordinates (Min/Max Lat, Min/Max Lon) — **Expected Vend Count remains editable in the drawer**, only the list table's column was dropped. **Note:** Coordinates and Vend Count are optional; clearing the inputs correctly sets the database values to `null`. The drawer features field-specific validation errors rather than generic numeric errors. Saving calls `PATCH /api/admin/districts/[district]`, which atomically updates `districts` and syncs the corresponding `auth_users` row (deletes the old email's row if the email changed, upserts the new one) — see the PATCH route entry in the API table above.
- **Bulk Excel provisioning** (`POST /api/admin/bulk-provision`) remains available below the table for initial campaign setup or large batches. `downloadTemplate()` calls `generateProvisionTemplate()` (in `apps/web/src/lib/excel.ts`) with the live district list, so the downloaded `.xlsx` arrives with District Name and Division pre-filled for all 75 rows — the admin only has to fill in the DEO columns.
- This is the **only** place district master data (division, DEO identity, expected vend count, bbox) can be edited. Minor corrections no longer require a full Excel re-upload.

**Admin Users page (`/admin/users`):**
- **Owner/superadmin-only**, same restriction pattern and same profile-dropdown placement as District Master (not the main navbar) — this page creates and deletes login credentials for the admin/HQ portal, so it is gated the same way (`GET`/`POST /api/admin/users`, `PATCH`/`DELETE /api/admin/users/[id]` all independently 403 for anything but `role: 'superadmin'`; the dropdown link and page body are hidden/restricted client-side for a plain `admin` session as UX only).
- Manages `auth_users` rows with `role: 'admin'` exclusively — **not** DEO accounts, which remain on the District Master page and stay in sync with their owning district. Add, rename, change email, or set/clear designation via the `EditAdminUserDrawer` (`apps/web/app/_components/EditAdminUserDrawer.tsx`), the same slide-in drawer pattern as District Master's `EditDistrictDrawer`.
- The owner/superadmin bypass account (the `auth_users` row whose `email_hash` matches `SUPERADMIN_EMAIL_HASH`) is listed read-only with an "Owner" badge: its name/designation can still be edited, but its email cannot be changed and the row cannot be deleted, since that would either desync or permanently lock out the only superadmin session — both guards are enforced server-side in `api/admin/users/[id]/route.ts`, not just hidden in the UI. A superadmin also cannot delete their own account row for the same self-lockout reason.
- Creating an account sends no email — the new admin signs in later with the existing magic-link flow at `/login`. Deleting an account removes its `auth_sessions` and `auth_magic_links` rows in the same atomic `db.batch` as the `auth_users` delete, so an active session is invalidated immediately, not just at next login. Changing an account's email invalidates its outstanding (unused) magic links the same way.
- Every create/edit/delete is audit-logged (`admin_user_created`, `admin_user_updated`, `admin_user_deleted` — see "Audit Log" below) with the acting superadmin's name/designation. Audit metadata never stores a plaintext email — only the SHA-256 hash, per the Zero-Knowledge PII rule.

**District detail page (`/admin/districts/[district]`):**
- The type breakdown bar, Circle/Sector Breakdown table, and the shop table itself (toolbar, sort, filters, group-by-type, pagination, XLSX export) are all the shared `ShopExplorer` component (`apps/web/src/components/ShopExplorer.tsx`) — the same one the DEO final-verification screen on `/verify` uses (see "State-wide final verification round" above). Page-specific bits (DEO/Division stat cards, the superadmin-only Edit drawer, the Unlock Requested button) stay in this page's own file.
- The "Division" stat card links to `/admin/divisions/[division]`.
- Shop rows are loaded **only here**. The single call is `GET /api/admin/districts/:district/shops?pageSize=all` — all rows for that district arrive in one response and are held in React state. All filtering, sorting, searching, grouping, and pagination happen **client-side with `useMemo`** — no additional API calls per interaction.
- `pageSize` on the API accepts 10/25/50/100 or `all`; server cap is 2000. The selected per-page display size is persisted to `localStorage` (`admin-page-size`).
- Shows all `phase1_raw_collection` fields: shop ID, name, circle/sector, thana, adjacent thanas (flex-wrap pills), type badge + CL5CC sub-badge, coordinates, revenue (collapsible `<details>` breakdown — no modal, via the shared `RevenueCell` component, see below). The breakdown popup is viewport-aware like `HelpPanel`'s balloon.
  - **M-47→M-51→M-60 history:** originally an `onToggle` handler checked `getBoundingClientRect()` against the shop table's own `.overflow-auto` wrapper (found via `closest()`), not `window.innerWidth`/`innerHeight` — checking against the full window (M-47's first pass) under-triggered the flip, since a row could pass the "fits in the window" check while still overflowing the narrower table wrapper. M-51 fixed that by bounding against the real container. **That container-bounded approach still broke on a short, filtered table** (e.g. a type filter down to 3 rows) — the popup was a DOM descendant of the `.overflow-auto` wrapper, so CSS `overflow: auto` clipped it to that wrapper's own (short) content box regardless of what the flip math computed, and a short table has no scrollbar to reveal the clipped content. **M-60 rewrote it as `apps/web/src/components/RevenueCell.tsx`**, shared by this page and the DEO final-verification screen (`/verify`, see "State-wide final verification round" above): the popup now renders via `createPortal` into `document.body` with `position: fixed` computed from `getBoundingClientRect()` against the viewport, so it has no scrollable ancestor to be clipped by, regardless of table height.
  - **HBR breakdown was silently empty (M-60 fix):** the breakdown-lines builder never had an `HBR` case at all — every other shop type had one, but this branch was missing entirely, so an HBR row's popup showed only the "Total" footer with zero component rows instead of the two-line formula from roadmap.md (`license_fee_lf + consideration_fee`). Fixed by adding the missing branch.
  - **Portal popup didn't close on outside click/scroll, and multiple could stack open (same-day M-60 follow-up):** a native `<details>` has no "click outside to dismiss" behavior at all — harmless with the old absolutely-positioned version since the popup stayed visually pinned under its row, but the fixed-position portal could float directly over a filter dropdown or another row and silently intercept/obscure clicks there until that same summary was clicked again. `RevenueCell` now closes on outside click, `Escape`, or the table scrolling (each via a `useEffect` active only while `open`), and tracks a single module-level `active` instance (by a stable per-component `token`, not function identity — a plain closure recreated every render would never equal itself across renders) so opening one row's breakdown closes whichever other row's was open instead of stacking.
- Group-by-type view collapses each type group independently with its own inner pagination. Group-by-type state persisted to `localStorage` (`admin-group-by-type`); per-group open/close persisted to `localStorage` (`admin-group-{districtName}`). Enabling group-by-type deselects any active type filter.
- Type labels use full names: `Composite Shop (FL + Beer)`, `PRV (Premium Retail Vend)`. The CL5CC breakdown bar card filters `has_cl5cc = true` and is only active alongside Country Liquor (disabled + greyed for other types). A circle/sector dropdown is also available.
- **Circle/Sector Breakdown** — a collapsible table (default expanded) between the shop-type breakdown bar and the shop table, one row per circle/sector: name, type (circle/sector), distinct thana count, shop count, revenue, and a per-shop-type badge breakdown (short labels — `TYPE_SHORT_LABEL`, not `TYPE_LABEL` — so HBR stays bare per CLAUDE.md's "shown verbatim everywhere" rule instead of being truncated from its spelled-out prose form). Computed client-side (`circleStats` `useMemo`) from `allShops`, seeded first from `detail.units` (the authoritative `district_circles_sectors` rows) so a registered-but-empty unit still shows a real 0-shop row — a signal that a DEO registered a circle/sector but never uploaded anything for it. Each row with shops has a download icon that exports just that circle/sector's shops via `exportShopsToXlsx()` (same shared builder as the full district export below).
- **Export XLSX** button and the Circle/Sector Breakdown's per-row download both call `exportShopsToXlsx()` (`apps/web/src/lib/excel.ts`) — a title row, friendly English headers (not raw camelCase field names), `shop_type` as the bare `SHOP_TYPE_LABELS` value, and a bold TOTAL row. This is the same sheet-building code (`addShopSheet`) used for every per-district tab inside the full-state export (see `/admin/export` below), so a header/format change never has to happen in two places.
- Full-state UI table (~30K shops in one view) is **not a supported operation**. The only full-state path is `GET /api/admin/export/all` → multi-sheet XLSX download via the `/admin/export` page (data cached in `excise-admin` IndexedDB, generated in-browser by ExcelJS). No CSV.
- **"Unlock Requested" button** — only renders when the district has both registered units (`detail.units.length > 0`) and a `pending` row in `district_unlock_requests` for it (checked against `GET /api/admin/unlock-requests`, cached via `adminUnlockRequestsCache` in `apps/web/src/lib/db.ts`, same manual-sync cache the `/admin/unlock-requests` page uses). It is absent by default for every locked district — an admin cannot unlock a district that hasn't actually requested it. Clicking it shows the DEO's stated reason and requires the admin's own note before calling `POST /api/admin/unlock-requests/resolve` with `action: 'approve'`.

**Export page (`/admin/export`):**
- Downloads a single multi-sheet workbook via `generateFullStateWorkbook()` (`apps/web/src/lib/excel.ts`), built entirely in-browser from `GET /api/admin/export/all`'s `{ rows, units }` (cached in `excise-admin` IndexedDB's `export_cache`) plus `useAdminDistricts()`'s district list:
  1. **Summary** — state totals, **district status breakdown** (Pending/In Progress/Submitted/Verified counts, M-61), shop-type breakdown, per-division rollup (18 rows). Not a single-header-row table — several stacked mini-tables on one sheet, so it skips the usual `applyPrintSetup`/autofilter treatment.
  2. **Districts** — the 75-row master table (name, division, DEO name, status, expected vs. actual vend count, revenue, submitted date).
  3. **District Progress** (M-61) — one row per district: status, circle/sector count, total shops, total revenue, then a Count + Revenue ₹ column pair per shop type (12 columns) — the per-district detail behind the Summary sheet's state-wide shop-type totals, without opening all 75 per-district tabs. Also downloadable on its own via **"Download Progress"** on the `/admin` overview's Submission Progress card (M-62) — `generateDistrictProgressWorkbook()` builds just a small status-count sheet + this one, not the full 76-sheet workbook. Uses whatever `export_cache` data is already on the device (populated by Sync All); if none exists yet, the click itself fetches it once.
  4. **Circle-Sector Summary** — every circle/sector across all 75 districts (district, name, type, distinct thana count, shop count, per-type counts, revenue), built from `units` (authoritative `district_circles_sectors` rows, seeded first the same way as the district page's on-page table) plus `rows`.
  5. **All Shops (Flat)** — every shop from every district in one sheet with a District Name column, via the same `addShopSheet()` builder as every per-district sheet — pivot-table-friendly, and functionally what the pre-rework single-sheet export already was, just with friendly headers now.
  6–80. **One sheet per district, all 75** — including districts with zero shops yet, which get a real tab with a "No shop data uploaded yet." placeholder row instead of being silently skipped, so the tab structure is stable across export runs. Sheet names are sanitized (Excel's 31-char cap and `: \ / ? * [ ]` are stripped) even though no UP district name currently needs it.
- This workbook generation happens entirely client-side via ExcelJS — no server-side spreadsheet work, per the Cloudflare Free Tier constraint below. ~30K shop rows across 76+5 sheets generates in a few seconds in-browser.
- "Refresh & Download" re-fetches from D1 and updates both the export cache and (via `useAdminDistricts().refresh()`) the districts cache. "Download from Cache" rebuilds the workbook from the cached `{ rows, units }` with no network call.
- **`useAdminExportData()`** (`apps/web/src/hooks/useAdminExportData.ts`, M-61) wraps this same `export_cache` entry for read-only consumers that need shop-level data but aren't exporting anything — the overview's Statewide Shop-Type Breakdown card, its Download Progress button, and the Circle & Sector Master page (below). Cache-first, **no background fetch on mount**: returns `data: null` until the cache has been populated — normally by the navbar's Sync All (M-62, see the "Global sync" note above), or by this page's own buttons, or (for Download Progress) the button's own click if nothing is cached yet. `sync()` returns the freshly-fetched data directly, not just via state, since a caller like a download handler needs it before the next render. This is the reusable version of the `refreshAndDownload`/`downloadFromCache` pattern already on this page — one cache, several read surfaces, no duplicate D1 round-trips.

**Circle & Sector Master page (`/admin/circles-sectors`, M-61):**
- One row per registered circle/sector across all 75 districts — district (links to its detail page), name, type, distinct thana count, shop count, revenue, and a per-shop-type badge breakdown (same short-label convention as the district detail page's own Circle/Sector Breakdown table). Search (district or circle/sector name), a district filter dropdown, and sortable columns — all client-side.
- Sourced entirely from `useAdminExportData()` — no dedicated API route. Seeded first from `units` so a registered-but-empty circle/sector still shows a real 0-shop row, same convention as every other circle/sector table in this app.
- Open to any `admin`/`superadmin` — read-only aggregate data, not an editing surface, so it doesn't need District Master's owner-only gating.
- If `export_cache` is empty on this device (Sync All hasn't been clicked yet), the page shows a single plain sentence pointing at the navbar's Sync All button — no technical explanation of caching or D1, and no separate sync button of its own. A small "Refresh" icon-button (once data exists) re-fetches just this dataset without redoing every other admin cache.

**Admin nav search:**
- The navbar search bar (`SearchBar` component in `app/(admin)/layout.tsx`) fetches district + division names once on mount (module-level cache `searchCache`). Filters as the user types, shows a dropdown grouped by Divisions / Districts, supports keyboard navigation (↑↓, Enter, Escape). No search results page — navigates directly to the clicked district or division page.

### DEO Workflow — Gated, One-Step-at-a-Time

> DEOs are treated as domain experts, not software users — the portal never assumes they'll infer the correct order of operations. Each step is either the only thing on screen or physically absent (not merely disabled) until its prerequisite is met.

- **Step 1 — Circles & Sectors (`/units`) is mandatory and a 3-step, one-shot wizard.** The DEO does not add units one at a time.
  1. **Unit type radio** — "Only Sectors" / "Only Circles" / "Both Circles & Sectors." Picking a type drives which count field(s) step 2 shows (`unitMode` state in `apps/web/app/(deo)/units/page.tsx`).
  2. **Counts** — *how many* sectors and/or circles, per step 1's choice.
  3. **Names/confirm** — **sectors carry no DEO-entered text at all.** They're generated and stored purely as `Sector - 1`, `Sector - 2`, … (no area name field exists for sectors — the DEO just reviews the numbered list and confirms). **Circles** keep a free-text area-name box next to a fixed, non-editable `Circle N -` label (e.g. `Circle 2 -` + typed `Fatehabad`). Typing the word "circle" anywhere in that box shows a non-blocking inline warning (`CONTAINS_CIRCLE_WORD` regex) — a hint, like any other inline form validation message, not a submit-blocker.

  Submitting shows a SweetAlert2 confirmation warning that the list **cannot be changed afterward**, then POSTs the full list at once to `POST /api/districts/[district]/units` as `{ circles, sectors }` — sectors as `Sector - N`, circles as `Circle N - <area>`.
- **Circle numbering placeholder convention:** sectors cover the urban part of a district; circles cover the rural part. If a district has **zero sectors** (purely rural, i.e. the "Only Circles" wizard path), circle placeholders start at `Circle 1`. If a district has **any sectors** ("Only Sectors" or "Both"), `Circle 1` is reserved for the sector-covered urban area and is never (re-)issued to a rural circle — circle placeholders start at `Circle 2`. Implemented client-side only in `apps/web/app/(deo)/units/page.tsx`'s `circleNumber(i)` helper (`ns === 0 ? i + 1 : i + 2`, where `ns` is the locked sector count from step 2); it is a placeholder-text convention, not a stored/validated value — the API (`POST /api/districts/[district]/units`) stores whatever string the client composed with no numbering logic of its own.
- **Server-side lock, no schema flag needed:** that endpoint rejects (409) if the district already has *any* row in `district_circles_sectors` — the lock is derived from row existence, not a separate `locked` column. There is no edit/delete path for units; a wrong name requires an admin-side correction, and the **only** way to unlock a district is by approving that DEO's own pending unlock request (below) — there is no admin-initiated "unlock on a whim" path. `DELETE /api/districts/[district]/units` does not exist; it was removed specifically because it let an admin unlock a district with no request on file, bypassing the audit trail (see "Confirmed Past Mistakes" pattern — every unlock must trace back to a `district_unlock_requests` row).
- **Self-service unlock request:** once locked, `/units` shows a "Request Unlock" button instead of only a "contact your Admin" message. The DEO types a reason (SweetAlert2 textarea, required) which `POST /api/districts/[district]/request-unlock` stores in `district_unlock_requests` (409 if a pending request already exists for that district). Admins review and resolve every request either on `/admin/unlock-requests` or directly on the admin district detail page (`/admin/districts/[district]`) — the "Unlock Requested" button there only renders when `GET /api/admin/unlock-requests` has a `pending` row for that exact district; clicking it shows the DEO's stated reason and requires the admin's own note, same as the dedicated unlock-requests page. Both surfaces call the same `POST /api/admin/unlock-requests/resolve` — approving deletes the district's `district_circles_sectors` rows and requires the admin to type their own note; denying also requires a note and leaves the district locked. `/units` polls its own latest request on load and shows a pending/denied banner accordingly.
- **Data-correction unlock (M-54) — fixing a submitted district's shop data without a D1 wipe:** a `submitted` (or `verified` — M-60) district is locked against new uploads server-side — `POST /api/upload/chunk` rejects (409) via `isLocked(districts.status)`, the actual enforcement point (the `/upload` page's own locked view is UX only). If a DEO finds wrong data for one or more shops after submission, `/upload` shows a locked state with a "Request Data-Correction Unlock" button (same `POST /api/districts/[district]/request-unlock` endpoint as the units-lock request, differentiated by the new `district_unlock_requests.requestType` column: `'data_correction'` when the district is already `submitted` at request time, `'units'` otherwise). An admin approves via `/admin/unlock-requests` or the district detail page's "Correction Requested" button — approving a `data_correction` request **never deletes `phase1_raw_collection` or `district_circles_sectors` rows**, it only resets `districts.status` back to `'in_progress'`, which is all `/upload`'s gate checks. The DEO then re-uploads a corrected Excel file — `POST /api/upload/chunk`'s existing `onConflictDoUpdate` upserts by `(shopId, districtName)`, so only the shop(s) whose data changed are touched, not a full D1 delete-and-redo — and resubmits via `/verify`, which flips `status` back to `'submitted'` as normal. This keeps a one-shop correction cheap (well within D1 free-tier write limits) instead of requiring the district's entire dataset to be wiped and re-uploaded.
- **`stagingDb.putRows()` (`apps/web/src/lib/db.ts`) actually replaces a district's staged data on re-upload, as documented — it previously didn't.** The `/upload` help text always claimed "uploading a new file replaces all staged data for this district, rows already marked uploaded are preserved," but the code only ever did a plain Dexie `bulkPut`, which upserts by IndexedDB's own auto-increment `id` — and every fresh `parseExcelFile()` call produces id-less row objects, so every re-upload silently added a second copy on top of whatever was already staged instead of replacing it. `putRows()` now deletes that district's existing non-`uploaded` rows before inserting the new parse. This was a latent bug in the normal (pre-M-54) upload flow too, not something M-54 introduced, but M-54's data-correction unlock made a second upload pass on the same district common enough to surface it immediately.
- **`adjacent_thanas_raw`/`latitude`/`longitude` are no longer labeled "Optional" in the Excel template's Instructions sheet (M-55).** DEOs kept asking "is Adjacent Thana optional?" — the "Optional" label itself invited the question. `latitude`/`longitude` remain nullable/non-blocking as originally described here; **`adjacent_thanas_raw` does not** — as of 2026-08-04 (see "Adjacent Thana Cross-District Rule" above) its presence is a hard, enforced requirement, not just reworded copy. The Excel "Required For" column and the DEO manual now say "MANDATORY" for this field. The red Adjacent-Thana-pill tooltip on `/verify` (and the template's own notes column) still state that a red *pill on a filled-in name* is **not an error** — that heuristic is unrelated to, and still does not block on its own, unlike a fully blank cell which now does.
- **Once submitted, `/verify`'s staged-review workflow disappears, not just its nav link:** the DEO nav bar drops the plain `/verify` link once the district's status is `submitted` (only the read-only `/verify?view=uploaded` "Uploaded Data" link remains — `/upload` itself stays in the nav, since it now hosts the locked view described above). `/verify` also independently fetches its own district status and, once submitted, forces `viewMode` to `'uploaded'` and hides the Staged/Uploaded toggle, the "Clear Staged Data" button, and the entire Submit District button block — replacing the latter with a plain "submitted, read-only, go to Upload to request a correction" notice. Before this, none of that UI checked submission status at all, so a DEO with any old locally-staged rows on their device could still see a disabled Submit District button and an active Clear Staged Data button on an already-submitted district, with nothing explaining why. **The `/home` dashboard's own "Step 3" card (M-57) independently checks `districts.status` server-side too** — it previously linked straight to plain `/verify` with "Review uploaded records, fix errors, then submit to headquarters" copy regardless of submission state, which is what a DEO actually sees first after logging back in, so it needed the same gate as the nav link and `/verify` itself, not just those two.
- **`submitDistrict()` re-seeds this device's local staging cache from D1 immediately after a successful submit (M-57), instead of leaving the pre-submit local rows in place:** on a confirmed-`ok` `POST /api/districts/[district]/submit` response, it calls `stagingDb.clearAll()` then re-populates `phase1_staging` with a fresh `GET /api/districts/[district]/shops` response (same pattern as `HomeStats`'s "Fetch from Server" button), all marked `status: 'uploaded'`. **Why:** leaving the pre-submit local cache (a mix of `pending`/`error`/`uploaded` rows from the upload that just happened) in place was harmless while the district stayed locked, but caused a real problem the next time a data-correction unlock was approved and the DEO re-uploaded a corrected file — the stale pre-submission local rows and the freshly re-staged corrected rows both existed in `phase1_staging` at once and could both render in the same `/verify` unit tab, looking like two conflicting copies of the same shop (Rampur, 2026-08-03). Re-seeding from D1 right after submission means every future unlock cycle always starts from a clean, server-true local cache. `submitDistrict()` also now checks the submit POST's `response.ok` before doing any of this or showing the success dialog — previously the response was never checked at all, so a failed submit (e.g. a race against another admin action) would still show "District submitted!" and leave the UI in a state that didn't match the server.
- **Upload and Verify do not exist for the DEO until units are locked.** `/home` renders only the "Create Circles & Sectors" card when `units.length === 0` — the Upload/Verify cards are not rendered, not shown disabled. The DEO nav bar (`app/(deo)/layout.tsx`) omits the Upload/Verify links entirely under the same condition. This mirrors the `hasUnits` gate already enforced server-side by every units-dependent API route. Once units are locked *and* at least one row has been uploaded (`stagingDb.getByStatus('uploaded')` on this device), the nav bar also shows an **"Uploaded Data"** link straight to `/verify?view=uploaded` — same destination as the `/home` dashboard's "Shops Uploaded" stat card (also a link, to the same URL). `/verify` reads the `view=uploaded` query param client-side via `window.location.search` (not Next's `useSearchParams()` — that hook requires a Suspense boundary during static prerendering and broke the build) and force-switches into the read-only uploaded view on load.
- **Clear Staged Data** (`/verify`, next to the Staged/Uploaded toggle): wipes this device's local `phase1_staging` + `upload_queue` Dexie tables (`stagingDb.clearAll()` in `apps/web/src/lib/db.ts`) — never touches D1. Recovery path for a DEO who staged the wrong Excel file locally; SweetAlert2-confirmed (bilingual, danger-red), disabled when nothing is staged.
- **SweetAlert2 for every irreversible action.** Locking circles/sectors and submitting a district to headquarters (`/verify`) both show a `Swal.fire` confirmation (row/unit counts, a bilingual warning) before the mutating request fires. Notyf toasts confirm success/failure for lighter-weight actions (parse complete, sync complete).
- **Submit District is a two-step confirm, matching the sibling `excise-revenue-recovery-portal` project's `confirmFinalSubmit()` + `promptDeoNameAndLock()` pattern:** a plain "are you sure" warning first, then a required name-entry prompt (`promptDeoNameAndLock()` in `apps/web/app/(deo)/verify/page.tsx`) with a bilingual personal-liability disclaimer — `validateDeoName()` rejects blank input, digits (catches a DEO pasting their CUG number), a designation instead of a name (e.g. "DEO"), and non-English characters. The confirmed name is sent as `submittedByName` in `POST /api/districts/[district]/submit`'s body (400 if missing) and stored in that event's audit log `metadata` JSON — visible on `/admin/audit` via the generic `METADATA_KEY_LABELS` rendering, not a dedicated `actorName` (that column is reserved for admin/superadmin-actor events per the schema comment in `packages/schema/src/phase1.ts`). **As of M-53, the same value also overwrites `districts.deoName`** in the same atomic batch — until a district is submitted, `deoName` is whatever an admin set at provisioning (often an English placeholder like `"<District> DEO"`, since real names are usually only in Hindi contact sheets — see Pre-Campaign Blocker #5); the DEO's own self-attested, liability-confirmed name at submission time is the first real ground truth for that district's DEO identity, so it becomes the on-file name from that point on, visible on the district detail page and both admin district-list tables.
- **Bilingual labels on the DEO portal only.** Page titles and step headings on `/home`, `/units`, `/upload`, `/verify` carry a short Hindi subtitle beneath the English heading (e.g. "सर्कल एवं सेक्टर पंजीकरण"). This is intentionally not a full i18n system — only titles, section names, and flow-step labels are translated; form validation errors and table data remain English-only per the Data Language rule below. The admin/HQ portal is English-only (admin users are department staff, not field DEOs).
- **State-wide final verification round (M-60).** A second, optional confirmation pass on top of the normal submit flow — for the campaign's closing phase, once most/all districts are `submitted`. Gated by a single global flag, `app_settings.verification_phase_open` (singleton row, `id=1`), toggled from the `/admin` overview page's "Final Verification Round" card via `GET`/`POST /api/admin/settings`. **As of 2026-08-18, the toggle button is open to any `admin`/`superadmin` account, not owner-only** — the department's actual approving authority (e.g. `decpehq@gmail.com`) holds a plain `admin` account, not the developer's owner/superadmin bypass, matching the precedent already set by unlock-request approval (also plain-`admin`-accessible). Toggling is audit-logged as `verification_phase_toggled`.
  - **DEO-side effect:** for any DEO whose district is `submitted` (or already `verified`) while the flag is open, the nav bar (`app/(deo)/layout.tsx`) collapses to just **Dashboard** and **Verify** — Circles, Upload, and the old plain Verify/"Uploaded Data" links all disappear. `/verify` itself renders a dedicated final-verification screen instead of its normal staged-review UI: stat cards (Total Shops with a per-type breakdown line, a clickable Circles & Sectors card, Total Revenue, DEO name) plus the same `ShopExplorer` component the admin district detail page uses (see below) — sourced from this device's local IndexedDB.
  - **`ShopExplorer` (`apps/web/src/components/ShopExplorer.tsx`, plus the `UnitsModal` component and `useShopAggregates` hook it and the admin page both call) is the single shared implementation of the shop-type breakdown bar, the Circle/Sector Breakdown table, and the filterable/sortable/groupable/paginated shop table with per-district and per-circle/sector XLSX export — used by both the admin district detail page and this DEO final-verification screen.** Earlier versions of the DEO screen were a hand-copied, deliberately smaller subset of the admin page's table (no type/circle filters, no sort, no group-by-type, no Circle/Sector Breakdown, no exports) and drifted further out of sync every time the admin page gained a feature. `storageKeyPrefix` (`'admin'` vs `'deo-final'`) namespaces each portal's own copy of the toolbar's localStorage keys — see the localStorage registry below.
  - **Minimal D1 reads by design:** the district's data is fetched from D1 exactly once per unlock/resubmit cycle, not on every visit — `submitDistrict()` already re-seeds `phase1_staging` fresh from D1 right after a successful submit (M-57) and now also sets `localStorage['verify-synced-{district}'] = 'true'` at that point. The final-verification screen checks that flag on mount: if set, it reads straight from local IndexedDB (`stagingDb.getAll()`, zero D1 hits); only if unset (e.g. the district was submitted on a different device, or before this feature existed) does it wipe local staging and do a one-time `GET /api/districts/[district]/shops` fetch, then set the flag.
  - **DEO confirms or requests correction:** "Everything is correct — Confirm & Verify" repeats the same two-step SweetAlert2 + `promptDeoNameAndLock()` pattern as the original Submit District, then calls `POST /api/districts/[district]/verify` (409 unless the round is open **and** the district is exactly `'submitted'`) — this flips `districts.status` to `**'verified'**` (a 4th status value, after `pending → in_progress → submitted`) and writes a `district_verified` audit log entry with the re-confirmed name. Alternatively, "I see wrong data — Request Unlock" calls the same `POST /api/districts/[district]/request-unlock` endpoint used everywhere else (now treating `'verified'` the same as `'submitted'` — see `isLocked()` below) — no new unlock mechanism, same admin-approval trail. Once `'verified'`, the screen becomes purely read-only with no action buttons.
  - **`apps/web/src/lib/status.ts`** is the single source for `districts.status` display and lock semantics — `STATUS_LABEL`/`STATUS_BADGE_CLASS`/`STATUS_COLOR` maps and an `isLocked(status)` helper (`true` for both `'submitted'` and `'verified'`) used by every upload/edit gate (`POST /api/upload/chunk`, `POST /api/districts/[district]/request-unlock`, the DEO nav/home/upload pages) and every admin status badge/choropleth color, replacing what used to be a ternary copy-pasted across 6+ files.

### UI Components — Shared
- **`HelpPanel`** (`app/_components/HelpPanel.tsx`): collapsible help triggered by an inline button. Opens as an **absolute-positioned balloon** below the trigger button (not a full-page overlay). Flips from `left-0` to `right-0` automatically via a `useLayoutEffect` viewport-overflow check (`getBoundingClientRect().right` vs `window.innerWidth`) so the balloon never renders off-screen; the caret position follows the flip. Balloon content is scrollable (`overflow-y-auto max-h-64`) so long help text never overflows the viewport. Balloon z-index (`z-[1002]`) and its backdrop (`z-[1001]`) sit above the sticky navbar and the Leaflet map panes (tooltip pane 650, popup pane 700) so it is never hidden behind the map on the overview page. A `fixed inset-0 backdrop-blur-[2px] bg-black/10 pointer-events-none` layer provides subtle background blur without blocking interactions. Closes on Escape key or outside click (mousedown on `document`). `localStorage` key `help_done_{pageKey}` tracks whether the user has dismissed the badge. Present on all DEO and admin pages.
- **`ViewPrefsPanel`** (`app/_components/ViewPrefsPanel.tsx`): floating FAB fixed at bottom-right on all pages. Controls theme (Light/Auto/Dark), font size (`data-font-size`: sm/base/lg), row density (`data-density`: compact/normal/spacious), and content width (`data-view-width`: normal/wide/full). Theme "Auto" resolves via `window.matchMedia('(prefers-color-scheme: dark)')`. Applies preferences as `data-*` attributes on `<html>`; corresponding CSS rules live in the global `<style>` block in `layout.tsx`. Persisted to `localStorage` key `excise-view-prefs-v1`. FAB has a `title` tooltip. The separate `ThemeToggle` component has been retired.

### Choropleth Map & GeoJSON Data

**File:** `apps/web/public/geodata/up-districts.geojson`

**Coverage:** All **75 UP districts** (complete — no missing districts).

**Data source:** OpenStreetMap (OSM) via the Overpass API.
- Query: `admin_level=5` administrative boundary relations within Uttar Pradesh state.
- API endpoint: `https://maps.mail.ru/osm/tools/overpass/api/interpreter` (used because overpass-api.de returned 406 and overpass.kumi.systems timed out for this query).
- Note: In OSM, UP uses `admin_level=5` for districts (tehsils/blocks are level 6). Using level 6 would return 316 elements (tehsils); level 5 returns exactly 75 elements (districts).
- Raw Overpass output (JSON format): 8.5 MB, 368,779 coordinate points.

**Processing pipeline** (ad-hoc Python script, not committed to repo):
1. Fetched Overpass JSON containing relation members (way segments for each district boundary).
2. Assembled closed rings from ways using a greedy chain algorithm (forward and reversed way directions handled).
3. Converted to GeoJSON FeatureCollection with one Feature per district.
4. Applied Ramer-Douglas-Peucker (RDP) simplification with tolerance = 0.002 degrees → reduced from 368,779 to 26,167 coordinate points.
5. Final file size: 615 KB (down from ~8.5 MB raw).
6. Applied name normalisations to match `districts.name` in D1:
   - `Raebareli` → `Rae Bareli`
   - `Sant Ravidas Nagar` → `Bhadohi`
   - `Sharavasti` → `Shravasti`
   - `Siddharthnagar` → `Siddharth Nagar`
   - `Mahrajganj` → `Maharajganj`

**Feature property:** `district` — must match `districts.name` in D1 exactly (case-sensitive).

**Map configuration:**
- Leaflet 1.9.4 with CartoDB tiles (light/dark variants, switches with theme).
- Map locked to UP: `minZoom: 6`, `maxZoom: 10`, `maxBounds: [[22.5, 76.0], [31.5, 85.5]]`, `fitBounds` to `[[23.8, 77.1], [30.4, 84.6]]`.
- District borders: `weight: 1.5`, `color: '#334155'` (slate-700). Fill opacity: `0.65`.
- Status fill colours: pending `#94a3b8`, in_progress `#f59e0b`, submitted `#16a34a`. Legend rendered below the map div. `districts.status` flips `pending` → `in_progress` the moment a district registers its circles/sectors (`POST /api/districts/[district]/units`, same `db.batch` as the unit inserts + audit log) — the first real action a DEO takes — and `in_progress` → `submitted` on `POST /api/districts/[district]/submit`. Before M-51, nothing ever wrote `in_progress`, so both this map and the `/admin` overview's Submission Progress doughnut chart always showed zero districts in that state regardless of real progress.
- Permanent district name labels: `bindTooltip(name, { permanent: true, direction: 'center', className: 'district-map-label' })`. CSS selector in `layout.tsx` global `<style>` block must be scoped as `.leaflet-tooltip.district-map-label` (not the bare class) to out-specificity Leaflet's own `.leaflet-tooltip` base styles (white background/border/shadow) — transparent background, 10px bold, white/slate triple text-shadow for legibility against tiles in light/dark mode respectively.
- Clicking a district polygon navigates to `/admin/districts/[name]`.
- On the overview page (`/admin`) the map card is taller (`height: 660`) than a standard card so the full state fits vertically without excessive zoom-out; header reads "District Status — Uttar Pradesh" with a "75 districts · click any district to view shop records" subtitle.

### Database Writes — Always Atomic
- Any Worker route that performs **two or more related writes** (e.g., insert row + insert audit log, update status + insert audit log) must wrap them in a single atomic operation.
- Use `db.batch([stmt1, stmt2, ...])` when all statements are inserts/upserts and can be built upfront — batch is preferred for chunk uploads (revenue rows + audit log in one round-trip).
- Use `db.transaction(async (tx) => { ... })` when statements depend on prior reads or contain conditional logic (unit registration, district submission).
- Never leave two related writes as separate `await` calls — if the second fails, the first cannot be rolled back and the database is left inconsistent.
- External I/O (Resend email calls in bulk-provision) cannot participate in a D1 transaction. Write DB state first, then send emails; on email failure, log the error in the result but do not roll back the already-committed DB row.

### API Error Handling — `withErrorHandling`

Every API route handler (except the trivial `/api/healthz` liveness check) is exported wrapped in `withErrorHandling(routeName, handler)` from `apps/web/src/lib/with-error-handling.ts`. Pattern: rename the handler function to `GET_`/`POST_`/etc. (unexported), then `export const GET = withErrorHandling('route:GET', GET_);` at the bottom of the file. This only catches what nothing anticipated — a D1 blip, an unhandled exception — and returns it as this app's own `{ error: string }` JSON 500 instead of letting it bubble to Next's default (non-JSON) error response, which breaks every client-side `res.json()` caller. It does **not** replace a route's own validation/expected-error responses (400/401/403/404/409) — those remain ordinary early `return`s inside the handler. New routes must follow this pattern.

### Cloudflare Free Tier
- The Worker must never perform CPU-heavy work. Excel parsing, DMS-to-DD conversion, and revenue calculation all happen **in the browser**.
- Batch inserts use `db.batch()`. Never issue individual `INSERT` calls in a loop.
- Upload chunks are 500 rows per POST request. Do not increase this without re-evaluating D1 write quota.
- Dashboard queries must use indexed columns only: `district_name`, `thana_name`, `shop_id`. Full table scans are not acceptable in production.
- The `districts` reference table (75 rows) may be queried freely — it is metadata-only and never contains shop data.

### CDN-First — Bundle Contains Only App Logic
- DaisyUI, Tailwind v4 browser CDN, ExcelJS, Dexie.js, SweetAlert2, and Notyf are all loaded from jsDelivr CDN at runtime. Never install these as npm dependencies or bundle them into the Next.js output.
- The Next.js bundle contains: React, Next.js App Router runtime, and app-specific TypeScript components. No auth SDK, no UI component library.

### PWA & Offline
- IndexedDB writes happen synchronously with every user action. The network upload is always secondary. Data is never at risk from a connectivity event.
- Connection loss, network change, tab close, or device sleep must never trigger a logout or IndexedDB clear. Session expiry (24h) is the only cause of re-authentication.
- Session expiry must not destroy IndexedDB data. The DEO re-authenticates via magic link and resumes with all staged data intact.
- The Service Worker pre-caches all CDN assets on install: DaisyUI, Tailwind v4 browser CDN, Dexie.js, SweetAlert2, Notyf, ExcelJS. After first load the entire app runs offline with no network dependency.
- **The fetch handler also opportunistically caches every same-origin GET response** (`apps/web/public/sw.js`), including Next.js's own `_next/static/*` JS chunks and rendered HTML — network-first, falling back to this cache when offline. This is a single static cache name (`CACHE` constant), not tied to deploys — if a bug fix ships without bumping that constant, a browser tab that already has the buggy bundle cached can keep serving it (see M-26). **Bump `CACHE` in `sw.js` whenever a fix needs to reach already-cached browsers deterministically**, not just on every deploy.
- **Navbars and dashboards are mobile-responsive** (as of the M-33 mobile pass) — both `(admin)/layout.tsx` and `(deo)/layout.tsx` collapse into a hamburger + slide-in drawer below `md`, and the DEO/admin dashboard pages (`/home`, `/admin`) use responsive grid stacking (`grid-cols-1 sm:grid-cols-3`, etc.), matching the pattern in the sibling `excise-revenue-recovery-portal` project's `AppHeader.tsx`. `sm:`/`md:` prefixes are expected and correct in these files.
- **Forms, the Excel upload flow, and data tables remain desktop-oriented by design** — `/units`, `/upload`, `/verify`, and every admin data table (`/admin/districts`, district detail's shop table, `/admin/audit`, `/admin/unlock-requests`, `/admin/provision`) are not redesigned for phone-width use; they already wrap in `overflow-x-auto` where needed so they're at least usable (horizontally scrollable) on a phone, but are not a mobile-first redesign target. The goal of the mobile pass is "a DEO or admin can at least check status from a phone," not full mobile parity with desktop.

### Excel/OOXML Hard Constraints — Read Before Touching `apps/web/src/lib/excel.ts`

> **This is the single most-repeated bug category in this project.** `has_cl5cc` (M-31, M-35, M-36), `circle_sector_name` (M-49), `shop_type` (M-50), and the `errorTitle`-over-32-chars bug (M-56) were all Excel/OOXML issues that only surfaced when a real DEO hit them in the field — never caught locally, because the exact failure mode (silent-accept vs. hard corruption vs. version-dependent rejection) doesn't reproduce the same way on every Excel build. Treat every edit to a `dataValidation` rule, a merged cell, or a sheet name in this file as touching a fragile, spec-constrained surface — not ordinary app code.

**Hard OOXML string limits — violating these causes "Excel found unreadable content" repair prompts on some (not all) Excel builds, which is exactly why this class of bug is easy to ship and hard to catch:**

| Attribute | Limit | Where |
|---|---|---|
| `dataValidation@errorTitle` | **32 characters** | Any `validations.add({ errorTitle: ... })` call |
| `dataValidation@promptTitle` | **32 characters** | Any `validations.add({ promptTitle: ... })` call |
| `dataValidation` error message (`error:`) | **255 characters** | Any `validations.add({ error: ... })` call |
| `dataValidation` prompt message (`prompt:`) | **255 characters** | Any `validations.add({ prompt: ... })` call |
| `dataValidation` inline `list` formula (`formulae: ['"a,b,c"']`) | **255 characters total** | e.g. `SHOP_TYPE_OPTIONS.join(',')` |
| Worksheet name | **31 characters**, and none of `: \ / ? * [ ]` | `wb.addWorksheet(name)` |

**Mandatory before any commit that touches `dataValidation` rules, merged cells, or new sheets in `excel.ts`:** run `pnpm --filter web test` (wraps `apps/web/scripts/check-excel-limits.mts`) locally. This script builds the real `generateTemplate()`/`generateProvisionTemplate()` output with the real `exceljs` package, reloads it, and checks every data-validation title/message and sheet name against the table above — it is also wired into `pnpm test` at the repo root, which both `ci.yml` and `deploy.yml`'s `check` job already run before every deploy, so a violation now **blocks the deploy** instead of only surfacing when a DEO opens the file. Do not bypass or skip this check. If you add a *new* generator function with data validations, add it to the `checkWorkbook(...)` calls at the bottom of that script — it is not automatically exhaustive over every function in `excel.ts`, only the ones explicitly listed.

**Why counting characters by eye is not enough:** the bug that motivated this section was exactly one character over the limit (`'Not applicable for this shop type'`, 33 chars vs. the 32-char cap) and was never caught by inspection across several review passes. Trust the script, not a manual character count.

**Other recurring Excel gotchas already documented elsewhere in this file — read them before writing new validation logic:**
- Excel's cell-level `list`/`custom` data validation **never fires on pasted or programmatically-set values**, only on typed keystrokes — this is the root cause of the `has_cl5cc`, `circle_sector_name`, and `shop_type` bugs above. Any new dropdown-style column needs a matching client-side (`validateRow()`) and/or server-side (Worker) check that doesn't rely on Excel's own validation actually having run.
- CSV is never acceptable (see "Confirmed Past Mistakes" at the top of this file) — this file is the only place spreadsheet I/O happens, via ExcelJS.

### Data Language
- All data fields — shop names, Thana names, district names, DEO identifiers, circle/sector names — are **English only**. No Hindi, Devanagari, Urdu, or any other script. Enforce this with input validation in the UI.
- This rule governs stored *data*, not UI *copy*. The DEO portal's page titles and step headings do carry Hindi subtitles for readability — see "DEO Workflow" above. Never let a Hindi UI label leak into a form's default/placeholder value that gets submitted as data.

### Coordinate Handling
- The database stores coordinates **exclusively in Decimal Degrees (DD)**.
- DMS input is converted to DD by the frontend before any data leaves the browser.
- After conversion, validate against the UP geographic bounding box: latitude `23.8°–30.4°N`, longitude `77.1°–84.6°E`.
- Out-of-bounds coordinates are flagged with a warning — they are never silently dropped or auto-corrected.
- **Do not add a bbox check to `validateRow()` (`apps/web/src/lib/validate.ts`) — it was there until 2026-08-03 and is exactly the "silently dropped" bug this rule forbids.** `normalizeCoordinates()` (`apps/web/src/lib/coordinates.ts`) is the *only* place that should ever check the UP bounding box — it sets `row.coordinateWarning` (the ⚠/✓ icon on `/verify`, non-blocking, does not affect `row.status`). `validateRow()` used to *also* run the same bbox check and push a blocking `RowError` on failure, which set `row.status = 'error'` and silently excluded that row from `submitDistrict()`'s `pending` filter — a real shop (Hardoi district) was dropped from the submitted dataset this way, with the DEO never shown a chance to confirm-and-submit-anyway. If a future change wants stricter coordinate enforcement, it must be a deliberate, visible product decision (e.g. a confirm-to-override dialog), not a quiet validation-error path that contradicts this section.

### Shop Type Enum
Valid values for `shop_type` are exactly:
```
MODEL_SHOP | COMPOSITE_SHOP | BHANG_SHOP | PRV | COUNTRY_LIQUOR | HBR
```
No other values are accepted. The Worker validates this on every inbound row. `HBR` was added 2026-07-28, reversing the prior hotel/restaurant-bar exclusion — see "What Is Out of Scope" below and roadmap.md §4.3a. **`HBR` is shown verbatim everywhere, including DEO-facing UI labels and the Excel dropdown — never spelled out as "Hotel / Bar / Restaurants."** DEOs know `HBR` as the excise-policy term covering every bar-type license (FL6, FL7, FL7A, FL7AR — hotel bars, airport bars, restaurant bars, etc.); spelling it out reads as one specific venue type and causes confusion about which licenses it covers. Spell out the full name only in this document's own prose, never in anything a DEO sees.

**`shop_id` naming convention for HBR (not enforced — a soft guide only):** there is no separate "bar ID" column — `HBR` reuses the same generic `shop_id` field as every other shop type. The department's convention is to include the literal text `HBR` in the ID (e.g. `HBR001`) so a bar license is identifiable from its ID alone. This is a **warning-style** Excel data validation on the `shop_id` column (`errorStyle: 'warning'` in `generateTemplate()`, `apps/web/src/lib/excel.ts`) — a DEO can click "Yes" past it — deliberately not a hard `error`-style gate and not checked by the Worker or `validateRow()`. Districts with HBR data already collected under a different ID pattern are never blocked or retroactively invalidated by this convention.

**`apps/web/src/lib/shop-type.ts`** (M-61) holds the UI-only counterparts to `SHOP_TYPE_LABELS` that don't belong in the shared schema package — `SHOP_TYPE_BADGE_CLASS` (DaisyUI badge color per type) and `SHOP_TYPE_SHORT_LABEL` (tight-space form, HBR still shown bare). Both were copy-pasted independently in the admin district detail page, the DEO `/verify` final-verification screen, and (as of M-61) the admin overview's statewide breakdown card and the new Circle & Sector Master page — now a single source, same reasoning as `apps/web/src/lib/status.ts`.

**`SHOP_TYPE_LABELS` is the single canonical source** (`packages/schema/src/constants.ts`) for the friendly display text per shop type (`Composite Shop (FL + Beer)`, `PRV (Premium Retail Vend)`, etc.) — shared by `excel.ts`'s dropdown/parse-time reverse mapping and `validate.ts`'s error messages, so a rejected value is always explained using the exact words the DEO sees in the dropdown, not the raw enum constant. **`shop_type` reverse-mapping is deliberately lenient** (`SHOP_TYPE_REVERSE` in `excel.ts`) — Excel's `list` dropdown validation never fires on a pasted value (same category of bug as `has_cl5cc`/`circle_sector_name` elsewhere in this file), so a pasted shorter/differently-worded value (e.g. "Composite Shop" instead of the dropdown's full "Composite Shop (FL + Beer)") used to fall through untouched to the raw enum-constant error (`Must be one of: MODEL_SHOP, COMPOSITE_SHOP, ...`) instead of being recognized. The reverse map now also matches bare enum keys, underscore-to-space variants, and common short forms, all resolving to the one canonical enum value.

### CL5CC Rule
- CL5CC is **not a separate shop type**. It is `COUNTRY_LIQUOR` with `has_cl5cc = true`.
- If `has_cl5cc = true`, then `shop_type` must be `COUNTRY_LIQUOR`. The DEO Excel template's `has_cl5cc` cell itself rejects `TRUE` unless `shop_type` is Country Liquor (a custom data-validation formula, not a plain dropdown — see `apps/web/src/lib/excel.ts`), and the Worker independently rejects any other combination on upload as a second layer.
- The frontend shows `special_beer_lf` and `special_beer_mgr` input fields only when `has_cl5cc` is checked. When unchecked, both values must be set to `0` before submission.

### Adjacent Thana Cross-District Rule
- Adjacent Thanas must belong to the **same district** as the source Thana — this is the policy target, not a technically-enforced invariant (see below).
- **`adjacent_thanas_raw` presence (non-blank) is mandatory and IS enforced, both client- and server-side (as of 2026-08-04).** `validateRow()` (`apps/web/src/lib/validate.ts`) requires it via the same `req()` helper used for `shopId`/`shopName`/etc., and since `POST /api/upload/chunk` (`apps/web/app/api/upload/chunk/route.ts`) calls that same shared `validateRow()`, a blank cell is rejected identically in the pre-flight browser check and the Worker's own dual verification — see "Client-Side Pre-Flight Validation (Parse-Time)" above for why both layers exist. On `/verify`, `updateRow()` also re-runs `validateRow()` whenever `adjacentThanasRaw` changes, so clearing the last pill via the UI (the only inline-edit path for this field) flips the row back to `'error'` immediately rather than silently staying `'pending'`. This closed a real gap — many districts (e.g. Kanpur Nagar) were submitting with this column entirely blank because nothing in the UI or validation ever flagged it; before this fix `/verify`'s empty-pill state rendered an unremarkable dim `—`, identical to any other fine field.
- **What is still NOT enforced, and never will be without a state-wide Thana master list (Pre-Campaign Blocker #3): district membership of the *names themselves*.** The mandatory check above only requires *something* be entered — it cannot verify the entered Thana names are correct or actually belong to this district. `POST /api/upload/chunk` writes whatever non-blank string is given through as-is beyond that presence check.
- **The verification UI red pill is a same-district, same-upload self-consistency heuristic, not a cross-district check — and is separate from the mandatory-presence rule above.** `/verify`'s `districtThanas` set (`app/(deo)/verify/page.tsx`) is built only from the current DEO's own district's own rows (staged or already-uploaded) — never any other district's or any other DEO's data. A red pill means the adjacent-Thana name doesn't (yet) appear as a `thanaName` value elsewhere in that same district's own dataset — usually a typo, but it can false-positive on a real Thana that simply has no shop in this particular upload. It cannot detect a genuine cross-district name, since it has no notion of which district any Thana actually belongs to. **A red pill alone does not block submission** — only a fully blank cell does (via `row.status === 'error'`, same as any other mandatory-field violation).

  Earlier versions of this file and the DEO Excel template's Instructions copy overclaimed the red-pill check itself as enforced ("filtered and rejected... by the Worker"); the wording above and the template's Instructions sheet (as of M-16) both now describe only what actually runs. That correction is unrelated to, and still true alongside, the new mandatory-presence enforcement described above.

### Revenue Dual-Verification
- The browser computes `total_revenue` and sends it with the row.
- The Worker independently recomputes `total_revenue` from the raw financial fields.
- If the values differ (zero tolerance), the Worker rejects the row with a reason string.
- This pattern protects against silent data corruption from frontend formula bugs.

### Client-Side Pre-Flight Validation (Parse-Time)
- `validateRow()` (`apps/web/src/lib/validate.ts`) mirrors every check `POST /api/upload/chunk` runs — required fields, `shop_type` enum, the CL5CC/`COUNTRY_LIQUOR` rule, composite sub-component sums, UP bbox, and the revenue dual-verification above. It was written as the Worker's own validation and originally only ran there.
- `parseExcelFile()` (`apps/web/src/lib/excel.ts`) now also calls `validateRow()` on every row immediately after parsing, and marks any row that fails as `status: 'error'` with `errorReason` set to the joined messages — the exact same fields a post-upload Worker rejection already populates, so `/verify` renders both cases identically.
- **Why this exists:** the `has_cl5cc` Excel cell has a hard data-validation gate (see "CL5CC Rule" below), but Excel's cell-level data validation only fires on typed keystrokes — not on pasted values. A DEO pasting a `has_cl5cc` column from another sheet can silently produce an invalid combination the Excel UI never flags. Without this check, that row would only surface as invalid after a full round trip through `POST /api/upload/chunk` (chunk upload → Worker rejection → DEO re-uploads). With it, `parseExcelFile()` catches the row the moment the file is opened in `/upload`, before any network request — `/verify`'s `submitDistrict()` already filters to `status === 'pending'` rows only, so an `error`-flagged row is never sent at all.
- This does not replace the Worker's own validation — a DEO could in principle open the app with an old cached JS bundle (mitigated by the Service Worker `CACHE` version bump policy, see "PWA & Offline") or the check could have a bug. The Worker remains the actual authority; this is purely a latency optimization to avoid the round trip for the common case.
- **`circle_sector_name` mismatch check (M-49):** `parseExcelFile()` also takes a `registeredUnits: string[]` parameter (the district's own registered unit names, already fetched for `/upload`'s page state) and flags any row whose `circle_sector_name` doesn't exactly match one of them as `status: 'error'`. Root cause this fixes: the `circle_sector_name` column's Excel data validation is a `list` dropdown, which — like `has_cl5cc` — never fires on a pasted value. A mismatched name (typo, or an Inspector pasting the column from elsewhere) previously passed `validateRow()` silently (it only checks non-empty), then never matched any tab's `circleSectorName === activeUnit` filter on `/verify` and never got included in any of `submitDistrict()`'s per-unit chunk groups either — the row just vanished from every circle/sector view with no error shown anywhere, which read to a real DEO (Rampur) as "my uploaded data got wiped" the moment they clicked a different circle tab. `/verify` now also computes `unmatchedRows` (staged rows whose name isn't in the registered `units` list) and shows them under a distinct red-bordered "Unregistered / Mismatched" card (`UNMATCHED_UNIT_KEY` sentinel activeUnit) instead of nowhere at all.

---

## Revenue Formulas

These are the canonical formulas. All values are **annual figures in Indian Rupees**. Encode constants as named values, never as magic numbers.

| Shop Type | `has_cl5cc` | Annual Revenue Formula |
|---|---|---|
| `MODEL_SHOP` | false | `license_fee_lf + mgr_amount + ON_PREMISES_CONSUMPTION_FEE` |
| `COMPOSITE_SHOP` | false | `composite_lf_fl + composite_lf_beer + composite_mgr_fl + composite_mgr_beer` |
| `PRV` | false | `license_fee_lf + mgr_amount` |
| `BHANG_SHOP` | false | `license_fee_lf + (mgq_quantity × BHANG_MGQ_MULTIPLIER)` |
| `COUNTRY_LIQUOR` | false | `basic_license_fee_blf + consideration_fee` |
| `COUNTRY_LIQUOR` | **true** | `basic_license_fee_blf + consideration_fee + special_beer_lf + special_beer_mgr` |
| `HBR` | n/a | `license_fee_lf + consideration_fee` (consideration fee = total consideration fee involved in the lifting for the previous year) |

`BHANG_MGQ_MULTIPLIER = ₹20 per unit` — this is a **per-unit price in Indian Rupees**, not a dimensionless number. `mgq_quantity` is the count of MGQ units; multiplying by ₹20/unit yields the annual INR contribution. Define as a named constant in `packages/schema` or a shared constants file. Do not hardcode `20` inline anywhere.

`ON_PREMISES_CONSUMPTION_FEE = ₹3,00,000` — fixed annual On Premises Consumption Fee applied to all `MODEL_SHOP` licences. This is a department-set constant, **not a per-shop variable field**. It is defined in `packages/schema/src/constants.ts` and baked directly into the revenue formula. There is no `on_premises_consumption_fee` column in the database or field in the Excel template.

For `COMPOSITE_SHOP`: `license_fee_lf` stores `composite_lf_fl + composite_lf_beer` and `mgr_amount` stores `composite_mgr_fl + composite_mgr_beer` as computed totals for cross-type SQL aggregation. The four sub-component fields are the source of truth. The Worker validates both sub-component sums before insert.

**These totals are computed by `parseExcelFile()` (`apps/web/src/lib/excel.ts`), never DEO-entered — do not remove this.** The Excel template's `FIELD_GATES` correctly excludes `COMPOSITE_SHOP` from the `license_fee_lf`/`mgr_amount` columns (Excel's own cell validation blocks a DEO from typing anything but 0 into either cell on a composite row), so `parseExcelFile()` sets `row.licenseFeeLf = compositeLfFl + compositeLfBeer` and `row.mgrAmount = compositeMgrFl + compositeMgrBeer` for every `COMPOSITE_SHOP` row right before `validateRow()` runs. This was missing until 2026-08-03 — every Composite Shop upload failed both sum checks unconditionally (the cell was stuck at 0, the sub-fields were correctly nonzero, so the equality could never hold), regardless of what the DEO entered. If this computation is ever removed or moved, Composite Shop uploads will break the same way again.

---

## Drizzle Schema Location

The canonical schema is split across two files in `packages/schema/src/`:

**`phase1.ts`** — data tables:
- `phase1_raw_collection` — all shop records (Section 5.2)
- `districts` — district registry with DEO metadata (Section 5.3)
- `district_circles_sectors` — circles/sectors per district (Section 5.4)
- `audit_log` — 45-day rolling event log (Section 5.5). Events actually written: `login`, `login_cug`, `logout`, `upload_chunk`, `district_submitted`, `unit_registered`, `units_unlocked`, `district_master_updated`, `bulk_provision`, `admin_user_created`, `admin_user_updated`, `admin_user_deleted`, `district_verified`, `verification_phase_toggled`. `actorName`/`actorDesignation` (added `migrations/0004_add_audit_actor_identity.sql`) capture the admin/superadmin actor's identity at write time for admin-initiated events (login, logout, unlock, District Master edits, bulk-provision) — null for DEO-actor events, where `deoId` already identifies the actor. `/admin/audit`'s `describeActor()` prefers `actorName`(+`actorDesignation`), falling back to `deoId`.

**`auth.ts`** — auth tables (all 7 tables live in `migrations/0001_initial.sql`; `deoCugHash` was added afterward in `migrations/0002_add_deo_cug_hash.sql`):
- `auth_users` — email hash, name, role ('deo'|'admin'), deoId, districtName, deoCugHash (SHA-256 of CUG mobile number, nullable — alternate login credential)
- `auth_magic_links` — tokenHash, expiresAt, used flag, rate-limit support
- `auth_sessions` — id=sha256(rawId), userId FK, expiresAt (24h)
- `login_attempts` (`migrations/0006_add_login_attempts.sql`) — per-IP brute-force counter for `POST /api/auth/verify-cug` (see SECURITY.md §3): `ipHash` (SHA-256 of `CF-Connecting-IP`, primary key — one row per IP, not per attempt), `windowStart`, `count`. Checked/incremented by `apps/web/src/lib/rate-limit.ts`'s `checkIpRateLimit()` before the `auth_users` lookup; 10 attempts / 5 minutes, `429` past that.
- `district_unlock_requests.requestType` (`migrations/0007_add_unlock_request_type.sql`, M-54) — `'units'` | `'data_correction'`, defaults to `'units'` for pre-existing rows. See "Data-correction unlock" above.
- `app_settings` (`migrations/0008_add_app_settings.sql`, M-60, defined in `packages/schema/src/settings.ts`) — singleton row (`id=1`), one column: `verificationPhaseOpen` (boolean). Backs the state-wide final-verification round toggle. See "State-wide final verification round" above.

When schema files do not yet exist, refer to [roadmap.md Section 5](roadmap.md#5-phase-1-database-schema) for exact definitions. Do not modify the schema without updating `roadmap.md` Section 5 as well.

---

## Development Commands

```bash
# Install dependencies
pnpm install

# Run the dev server (Next.js + all API routes)
pnpm --filter web dev

# Apply D1 migrations (run after adding new migration files)
wrangler d1 migrations apply up-excise-spatial-revenue-optimizer-prod
# Note: wrangler tracks applied migrations by filename, not content. If a migration file
# that's already marked applied is edited in place (rather than adding a new file), the
# above command reports "No migrations to apply!" even though the SQL changed. Force-apply
# with: wrangler d1 execute up-excise-spatial-revenue-optimizer-prod --remote --file=migrations/0001_initial.sql

# Seed the districts master table (all 75 UP districts + 18 divisions + bbox; re-run if
# the GeoJSON or division mapping ever changes — safe to re-run, upserts by district name)
pnpm seed:districts

# Seed real DEO accounts (email hash + CUG hash) from department contact sheets.
# Source CSVs (scripts/data/deo-contact.csv, deo-emails.csv) contain raw PII — gitignored,
# never committed. Idempotent upsert by email hash. See "CUG-hashed login" above.
pnpm seed:deo-accounts

# Run unit tests
pnpm test

# Run E2E tests
pnpm --filter web test:e2e

# Type-check all packages
pnpm typecheck

# Build portal as Cloudflare Worker (output: apps/web/.open-next/)
cd apps/web && npx @opennextjs/cloudflare build

# Deploy portal Worker
cd apps/web && npx @opennextjs/cloudflare deploy

# ── Set secrets (one-time setup) ──────────────────────────────────────────────
npx wrangler secret put SESSION_SECRET --name up-excise-spatial-revenue-optimizer-web
npx wrangler secret put API_SECRET --name up-excise-spatial-revenue-optimizer-web
npx wrangler secret put RESEND_API_KEY --name up-excise-spatial-revenue-optimizer-web
npx wrangler secret put RESEND_FROM_EMAIL --name up-excise-spatial-revenue-optimizer-web
```

---

## Milestone Progress

Full per-milestone delivery history (Objective, Deliverables, Exit Criterion, bugs found/fixed) lives in **[summary.md](summary.md)**, split out from roadmap.md so that file stays a pure technical/business-logic spec and this file stays pure AI-agent operating instructions. The table below is a quick-glance status only — update it (one line) the moment a milestone completes, and add the full write-up to summary.md in the same session.

| Milestone | Status |
|---|---|
| M-0: Foundation & Repo Setup | **Completed** |
| M-1: Schema, Migrations & Worker Skeleton | **Completed** |
| M-2: Excel Ingestion & Coordinate Engine | **Completed** |
| M-3: Verification UI & IndexedDB | **Completed** |
| M-4: Worker Batch API & D1 Integration | **Completed** |
| M-5: Dashboard, Testing & DEO Handoff | **Completed** |
| M-6: Auth Migration + Single Worker | **Completed** |
| M-7: Admin Portal UI Overhaul | **Completed** |
| M-8: Admin Portal Navigation & Divisions | **Completed** |
| M-9: SPA Navigation Parity & Polish | **Completed** |
| M-10: District Master & Migration Consolidation | **Completed** |
| M-11: PII Email Hashing & Superadmin Config | **Completed** |
| M-12a: E2E Playwright Automation | **Completed** |
| M-12b: Excel Template UX & Developer QoL | **Completed** |
| M-13: Admin UX Refresh & Excel Enhancements | **Completed** |
| M-14: Single-Library Spreadsheet Rewrite | **Completed** |
| M-15: Foolproof Gated DEO Workflow | **Completed** |
| M-16: DEO Portal Polish & Bilingual Excel Template Overhaul | **Completed** |
| M-17: CUG Login, API Error Handling & Atomicity Hardening | **Completed** |
| M-18: Audit Log UI Overhaul | **Completed** |
| M-19: Admin Name/Designation Display | **Completed** |
| M-20: Audit Actor Identity & Owner-Only District Master | **Completed** |
| M-21: DEO Excel Template Overhaul, Admin Navbar Fix & Adjacent-Thana Honesty Fix | **Completed** |
| M-22: Prod Go-Live Cleanup & Custom Domain | **Completed** |
| M-23: Circle Numbering Convention (Rural vs. Urban) | **Completed** |
| M-24: Self-Service Unlock Requests & Login-Page ViewPrefs Cleanup | **Completed** |
| M-25: Bilingual DEO User Manual (PDF) & Manual-Generation E2E Tests | **Completed** |
| M-26: Fixed Circle/Sector Number Prefix, Excel Column Resize Fix & SW Cache Bump | **Completed** |
| M-27: /units Locked-View Redesign & "Invalid Date" Fix | **Completed** |
| M-28: Single Global Admin "Sync All" Button | **Completed** |
| M-29: SEO Metadata, robots.txt, Favicon & Social-Preview Image | **Completed** |
| M-30: District Detail Circles/Sectors Modal | **Completed** |
| M-31: Fixed has_cl5cc Excel Validation Always Rejecting Both TRUE and FALSE | **Completed** |
| M-32: OG Image Middleware Fix & Doc Reorg (roadmap.md/summary.md split) | **Completed** |
| M-33: Mobile-Responsive Navbars & Dashboards | **Completed** |
| M-34: District Detail Inline Edit (Superadmin-Only) | **Completed** |
| M-35: has_cl5cc Boolean-Parse Fix & 3-Step Circles/Sectors Wizard | **Completed** |
| M-36: has_cl5cc Hard Cell-Level Gate (Country Liquor Only) | **Completed** |
| M-37: HBR (Hotel / Bar / Restaurants) Shop Type Addition | **Completed** |
| M-38: Prod D1 Fresh-Start Reset | **Completed** |
| M-39: Admin Users Management Module | **Completed** |
| M-40: Circle/Sector Stats & Admin Export Rework | **Completed** |
| M-41: DEO Routes Made Deo-Only (Removed Admin/Superadmin Bypass) | **Completed** |
| M-42: CUG Login Rate Limiting (Cross-Project Security Audit) | **Completed** |
| M-43: Clear Staged Data, Direct Uploaded-Data Link & Composite Shop Upload Fix | **Completed** |
| M-44: Verify-Page Unit-List Race Fix & Missing-Unit Diagnostics | **Completed** |
| M-45: Coordinate Bbox No Longer Blocks Upload; Submit Result Summary | **Completed** |
| M-46: DEO Name Confirmation & Liability Disclaimer on Submit District | **Completed** |
| M-47: Excel Min-Version Warning & Revenue Breakdown Popup Viewport Flip | **Completed** |
| M-48: HBR Shop ID Naming Convention (Soft Warning, Not Enforced) | **Completed** |
| M-49: Fix Mismatched circle_sector_name Silently Vanishing All Data | **Completed** |
| M-50: Lenient Shop-Type Reverse Mapping & Human-Readable Validation Errors | **Completed** |
| M-51: `in_progress` District Status & Revenue Popup Container-Bound Flip Fix | **Completed** |
| M-52: Circle/Sector Count Column; District Master Drops Expected-Vends Column | **Completed** |
| M-53: Submit District Writes the Confirmed DEO Name Back to `districts.deoName` | **Completed** |
| M-54: Post-Submission Data-Correction Unlock (No D1 Wipe); Dropdown-Only Entry Warnings | **Completed** |
| M-55: DEO Manual Regenerated End-to-End; Dropdown/Adjacent-Thana Wording Fixes | **Completed** |
| M-56: Fixed Excel Template XML Corruption (errorTitle Over Excel's 32-Char Limit); Status/Audit Label Fixes | **Completed** |
| M-57: Automated OOXML-Limit Regression Check; Home/Verify Locked Down Post-Submission; Post-Submit Local Cache Re-Seed | **Completed** |
| M-58: Adjacent Thana Presence Made Mandatory & Enforced | **Completed** |
| M-59: 7-Day Sliding-Renewal Admin Sessions ("Remember Me") | **Completed** |
| M-60: State-Wide Final Verification Round; Shared RevenueCell (HBR Fix, Portal-Based Popup) | **Completed** |
| M-61: Statewide Shop-Type/Circle-Sector Stats, Circle & Sector Master Page, District Progress Export | **Completed** |
| M-62: Removed Standing Data-Wipe Endpoint; One-Click District Progress Download; CL5CC Card Fixes | **Completed** |
| M-63: Paginated Full-State Export & Sync All D1-Read Throttling | **Completed** |
| M-64: Per-District Incremental Export Sync | **Completed** |
| M-65: Admin Cache TTL Enforcement, `makeKvCache` Factory, Shop Table Column-Width Fix | **Completed** |
| M-66: Final Verification Round Toggle Opened to Any Admin | **Completed** |
| M-67: DEO Final-Verification Screen at Parity with Admin (`ShopExplorer`), Real DEO Name, Excel Instructions Update | **Completed** |

See [summary.md](summary.md) for full milestone specs, entry/exit criteria, deliverable checklists, the backlog, and pre-campaign-blocker history.

---

## Pre-Campaign Blockers

The following are unresolved department-side decisions that block specific milestones. Do not implement the affected features until these are resolved.

1. **DEO email addresses** — resolved for all 75 districts via `scripts/seed-deo-accounts.ts` (department contact sheets), Bhadohi included — verified directly against prod D1 on 2026-07-23 (`districts.deo_id = "DEO-BHADOHI"`, `auth_users.district_name = "Bhadohi"`, real `deo_email_hash` set).
2. **Excel template column layout** — column mapping cannot be built until column names and order are locked.
3. **Thana master list** — blocks the adjacent Thana cross-district filter (best-effort; proceed with runtime check if unavailable).
4. **Shop count estimates per district** — blocks dashboard "X of Y uploaded" progress metrics.
5. **DEO credential and identifier assignment** — `deoId` now auto-assigned as `DEO-<DISTRICT-NAME>` by `seed-deo-accounts.ts` for all 75 districts. DEO *names* are still English placeholders (`"<District> DEO"`) — the source contact sheet's names are in Hindi, which this project's Data Language rule forbids storing; correct real names via the admin District Master page. Provisioning still sends magic-link emails to DEO addresses (or DEOs can sign in with their CUG number — see "CUG-hashed login"). DEOs must also complete circle/sector pre-registration before distributing templates to Inspectors.
6. **Circle/sector naming convention** — DEOs need a consistent naming standard so pre-registered unit names are clean and unambiguous across all 75 districts.
7. **Upsert vs. versioning decision** — resolved as upsert. `POST /api/upload/chunk` uses `onConflictDoUpdate` (`apps/web/app/api/upload/chunk/route.ts`) — a DEO re-uploading a district overwrites existing rows for the same `shop_id` rather than versioning them.
8. **Custom email domain** — resolved. `mail.exciseup.in` verified in Resend; `RESEND_FROM_EMAIL` is `noreply@mail.exciseup.in`. Same domain/sender reused for the sibling `excise-revenue-recovery-portal` project's `FROM_EMAIL` secret (different env var name there — see that repo's CLAUDE.md). Magic-link email is scoped to Admin/HQ login only — DEOs use CUG login.
9. **DoT SMS template approval** — in progress, for a DEO login-OTP SMS text. Not a blocker for launch (CUG-hash login already works); see summary.md's Backlog section for the planned SMS-OTP upgrade once approved.

---

## localStorage Keys — Authoritative Registry

All `localStorage` keys used by the portal, their owning component, and what they store. Do not add new keys without updating this table.

| Key | Owner | Value |
|---|---|---|
| `theme` | `ViewPrefsPanel.tsx` | `'light'` \| `'dark'` \| `'system'` — persists user's theme mode; `'system'` re-evaluates OS preference on load |
| `excise-view-prefs-v1` | `ViewPrefsPanel.tsx` | JSON: `{ fontSize, density, width }` — font size, row density, content width |
| `help_done_{pageKey}` | `HelpPanel.tsx` | `'true'` when user has dismissed the help badge for that page |
| `admin-page-size` | `ShopExplorer` (`storageKeyPrefix="admin"`, used by the admin district detail page) | `'10'` \| `'25'` \| `'50'` \| `'100'` \| `'all'` — persists rows-per-page selector |
| `admin-group-by-type` | `ShopExplorer` (`storageKeyPrefix="admin"`) | `'true'` \| `'false'` — persists group-by-type toggle state across navigation |
| `admin-group-{districtName}` | `ShopExplorer` (`storageKeyPrefix="admin"`) | JSON array of open group type strings — which shop-type groups are expanded |
| `deo-final-page-size` | `ShopExplorer` (`storageKeyPrefix="deo-final"`, used by the DEO final-verification screen on `/verify`) | Same shape as `admin-page-size`, namespaced separately so the two portals never collide in localStorage on a shared browser |
| `deo-final-group-by-type` | `ShopExplorer` (`storageKeyPrefix="deo-final"`) | Same shape as `admin-group-by-type`, DEO-portal namespace |
| `deo-final-group-{districtName}` | `ShopExplorer` (`storageKeyPrefix="deo-final"`) | Same shape as `admin-group-{districtName}`, DEO-portal namespace |
| `admin-last-full-sync-at` | `invalidateAllAdminCaches()` (`apps/web/src/lib/db.ts`) | Epoch ms of the last time Sync All actually ran (M-63) — a click within 15 minutes of this timestamp is a silent no-op, zero D1 reads |
| `admin-export-sync-watermark` | `syncExportCache()` (`apps/web/src/lib/db.ts`) | Epoch ms up to which `export_cache` is known-accurate on this device (M-64) — passed as `?since=` to `GET /api/admin/changed-districts` so only newly-changed districts get re-fetched |

---

## Code Conventions

- TypeScript strict mode everywhere. No `any` types.
- All financial values are whole-rupee integers in Indian Rupees (no paise). Never use floats for money. Store full figures — e.g., `10000000` for one crore. No abbreviation or scaling in the database; UI formatting (lakhs, crores) is a rendering concern only.
- Coordinate precision: store `latitude_decimal` and `longitude_decimal` as `REAL` (SQLite float). 6 decimal places is sufficient (~0.1m precision).
- Error messages returned by the Worker are English, structured as `{ error: string, rejectedRows?: { rowIndex: number, reason: string }[] }`.
- No comments in code that describe what the code does. Only comment the WHY when a constraint is non-obvious (e.g., the 500-row chunk size rationale belongs in a comment; a `for` loop does not).
- Do not add error handling for impossible states. Trust internal schema validation and the Worker's inbound validation layer.

---

## What Is Out of Scope

Do not implement, suggest, or encode any of the following:

- Commercial lounges, banquet hall licenses, wholesale distribution. (Hotel/restaurant bars are **in scope** as of 2026-07-28 — see `shop_type = HBR` above and roadmap.md §4.3a.)
- Phase 2 boundary optimization logic (Inspector assignment algorithms, Voronoi-style territory splitting, etc.).
- Password-based authentication. The system is magic-link only — no password fields, no password reset flows.
- Inspector-level portal access. Inspectors fill Excel files and hand them to the DEO. They have no accounts and no portal access.
- Self-registration for DEO accounts. All accounts are provisioned by the administrator from the department email list.
- Full mobile-first redesign of forms, the Excel upload flow, or admin data tables — see "PWA & Offline" above for what mobile support *does* cover (navbars, dashboards) as of the M-33 mobile pass.
- Any field, route, or UI component not grounded in a roadmap milestone deliverable.

---

## Co-Authorship

This project is co-developed by:

- **Subhan Raj** — Lead Engineer, SIBIN Tech Solutions
- **Claude Sonnet 4.6** (Anthropic) — AI Co-Author and Systems Architect

All Claude-assisted commits carry the trailer:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
