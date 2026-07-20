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
├── migrations/       # D1 SQL migration files (single consolidated 0001_initial.sql)
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
| Excel I/O | ExcelJS 4.4.0 | CDN. 100% in-browser — reads uploads, generates templates, and exports, all with native print/freeze/validation support. Never bundled. |
| Local Cache | Dexie.js 4.0.10 (IndexedDB) | CDN. Offline-first staging for all DEO data. |
| PWA / Offline | Service Worker + Background Sync | Full offline capability after first load. |
| Charts | Chart.js 4.4.7 | CDN. Admin route group only. |
| Maps | Leaflet.js 1.9.4 + CartoDB tiles | CDN. UP district choropleth. No API key. |
| Modal Alerts | SweetAlert2 11.14.5 | CDN. Replaces native `alert()`/`confirm()`. |
| Toasts | Notyf 3.10.0 | CDN. |
| Testing | Vitest + Playwright | Unit tests for business logic. |

---

## Authentication & PII Hashing

**Passwordless magic-link only. No passwords ever set or stored.**
**Zero-Knowledge PII: No plaintext emails are stored in the database. Only SHA-256 hashes are persisted.**

**Flow:**
1. DEO enters their plaintext email on `/login`
2. Server hashes the email on the fly and verifies it against `auth_users.email_hash` in D1
3. Resend delivers a single-use magic link (15-min expiry) to the in-memory plaintext email, then the server drops the plaintext string.
4. DEO clicks the link → `/auth/verify` verifies token via `POST /api/auth/verify`
5. Session cookies set (`excise-session` HttpOnly HMAC, `excise-role` client-readable)
6. DEO redirected to `/home` (or `/admin` for admin role)

**Alternate flow — CUG login:** DEOs can also sign in with their department CUG mobile number instead of email — this remains the default/primary DEO login path even after the domain switch below, since magic-link email is now scoped to Admin/HQ. `/login` has an Email/CUG toggle; the browser SHA-256-hashes the 10-digit number and POSTs it to `POST /api/auth/verify-cug`, which checks it against `auth_users.deo_cug_hash` and issues the same session cookie. The raw number never leaves the browser.

**Session:** 24 hours clock-based. IndexedDB data preserved through re-login.

**Accounts:** Provisioned by admin via `POST /api/admin/bulk-provision` (Excel upload) or `pnpm seed:deo-accounts` (bulk-seeds real DEO email + CUG hashes from department contact sheets — see DEPLOY.md). No self-registration.

---

## Security

- **PII Hashing:** User and DEO emails are strictly hashed (SHA-256) in D1.
- **Superadmin Override:** Configured securely via `SUPERADMIN_EMAIL_HASH` environment variable, avoiding hardcoded email strings in the codebase.
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

## DEO Portal Workflow

Strictly gated, one step at a time — nothing is shown before its prerequisite is met, and nothing is left to the DEO's memory of "the right order."

1. **Circles & Sectors (`/units`)** — the only thing a new DEO can do. Enter how many circles and how many sectors the district has, fill in the pre-generated name boxes, confirm via a SweetAlert2 dialog, submit once. This locks permanently (enforced server-side — a district that already has any unit row rejects further registration).
2. **Upload (`/upload`)** — unlocks automatically once circles/sectors are locked; download the district template, consolidate Inspector sections, upload the single `.xlsx` file.
3. **Verify & Submit (`/verify`)** — review staged rows, fix flagged adjacent-Thana pills, then submit to headquarters behind a final SweetAlert2 confirmation.

Upload and Verify are not rendered — not merely disabled — until circles/sectors are locked, on both `/home` and the DEO nav bar. Page titles and step headings carry a Hindi subtitle; underlying data stays English-only.

---

## Admin / HQ Dashboard

**Overview (`/admin`):**
- Full-width UP choropleth map (500px tall, Leaflet + CartoDB tiles, dark/light-aware tiles) with permanent district name labels
- Top 10 districts by revenue + "View all 75 →" link
- Divisions grid: 18 division cards each showing district count, submission progress bar, and total revenue
- 2 Chart.js charts side by side: submission progress doughnut + top-20 districts bar chart
- State totals stat cards (submitted districts, total vends, total revenue)
- Manual Sync button for live data pull; map click on district polygon → district detail page

