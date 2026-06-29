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
| Frontend | Next.js (App Router) | Single app (`apps/web`). Route groups `(deo)` and `(admin)` separate DEO and HQ routes. One Cloudflare Pages deployment. Domain TBD. |
| Backend | Cloudflare Workers + Hono | Serverless edge. 10ms CPU limit per request — enforce this hard. |
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
- **Every route is behind auth.** A single `apps/web/middleware.ts` uses Clerk's `clerkMiddleware` to redirect unauthenticated requests to `/login`. There is no landing page, no public home, no visitor-facing content.
- **Only two public routes exist:** `/login` and `/api/webhooks/clerk`. Everything else requires a valid Clerk session.
- Do not add any public-facing route, page, or layout without this being an explicit milestone requirement.

### Security
- **No data in URL query parameters.** All mutations use HTTP POST with JSON body. GET endpoints return only read-only reference data. No sensitive field ever appears in a URL.
- **No secrets in source.** All API keys, Clerk secret keys, and webhook signing secrets live in Cloudflare Workers Secrets. Only the Clerk publishable key (safe by design) is in the frontend environment.
- **SRI on every CDN asset.** Every CDN-loaded `<script>` and `<link>` must have `integrity` and `crossorigin="anonymous"`. CI blocks merge if any CDN tag is missing these. No exceptions.
- **Session credentials stay in Clerk cookies.** HttpOnly, Secure, SameSite=Strict. They never touch `localStorage`, `sessionStorage`, or IndexedDB.
- **No `unsafe-inline` or `unsafe-eval` in CSP.** The CSP in `public/_headers` must never include these directives.
- **One active session per DEO.** A second login invalidates all previous sessions. Clerk configuration enforces this.

### Admin Data Loading
- The admin portal default view **never loads shop rows**. The district summary list is 75 aggregate rows (name, vend count, total annual revenue, status) plus an "All State" totals row at the bottom. Built from `COUNT`/`SUM` aggregates — no row-level data.
- The state totals aggregate is **pre-computed server-side** on each `district_submitted` event and **cached in admin IndexedDB** (`admin_state_totals`, 15-min TTL). The summary page never runs a fresh full-table aggregate within the TTL window.
- Shop rows are loaded **only when an admin drills into a specific district**. The route is `GET /api/admin/districts/:district/shops` (paginated, 100 rows/page). All pages for that district are cached in admin IndexedDB (`admin_district_cache`, 1-hour TTL).
- Full-state UI table (~30K shops in one view) is **not a supported operation**. The only full-state path is `GET /api/admin/export/all` — a chunked `.xlsx` Excel file download. It triggers a file download, never a UI render.

### Cloudflare Free Tier
- The Worker must never perform CPU-heavy work. Excel parsing, DMS-to-DD conversion, and revenue calculation all happen **in the browser**.
- Batch inserts use `db.batch()`. Never issue individual `INSERT` calls in a loop.
- Upload chunks are 500 rows per POST request. Do not increase this without re-evaluating D1 write quota.
- Dashboard queries must use indexed columns only: `district_name`, `thana_name`, `shop_id`. Full table scans are not acceptable in production.
- The `districts` reference table (75 rows) may be queried freely — it is metadata-only and never contains shop data.

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
| `MODEL_SHOP` | false | `license_fee_lf + mgr_amount + premises_consideration_fee` |
| `COMPOSITE_SHOP` | false | `composite_lf_fl + composite_lf_beer + composite_mgr_fl + composite_mgr_beer` |
| `PRV` | false | `license_fee_lf + mgr_amount` |
| `BHANG_SHOP` | false | `license_fee_lf + (mgq_quantity × BHANG_MGQ_MULTIPLIER)` |
| `COUNTRY_LIQUOR` | false | `basic_license_fee_blf + consideration_fee` |
| `COUNTRY_LIQUOR` | **true** | `basic_license_fee_blf + consideration_fee + special_beer_lf + special_beer_mgr` |

`BHANG_MGQ_MULTIPLIER = ₹20 per unit` — this is a **per-unit price in Indian Rupees**, not a dimensionless number. `mgq_quantity` is the count of MGQ units; multiplying by ₹20/unit yields the annual INR contribution. Define as a named constant in `packages/schema` or a shared constants file. Do not hardcode `20` inline anywhere.

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

These commands will apply once the monorepo is scaffolded (Milestone M-0). Do not run them before the relevant milestone is active.

```bash
# Install dependencies
pnpm install

# Run the portal dev server (serves both DEO and Admin route groups)
pnpm --filter web dev

# Run Wrangler local dev (Worker + D1)
pnpm --filter worker dev

# Apply D1 migrations (dev)
wrangler d1 migrations apply phase1-dev --local

# Apply D1 migrations (prod)
wrangler d1 migrations apply phase1-prod

# Run unit tests
pnpm test

# Run E2E tests
pnpm --filter web test:e2e

# Type-check all packages
pnpm typecheck

# Dry-run deploy (CI check)
wrangler deploy --dry-run
```

---

## Milestone Progress

Track which milestone is currently active. Update this table as milestones are completed.

| Milestone | Status | Notes |
|---|---|---|
| M-0: Foundation & Repo Setup | Not Started | |
| M-1: Schema, Migrations & Worker Skeleton | Not Started | |
| M-2: Excel Ingestion & Coordinate Engine | Not Started | Blocked: DEO Excel template not yet finalized |
| M-3: Verification UI & IndexedDB | Not Started | |
| M-4: Worker Batch API & D1 Integration | Not Started | Blocked: upsert strategy decision pending |
| M-5: Dashboard, Testing & DEO Handoff | Not Started | |

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
- All financial values are integers in Indian Rupees (paise-truncated). Never use floats for money.
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
