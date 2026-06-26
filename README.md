# State Excise Portal — Spatial & Revenue Optimization System

**Client:** Department of Excise, Government of Uttar Pradesh
**Consulting Firm:** SIBIN Tech Solutions
**Lead Engineer:** Subhan Raj
**Active Phase:** Phase 1 — Comprehensive Data Collection Pipeline

---

## Overview

The Government of Uttar Pradesh administers approximately **30,000 retail liquor vends** across **75 districts**. Inspector jurisdictions (circles and sectors) were drawn decades ago and have never been recalibrated against current spatial realities or revenue density. The result: unbalanced workloads, accountability gaps, and revenue leakage.

This system is a **two-phase initiative** to correct that at scale.

**Phase 1 (this repo):** A state-wide data collection campaign. 75 District Excise Officers (DEOs) — the most senior excise post at the district level, each overseeing all Excise Inspectors in their district — upload structured Excel spreadsheets through a browser-based portal. The system ingests, validates, geocodes, and stores granular administrative, spatial, and financial data for every retail vend in the state.

**Phase 2 (subsequent):** Boundary optimization — using Phase 1 data as the spatial and financial baseline to remap circles, reassign Inspector jurisdictions, and surface revenue anomalies.

> Phase 2 is entirely dependent on Phase 1 data quality. Every schema decision and validation rule in Phase 1 must anticipate Phase 2's spatial and financial computations.

Each DEO pre-registers their district's circles and sectors in the portal, distributes per-circle/sector Excel templates to individual Inspectors, and uploads the filled files one by one. The UI groups data by circle/sector for review, but the final submission to HQ is always at the district level — HQ never sees individual circle/sector breakdowns.

---

## Monorepo Structure

```
up-excise-spatial-revenue-optimizer/
├── apps/
│   ├── web/          # Next.js frontend — Cloudflare Pages
│   └── worker/       # Hono backend — Cloudflare Workers
├── packages/
│   └── schema/       # Shared Drizzle ORM schema (D1/SQLite)
├── docs/
│   └── templates/    # Standardized DEO Excel upload templates
├── roadmap.md        # Engineering master document
└── CLAUDE.md         # AI co-author context and conventions
```

---

## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js (App Router) | Static-first. Deployed to Cloudflare Pages. |
| Backend | Cloudflare Workers + Hono | Serverless edge. 10ms CPU limit per request. |
| Database | Cloudflare D1 (SQLite) | `db.batch()` for all multi-row writes. |
| ORM | Drizzle ORM | D1 adapter. Schema in `packages/schema/src/phase1.ts`. |
| Excel Parsing | SheetJS (`xlsx`) | Client-side only — dynamic import with `ssr: false`. Never server-side. |
| Local Cache | Dexie.js (IndexedDB) | Offline-first staging layer. Rows carry `status: 'pending' | 'uploaded' | 'error'`. |
| Testing | Vitest + Playwright | Unit tests for revenue calculator and coordinate converter. E2E for upload flows. |

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        DEO BROWSER (CLIENT)                          │
│                                                                      │
│   ┌─────────────┐    ┌──────────────────┐    ┌───────────────────┐  │
│   │  Excel File │───▶│  SheetJS Parser  │───▶│  DMS → DD         │  │
│   │  (.xlsx)    │    │  (100% in-browser│    │  Coordinate       │  │
│   └─────────────┘    │   0ms server CPU)│    │  Normalizer       │  │
│                      └──────────────────┘    └────────┬──────────┘  │
│                                                        │             │
│                      ┌─────────────────────────────────▼──────────┐ │
│                      │         Dexie.js (IndexedDB Cache)         │ │
│                      │   Refresh-resilient local persistence      │ │
│                      └─────────────────────────────────┬──────────┘ │
│                                                        │             │
│   ┌────────────────────────────────────────────────────▼──────────┐ │
│   │              Next.js Verification UI                          │ │
│   │  • Staged data table with inline edit                         │ │
│   │  • Adjacent Thana pill component (intra-district only)        │ │
│   │  • Revenue preview per shop type                              │ │
│   │  • Coordinate validation with bounding box warning            │ │
│   └────────────────────────────────────────────────────┬──────────┘ │
└───────────────────────────────────────────────────────┼─────────────┘
                                                        │ HTTPS
                                                        │ Chunked JSON (500 rows/batch)
                              ┌─────────────────────────▼──────────────┐
                              │        Cloudflare Worker (Hono)        │
                              │  • Validates payload structure         │
                              │  • Rejects cross-district adjacency    │
                              │  • Recomputes totalRevenue             │
                              │  • Calls db.batch() for atomic insert  │
                              └─────────────────────────┬──────────────┘
                                                        │
                              ┌─────────────────────────▼──────────────┐
                              │         Cloudflare D1 (SQLite)         │
                              │  • phase1_raw_collection table         │
                              │  • Indexed on district, thana, shop_id │
                              └────────────────────────────────────────┘
