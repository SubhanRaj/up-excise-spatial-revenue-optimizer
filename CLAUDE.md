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

### Pinned Versions and CDN URLs Are Deliberate

Every version in the Technology Stack table is tested and pinned. Do not change any CDN URL or version number, install CDN libraries as npm packages, or suggest "let's try the latest version." If a library is not rendering correctly, compare the URL in the code against this file — the URL here is correct; the code is wrong.

---

## Project Identity

| Field | Value |
|---|---|
| **Project** | State Excise Portal — Spatial & Revenue Optimization System |
| **Client** | Department of Excise, Government of Uttar Pradesh |
| **Consulting Firm** | SIBIN Tech Solutions |
| **Lead Engineer** | Subhan Raj |
| **AI Co-Author** | Claude Sonnet 4.6 (Anthropic) |
| **Active Phase** | Phase 1 — Comprehensive Data Collection Pipeline |
| **Roadmap** | [roadmap.md](roadmap.md) — read this for full architectural context |

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
| `/admin/provision` | `app/(admin)/admin/provision/page.tsx` | `admin` |
| `/admin/audit` | `app/(admin)/admin/audit/page.tsx` | `admin` |
| `/admin/export` | `app/(admin)/admin/export/page.tsx` | `admin` |
| `/admin/districts/[district]` | `app/(admin)/admin/districts/[district]/page.tsx` | `admin` |

**How Next.js App Router derives URLs:** route groups `(name)` are stripped; every other folder becomes a URL segment; `[param]` is a dynamic segment.

**Past blunder:** `(admin)/provision/page.tsx` was created, producing URL `/provision` — navbar linked to `/admin/provision` → 404. The route group was stripped but `admin/` was never added. This table prevents repeating that.

#### Next.js API Route Handlers (`apps/web/app/api/`)

All API routes are Next.js Route Handlers inside the single `up-excise-spatial-revenue-optimizer-web` Worker. They access D1 via `getCloudflareContext()` and verify auth via the session cookie (`getSession()`). No separate API worker exists.

**Public:**

| Method | Path | File |
|---|---|---|
| `GET` | `/api/healthz` | `api/healthz/route.ts` |
| `GET` | `/api/auth/session` | `api/auth/session/route.ts` — returns `{ deoId, role, districtName, name }` |
| `POST` | `/api/auth/logout` | `api/auth/logout/route.ts` |

**DEO (`role: deo`):**

| Method | Path | File |
|---|---|---|
| `POST` | `/api/upload/chunk` | `api/upload/chunk/route.ts` — 500-row batch insert via `db.batch()` |
| `GET` | `/api/districts` | `api/districts/route.ts` |
| `GET` | `/api/districts/[district]/units` | `api/districts/[district]/units/route.ts` |
| `POST` | `/api/districts/[district]/units` | `api/districts/[district]/units/route.ts` |
| `GET` | `/api/districts/[district]/template` | `api/districts/[district]/template/route.ts` |
| `GET` | `/api/districts/[district]/status` | `api/districts/[district]/status/route.ts` |
| `GET` | `/api/districts/[district]/shops` | `api/districts/[district]/shops/route.ts` |
| `POST` | `/api/districts/[district]/submit` | `api/districts/[district]/submit/route.ts` |

**Admin (`role: admin`):**

| Method | Path | File |
|---|---|---|
| `GET` | `/api/admin/districts` | `api/admin/districts/route.ts` — 75-row aggregate |
| `GET` | `/api/admin/districts/[district]` | `api/admin/districts/[district]/route.ts` |
| `GET` | `/api/admin/districts/[district]/shops` | `api/admin/districts/[district]/shops/route.ts` |
| `GET` | `/api/admin/districts/[district]/export` | `api/admin/districts/[district]/export/route.ts` |
| `GET` | `/api/admin/export/all` | `api/admin/export/all/route.ts` |
| `GET` | `/api/admin/map-data` | `api/admin/map-data/route.ts` |
| `GET` | `/api/admin/search` | `api/admin/search/route.ts` |
| `POST` | `/api/admin/bulk-provision` | `api/admin/bulk-provision/route.ts` |
| `GET` | `/api/admin/audit-log` | `api/admin/audit-log/route.ts` |

