# CLAUDE.md — State Excise Portal: Spatial & Revenue Optimization System

> This file is the authoritative context document for Claude Code when working in this repository.
> Read it fully before making any changes or suggestions.

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
│   ├── web/          # Next.js frontend — single app, route groups for DEO and Admin/HQ
│   │   └── app/
│   │       ├── (deo)/    # DEO portal routes — middleware enforces role: 'deo'
│   │       ├── (admin)/  # Admin/HQ portal routes — middleware enforces role: 'admin'
│   │       └── login/    # Only public route
│   └── worker/       # Hono backend — Cloudflare Workers
├── packages/
│   └── schema/       # Shared Drizzle ORM schema (D1/SQLite)
├── docs/
│   └── templates/    # Standardized DEO Excel upload templates
├── roadmap.md        # Engineering master document
└── CLAUDE.md         # This file
```

When files for any app or package do not exist yet, do not create them speculatively. Create them when a milestone is actively being worked on.

---

## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js (App Router) + `@opennextjs/cloudflare` | Single app (`apps/web`). Route groups `(deo)` and `(admin)` separate DEO and HQ routes. Deployed as a Cloudflare Worker (not Pages) via OpenNext adapter. Live: `up-excise-portal.shubhanraj2002.workers.dev` |
| Backend | Cloudflare Workers + Hono | Serverless edge API. 10ms CPU limit per request — enforce this hard. Live: `up-excise-spatial-revenue-optimizer.shubhanraj2002.workers.dev` |
| Database | Cloudflare D1 (SQLite) | Use `db.batch()` for all multi-row writes. |
| ORM | Drizzle ORM | D1 adapter. Schema lives in `packages/schema`. |
| Authentication | Clerk | Passwordless magic-link. Single active session per user. Webhook → `audit_log`. |
| UI Components | DaisyUI | Loaded from jsDelivr CDN. Tailwind CSS plugin — zero JS runtime. Never bundled into Next.js output. |
| CSS Utilities | Tailwind Play CDN | Loaded from CDN. No PostCSS build step. The Next.js bundle contains only app logic. |
| Excel Parsing | SheetJS (`xlsx`) | Loaded from jsDelivr CDN dynamically on upload page (`ssr: false`). Never bundled. |
| Local Cache | Dexie.js (IndexedDB) | Loaded from jsDelivr CDN. Offline-first staging layer. Rows carry `status: 'pending' | 'uploaded' | 'error'`. |
| PWA / Offline | Service Worker + Background Sync | DEO portal only. App shell + CDN asset cache. Transparent upload retry on reconnect. |
| Modal Alerts | SweetAlert2 | Loaded from jsDelivr CDN. Used for all modal alerts, confirmation dialogs, and prompts. Replaces all native `alert()`/`confirm()` calls. Never bundled. |
| Toast Notifications | Notyf | Loaded from jsDelivr CDN. Side flash notifications (success, error, warning). ~3KB, vanilla JS. Never bundled. (Sonner requires React bundling — excluded.) |
| Charts | Chart.js | Admin/HQ route group only. jsDelivr CDN. Direct `useEffect` imperative API — no React wrapper. |
| Maps | Leaflet.js + CartoDB tiles | Admin/HQ route group only. jsDelivr CDN. UP district choropleth. No API key. GeoJSON at `apps/web/public/geodata/`. |
| Scheduled Tasks | Cloudflare Cron Triggers | Daily audit log purge. Defined in `wrangler.toml`. |
| Testing | Vitest (unit) + Playwright (E2E) | Revenue calculator and coordinate converter must have unit tests. |

---

## Hard Constraints — Never Violate These

### Auth Facade — No Public Pages
- **Every route is behind auth.** A single `apps/web/middleware.ts` uses Clerk's `clerkMiddleware` with a manual `const { userId } = await auth()` check — unauthenticated users are redirected to `/login` with no `?redirect_url=` query param.
- **Only two public routes exist:** `/login` and `/api/webhooks/clerk`. Everything else requires a valid Clerk session.
- **Do not use `auth.protect()`** — it appends `?redirect_url=<current_url>` to every redirect, creating messy URLs and potential infinite redirect loops. Use the manual `userId` check pattern already in `middleware.ts`.
- **`NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login`** must be set at build time. Without it, Clerk's default redirects go to `/sign-in` (not a public route), causing an infinite redirect loop.
- Do not add any public-facing route, page, or layout without this being an explicit milestone requirement.

### Security
- **No data in URL query parameters.** All mutations use HTTP POST with JSON body. GET endpoints return only read-only reference data. No sensitive field ever appears in a URL.
- **No secrets in source.** All API keys, Clerk secret keys, and webhook signing secrets live in Cloudflare Workers Secrets. Only the Clerk publishable key (safe by design) is in the frontend environment.
- **`CLERK_SECRET_KEY` must be set on BOTH Workers** — `up-excise-spatial-revenue-optimizer` (API Worker, for route guards and webhook verification) and `up-excise-portal` (portal Worker, for `clerkMiddleware` server-side session validation). Missing it on the portal causes 500 errors on every page load.
- **SRI on every CDN asset.** Every CDN-loaded `<script>` and `<link>` must have `integrity` and `crossorigin="anonymous"`. CI blocks merge if any CDN tag is missing these. No exceptions.
- **Session credentials stay in Clerk cookies.** HttpOnly, Secure, SameSite=Strict. They never touch `localStorage`, `sessionStorage`, or IndexedDB.
- **No `unsafe-inline` or `unsafe-eval` in CSP.** The CSP in `public/_headers` must never include these directives.
- **One active session per DEO.** A second login invalidates all previous sessions. Clerk configuration enforces this.

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
- External I/O (Clerk API calls in bulk-provision) cannot participate in a D1 transaction. Write DB state first, then call external APIs; on API failure, log the error in the result but do not roll back the already-committed DB row.

### Cloudflare Free Tier
- The Worker must never perform CPU-heavy work. Excel parsing, DMS-to-DD conversion, and revenue calculation all happen **in the browser**.
- Batch inserts use `db.batch()`. Never issue individual `INSERT` calls in a loop.
- Upload chunks are 500 rows per POST request. Do not increase this without re-evaluating D1 write quota.
- Dashboard queries must use indexed columns only: `district_name`, `thana_name`, `shop_id`. Full table scans are not acceptable in production.
- The `districts` reference table (75 rows) may be queried freely — it is metadata-only and never contains shop data.

### Icons & Typography
- **Icons: Tabler Icons only.** Use inline SVG paths copied from [tabler.io/icons](https://tabler.io/icons). No emoji as icons — ever. No icon font libraries. No `react-icons` or similar packages.
- **Font: Google Fonts (Inter).** Load via `<link>` in root `layout.tsx` with `display=swap`. Never bundle fonts into the Next.js output.
- All existing emoji usage in UI components must be replaced with the equivalent Tabler icon SVG.

### CDN-First — Bundle Contains Only App Logic
- DaisyUI, Tailwind Play CDN, SheetJS, Dexie.js, SweetAlert2, and Notyf are all loaded from jsDelivr CDN at runtime. They are never installed as npm dependencies or bundled into the Next.js output.
- The Next.js bundle contains: React, Next.js App Router runtime, Clerk frontend SDK, and app-specific TypeScript components. Nothing else.
- This keeps Cloudflare Pages bandwidth usage minimal — only app logic is served from CF; all library assets come from jsDelivr.

### PWA & Offline
- IndexedDB writes happen synchronously with every user action. The network upload is always secondary. Data is never at risk from a connectivity event.
- Connection loss, network change, tab close, or device sleep must never trigger a logout or IndexedDB clear. The only session expiry is Clerk's 24-hour clock.
- Session expiry must not destroy IndexedDB data. The DEO re-authenticates and resumes with all staged data intact.
- The Service Worker pre-caches all CDN assets on install: DaisyUI, Tailwind Play CDN, Dexie.js, SweetAlert2, Notyf, SheetJS. After first load the entire app runs offline with no network dependency.
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

The canonical schema is in `packages/schema/src/phase1.ts`. The schema contains four tables:
- `phase1_raw_collection` — all shop records (Section 5.2)
- `districts` — district registry with DEO metadata (Section 5.3)
- `district_circles_sectors` — circles/sectors per district (Section 5.4)
- `audit_log` — 45-day rolling event log (Section 5.5)

When schema files do not yet exist, refer to [roadmap.md Section 5](roadmap.md#5-phase-1-database-schema) for exact definitions. Do not modify the schema without updating `roadmap.md` Section 5 as well.

---

## Development Commands

```bash
# Install dependencies
pnpm install

