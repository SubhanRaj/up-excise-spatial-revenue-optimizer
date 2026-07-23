# CLAUDE.md — State Excise Portal: Spatial & Revenue Optimization System

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
| **Roadmap** | [roadmap.md](roadmap.md) — read this for full architectural context |
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
├── roadmap.md        # Engineering master document
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
| `/admin/unlock-requests` | `app/(admin)/admin/unlock-requests/page.tsx` | `admin` |
| `/admin/audit` | `app/(admin)/admin/audit/page.tsx` | `admin` |
| `/admin/export` | `app/(admin)/admin/export/page.tsx` | `admin` |

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
| `POST` | `/api/auth/verify-cug` | `api/auth/verify-cug/route.ts` — alternate login: browser hashes the DEO's 10-digit CUG mobile number (SHA-256), server looks it up against `auth_users.deo_cug_hash`, creates session, returns `{ redirect }` |
| `POST` | `/api/auth/logout` | `api/auth/logout/route.ts` |

**DEO (`role: deo`):**

| Method | Path | File |
|---|---|---|
| `POST` | `/api/upload/chunk` | `api/upload/chunk/route.ts` — 500-row batch insert via `db.batch()` |
| `GET` | `/api/districts` | `api/districts/route.ts` |
| `GET` | `/api/districts/[district]/units` | `api/districts/[district]/units/route.ts` |
| `POST` | `/api/districts/[district]/units` | `api/districts/[district]/units/route.ts` — **bulk-only**, one-shot: body is `{ circles: string[], sectors: string[] }`. Rejects (409) if the district already has any unit row — see "DEO Workflow" below. |
| `GET` | `/api/districts/[district]/template` | `api/districts/[district]/template/route.ts` |
| `GET` | `/api/districts/[district]/status` | `api/districts/[district]/status/route.ts` |
| `GET` | `/api/districts/[district]/shops` | `api/districts/[district]/shops/route.ts` |
| `POST` | `/api/districts/[district]/submit` | `api/districts/[district]/submit/route.ts` |
| `GET` | `/api/districts/[district]/request-unlock` | `api/districts/[district]/request-unlock/route.ts` — the signed-in DEO's own latest unlock request (or `null`), for the `/units` locked-view pending banner |
| `POST` | `/api/districts/[district]/request-unlock` | `api/districts/[district]/request-unlock/route.ts` — self-service unlock request (409 if not locked yet, or if a pending request already exists); audit-logged as `unlock_requested` |

**Admin (`role: admin`):**

| Method | Path | File |
|---|---|---|
| `GET` | `/api/admin/districts` | `api/admin/districts/route.ts` — 75-row aggregate |
| `GET` | `/api/admin/districts/[district]` | `api/admin/districts/[district]/route.ts` |
| `PATCH` | `/api/admin/districts/[district]` | `api/admin/districts/[district]/route.ts` — District Master inline edit (division, DEO identity, expected vend count, bbox); atomic `db.batch`, syncs `auth_users`. **Owner/superadmin-only** — 403 for a plain `admin` role |
| `GET` | `/api/admin/districts/[district]/shops` | `api/admin/districts/[district]/shops/route.ts` |
| `GET` | `/api/admin/districts/[district]/export` | `api/admin/districts/[district]/export/route.ts` |
| `GET` | `/api/admin/export/all` | `api/admin/export/all/route.ts` |
| `GET` | `/api/admin/map-data` | `api/admin/map-data/route.ts` |
| `GET` | `/api/admin/search` | `api/admin/search/route.ts` |
| `POST` | `/api/admin/bulk-provision` | `api/admin/bulk-provision/route.ts` — **Owner/superadmin-only** (creates DEO accounts and sends real magic-link emails) — 403 for a plain `admin` role |
| `GET` | `/api/admin/audit-log` | `api/admin/audit-log/route.ts` |
| `GET` | `/api/admin/unlock-requests` | `api/admin/unlock-requests/route.ts` — all `district_unlock_requests` rows, newest first |
| `POST` | `/api/admin/unlock-requests/resolve` | `api/admin/unlock-requests/resolve/route.ts` — `{ id, action: 'approve'\|'deny', note }`; approve deletes that district's `district_circles_sectors` rows (same effect as the manual `DELETE /api/districts/[district]/units` unlock) and audit-logs `units_unlocked`; deny audit-logs `unlock_request_denied`. Open to plain `admin`, not owner/superadmin-only — same access level as the existing manual unlock |

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

1. **Session cookie** (`excise-session`): `rawId.hmacSig` where `hmacSig = HMAC-SHA256(rawId, SESSION_SECRET)`. HttpOnly, Secure, SameSite=Lax, 24-hour expiry. Set on `/auth/verify` after consuming a valid magic link. Stored as SHA-256 hash in D1 `auth_sessions`.

2. **Role cookie** (`excise-role`): `deo` or `admin`. Client-readable, used by `middleware.ts` for routing (DEO routes vs admin routes). Not a security boundary — the security check is in server layouts via `requireAuth()` and in route handlers via `getSession()`.

All API routes are same-origin Next.js Route Handlers. The browser sends the session cookie automatically — no Bearer tokens, no API tokens. Route handlers call `getSession()` which verifies the HMAC and does a D1 lookup.

**Magic-link flow:**
1. DEO enters email on `/login` → server action `requestMagicLink()` validates email against `auth_users`, rate-limits (3/15min), generates UUID token, stores SHA-256 hash in `auth_magic_links`, sends link via Resend.
2. DEO clicks link → `/auth/verify?token=xxx` → **client component** shows spinner, POSTs token to `POST /api/auth/verify` → route handler verifies hash, marks used, creates `auth_sessions` record, sets cookies, returns `{ redirect }` → client does `window.location.href = redirect` to `/home` or `/admin`.
   - **Why client component:** Next.js 15 forbids `cookies().set()` in Server Component pages. Cookie writes are only allowed in Route Handlers and Server Actions. The verify page is `'use client'`; the actual verification and session creation happen in the `/api/auth/verify` Route Handler.
3. Client pages call `/api/auth/session` on mount → route handler verifies session cookie → returns `{ deoId, name, role, districtName }`. No token issued.
4. Client calls all `/api/*` routes directly — session cookie authenticates automatically.

**CUG-hashed login (primary DEO credential):** a DEO signs in with their department CUG mobile number rather than email — this remains the primary/default DEO login path even with the domain now verified, since magic-link email is scoped to Admin/HQ only. The `/login` page has an Email/CUG toggle; the CUG path hashes the 10-digit number client-side (`apps/web/src/lib/crypto-client.ts`, Web Crypto SHA-256 — the raw number never leaves the browser) and POSTs `{ cugHash }` to `/api/auth/verify-cug`, which looks it up against `auth_users.deo_cug_hash`, creates the same session/cookie as the magic-link path, and returns `{ redirect }`. Both login paths are equally valid and interchangeable per account — a DEO with both an email and a CUG hash on file can use either. `scripts/seed-deo-accounts.ts` populates `deo_cug_hash` (and `deoEmailHash`) for real DEOs from department contact sheets — see "DEO Account Seeding" below.

