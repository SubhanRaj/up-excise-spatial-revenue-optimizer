# State Excise Portal — Spatial & Revenue Optimization System

**Client:** Department of Excise, Government of Uttar Pradesh
**Consulting Firm:** SIBIN Tech Solutions
**Lead Engineer:** Subhan Raj
**Active Phase:** Phase 1 — Comprehensive Data Collection Pipeline

---

## Overview

The Government of Uttar Pradesh administers approximately **30,000 retail liquor vends** across **75 districts**. Inspector jurisdictions (circles and sectors) were drawn decades ago and have never been recalibrated against current spatial realities or revenue density. The result: unbalanced workloads, accountability gaps, and revenue leakage.

This system is a **two-phase initiative** to correct that at scale.

**Phase 1 (this repo):** A state-wide data collection campaign. 75 District Excise Officers (DEOs) upload structured Excel spreadsheets through a browser-based portal. The system ingests, validates, geocodes, and stores granular administrative, spatial, and financial data for every retail vend in the state.

**Phase 2 (subsequent):** Boundary optimization — using Phase 1 data as the spatial and financial baseline to remap circles, reassign Inspector jurisdictions, and surface revenue anomalies.

---

## Live Portal

**https://up-excise-spatial-revenue-optimizer-web.shubhanraj2002.workers.dev**

Single Cloudflare Worker serving both pages and API.

---

## Monorepo Structure

```
up-excise-spatial-revenue-optimizer/
├── apps/
│   └── web/          # Next.js — single app, DEO and Admin/HQ as route groups
│       └── app/
│           ├── (deo)/    # DEO portal: /home, /upload, /verify, /units
│           ├── (admin)/  # HQ dashboard: /admin, /admin/*
│           ├── login/    # Public: /login
│           ├── auth/     # Public: /auth/verify (client component)
│           └── api/      # 19 Next.js Route Handlers (same Worker)
├── packages/
│   └── schema/       # Shared Drizzle ORM schema (D1/SQLite)
├── migrations/       # D1 SQL migration files (0001–0003)
├── docs/
│   └── templates/    # Standardized DEO Excel upload templates
├── roadmap.md        # Engineering master document
├── DEPLOY.md         # Deployment and secrets reference
└── CLAUDE.md         # AI co-author context and conventions
```

---

## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 15 (App Router) | Single app (`apps/web`). `(deo)` and `(admin)` route groups. |
| Deployment | Cloudflare Workers (`@opennextjs/cloudflare` v1.20.1) | One Worker serves pages + all API routes. No Cloudflare Pages, no separate API worker. |
| Database | Cloudflare D1 (SQLite) | `db.batch()` for all multi-row writes. Bound as `DB`. |
| ORM | Drizzle ORM | D1 adapter. Schema in `packages/schema/src/`. |
| Auth | Custom HMAC magic-link | No external provider. HMAC-SHA256 session cookies + UUID tokens in D1 + Resend email. 24h sessions. |
| Email | Resend | Magic-link delivery. |
| UI Components | DaisyUI 5.6.3 | CDN. Requires Tailwind v4. |
| CSS | Tailwind v4 (`@tailwindcss/browser`) | CDN. No PostCSS build step. |
| Excel Parsing | SheetJS 0.18.5 | CDN. 100% in-browser. Never bundled. |
| Local Cache | Dexie.js 4.0.10 (IndexedDB) | CDN. Offline-first staging for all DEO data. |
| PWA / Offline | Service Worker + Background Sync | Full offline capability after first load. |
| Charts | Chart.js 4.4.7 | CDN. Admin route group only. |
| Maps | Leaflet.js 1.9.4 + CartoDB tiles | CDN. UP district choropleth. No API key. |
| Modal Alerts | SweetAlert2 11.14.5 | CDN. Replaces native `alert()`/`confirm()`. |
| Toasts | Notyf 3.10.0 | CDN. |
| Testing | Vitest + Playwright | Unit tests for business logic. |

---

## Authentication

**Passwordless magic-link only. No passwords ever set or stored.**