> **Note:** The daily cron trigger (audit log purge, 45-day retention) is deferred. With single-worker architecture and @opennextjs/cloudflare v1, the generated worker.js does not expose a `scheduled` export hook. Add when either: (a) @opennextjs/cloudflare adds scheduled handler support, or (b) a separate 3-line cron worker is justified. At 75 users, audit log growth is negligible.

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
| Frontend deploy adapter | `@opennextjs/cloudflare` | latest — builds Next.js as a Cloudflare Worker (NOT Pages) |
| Database | Cloudflare D1 (SQLite) | `db.batch()` for all multi-row writes; bound to `up-excise-spatial-revenue-optimizer-web` |
| ORM | Drizzle ORM | D1 adapter, schema at `packages/schema/src/phase1.ts` + `packages/schema/src/auth.ts` |
| Authentication | Custom HMAC magic-link | No external auth provider. Magic links via Resend → D1 sessions → session cookie auth |
| Email | Resend | Magic-link delivery. Initially `onboarding@resend.dev`; switch to custom domain when verified. |
| Testing | Vitest + Playwright | unit tests for revenue calc + coord converter |

### Authentication Architecture

The portal uses a **two-cookie design** — no external auth provider, no separate API worker:

1. **Session cookie** (`excise-session`): `rawId.hmacSig` where `hmacSig = HMAC-SHA256(rawId, SESSION_SECRET)`. HttpOnly, Secure, SameSite=Lax, 24-hour expiry. Set on `/auth/verify` after consuming a valid magic link. Stored as SHA-256 hash in D1 `auth_sessions`.

2. **Role cookie** (`excise-role`): `deo` or `admin`. Client-readable, used by `middleware.ts` for routing (DEO routes vs admin routes). Not a security boundary — the security check is in server layouts via `requireAuth()` and in route handlers via `getSession()`.

All API routes are same-origin Next.js Route Handlers. The browser sends the session cookie automatically — no Bearer tokens, no API tokens. Route handlers call `getSession()` which verifies the HMAC and does a D1 lookup.

**Magic-link flow:**
1. DEO enters email on `/login` → server action `requestMagicLink()` validates email against `auth_users`, rate-limits (3/15min), generates UUID token, stores SHA-256 hash in `auth_magic_links`, sends link via Resend.
2. DEO clicks link → `/auth/verify?token=xxx` → server component verifies hash, marks used, creates `auth_sessions` record, sets cookies → redirects to `/home` or `/admin`.
3. Client pages call `/api/auth/session` on mount → route handler verifies session cookie → returns `{ deoId, name, role, districtName }`. No token issued.
4. Client calls all `/api/*` routes directly — session cookie authenticates automatically.

**Auth tables in D1** (`packages/schema/src/auth.ts`):
- `auth_users` — email, name, role, deoId, districtName (populated during bulk-provision)
- `auth_magic_links` — tokenHash, expiresAt, used flag
- `auth_sessions` — id=sha256(rawId), userId, expiresAt (24h)

**CF worker bindings required** (`up-excise-spatial-revenue-optimizer-web`):
- `DB` — D1 database
- `SESSION_SECRET` — for session cookie HMAC
- `API_SECRET` — reserved (used internally; not currently used for inter-service auth since single worker)
- `RESEND_API_KEY` — for magic link emails
- `RESEND_FROM_EMAIL` — sender address (start with `onboarding@resend.dev`)

### Frontend CDN Stack (loaded at runtime, never bundled)

> All CDN assets are loaded in `apps/web/app/layout.tsx` as `<script src="...">` and `<link>` tags in `<head>`. Never install these as npm packages. Never use dynamic loading — all libraries must be explicit tags in the root layout so they are available as globals on every page before React hydration.

| Library | Version | CDN URL | Used in |
|---|---|---|---|
| **DaisyUI** | **5.6.3** | `https://cdn.jsdelivr.net/npm/daisyui@5.6.3/daisyui.css` | All pages |
| **Tailwind CSS** | **v4** (`@tailwindcss/browser`) | `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4` | All pages |
| **Dexie.js** | 4.0.10 | `https://cdn.jsdelivr.net/npm/dexie@4.0.10/dist/dexie.min.js` | All pages |
| **SweetAlert2** | 11.14.5 | `https://cdn.jsdelivr.net/npm/sweetalert2@11.14.5/dist/sweetalert2.all.min.js` | All pages |
| **Notyf** (JS + CSS) | 3.10.0 | `https://cdn.jsdelivr.net/npm/notyf@3.10.0/notyf.min.{js,css}` | All pages |
| **SheetJS** (`xlsx`) | **0.18.5** | `https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js` | All pages |
| **Chart.js** | **4.4.7** | `https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js` | All pages |
| **Leaflet.js** (JS + CSS) | **1.9.4** | `https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.{js,css}` | All pages |