**Districts page (`/admin/districts`):**
- Full 75-district sortable table with search, division filter, and status filter
- Summary chips (shown count, submitted, total vends, total revenue)
- Read-only — district/DEO master data editing lives on the District Master page

**Divisions (`/admin/divisions` and `/admin/divisions/[division]`):**
- 18 division cards with progress bars; each card opens a division detail page
- Division detail: summary stats (districts, submitted, vends, revenue) + districts table sorted by revenue

**District Master (`/admin/provision`) — owner/superadmin-only:**
- All-75-district table; each row's edit icon opens a right-side drawer to update division, DEO name/email/identifier, expected vend count, and bbox coordinates in place via `PATCH /api/admin/districts/[district]` (Coordinates and Vend Count can optionally be cleared)
- Bulk Excel provisioning retained below the table for initial campaign setup — `generateProvisionTemplate()` pre-fills District Name and Division from the live district list
- The only place district/DEO master data can be edited; `districts` and `districts/[district]` pages remain read-only
- Restricted to `role: 'superadmin'` — nav link hidden and page content replaced with a restricted message for a plain `admin` session; the underlying PATCH/bulk-provision routes 403 non-superadmins server-side too. Every edit/provision run is audit-logged with the acting superadmin's identity.

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
- Nav links: Overview, Districts, Divisions, District Master, Audit, Export

**Shared UI:**
- `HelpPanel` on every page — balloon popover with background blur (`backdrop-blur-[2px]`), auto-flips on/off-screen, scrollable content, closes on Escape or outside click
- `ViewPrefsPanel` FAB (bottom-right) — theme (Light/Auto/Dark, respects and live-tracks system preference), font size, row density, content width; all persisted to `localStorage`
- Full-state CSV export (never rendered in UI — `/api/admin/export/all` only)
- Audit log viewer (last 45 days, paginated) — shows admin/superadmin actor name + designation for admin-initiated events (login, logout, unlock, District Master edits, bulk-provision), `deoId` for DEO-actor events
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

# Seed the 75 districts + 18 divisions + bbox (idempotent, safe to re-run)
pnpm seed:districts

# Seed real DEO accounts (email + CUG hash) from department contact sheets (idempotent)
pnpm seed:deo-accounts

# Run unit tests
pnpm test

# Type-check all packages
pnpm typecheck

# Build as Cloudflare Worker
cd apps/web && pnpm exec opennextjs-cloudflare build

# Deploy
cd apps/web && pnpm exec opennextjs-cloudflare deploy
```

See [DEPLOY.md](DEPLOY.md) for secrets, CI/CD, and account management. See [docs/app-flow.md](docs/app-flow.md) for Mermaid diagrams of the auth flow, DEO workflow, admin data loading, and API error handling.

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
| M-9: SPA Navigation Parity & Polish | **Completed** |
| M-10: District Master & Migration Consolidation | **Completed** |
| M-11 – M-16 | **Completed** — see CLAUDE.md's milestone table for full detail |
| M-17: CUG Login, API Error Handling & Atomicity Hardening | **Completed** |

See [roadmap.md](roadmap.md) for full specs, entry/exit criteria, and deliverable checklists.

---

## Pre-Campaign Blockers

Engineering is complete. Department action required before rollout:

1. **DEO email addresses** — resolved for all 75 districts via `pnpm seed:deo-accounts`
2. **Excel template column layout** — must be locked before column mapping is built
3. **Shop count estimates per district** — for dashboard progress metrics
4. **DEO credential/identifier assignment** — `deo_id` auto-assigned for all 75 seeded districts; DEO names are English placeholders pending correction (source names are Hindi)
5. **Circle/sector naming convention** — consistent names across all 75 districts
6. **Custom email domain** — resolved. `mail.exciseup.in` verified in Resend; `RESEND_FROM_EMAIL` is `noreply@mail.exciseup.in`. Magic-link email is the Admin/HQ login channel; DEOs sign in via CUG number (see "CUG-hashed login")
7. **DoT SMS template approval** — in progress. Blocks real SMS-OTP login for DEOs (see roadmap.md's Backlog section); the current CUG-hash login (a static shared secret, not a one-time code) remains the DEO login mechanism until approval lands

---

## Co-Authorship

This project is co-developed by:

- **Subhan Raj** — Lead Engineer, SIBIN Tech Solutions
- **Claude Sonnet 4.6** (Anthropic) — AI Co-Author and Systems Architect

All Claude-assisted commits carry:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