**Flow:**
1. DEO enters their email on `/login`
2. Resend delivers a single-use magic link (15-min expiry)
3. DEO clicks the link → `/auth/verify` verifies token via `POST /api/auth/verify`
4. Session cookies set (`excise-session` HttpOnly HMAC, `excise-role` client-readable)
5. DEO redirected to `/home` (or `/admin` for admin role)

**Session:** 24 hours clock-based. IndexedDB data preserved through re-login.

**Accounts:** Provisioned by admin via `POST /api/admin/bulk-provision` (Excel upload). No self-registration.

---

## Security

- **No data in URLs.** All mutations are HTTP POST with JSON body.
- **No secrets in source.** All keys live in Cloudflare Worker Secrets.
- **Session cookies:** HttpOnly, Secure, SameSite=Lax. Never in localStorage or IndexedDB.
- **D1 is not internet-accessible.** Only the Worker binding can reach it.
- **HMAC session verification** on every protected request in `requireAuth()` / `getSession()`.

---

## PWA & Offline

- Full offline capability after first load (Service Worker caches app shell + all CDN assets)
- IndexedDB-first: every DEO action writes locally before any network call
- Background Sync: chunk upload retries automatically on reconnect
- Minimum viewport: 768px (iPad). Small-screen mobile not supported.

---

## Admin / HQ Dashboard

**Overview (`/admin`):**
- Full-width UP choropleth map (500px tall, Leaflet + CartoDB tiles, dark/light-aware tiles) with permanent district name labels
- Top 10 districts by revenue + "View all 75 →" link
- Divisions grid: 18 division cards each showing district count, submission progress bar, and total revenue
- 2 Chart.js charts side by side: submission progress doughnut + top-20 districts bar chart
- State totals stat cards (submitted districts, total vends, total revenue)
- Auto-refresh every 5 minutes; map click on district polygon → district detail page

**Districts page (`/admin/districts`):**
- Full 75-district sortable table with search, division filter, and status filter
- Summary chips (shown count, submitted, total vends, total revenue)

**Divisions (`/admin/divisions` and `/admin/divisions/[division]`):**
- 18 division cards with progress bars; each card opens a division detail page
- Division detail: summary stats (districts, submitted, vends, revenue) + districts table sorted by revenue

**District detail (`/admin/districts/[district]`):**
- All `phase1_raw_collection` fields: shop ID, name, circle/sector, thana, adjacent thanas (flex-wrap pills), type + CL5CC sub-badge, coordinates, revenue
- Collapsible per-row revenue breakdown (`<details>/<summary>` — no modal)
- Full type labels: "Composite Shop (FL + Beer)", "PRV (Premium Retail Vend)"
- Per-type + CL5CC breakdown bar — each card clickable to filter; CL5CC only active alongside Country Liquor
- Client-side search (shop ID / name / thana), type filter, circle/sector filter, sortable columns
- Group by type — auto-collapses all on enable; per-group expand/collapse persisted to `localStorage`; clears type filter on enable
- Rows per page: 10 / 25 / 50 / 100 / All — preference persisted to `localStorage`
- Per-district CSV export

**Navigation:**
- Navbar search: live dropdown across all 75 districts and 18 divisions, keyboard navigation (↑↓ / Enter / Escape)
- Breadcrumbs: all segments are clickable links — Overview → Districts/Divisions → current page
- Nav links: Overview, Districts, Divisions, Provision, Audit, Export

**Shared UI:**
- `HelpPanel` on every page — balloon popover with background blur (`backdrop-blur-[2px]`), closes on Escape or outside click
- `ViewPrefsPanel` FAB (bottom-right) — font size, row density, content width; all persisted to `localStorage`
- Full-state CSV export (never rendered in UI — `/api/admin/export/all` only)
- Audit log viewer (last 45 days, paginated)
- Bulk DEO provisioning via Excel upload

---

## Geospatial Data

**File:** `apps/web/public/geodata/up-districts.geojson`

**Coverage:** All 75 UP districts — complete, no gaps.