```

---

## Data Rules (Non-Negotiable)

### Shop Types

Valid `shop_type` values:

```
MODEL_SHOP | COMPOSITE_SHOP | BHANG_SHOP | PRV | COUNTRY_LIQUOR
```

CL5CC is **not a separate shop type** — it is `COUNTRY_LIQUOR` with `has_cl5cc = true`.

### Revenue Formulas

| Shop Type | `has_cl5cc` | Formula |
|---|---|---|
| `MODEL_SHOP` | false | `license_fee_lf + mgr_amount` |
| `COMPOSITE_SHOP` | false | `license_fee_lf + mgr_amount` |
| `PRV` | false | `license_fee_lf + mgr_amount` |
| `BHANG_SHOP` | false | `license_fee_lf + (mgq_quantity × BHANG_MGQ_MULTIPLIER)` |
| `COUNTRY_LIQUOR` | false | `basic_license_fee_blf + consideration_fee` |
| `COUNTRY_LIQUOR` | **true** | `basic_license_fee_blf + consideration_fee + special_beer_lf + special_beer_mgr` |

`BHANG_MGQ_MULTIPLIER = 20` — defined as a named constant. Never hardcoded inline.

The browser computes `total_revenue` and sends it with the row. The Worker independently recomputes it. Mismatch → row rejected.

### Coordinates

- Database stores coordinates **exclusively in Decimal Degrees (DD)**.
- DMS input is converted by the frontend before any data leaves the browser.
- UP bounding box: latitude `23.8°–30.4°N`, longitude `77.1°–84.6°E`.
- Out-of-bounds coordinates are flagged with a warning — never silently dropped.

### Adjacent Thanas

- Adjacent Thanas must belong to the **same district** as the source Thana.
- Cross-district adjacency is rejected by the verification UI (red pill) and by the Worker.
- The rule is symmetric: the DEO of District A cannot list a Thana from District B as adjacent, and the DEO of District B equally cannot list that Thana from District A as adjacent.

### Data Language

All fields — shop names, Thana names, district names, DEO identifiers — are **English only**. No Devanagari, Hindi, Urdu, or any other script.

### Financial Values

All financial fields are integers in Indian Rupees (paise-truncated). No floats for money.

---

## Development Commands

> These commands apply once the monorepo is scaffolded (Milestone M-0).

```bash
# Install dependencies
pnpm install

# Run Next.js dev server
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

| Milestone | Status | Notes |
|---|---|---|
| M-0: Foundation & Repo Setup | Not Started | |
| M-1: Schema, Migrations & Worker Skeleton | Not Started | |
| M-2: Excel Ingestion & Coordinate Engine | Not Started | Blocked: DEO Excel template not yet finalized |
| M-3: Verification UI & IndexedDB | Not Started | |
| M-4: Worker Batch API & D1 Integration | Not Started | Blocked: upsert strategy decision pending |
| M-5: Dashboard, Testing & DEO Handoff | Not Started | |

See [roadmap.md](roadmap.md) for full milestone specs, entry/exit criteria, and deliverable checklists.

---

## Pre-Campaign Blockers

The following require department action before development can proceed past M-1:

1. **Excel template column layout** — blocks M-2. SheetJS column mapping cannot be built until column names and order are locked.
2. **Thana master list** — blocks the adjacent Thana cross-district filter (will use runtime check if unavailable).
3. **Shop count estimates per district** — blocks dashboard "X of Y uploaded" progress metrics.
4. **DEO credential and identifier assignment** — blocks the upload campaign. Portal credentials and `uploaded_by_deo` identifiers must be issued by the department. DEOs must also complete circle/sector pre-registration before distributing templates to Inspectors.
5. **Circle/sector naming convention** — DEOs need a consistent naming standard so pre-registered unit names are clean and unambiguous across all 75 districts.
6. **Upsert vs. versioning decision** — blocks M-4. Re-upload by a DEO: overwrite or version?

---

## Cloudflare Free Tier Strategy

Phase 1 runs at **zero infrastructure cost**. Architecture is engineered around Cloudflare's free tier limits:

| Resource | Free Tier Limit | Strategy |
|---|---|---|
| Workers CPU Time | 10ms/request | All heavy compute (Excel parse, DMS conversion, revenue calculation) runs in the browser. |
| D1 Write Rows | 100,000/day | `db.batch()` groups inserts into single transactions. 500 rows per POST. |
| D1 Read Rows | 5,000,000/day | Dashboard queries use indexed columns only. No full-table scans. |
| Pages Bandwidth | 500GB/month | Static-first frontend. SheetJS and Dexie.js load client-side only on the upload page. |

---

## Scope Exclusions

Do not implement, suggest, or encode any of the following:

- Hotel/restaurant bars, commercial lounges, banquet hall licenses, wholesale distribution.
- Phase 2 boundary optimization logic (Inspector assignment algorithms, territory splitting).
- Role-based auth at the record level (`uploaded_by_deo` is an audit tag only).
- Any field, route, or UI component not grounded in a roadmap milestone deliverable.

---

## Co-Authorship

This project is co-developed by:

- **Subhan Raj** — Lead Engineer, SIBIN Tech Solutions
- **Claude Sonnet 4.6** (Anthropic) — AI Co-Author and Systems Architect

All Claude-assisted commits carry:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

---

*For technical queries contact the SIBIN Tech Solutions engineering team. For scope or business rule queries escalate to the Department of Excise, Government of Uttar Pradesh.*