**Critical version constraints:**
- **DaisyUI 5 requires Tailwind v4.** Never pair DaisyUI 5 with Tailwind v3. They use incompatible layer architectures. `cdn.tailwindcss.com` serves Tailwind v3 — do not use that URL.
- **DaisyUI themes** must be built-in names: `light` or `dark`. Custom names silently produce no styling.
- **Tailwind utilities** (`flex`, `text-center`, `p-4`, etc.) come from the Tailwind v4 CDN script. DaisyUI color utilities (`bg-base-200`, `text-primary`) come from the DaisyUI CSS file.

**Theme system (dark/light mode, no flash):**
- An inline `<script>` in `apps/web/app/layout.tsx` runs before first paint: reads `localStorage.getItem('theme')` and sets `data-theme` on `<html>`. This eliminates the white flash on dark-mode load.
- `data-theme` must only ever be set on `<html>` — **never on child `<div>` elements**. A `data-theme` attribute on any descendant overrides the root and breaks the anti-flash script.
- The `ThemeToggle` component (`app/_components/ThemeToggle.tsx`) is the only place that writes `data-theme` and `localStorage`. Toggle by setting `document.documentElement.setAttribute('data-theme', ...)`.
- Valid values: `light` and `dark` only.

### Icons & Fonts

| Layer | Technology | How to use |
|---|---|---|
| Icons | Tabler Icons | Inline SVG paths from [tabler.io/icons](https://tabler.io/icons). No icon libraries, no emoji as icons, ever. |
| Font | Inter (Google Fonts) | `<link>` in root `layout.tsx`. Never bundle. |

---

## Hard Constraints — Never Violate These

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
- The admin portal default view **never loads shop rows**. The district summary list is 75 aggregate rows (name, vend count, total annual revenue, status) plus an "All State" totals row at the bottom. Built from `COUNT`/`SUM` aggregates — no row-level data.
- The state totals aggregate is **pre-computed server-side** on each `district_submitted` event and **cached in admin IndexedDB** (`admin_state_totals`, 15-min TTL). The summary page never runs a fresh full-table aggregate within the TTL window.
- Shop rows are loaded **only when an admin drills into a specific district**. The route is `GET /api/admin/districts/:district/shops` (paginated, 100 rows/page). All pages for that district are cached in admin IndexedDB (`admin_district_cache`, 1-hour TTL).
- Full-state UI table (~30K shops in one view) is **not a supported operation**. The only full-state path is `GET /api/admin/export/all` — a chunked `.xlsx` Excel file download. It triggers a file download, never a UI render.

### Database Writes — Always Atomic
- Any Worker route that performs **two or more related writes** (e.g., insert row + insert audit log, update status + insert audit log) must wrap them in a single atomic operation.
- Use `db.batch([stmt1, stmt2, ...])` when all statements are inserts/upserts and can be built upfront — batch is preferred for chunk uploads (revenue rows + audit log in one round-trip).
- Use `db.transaction(async (tx) => { ... })` when statements depend on prior reads or contain conditional logic (unit registration, district submission).
- Never leave two related writes as separate `await` calls — if the second fails, the first cannot be rolled back and the database is left inconsistent.
- External I/O (Resend email calls in bulk-provision) cannot participate in a D1 transaction. Write DB state first, then send emails; on email failure, log the error in the result but do not roll back the already-committed DB row.

### Cloudflare Free Tier
- The Worker must never perform CPU-heavy work. Excel parsing, DMS-to-DD conversion, and revenue calculation all happen **in the browser**.
- Batch inserts use `db.batch()`. Never issue individual `INSERT` calls in a loop.
- Upload chunks are 500 rows per POST request. Do not increase this without re-evaluating D1 write quota.
- Dashboard queries must use indexed columns only: `district_name`, `thana_name`, `shop_id`. Full table scans are not acceptable in production.
- The `districts` reference table (75 rows) may be queried freely — it is metadata-only and never contains shop data.

### CDN-First — Bundle Contains Only App Logic
- DaisyUI, Tailwind v4 browser CDN, SheetJS, Dexie.js, SweetAlert2, and Notyf are all loaded from jsDelivr CDN at runtime. Never install these as npm dependencies or bundle them into the Next.js output.
- The Next.js bundle contains: React, Next.js App Router runtime, and app-specific TypeScript components. No auth SDK, no UI component library.

### PWA & Offline
- IndexedDB writes happen synchronously with every user action. The network upload is always secondary. Data is never at risk from a connectivity event.
- Connection loss, network change, tab close, or device sleep must never trigger a logout or IndexedDB clear. Session expiry (24h) is the only cause of re-authentication.
- Session expiry must not destroy IndexedDB data. The DEO re-authenticates via magic link and resumes with all staged data intact.
- The Service Worker pre-caches all CDN assets on install: DaisyUI, Tailwind v4 browser CDN, Dexie.js, SweetAlert2, Notyf, SheetJS. After first load the entire app runs offline with no network dependency.
- Minimum supported viewport is **768px**. No small-screen mobile layouts. Do not write `sm:` or `xs:` responsive prefixes in any layout.

### Data Language
- All data fields — shop names, Thana names, district names, DEO identifiers — are **English only**. No Hindi, Devanagari, Urdu, or any other script. Enforce this with input validation in the UI.

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
- Adjacent Thanas must belong to the **same district** as the source Thana.
- Cross-district adjacency entries must be filtered and rejected. This is enforced in the verification UI (red pill highlight) and by the Worker.

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
- `audit_log` — 45-day rolling event log (Section 5.5)

**`auth.ts`** — auth tables (migration `0003_auth.sql`):
- `auth_users` — email, name, role ('deo'|'admin'), deoId, districtName
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
| M-1: Schema, Migrations & Worker Skeleton | **Completed** | Drizzle schema (4 tables), 2 migrations applied to dev + prod D1, initial worker skeleton |
| M-2: Excel Ingestion & Coordinate Engine | **Completed** | SheetJS parser, DMS→DD converter, revenue formulas, UP bbox validation |
| M-3: Verification UI & IndexedDB | **Completed** | DEO verify page, Dexie.js offline staging, Service Worker + Background Sync PWA |
| M-4: Worker Batch API & D1 Integration | **Completed** | Batch upload, dual-verification, atomic db.batch()/db.transaction() writes |
| M-5: Dashboard, Testing & DEO Handoff | **Completed** | Admin choropleth map, Chart.js analytics, audit log, CSV export, 12/12 unit tests passing |
| M-6: Auth Migration + Single Worker | **Completed** | Custom HMAC magic-link auth; Resend email; D1 sessions; all API routes merged into one CF Worker (`up-excise-spatial-revenue-optimizer-web`); no external auth provider |

See [roadmap.md Section 6](roadmap.md#6-development-milestones--action-plan) for full milestone specs, entry/exit criteria, and deliverable checklists.

---

## Pre-Campaign Blockers

The following are unresolved department-side decisions that block specific milestones. Do not implement the affected features until these are resolved.

1. **DEO email addresses** — All 75 DEO department emails must be provided before accounts can be provisioned via `POST /api/admin/bulk-provision`.
2. **Excel template column layout** — SheetJS column mapping cannot be built until column names and order are locked.
3. **Thana master list** — blocks the adjacent Thana cross-district filter (best-effort; proceed with runtime check if unavailable).
4. **Shop count estimates per district** — blocks dashboard "X of Y uploaded" progress metrics.
5. **DEO credential and identifier assignment** — blocks the upload campaign. Provisioning sends magic-link emails to DEO addresses. DEOs must also complete circle/sector pre-registration before distributing templates to Inspectors.
6. **Circle/sector naming convention** — DEOs need a consistent naming standard so pre-registered unit names are clean and unambiguous across all 75 districts.
7. **Upsert vs. versioning decision** — blocks M-4. If a DEO re-uploads a district, does the system overwrite or version the records?
8. **Custom email domain** — Resend initially sends from `onboarding@resend.dev`. Switch `RESEND_FROM_EMAIL` to a verified custom domain (e.g. `noreply@up-excise.in`) before campaign launch for deliverability.

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