**Source:** OpenStreetMap (OSM) via the Overpass API (`admin_level=5` administrative boundary relations for Uttar Pradesh). Fetched via `https://maps.mail.ru/osm/tools/overpass/api/interpreter`. OSM uses `admin_level=5` for UP districts; level 6 = tehsils (316 elements).

**Processing:**
1. Overpass JSON → closed rings assembled from OSM relation ways (greedy chain algorithm, handles reversed way directions)
2. Ramer-Douglas-Peucker simplification: tolerance 0.002° → 26,167 points from 368,779 (615 KB from 8.5 MB raw)
3. Name normalisations applied to match D1 district names: Raebareli → Rae Bareli, Sant Ravidas Nagar → Bhadohi, Sharavasti → Shravasti, Siddharthnagar → Siddharth Nagar, Mahrajganj → Maharajganj

**Feature property:** `district` — must match `districts.name` in D1 exactly.

> The processing pipeline was run ad hoc in Python and is not committed to this repo. To regenerate, query Overpass for `rel[admin_level=5][boundary=administrative]["is_in:state"="Uttar Pradesh"]`, assemble rings, apply RDP, and export as GeoJSON with a `district` property.

---

## Data Rules

### Shop Types
```
MODEL_SHOP | COMPOSITE_SHOP | BHANG_SHOP | PRV | COUNTRY_LIQUOR
```
CL5CC is not a separate shop type — it is `COUNTRY_LIQUOR` with `has_cl5cc = true`.

### Revenue Formulas

| Shop Type | `has_cl5cc` | Formula |
|---|---|---|
| `MODEL_SHOP` | false | `license_fee_lf + mgr_amount + ON_PREMISES_CONSUMPTION_FEE (₹3,00,000)` |
| `COMPOSITE_SHOP` | false | `composite_lf_fl + composite_lf_beer + composite_mgr_fl + composite_mgr_beer` |
| `PRV` | false | `license_fee_lf + mgr_amount` |
| `BHANG_SHOP` | false | `license_fee_lf + (mgq_quantity × ₹20)` |
| `COUNTRY_LIQUOR` | false | `basic_license_fee_blf + consideration_fee` |
| `COUNTRY_LIQUOR` | **true** | `basic_license_fee_blf + consideration_fee + special_beer_lf + special_beer_mgr` |

Browser computes `total_revenue`; Worker recomputes independently. Mismatch → row rejected.

### Coordinates
- Stored as Decimal Degrees (DD). DMS converted in browser before upload.
- UP bounding box: lat `23.8°–30.4°N`, lon `77.1°–84.6°E`. Out-of-bounds → warning.

---

## Development Commands

```bash
# Install dependencies
pnpm install

# Dev server (Next.js on :3000)
pnpm --filter web dev

# Apply D1 migrations (prod)
npx wrangler d1 migrations apply up-excise-spatial-revenue-optimizer-prod --remote

# Run unit tests
pnpm test

# Type-check all packages
pnpm typecheck

# Build as Cloudflare Worker
cd apps/web && pnpm exec opennextjs-cloudflare build

# Deploy
cd apps/web && pnpm exec opennextjs-cloudflare deploy
```

See [DEPLOY.md](DEPLOY.md) for secrets, CI/CD, and account management.

---

## Milestone Progress

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

See [roadmap.md](roadmap.md) for full specs, entry/exit criteria, and deliverable checklists.

---

## Pre-Campaign Blockers

Engineering is complete. Department action required before rollout:

1. **DEO email addresses** — all 75 required for bulk provisioning
2. **Excel template column layout** — must be locked before SheetJS mapping is built
3. **Shop count estimates per district** — for dashboard progress metrics
4. **DEO credential/identifier assignment** — for `deo_id` scoping and circle/sector pre-registration
5. **Circle/sector naming convention** — consistent names across all 75 districts
6. **Custom email domain** — switch `RESEND_FROM_EMAIL` from `onboarding@resend.dev` to verified domain

---

## Co-Authorship

This project is co-developed by:

- **Subhan Raj** — Lead Engineer, SIBIN Tech Solutions
- **Claude Sonnet 4.6** (Anthropic) — AI Co-Author and Systems Architect

All Claude-assisted commits carry:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