# Run the portal dev server (serves both DEO and Admin route groups)
pnpm --filter web dev

# Run Wrangler local dev (Hono API Worker + D1)
pnpm --filter worker dev

# Apply D1 migrations (local dev)
pnpm --filter worker exec wrangler d1 migrations apply up-excise-spatial-revenue-optimizer-dev --local

# Apply D1 migrations (prod)
pnpm --filter worker exec wrangler d1 migrations apply up-excise-spatial-revenue-optimizer-prod

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

# Deploy API Worker
pnpm --filter worker exec wrangler deploy

# Set secrets on portal Worker (required: CLERK_SECRET_KEY)
npx wrangler secret put CLERK_SECRET_KEY --name up-excise-portal

# Set secrets on API Worker
pnpm --filter worker exec wrangler secret put CLERK_SECRET_KEY
pnpm --filter worker exec wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET
```

---

## Milestone Progress

Track which milestone is currently active. Update this table as milestones are completed.

| Milestone | Status | Notes |
|---|---|---|
| M-0: Foundation & Repo Setup | **Completed** | pnpm workspace, CI/CD, wrangler config, D1 databases created and migrated |
| M-1: Schema, Migrations & Worker Skeleton | **Completed** | Drizzle schema (4 tables), 2 migrations applied to dev + prod D1, Hono Worker skeleton deployed |
| M-2: Excel Ingestion & Coordinate Engine | **Completed** | SheetJS parser, DMS→DD converter, revenue formulas, UP bbox validation |
| M-3: Verification UI & IndexedDB | **Completed** | DEO verify page, Dexie.js offline staging, Service Worker + Background Sync PWA |
| M-4: Worker Batch API & D1 Integration | **Completed** | Batch upload, dual-verification, atomic db.batch()/db.transaction() writes |
| M-5: Dashboard, Testing & DEO Handoff | **Completed** | Admin choropleth map, Chart.js analytics, audit log, CSV export, 12/12 unit tests passing |

See [roadmap.md Section 6](roadmap.md#6-development-milestones--action-plan) for full milestone specs, entry/exit criteria, and deliverable checklists.

---

## Pre-Campaign Blockers

The following are unresolved department-side decisions that block specific milestones. Do not implement the affected features until these are resolved.

1. **DEO email addresses** — blocks M-0 close. All 75 DEO department emails must be provided before Clerk accounts can be provisioned.
2. **Excel template column layout** — blocks M-2. SheetJS column mapping cannot be built until column names and order are locked.
3. **Thana master list** — blocks the adjacent Thana cross-district filter (best-effort; proceed with runtime check if unavailable).
4. **Shop count estimates per district** — blocks dashboard "X of Y uploaded" progress metrics.
5. **DEO credential and identifier assignment** — blocks the upload campaign. Portal credentials and `uploaded_by_deo` identifiers must be issued by the department. DEOs must also complete circle/sector pre-registration before distributing templates to Inspectors.
6. **Circle/sector naming convention** — DEOs need a consistent naming standard so pre-registered unit names are clean and unambiguous across all 75 districts.
7. **Upsert vs. versioning decision** — blocks M-4. If a DEO re-uploads a district, does the system overwrite or version the records?

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
