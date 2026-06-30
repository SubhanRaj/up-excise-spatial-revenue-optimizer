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

- 75-row district summary + state totals (no shop rows on default view)
- Interactive UP choropleth map (Leaflet, district status colour-coded)
- 5 Chart.js analytics charts (submission progress, revenue by district, shop type breakdown)
- District drill-down: paginated shop table (10/25/50/100/All rows per page selector, IndexedDB-cached 1h); shows all fields including circle/sector, coordinates, adjacent thanas, CL5CC, and per-row revenue breakdown (collapsible inline, no modal)
- Full-state export: chunked `.xlsx` download (never rendered in UI)
- Audit log viewer (last 45 days)
- Bulk DEO provisioning via Excel upload

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