**Admin name/designation:** `auth_users.designation` (nullable, e.g. "Excise Commissioner") is shown in the admin navbar next to the person's `name` — see `AdminIdentity` in `app/(admin)/layout.tsx`. Falls back to "Superadmin"/"Admin" (by role) when unset. **No email tooltip** — unlike a plaintext-email system, this project only ever stores `email_hash` (Zero-Knowledge PII), so there is no readable email available client-side to show on hover. `GET /api/auth/session` and `SessionUser`/`SessionInfo` (`src/lib/auth.ts`, `src/hooks/useSession.ts`) both carry `designation` through from D1. Multiple admin accounts (department officials, not just the one superadmin-bypass owner) are supported the same way DEOs are — a plain `auth_users` row with `role: 'admin'`, provisioned by direct D1 insert today (no self-service UI yet — see roadmap.md's Backlog).

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
- **Session cookie is HttpOnly, Secure, SameSite=Lax.** Session credentials never touch `localStorage`, `sessionStorage`, or IndexedDB.
- **Sign-out** clears both `excise-session` and `excise-role` cookies via a server action that also deletes the D1 session row. The sign-out button in layouts calls a form action — there is no client-side Clerk hook.
- **Token in URL** — the magic-link token (`/auth/verify?token=xxx`) is consumed and marked used on first visit. Expired, used, or missing tokens show an error and redirect to `/login`. Tokens expire in 15 minutes.
- **Rate limit**: 3 magic-link requests per email per 15-minute window. Enforced in `requestMagicLink()` server action.
- **Session lifetime**: 24 hours. Sessions created at login have `expires_at = now + 24h` in D1. The `requireAuth()` check enforces this.

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

**Overview page (`/admin`):**
- Default view **never loads shop rows**. Calls `GET /api/admin/districts` (one request, 75 aggregate rows) and `GET /api/admin/map-data`.
- District table on the overview shows **top 10 by revenue only**, with a "View all 75 districts →" link to `/admin/districts`.
- A **divisions grid** below the charts groups districts by `division` field client-side — 18 division cards each showing district count, submission progress bar, and total revenue. Cards link to `/admin/divisions/[name]`.
- The state totals aggregate is **pre-computed server-side** on each `district_submitted` event and **cached in admin IndexedDB** (`admin_state_totals`, 15-min TTL). The summary page never runs a fresh full-table aggregate within the TTL window.

**Districts page (`/admin/districts`):**
- Full 75-district table. Fetches from the same `GET /api/admin/districts` endpoint (75 aggregate rows — no shop data). The endpoint also returns `deoEmail`, `deoId`, and a bbox-midpoint `centerLat`/`centerLon` per district (computed server-side from `districts.bboxMinLat/MaxLat/MinLon/MaxLon`).
- Client-side search (matches district, division, DEO name, DEO email — `deoEmail` is matched but not rendered, see below), division filter, status filter, and sortable columns. No additional API calls.
- **Read-only view.** DEO name, email, and coordinates are displayed for browsing only — there is no edit UI on this page. The DEO email column itself is **not rendered** (only DEO name) to keep the table uncluttered; all district/DEO editing happens on the District Master page (`/admin/provision`), described below.
- Division badge in each row links to `/admin/divisions/[division]`.

**Divisions page (`/admin/divisions`):**
- 18 division cards derived client-side from `GET /api/admin/districts`. Shows district count, submission progress, and revenue per division.

**Division detail page (`/admin/divisions/[division]`):**
- Fetches `GET /api/admin/districts`, filters client-side by division. Shows districts in that division as a sortable table.

**District Master page (`/admin/provision`, nav label "District Master"):**
- **Owner/superadmin-only.** This page reassigns any district's DEO identity and bulk-provisions DEO accounts (sending real magic-link emails), so — unlike every other admin page — it is restricted to the `superadmin` role, not open to all `admin` accounts. The nav bar hides the "District Master" link entirely for a plain `admin` session; direct navigation to `/admin/provision` renders a restricted message instead of the page content; and the two underlying routes (`PATCH /api/admin/districts/[district]`, `POST /api/admin/bulk-provision`) independently 403 for anything but `role: 'superadmin'` — the client-side hide is UX only, the server check is the actual boundary. Every edit and every bulk-provision run is audit-logged (`district_master_updated`, `bulk_provision` — see "Audit Log" below) with the acting superadmin's name/designation.
- Single page for both inline editing and bulk Excel provisioning of the 75-row `districts` table.
- **Inline edit:** the page fetches `GET /api/admin/districts` and renders all 75 districts in a table. Clicking the edit icon on a row opens a right-side drawer (`EditDrawer`) with fields: Division (`<select>` populated from `UP_DIVISIONS` in `packages/schema/src/constants.ts`), DEO Name, DEO Email, DEO Identifier, Expected Vend Count, and the four bbox coordinates (Min/Max Lat, Min/Max Lon). **Note:** Coordinates and Vend Count are optional; clearing the inputs correctly sets the database values to `null`. The drawer features field-specific validation errors rather than generic numeric errors. Saving calls `PATCH /api/admin/districts/[district]`, which atomically updates `districts` and syncs the corresponding `auth_users` row (deletes the old email's row if the email changed, upserts the new one) — see the PATCH route entry in the API table above.
- **Bulk Excel provisioning** (`POST /api/admin/bulk-provision`) remains available below the table for initial campaign setup or large batches. `downloadTemplate()` calls `generateProvisionTemplate()` (in `apps/web/src/lib/excel.ts`) with the live district list, so the downloaded `.xlsx` arrives with District Name and Division pre-filled for all 75 rows — the admin only has to fill in the DEO columns.
- This is the **only** place district master data (division, DEO identity, expected vend count, bbox) can be edited. Minor corrections no longer require a full Excel re-upload.

**District detail page (`/admin/districts/[district]`):**
- The "Division" stat card links to `/admin/divisions/[division]`.
- Shop rows are loaded **only here**. The single call is `GET /api/admin/districts/:district/shops?pageSize=all` — all rows for that district arrive in one response and are held in React state. All filtering, sorting, searching, grouping, and pagination happen **client-side with `useMemo`** — no additional API calls per interaction.
- `pageSize` on the API accepts 10/25/50/100 or `all`; server cap is 2000. The selected per-page display size is persisted to `localStorage` (`admin-page-size`).
- Shows all `phase1_raw_collection` fields: shop ID, name, circle/sector, thana, adjacent thanas (flex-wrap pills), type badge + CL5CC sub-badge, coordinates, revenue (collapsible `<details>` breakdown — no modal).
- Group-by-type view collapses each type group independently with its own inner pagination. Group-by-type state persisted to `localStorage` (`admin-group-by-type`); per-group open/close persisted to `localStorage` (`admin-group-{districtName}`). Enabling group-by-type deselects any active type filter.
- Type labels use full names: `Composite Shop (FL + Beer)`, `PRV (Premium Retail Vend)`. The CL5CC breakdown bar card filters `has_cl5cc = true` and is only active alongside Country Liquor (disabled + greyed for other types). A circle/sector dropdown is also available.
- Full-state UI table (~30K shops in one view) is **not a supported operation**. The only full-state path is `GET /api/admin/export/all` → XLSX download via the `/admin/export` page (data cached in `excise-admin` IndexedDB, generated in-browser by ExcelJS). No CSV.

**Admin nav search:**
- The navbar search bar (`SearchBar` component in `app/(admin)/layout.tsx`) fetches district + division names once on mount (module-level cache `searchCache`). Filters as the user types, shows a dropdown grouped by Divisions / Districts, supports keyboard navigation (↑↓, Enter, Escape). No search results page — navigates directly to the clicked district or division page.

### DEO Workflow — Gated, One-Step-at-a-Time

> DEOs are treated as domain experts, not software users — the portal never assumes they'll infer the correct order of operations. Each step is either the only thing on screen or physically absent (not merely disabled) until its prerequisite is met.

- **Step 1 — Circles & Sectors (`/units`) is mandatory and one-shot.** The DEO does not add units one at a time. The page first asks *how many* circles and *how many* sectors the district has, generates that exact number of pre-labelled input boxes (`Sector 1`, `Sector 2`, … and `Circle N`, `Circle N+1`, …), and the DEO edits each box in place — circle names conventionally include an area (`Circle 1 Mall, Malihabad`), sector names are usually just a number but may also carry an area. Submitting shows a SweetAlert2 confirmation warning that the list **cannot be changed afterward**, then POSTs the full list at once to `POST /api/districts/[district]/units` as `{ circles, sectors }`.
- **Circle numbering placeholder convention:** sectors cover the urban part of a district; circles cover the rural part. If a district has **zero sectors** (purely rural), circle placeholders start at `Circle 1`. If a district has **any sectors**, `Circle 1` is reserved for the sector-covered urban area and is never (re-)issued to a rural circle — circle placeholders start at `Circle 2`. Implemented client-side only in `apps/web/app/(deo)/units/page.tsx`'s `circleNumber(i)` helper (`sectorNames.length === 0 ? i + 1 : i + 2`); it is a placeholder-text convention, not a stored/validated value — the DEO still types the actual name into each box, and the API (`POST /api/districts/[district]/units`) stores whatever free-text name was typed with no numbering logic of its own.
- **Server-side lock, no schema flag needed:** that endpoint rejects (409) if the district already has *any* row in `district_circles_sectors` — the lock is derived from row existence, not a separate `locked` column. There is no edit/delete path for units; a wrong name requires an admin-side correction, either via the DEO's own in-app unlock request (below) or a manual unlock on the admin district detail page.
- **Self-service unlock request:** once locked, `/units` shows a "Request Unlock" button instead of only a "contact your Admin" message. The DEO types a reason (SweetAlert2 textarea, required) which `POST /api/districts/[district]/request-unlock` stores in `district_unlock_requests` (409 if a pending request already exists for that district). Admins review and resolve every request on `/admin/unlock-requests` (`POST /api/admin/unlock-requests/resolve`) — approving deletes the district's `district_circles_sectors` rows (same effect as the pre-existing manual unlock) and requires the admin to type their own note; denying also requires a note and leaves the district locked. `/units` polls its own latest request on load and shows a pending/denied banner accordingly.
- **Upload and Verify do not exist for the DEO until units are locked.** `/home` renders only the "Create Circles & Sectors" card when `units.length === 0` — the Upload/Verify cards are not rendered, not shown disabled. The DEO nav bar (`app/(deo)/layout.tsx`) omits the Upload/Verify links entirely under the same condition. This mirrors the `hasUnits` gate already enforced server-side by every units-dependent API route.
- **SweetAlert2 for every irreversible action.** Locking circles/sectors and submitting a district to headquarters (`/verify`) both show a `Swal.fire` confirmation (row/unit counts, a bilingual warning) before the mutating request fires. Notyf toasts confirm success/failure for lighter-weight actions (parse complete, sync complete).
- **Bilingual labels on the DEO portal only.** Page titles and step headings on `/home`, `/units`, `/upload`, `/verify` carry a short Hindi subtitle beneath the English heading (e.g. "सर्कल एवं सेक्टर पंजीकरण"). This is intentionally not a full i18n system — only titles, section names, and flow-step labels are translated; form validation errors and table data remain English-only per the Data Language rule below. The admin/HQ portal is English-only (admin users are department staff, not field DEOs).

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
- Status fill colours: pending `#94a3b8`, in_progress `#f59e0b`, submitted `#16a34a`. Legend rendered below the map div.
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
- Minimum supported viewport is **768px**. No small-screen mobile layouts. Do not write `sm:` or `xs:` responsive prefixes in any layout.

### Data Language
- All data fields — shop names, Thana names, district names, DEO identifiers, circle/sector names — are **English only**. No Hindi, Devanagari, Urdu, or any other script. Enforce this with input validation in the UI.
- This rule governs stored *data*, not UI *copy*. The DEO portal's page titles and step headings do carry Hindi subtitles for readability — see "DEO Workflow" above. Never let a Hindi UI label leak into a form's default/placeholder value that gets submitted as data.

### Coordinate Handling
- The database stores coordinates **exclusively in Decimal Degrees (DD)**.
- DMS input is converted to DD by the frontend before any data leaves the browser.
- After conversion, validate against the UP geographic bounding box: latitude `23.8°–30.4°N`, longitude `77.1°–84.6°E`.
- Out-of-bounds coordinates are flagged with a warning — they are never silently dropped or auto-corrected.

### Shop Type Enum
Valid values for `shop_type` are exactly:
```
MODEL_SHOP | COMPOSITE_SHOP | BHANG_SHOP | PRV | COUNTRY_LIQUOR
```
No other values are accepted. The Worker validates this on every inbound row.

### CL5CC Rule
- CL5CC is **not a separate shop type**. It is `COUNTRY_LIQUOR` with `has_cl5cc = true`.
- If `has_cl5cc = true`, then `shop_type` must be `COUNTRY_LIQUOR`. The Worker rejects any other combination.
- The frontend shows `special_beer_lf` and `special_beer_mgr` input fields only when `has_cl5cc` is checked. When unchecked, both values must be set to `0` before submission.

### Adjacent Thana Cross-District Rule
- Adjacent Thanas must belong to the **same district** as the source Thana — this is the policy target, not a technically-enforced invariant (see below).
- **Not enforced by the Worker.** No state-wide Thana master list exists (Pre-Campaign Blocker #3), so there is nothing to validate district membership against server-side — `POST /api/upload/chunk` writes `adjacentThanasRaw` through as-is, unvalidated.
- **The verification UI red pill is a same-district, same-upload self-consistency heuristic, not a cross-district check.** `/verify`'s `districtThanas` set (`app/(deo)/verify/page.tsx`) is built only from the current DEO's own district's own rows (staged or already-uploaded) — never any other district's or any other DEO's data. A red pill means the adjacent-Thana name doesn't (yet) appear as a `thanaName` value elsewhere in that same district's own dataset — usually a typo, but it can false-positive on a real Thana that simply has no shop in this particular upload. It cannot detect a genuine cross-district name, since it has no notion of which district any Thana actually belongs to. **It does not block submission** — `canSubmit` has no dependency on it.

  Earlier versions of this file and the DEO Excel template's Instructions copy overclaimed this as enforced ("filtered and rejected... by the Worker"); the wording above and the template's Instructions sheet (as of M-16) both now describe only what actually runs.

### Revenue Dual-Verification
- The browser computes `total_revenue` and sends it with the row.
- The Worker independently recomputes `total_revenue` from the raw financial fields.
- If the values differ (zero tolerance), the Worker rejects the row with a reason string.
- This pattern protects against silent data corruption from frontend formula bugs.

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

`BHANG_MGQ_MULTIPLIER = ₹20 per unit` — this is a **per-unit price in Indian Rupees**, not a dimensionless number. `mgq_quantity` is the count of MGQ units; multiplying by ₹20/unit yields the annual INR contribution. Define as a named constant in `packages/schema` or a shared constants file. Do not hardcode `20` inline anywhere.

`ON_PREMISES_CONSUMPTION_FEE = ₹3,00,000` — fixed annual On Premises Consumption Fee applied to all `MODEL_SHOP` licences. This is a department-set constant, **not a per-shop variable field**. It is defined in `packages/schema/src/constants.ts` and baked directly into the revenue formula. There is no `on_premises_consumption_fee` column in the database or field in the Excel template.

For `COMPOSITE_SHOP`: `license_fee_lf` stores `composite_lf_fl + composite_lf_beer` and `mgr_amount` stores `composite_mgr_fl + composite_mgr_beer` as computed totals for cross-type SQL aggregation. The four sub-component fields are the source of truth. The Worker validates both sub-component sums before insert.

---

## Drizzle Schema Location

The canonical schema is split across two files in `packages/schema/src/`:

**`phase1.ts`** — data tables:
- `phase1_raw_collection` — all shop records (Section 5.2)
- `districts` — district registry with DEO metadata (Section 5.3)
- `district_circles_sectors` — circles/sectors per district (Section 5.4)
- `audit_log` — 45-day rolling event log (Section 5.5). Events actually written: `login`, `login_cug`, `logout`, `upload_chunk`, `district_submitted`, `unit_registered`, `units_unlocked`, `district_master_updated`, `bulk_provision`. `actorName`/`actorDesignation` (added `migrations/0004_add_audit_actor_identity.sql`) capture the admin/superadmin actor's identity at write time for admin-initiated events (login, logout, unlock, District Master edits, bulk-provision) — null for DEO-actor events, where `deoId` already identifies the actor. `/admin/audit`'s `describeActor()` prefers `actorName`(+`actorDesignation`), falling back to `deoId`.

**`auth.ts`** — auth tables (all 7 tables live in `migrations/0001_initial.sql`; `deoCugHash` was added afterward in `migrations/0002_add_deo_cug_hash.sql`):
- `auth_users` — email hash, name, role ('deo'|'admin'), deoId, districtName, deoCugHash (SHA-256 of CUG mobile number, nullable — alternate login credential)
- `auth_magic_links` — tokenHash, expiresAt, used flag, rate-limit support
- `auth_sessions` — id=sha256(rawId), userId FK, expiresAt (24h)

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

Track which milestone is currently active. Update this table as milestones are completed.

| Milestone | Status | Notes |
|---|---|---|
| M-0: Foundation & Repo Setup | **Completed** | pnpm workspace, CI/CD, wrangler config, D1 databases created and migrated |
| M-1: Schema, Migrations & Worker Skeleton | **Completed** | Drizzle schema (4 tables), 2 migrations applied to dev + prod D1, initial worker skeleton (migrations later consolidated into a single file — see M-10) |
| M-2: Excel Ingestion & Coordinate Engine | **Completed** | Excel parser, DMS→DD converter, revenue formulas, UP bbox validation |
| M-3: Verification UI & IndexedDB | **Completed** | DEO verify page, Dexie.js offline staging, Service Worker + Background Sync PWA |
| M-4: Worker Batch API & D1 Integration | **Completed** | Batch upload, dual-verification, atomic db.batch()/db.transaction() writes |
| M-5: Dashboard, Testing & DEO Handoff | **Completed** | Admin choropleth map (initially 70 GADM polygons, later replaced), Chart.js analytics, audit log, CSV export, 12/12 unit tests passing |
| M-6: Auth Migration + Single Worker | **Completed** | Custom HMAC magic-link auth; Resend email; D1 sessions; all API routes merged into one CF Worker (`up-excise-spatial-revenue-optimizer-web`); no external auth provider |
| M-7: Admin Portal UI Overhaul | **Completed** | District detail: all fields, client-side sort/filter/search/group-collapse/pagination, full type labels, CL5CC filter, circle/sector filter, revenue breakdown; HelpPanel balloon on all pages; ViewPrefsPanel FAB; GeoJSON map replaced with 75-district OSM source; government colour palette; district name labels on map |
| M-8: Admin Portal Navigation & Divisions | **Completed** | /admin/districts page (full 75-district table); /admin/divisions page (18 division cards); /admin/divisions/[division] detail page; clickable breadcrumbs; functional nav search dropdown (districts + divisions, keyboard nav); overview top-10 by revenue + divisions grid; map full-width; charts side-by-side |
| M-9: SPA Navigation Parity & Polish | **Completed** | Full `<a>`→`<Link>`/`router.push()` migration across both portals (admin districts/divisions/overview, DEO home action cards, Leaflet map click handler); DEO layout rewritten to match admin layout (logo links home, `<Link>` nav, `ThemeToggle` removed in favour of the global `ViewPrefsPanel`); navbar brand/logo links to the portal home on both layouts; HelpPanel viewport-overflow auto-flip + scrollable content + z-index raised above Leaflet panes; districts table shows bbox-midpoint coordinates (read-only); district detail "Division" stat links to its division page; dark-mode anti-flash script and `ViewPrefsPanel` now correctly resolve and live-track `'system'` preference; DEO home page stat cards (`HomeStats.tsx`) now read live counts from Dexie/IndexedDB and the units API instead of static placeholders; admin overview map enlarged (660px) with a clearer title; district map labels CSS specificity fixed |
| M-10: District Master & Migration Consolidation | **Completed** | Migrations consolidated from 3 files (`0001_initial.sql` + `0002_drop_premises_consideration_fee.sql` + `0003_auth.sql`) into a single `0001_initial.sql` matching `packages/schema` exactly (all 7 tables), reapplied to prod via `wrangler d1 execute` (filename-based migration tracking made `migrations apply` a no-op); `scripts/seed-districts.ts` (`pnpm seed:districts`) seeds the real 75 UP districts + 18 divisions + bbox into `districts` (sourced from OSM GeoJSON + Wikipedia, cross-verified) — previously only the schema columns existed, never the data; `UP_DIVISIONS` constant added to `packages/schema/src/constants.ts`; new `PATCH /api/admin/districts/[district]` endpoint (atomic, syncs `auth_users`); `/admin/provision` renamed to "District Master" in nav and rebuilt with an all-75-district table, a right-side edit drawer (division dropdown, DEO name/email/identifier, expected vend count, bbox) wired to the PATCH endpoint, and the existing bulk-Excel-provision flow retained below it with `generateProvisionTemplate()` now pre-filling District Name + Division from the live district list; `/admin/districts` table DEO email column removed (search still matches on email, just not displayed) and subtitle wording professionalized; demo DEO test account changed from a fake `clerk_test@up-excise.dev` address to a real `+deo` Gmail alias, and `seed-demo.ts` now also inserts the matching `auth_users` row (previously the demo DEO could never actually log in) |
| M-11: Admin Portal Offline-First Parity | **Completed** | Upgraded Dexie.js admin schema to version 3. Added caching stores for map data, individual district shops, and audit log. Refactored the overview map, district detail shops table, and audit log to use the IndexedDB-first caching pattern. All admin pages now fetch locally before attempting D1 queries, enforcing zero-cost and offline-first compliance. |
| M-12: Excel Template UX & Developer QoL | **Completed** | Refactored the DEO Excel template generator to produce 3 separate sheets (Data Entry, Demo Data, Instructions) to improve DEO UX; consolidated 4 coordinate columns into 2 (`latitude`, `longitude`) accepting either DMS or DD while retaining `latitudeDms` and `longitudeDms` internally as an audit failsafe; added `superadmin` role bypass for `shubhanraj2002@gmail.com` to test both DEO and Admin routes simultaneously; updated Playwright tests for full end-to-end local demo automation. |
| M-13: Admin UX Refresh & Excel Enhancements | **Completed** | Removed 5-minute auto-polling TTLs from Admin cache in favor of manual "Sync from Server" buttons; enhanced `exportXlsx` on District Detail with auto-filters, freeze panes, and an injected "TOTAL" row at the bottom; disabled DEO district Excel upload/verify actions when no units are registered. Overhauled DEO Excel template: fixed JSZip XML validation injection, added merged title rows, froze top panes, and added dynamic dropdowns for circles/sectors driven by a hidden Reference Data sheet. |
| M-14: Single-Library Spreadsheet Rewrite | **Completed** | Replaced SheetJS + hand-patched JSZip XML with ExcelJS as the one spreadsheet library for the entire app (CDN global `window.ExcelJS`, `apps/web/src/lib/excel.ts`) — fixes the corrupted DEO Excel template (missing workbook-level `_xlnm.Print_Titles` defined name from the old XML patch) and removes the SheetJS/ExcelJS duplication. Every generated/exported workbook (`generateTemplate`, `generateProvisionTemplate`, `exportRowsToXlsx`) now gets landscape orientation, fit-to-width printing, a header row repeated on every printed page, frozen header panes, and wrapped cell text. Added shared `readWorkbookRows`/`rowsFromSheet` helpers for reading uploads (DEO district file, admin bulk-provision file). Removed `xlsx` and `jszip` from the CDN stack, Service Worker precache list, and dependencies. |
| M-15: Foolproof Gated DEO Workflow | **Completed** | Rebuilt the DEO portal around a strict, one-step-at-a-time flow so a first-time DEO cannot get lost: `POST /api/districts/[district]/units` is now bulk-only (`{ circles, sectors }`) and rejects with 409 once any unit row exists for the district — the lock is derived from row existence, no schema change. `/units` is a 2-step wizard (enter counts → fill pre-generated name boxes → SweetAlert2-confirmed one-shot submit) replacing the old add-one-at-a-time form. `/home` and the DEO nav bar (`app/(deo)/layout.tsx`) no longer show Upload/Verify at all until units are locked (previously shown greyed-out/disabled). Added a SweetAlert2 confirmation before the final `/verify` district submission. Added Hindi subtitles to DEO portal page titles/step headings (bilingual, DEO-portal-only — admin stays English-only). Darkened `--color-base-content`/`--color-base-300` and deepened primary/secondary/accent in the light theme (`app/layout.tsx`) for stronger contrast. |
| M-16: DEO Portal Polish & Bilingual Excel Template Overhaul | **Completed** | `HelpPanel` (`app/_components/HelpPanel.tsx`) gained optional `titleHi`/`childrenHi` props with an English/हिन्दी tab, shown only when Hindi content is supplied — all four DEO help panels (home, units, upload, verify) fully translated; all seven admin help panels untouched (English-only by design). `/units` circle/sector submission now shows a blocking "Locking circles & sectors…" loader overlay instead of freezing silently; the locked view tells the DEO to contact Admin/HQ for corrections. Added `DELETE /api/districts/[district]/units` (admin/superadmin only, audit-logged as `units_unlocked`) and an "Unlock Circles/Sectors" action on the admin district detail page — the actual recovery path for DEO mistakes. DEO Excel template (`apps/web/src/lib/excel.ts`) header row replaced raw snake_case DB column names (`basic_license_fee_blf`) with bilingual human-readable labels; parsing switched from header-text matching to fixed column-position mapping (`rowsFromSheetByPosition`) so the visible label is fully decoupled from field identity. Added per-cell Excel data validation gating every financial column to the shop types it applies to per the Revenue Formulas table (e.g. `basic_license_fee_blf` only accepts input when `shop_type = COUNTRY_LIQUOR`) — enforced by Excel itself, not just the Worker on upload. The Shop Type dropdown itself shows friendly labels ("Model Shop", "Country Liquor"...) instead of the raw `MODEL_SHOP`/`COUNTRY_LIQUOR` enum constants — `parseExcelFile` maps the friendly label back to the exact enum string via a reverse lookup (`SHOP_TYPE_REVERSE`) before it reaches `StagedRow`/the Worker, so the backend enum contract in "Shop Type Enum" is unchanged. `has_cl5cc` is now gated the same way as the financial fields — Excel rejects `true` unless that row's Shop Type is Country Liquor, matching the "CL5CC Rule". "Reference Data" sheet hidden (`ws.state = 'hidden'`) rather than removed — it still feeds the circle/sector dropdown's list-validation range, which Excel requires to live in an actual cell range, but is no longer a visible redundant tab — and sheet-protected read-only (`ws.protect('', {...})`, no password — a guardrail, not a security boundary) so it can't be accidentally edited even if unhidden, since it's rebuilt fresh from the live units list on every download. Instructions sheet fully translated to Hindi; Thana Name and Adjacent Thanas Instructions copy corrected twice — first to stop claiming a non-enforced "Excise-authoritative, not police" distinction and to stop describing adjacency as district-wide, then again to stop overclaiming enforcement: the portal has no state-wide Thana-to-district master list (Pre-Campaign Blocker #3), so the actual check is client-side only — the Verify page (`app/(deo)/verify/page.tsx`) flags an adjacent-Thana name red if it isn't already present in that district's own uploaded `thanaName` values; nothing is server-rejected or blocked from submission. |
| M-17: CUG Login, API Error Handling & Atomicity Hardening | **Completed** | Added `deo_cug_hash` column to `auth_users` (migration `0002_add_deo_cug_hash.sql`) and a `POST /api/auth/verify-cug` route so a DEO can sign in with their department CUG mobile number (hashed client-side, SHA-256, never sent raw) as an alternate to magic-link email — unblocks login while `RESEND_FROM_EMAIL`'s domain isn't verified. `/login` gained an Email/CUG toggle (`app/login/_components/LoginForm.tsx`), defaulting to the CUG tab. `scripts/seed-deo-accounts.ts` parses department contact sheets (`scripts/data/deo-contact.csv`, `deo-emails.csv` — raw PII, gitignored, never committed) and seeded all 75 real DEO accounts into prod D1, including Bhadohi (its designation string still carries the pre-renaming "Sant Ravidas Nagar" prefix — mapped to `Bhadohi`, the current name used throughout D1, not the deprecated one). Added `apps/web/src/lib/with-error-handling.ts` (`withErrorHandling` wrapper — see "API Error Handling" below) and applied it to all 25 non-trivial API routes, so an unhandled exception now returns this app's own `{ error }` JSON 500 instead of Next's default non-JSON error response. Fixed the one atomicity gap found across all routes: `bulk-provision`'s per-row `districts` insert + `auth_users` insert were two separate `await`s (a partial failure could leave them inconsistent) — now wrapped in `db.transaction`. Seeded a test CUG onto the "Demo DEO Officer" `auth_users` row (raw digits only in the `DEMO_CUG` Worker secret) with `role` changed to `admin` so one login can reach both portals for testing. |
| M-18: Audit Log UI Overhaul | **Completed** | Rebuilt `/admin/audit` (`app/(admin)/admin/audit/page.tsx`) to match the feature set of the sibling `excise-revenue-recovery-portal` project's audit page, in this project's own DaisyUI idiom rather than a literal visual copy: human-readable event-type and metadata-key labels (`EVENT_LABELS`/`METADATA_KEY_LABELS`), an event-type filter dropdown, a newest/oldest sort toggle (both client-side over the currently loaded page, matching the sibling's approach), a manual "Sync from Server" button (`adminAuditCache.invalidate()`, mirroring the M-13 manual-sync pattern used elsewhere in the admin portal), and loading-skeleton rows. `GET /api/admin/audit-log` gained opportunistic 45-day retention pruning on every read (deletes rows older than the cutoff before returning the page) — closes the "deferred cron trigger" gap noted below, since this table's only consumer is this one page. Follow-up pass over the rest of the app for the same "sibling project has better UX" gaps: `/units` (`app/(deo)/units/page.tsx`) — replaced two plain "Loading…" text lines with skeleton blocks, and added inline "Required" text under blank name boxes (previously only a red border, no text, once the DEO tried submitting incomplete data). `/admin/provision` (District Master) — replaced a native browser `confirm()` in `resetTestData()` with a `SweetAlert2` dialog (the native dialog was a direct violation of CLAUDE.md's own "SweetAlert2 for every irreversible action" rule), added a `SweetAlert2` confirmation before `provision()` sends real magic-link emails to the addresses in the preview table (previously fired with no confirmation step at all), and replaced the table's loading spinner with skeleton rows matching `/admin/districts`'s pattern. |
| M-19: Admin Name/Designation Display | **Completed** | Added `auth_users.designation` (migration `0003_add_designation.sql`, nullable, additive — applied to prod D1 before the code deploy so the already-live worker never queried a column that didn't exist yet). Admin navbar (`app/(admin)/layout.tsx`'s new `AdminIdentity`) now shows the signed-in admin's name and designation instead of nothing at all; falls back to "Superadmin"/"Admin" by role when designation is unset. No email-on-hover tooltip — this project's Zero-Knowledge PII design means no plaintext email is ever available to show. While wiring this up, found and fixed two real bugs surfaced by the type change: (1) `SessionInfo.email` was declared but never actually populated by `GET /api/auth/session`, so `/admin/provision`'s Danger Zone gate (`session?.email === SUPERADMIN_EMAIL`) had silently never rendered for anyone — replaced with `session?.role === 'superadmin'`; (2) that same file and `api/admin/reset-test-data/route.ts` both hardcoded the superadmin's plaintext email as a dead/redundant local constant, a direct violation of the "Superadmin Configuration" hard constraint below — removed both, the server-side check already correctly used `SUPERADMIN_EMAIL_HASH`. |
| M-20: Audit Actor Identity & Owner-Only District Master | **Completed** | Ported four gaps found by comparing against the sibling `excise-revenue-recovery-portal` project. (1) **Owner-only District Master:** `/admin/provision` (DEO reassignment + bulk-provisioning, which sends real magic-link emails) is now restricted to `role: 'superadmin'` — the nav link is hidden for a plain `admin` session, direct navigation renders a restricted message, and `PATCH /api/admin/districts/[district]` + `POST /api/admin/bulk-provision` independently 403 non-superadmins server-side (client hide is UX only, the API check is the real boundary) — this matters more now that multiple department admin accounts exist beyond the superadmin. (2) **Audit actor identity:** added `audit_log.actorName`/`actorDesignation` (migration `0004_add_audit_actor_identity.sql`, nullable, additive), populated at write time for every admin/superadmin-initiated event; previously the audit table's only actor column was `deoId`, which is empty for admin actions, so e.g. "Circles/Sectors unlocked" rendered with a blank actor. `/admin/audit`'s new `describeActor()` prefers `actorName`(+designation), falling back to `deoId`. (3) **Missing login/logout events:** `login` (magic link, `api/auth/verify/route.ts`) and `logout` (`api/auth/logout/route.ts`) are now actually written to `audit_log` — both event types were documented in the schema comment and the audit page's label map for milestones but never wired to an insert anywhere. (4) **Unaudited admin writes:** `PATCH /api/admin/districts/[district]` (`district_master_updated`) and `POST /api/admin/bulk-provision` (`bulk_provision`, one summary row per run) now write an audit row — metadata records which fields changed / row counts, never raw emails, keeping the Zero-Knowledge PII rule intact even in audit metadata. |
| M-21: DEO Excel Template Overhaul, Admin Navbar Fix & Adjacent-Thana Honesty Fix | **Completed** | **Excel template** (`apps/web/src/lib/excel.ts`, `generateTemplate`): removed the "Demo Data" sheet — DEOs mistook its example rows for a second copy of their own data (now 3 sheets: Data Entry, Instructions, Reference Data, down from 4). The Data Entry header row is now sheet-protected and cell-locked (no password, same guardrail-not-security-boundary pattern as Reference Data) so it can't be overtyped; every data cell stays unlocked via a column-level default set *before* any header cell is styled (`ws.columns=...` + `ws.getColumn(c).protection={locked:false}` first, header `cell.protection={locked:true}` after — reversing this order silently unlocks the header too, since ExcelJS's `Column.protection` setter walks every already-existing cell in that column and overwrites its protection; verified empirically against the pinned exceljs@4.4.0 by inspecting the generated OOXML). Every header cell now carries a hover tooltip (`cell.note`, an Excel cell comment) with that field's rules, derived programmatically from `COLUMN_GUIDE` (`HEADER_HELP`) so the two can't drift apart. `adjacent_thanas_raw`'s header and Instructions-sheet copy both gained a concrete example (`e.g. Kotwali, Hazratganj`). Verified end-to-end (not just typecheck/build) by downloading the real template from a running dev server via Playwright and inspecting the resulting XML/comments/styles directly. **Admin + DEO navbar layout bug:** both `app/(admin)/layout.tsx` and `app/(deo)/layout.tsx` had a nav-button container styled `flex-none gap-1` with no `display:flex` of its own — `flex-none` only controls how that div behaves *as a child* of the parent navbar's flex layout, it doesn't make the div's own children lay out as a flex row, so the buttons were rendering as plain inline content and wrapping like text once total width ran out (visible as the admin identity pill + Sign out breaking onto a second line). Predates this session (confirmed via `git diff` — untouched by M-20's edits to the same file) but was reported live and fixed: both containers now `flex-none flex items-center flex-wrap justify-end gap-1`, verified via a real Playwright screenshot of the deployed navbar. **Adjacent-Thana enforcement honesty fix:** the verify page's red-pill tooltip said "Cross-district adjacency — must be removed," and CLAUDE.md's own "Adjacent Thana Cross-District Rule" claimed this was "enforced... by the Worker" — both false. `districtThanas` (`app/(deo)/verify/page.tsx`) is built only from the current DEO's own district's own rows (staged or uploaded) — it has no access to any other district's data and there is no state-wide Thana master list (Pre-Campaign Blocker #3) to validate against, and the Worker (`upload/chunk/route.ts`) never validates `adjacentThanasRaw` at all. A red pill only means the name doesn't yet appear as a `thanaName` elsewhere in that same district's own dataset — a same-district, same-upload typo-catching heuristic, not cross-district detection, and it does not block submission (`canSubmit` has no dependency on it). Reworded the tooltip, the `districtThanas` code comment, both English/Hindi Help Panel paragraphs, CLAUDE.md's own "Adjacent Thana Cross-District Rule" section, and — caught in a follow-up pass since it feeds both the Instructions sheet row and the new header hover tooltip (`HEADER_HELP` is derived from `COLUMN_GUIDE`) — the `adjacent_thanas_raw` entry in `excel.ts`'s `COLUMN_GUIDE`, which still said "the portal flags any name it doesn't recognize" without clarifying it's a same-district-only, non-blocking, non-master-list check. |
| M-22: Prod Go-Live Cleanup & Custom Domain | **Completed** | **Prod D1 fresh start:** deleted all test/demo state ahead of the real campaign — every `phase1_raw_collection` row, every `district_circles_sectors` row (Ayodhya/Lucknow/Demo District test units), all `audit_log` rows, the "Demo DEO Officer" `auth_users` row and its `auth_sessions`/`auth_magic_links` (had to be deleted before the row itself, or the FK on `auth_sessions.user_id` rejects it), and the `Demo District` row from `districts` entirely — not just truncated, since the demo campaign phase is over. All 75 real districts' master data (bbox, DEO name/email/CUG hash) and all 6 admin accounts were left untouched; the owner's own `auth_users` row also had its stale `deo_id`/`district_name` (leftover from when it pointed at Demo District) nulled out. `districts.status` reset to `pending` for all rows. **Admin navbar:** removed the "DEO Portal" quick-switch `<Link>` from `app/(admin)/layout.tsx` — it existed only to test the Demo DEO Officer's dual-portal (`admin` role reaching DEO pages) bypass, which no longer has an account to test with. **Custom domain:** migrated `exciseup.in`'s DNS zone from Google nameservers (leftover from the Google Domains → Squarespace registrar transfer) to Cloudflare, preserving Google Workspace email (MX/SPF/DMARC) and Resend's `mail.exciseup.in` record, and disabling DNSSEC before the nameserver switch and re-enabling it after (skipping this ordering would have broken domain resolution mid-migration). Hit and documented one real regression: Cloudflare's DNS auto-scan did not correctly preserve `mail.exciseup.in`'s original `CNAME → ext-sq.squarespace.com` record. Added `apps/web/wrangler.jsonc`'s `routes: [{ pattern: "sro.exciseup.in", custom_domain: true }]` — chosen name deliberately reads "SRO" (Spatial Revenue Optimizer) rather than "Excise Portal," since that name is already used by the sibling `excise-revenue-recovery-portal` project. `apps/web/app/login/actions.ts`'s `ALLOWED_HOSTS`/`FALLBACK_HOST` (the open-redirect guard that builds magic-link email URLs) updated to `sro.exciseup.in`. The old `*.workers.dev` URL is now disabled — Cloudflare's default behavior once a `custom_domain` route exists on a Worker. Full migration steps documented in DEPLOY.md's "Custom Domain Migration" section for reference during any future domain work. |
| M-23: Circle Numbering Convention (Rural vs. Urban) | **Completed** | Fixed `/units`' circle name placeholders (`Circle N`) to reflect the department's real numbering rule: sectors cover a district's urban area, circles cover its rural area, and "Circle 1" is conceptually reserved for the sector-covered urban area. If a district registers zero sectors (purely rural), circle placeholders start at "Circle 1" as before. If a district registers any sectors, circle placeholders now start at "Circle 2" — "Circle 1" is never issued to a rural circle. Implemented as a pure client-side placeholder convention (`circleNumber(i)` helper in `apps/web/app/(deo)/units/page.tsx`, driven off `sectorNames.length`) — the DEO always types the real unit name into the box regardless of placeholder, and the API/schema (`POST /api/districts/[district]/units`, `district_circles_sectors`) store whatever free-text name was submitted with no numbering logic of their own, so no migration or backend change was needed. Both English and Hindi help-panel copy on `/units` updated to state the rule explicitly. |
| M-24: Self-Service Unlock Requests & Login-Page ViewPrefs Cleanup | **Completed** | **Unlock requests** (parity with the sibling `excise-revenue-recovery-portal` project's `unlock_requests` feature, no PDF attachment since this project has no R2 binding and none was requested): new `district_unlock_requests` table (migration `0005_add_unlock_requests.sql`) — `pending`\|`approved`\|`denied`, one reason string, no attachment. `/units`' locked view now shows a "Request Unlock" button (SweetAlert2 textarea, reason required) instead of only a "contact your Admin" message; `POST /api/districts/[district]/request-unlock` rejects if not yet locked or if a pending request already exists, and the page polls `GET` on load to show a pending/denied banner. New `/admin/unlock-requests` page (nav link added to `app/(admin)/layout.tsx`, IndexedDB-first per the "Admin Data Loading" rule — `adminUnlockRequestsCache` in `db.ts`, manual "Sync from Server" button) lists every request; approve/deny both require the admin to type their own note (`POST /api/admin/unlock-requests/resolve`) — approving deletes the district's `district_circles_sectors` rows (identical effect to the pre-existing manual `DELETE /api/districts/[district]/units` unlock) and audit-logs `units_unlocked`; denying audit-logs the new `unlock_request_denied` event. Open to plain `admin`, not owner/superadmin-gated, matching the existing manual-unlock access level. `/admin/audit`'s `EVENT_LABELS`/`METADATA_KEY_LABELS` extended with the new event and `reason`/`note` metadata keys. **ViewPrefsPanel on login:** the theme/font/density/width customization FAB was appearing on `/login` and `/auth/verify` before a user is even signed in. `ViewPrefsPanel.tsx` now reads `usePathname()` and renders nothing on those two routes — the anti-flash inline script in `layout.tsx` (unaffected, always runs) still resolves the correct theme from `localStorage`/OS preference before first paint, so login/verify still respect the device's theme, just without a visible customization control. |
| M-25: Bilingual DEO User Manual (PDF) & Manual-Generation E2E Tests | **Completed** | Added `docs/manual/DEO-User-Manual.pdf` — a 21-page bilingual (English/Hindi) step-by-step DEO user manual with real portal screenshots, generated (not hand-authored) by two new Playwright specs: `apps/web/tests/manual-screenshots.spec.ts` walks the entire DEO flow (login → home → circles/sectors wizard → lock confirmation → download template → upload → verify → submit → unlock request) against a real seeded district (Agra — Demo District no longer exists post-M-22) on local D1, saving 17 numbered screenshots plus the actual downloaded district template (`page.waitForEvent('download')`) to a temp path; `apps/web/tests/build-manual-pdf.spec.ts` turns these into the PDF via Chromium's own `page.pdf()` (no new PDF library). The template-columns section (`Section 10`) is read directly from the real downloaded template's own "Instructions" sheet — not a hand-maintained copy — so it can never drift from `apps/web/src/lib/excel.ts`; it explicitly documents the Adjacent Thanas comma-separated multi-name format (e.g. `Fatehabad, Hariparvat, Sadar Bazar`) since that format is easy to get wrong. `Section 11` documents the per-shop-type revenue formulas (mirroring this file's own "Revenue Formulas" table) and the browser/server dual-verification check. **Real bug found and fixed while building this:** `getSession()` (`apps/web/src/lib/auth.ts`) hardcoded the superadmin-bypass session's `districtName` to the literal `'Demo District'` regardless of the account's actual assigned district, inconsistent with `api/auth/verify/route.ts`'s own `user.districtName ?? 'Demo District'` fallback — since Demo District no longer exists in prod (M-22), this silently broke the bypass account's ability to reach any DEO page in production; fixed to `row.districtName ?? 'Demo District'`. `playwright.config.ts`'s `baseURL` now reads `PLAYWRIGHT_TEST_BASE_URL` (falls back to `http://localhost:3000`) since these new specs must run against the OpenNext Cloudflare **preview** server (`npx @opennextjs/cloudflare preview`, with a local-only `.dev.vars`), not plain `next dev` — plain `next dev` has no D1/secrets binding at all (`getCloudflareContext()` throws), a gap invisible until this work actually exercised the auth routes against a fresh `next dev` process; documented in TEST.md along with the full regeneration steps. The DEO Dashboard's (`/home`) `HelpPanel` now links to the manual — `https://raw.githubusercontent.com/SubhanRaj/up-excise-spatial-revenue-optimizer/main/docs/manual/DEO-User-Manual.pdf`, fetched from GitHub (public repo) rather than served from the Worker, since it's a static reference doc regenerated ad hoc rather than something that needs bundling or a redeploy to update. Removed the "SIBIN Tech Solutions" co-branding line from the magic-link email footer (`apps/web/src/lib/email.ts`) and the manual's cover page — retained only in this file's own "Project Identity" table and other `.md` docs, per instruction. |
| M-26: Fixed Circle/Sector Number Prefix, Excel Column Resize Fix & SW Cache Bump | **Completed** | **Unit numbering is now a fixed UI element, not editable text:** many DEOs were typing only the Inspector-supplied area name into `/units`' Step 2 boxes and dropping the circle/sector number entirely, leaving no way to tell which unit a shop belongs to. Went through two iterations — first tried pre-filling the (still free-text) box with `Sector 1 - ` and regex-validating the prefix stayed intact, but this was still editable and error-prone ("so much spoon feeding" — user's words). Final design: each row shows a non-editable `Sector 1 -` / `Circle N -` label (`apps/web/app/(deo)/units/page.tsx`) next to an input that holds **only** the area name, which is mandatory (`allFilled`/`canSubmit` require every box non-blank). `submitUnits()` builds the full stored name server-side as `` `Sector ${i+1} - ${areaName.trim()}` `` / `` `Circle ${circleNumber(i)} - ${areaName.trim()}` `` — the DEO can no longer touch, drop, or mistype the number at all. **Excel column resize:** the DEO Excel template's Data Entry sheet (`apps/web/src/lib/excel.ts`, `buildShopDataSheet`) had `formatColumns: false` in its `ws.protect(...)` call — the OOXML flag that blocks Excel's "Format → Column Width" even on unlocked data cells. Changed to `formatColumns: true`; header cells stay uneditable regardless, since that's governed by a separate per-cell `locked: true` in `styleHeaderRow()`, not by `formatColumns`. **Service worker cache bump:** `apps/web/public/sw.js`'s `CACHE` constant bumped `excise-v2` → `excise-v3` — found while investigating a reported `/verify` hang whose underlying infinite-toggle bug had already been fixed on 2026-07-11 (`b79320c`) but shipped without a cache-name bump, so a browser with the app's JS already cached could keep running the stale pre-fix bundle indefinitely (the SW's fetch handler opportunistically caches every same-origin GET, including `_next/static/*` chunks, under one static cache name not tied to deploys — see "PWA & Offline" below, which only documented CDN-asset pre-caching). |

See [roadmap.md Section 6](roadmap.md#6-development-milestones--action-plan) for full milestone specs, entry/exit criteria, and deliverable checklists.

---

## Pre-Campaign Blockers

The following are unresolved department-side decisions that block specific milestones. Do not implement the affected features until these are resolved.

1. **DEO email addresses** — Resolved for 74 of 75 districts via `scripts/seed-deo-accounts.ts` (department contact sheets). Bhadohi's designation string uses a deprecated pre-renaming district name with no mapping entry — provision it manually via the admin District Master page.
2. **Excel template column layout** — column mapping cannot be built until column names and order are locked.
3. **Thana master list** — blocks the adjacent Thana cross-district filter (best-effort; proceed with runtime check if unavailable).
4. **Shop count estimates per district** — blocks dashboard "X of Y uploaded" progress metrics.
5. **DEO credential and identifier assignment** — `deoId` now auto-assigned as `DEO-<DISTRICT-NAME>` by `seed-deo-accounts.ts` for all 75 districts. DEO *names* are still English placeholders (`"<District> DEO"`) — the source contact sheet's names are in Hindi, which this project's Data Language rule forbids storing; correct real names via the admin District Master page. Provisioning still sends magic-link emails to DEO addresses (or DEOs can sign in with their CUG number — see "CUG-hashed login"). DEOs must also complete circle/sector pre-registration before distributing templates to Inspectors.
6. **Circle/sector naming convention** — DEOs need a consistent naming standard so pre-registered unit names are clean and unambiguous across all 75 districts.
7. **Upsert vs. versioning decision** — blocks M-4. If a DEO re-uploads a district, does the system overwrite or version the records?
8. **Custom email domain** — resolved. `mail.exciseup.in` verified in Resend; `RESEND_FROM_EMAIL` is `noreply@mail.exciseup.in`. Same domain/sender reused for the sibling `excise-revenue-recovery-portal` project's `FROM_EMAIL` secret (different env var name there — see that repo's CLAUDE.md). Magic-link email is scoped to Admin/HQ login only — DEOs use CUG login.
9. **DoT SMS template approval** — in progress, for a DEO login-OTP SMS text. Not a blocker for launch (CUG-hash login already works); see roadmap.md's Backlog section for the planned SMS-OTP upgrade once approved.

---

## localStorage Keys — Authoritative Registry

All `localStorage` keys used by the portal, their owning component, and what they store. Do not add new keys without updating this table.

| Key | Owner | Value |
|---|---|---|
| `theme` | `ViewPrefsPanel.tsx` | `'light'` \| `'dark'` \| `'system'` — persists user's theme mode; `'system'` re-evaluates OS preference on load |
| `excise-view-prefs-v1` | `ViewPrefsPanel.tsx` | JSON: `{ fontSize, density, width }` — font size, row density, content width |
| `help_done_{pageKey}` | `HelpPanel.tsx` | `'true'` when user has dismissed the help badge for that page |
| `admin-page-size` | District detail page | `'10'` \| `'25'` \| `'50'` \| `'100'` \| `'all'` — persists rows-per-page selector |
| `admin-group-by-type` | District detail page | `'true'` \| `'false'` — persists group-by-type toggle state across navigation |
| `admin-group-{districtName}` | District detail page | JSON array of open group type strings — which shop-type groups are expanded |

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

- Hotel/restaurant bars, commercial lounges, banquet hall licenses, wholesale distribution.
- Phase 2 boundary optimization logic (Inspector assignment algorithms, Voronoi-style territory splitting, etc.).
- Password-based authentication. The system is magic-link only — no password fields, no password reset flows.
- Inspector-level portal access. Inspectors fill Excel files and hand them to the DEO. They have no accounts and no portal access.
- Self-registration for DEO accounts. All accounts are provisioned by the administrator from the department email list.
- Small-screen mobile (< 768px) optimized layouts. Do not build or suggest responsive layouts for phones.
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
