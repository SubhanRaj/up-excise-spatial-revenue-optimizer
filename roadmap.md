# State Excise Portal — Spatial & Revenue Optimization System
## Official Engineering Roadmap: Phase 1 — Comprehensive Data Collection Pipeline

---

| Field | Value |
|---|---|
| **Document Version** | 1.0.0 |
| **Classification** | Internal Engineering Master Document |
| **Target Phase** | Phase 1 — Comprehensive Data Harvesting & Verification |
| **Prepared By** | Subhan Raj, CSE Engineer — SIBIN Tech Solutions |
| **Consulting For** | Department of Excise, Government of Uttar Pradesh |
| **Authored** | 2026-06-25 |
| **Status** | Active — Pending Departmental Review |

---

## Table of Contents

1. [Executive Summary & Phase 1 Objectives](#1-executive-summary--phase-1-objectives)
2. [Business Rules & Operational Constraints](#2-business-rules--operational-constraints)
3. [Edge Architecture & Zero-Cost Strategy](#3-edge-architecture--zero-cost-strategy)
4. [Data Dictionary & Shop Classification Matrix](#4-data-dictionary--shop-classification-matrix)
5. [Phase 1 Database Schema](#5-phase-1-database-schema)
6. [Development Milestones & Action Plan](#6-development-milestones--action-plan)

---

## 1. Executive Summary & Phase 1 Objectives

### 1.1 Strategic Context

The Department of Excise, Government of Uttar Pradesh, administers approximately **30,000 retail liquor vends** across **75 districts** and **18 administrative divisions**. The existing jurisdictional structure — circles, sectors, and Thana-level assignments for Excise Inspectors — was drawn decades ago and has not been systematically recalibrated against ground-level spatial realities, revenue density, or population shifts. The result is a fragmented administrative landscape: some Inspectors carry disproportionate geographic loads while others operate over-segmented, low-density territories. Revenue leakage, accountability gaps, and enforcement blind spots persist as a direct consequence.

This project, the **State Excise Portal Spatial & Revenue Optimization System**, is a two-phase initiative designed to correct this at scale.

### 1.2 The Two-Phase Architecture

**Phase 1 (This Document):** A state-wide data collection campaign. 75 District Excise Officers (DEOs) will upload structured spreadsheets through a browser-based portal. The system will ingest, validate, and store granular administrative, spatial, and financial metrics for every retail vend in the state. This phase produces the single authoritative dataset that everything downstream depends on.

**Phase 2 (Subsequent):** Using the Phase 1 dataset as its mathematical and spatial baseline, the system will run boundary optimization algorithms to redefine circles and sectors, reassign Excise Inspector jurisdictions, eliminate geographic redundancies, and surface revenue anomalies. Phase 2 is entirely dependent on the quality and completeness of Phase 1 data.

> **The engineering implication is direct:** every schema decision, every validation rule, and every data field defined in Phase 1 must anticipate the spatial and financial computations Phase 2 will perform. There is no tolerance for ambiguity in Phase 1 output.

### 1.3 Phase 1 Core Objectives

| # | Objective | Success Criterion |
|---|---|---|
| O-1 | **Universal Coverage** | 100% of ~30,000 retail vends across all 75 districts captured with no district gaps. |
| O-2 | **Spatial Accuracy** | Every vend has a geocoordinate stored in Decimal Degrees (DD), normalized from DEO input regardless of whether input is DMS or DD format. |
| O-3 | **Financial Precision** | Revenue fields collected at the component level (LF, MGR, BLF, MGQ, etc.), with the system computing and storing `totalRevenue` deterministically from those components. |
| O-4 | **Jurisdictional Mapping** | Every vend is anchored to a Thana, and every Thana records its adjacent Thanas within its own district boundary. |
| O-5 | **Zero Infrastructure Cost** | The entire system runs on Cloudflare's free tier. No server provisioning, no managed database licensing, no cloud compute bills during Phase 1. |
| O-6 | **Data Integrity Under Field Conditions** | Browser-side caching (IndexedDB) ensures no partial entry is lost due to connectivity issues, accidental refreshes, or tab closures in the field. |
| O-7 | **Audit Trail** | Every record carries the uploading DEO's identity and a creation timestamp for accountability. |

### 1.4 Explicit Scope Exclusions

The following are **outside the boundary of Phase 1** and must not be captured, implied, or encoded in the schema:

- High-end hotel and restaurant bars.
- Commercial lounges and banquet hall licenses.
- Wholesale distribution licenses.
- Any outlet category that does not map to the five retail classifications defined in Section 4.

Attempting to force out-of-scope data into Phase 1 fields will corrupt the Phase 2 optimization baseline. DEOs must be briefed on this boundary before the upload campaign begins.

---

## 2. Business Rules & Operational Constraints

This section defines the non-negotiable rules that govern data structure, validation logic, and UI behavior. These are not implementation preferences — they are the operational realities of excise administration in UP, and the system must enforce them without exception.

### 2.1 The Thana as the Atomic Geographic Unit

The **Thana** (police station jurisdictional area) is the smallest indivisible geographic unit in this system. All spatial analysis in Phase 2 — boundary remapping, Inspector workload balancing, contiguity checks — operates at the Thana level.

**Critical distinction:** While the Thana is borrowed from the police administrative structure as a naming convention, **Excise jurisdiction supersedes police boundaries**. A single Excise Inspector may be assigned a Thana that corresponds to multiple police sub-jurisdictions, or conversely, a Thana boundary in Excise records may differ from the police definition for the same name. Phase 1 uses the Excise-authoritative Thana names as the canonical identifier.

**Implication for schema design:** `thanaName` is stored as a free-text string, not a foreign key to a locked reference table. This is intentional. Enforcing referential integrity against a pre-seeded Thana master list would block uploads if DEOs encounter naming variations in legacy spreadsheets. Normalization of Thana name variants is a Phase 2 data-cleaning task.

### 2.2 Inspector Assignment Constraints (Phase 2 Alignment Rule)

Phase 1 does not store Inspector assignments. However, Phase 1 data collection is designed to feed Phase 2's assignment optimizer, which enforces the following hard rule:

> **One Thana → Maximum One Excise Inspector.**
> **One Inspector → Permitted Multiple Thanas.**

This rule exists to eliminate the accountability vacuum that emerges when two Inspectors share jurisdiction over a single Thana. Every vend in Phase 1 must be unambiguously anchored to exactly one Thana so that Phase 2 can compute clean, non-overlapping assignment territories.

Any vend record where `thanaName` is null, empty, or ambiguous will be flagged as a Phase 2 blocker and must be resolved before boundary optimization runs.

### 2.3 The Adjacent Thana Rule

Adjacency data is critical for Phase 2's contiguity-based remapping. If Inspector territories are to be reorganized into logical geographic clusters, the system must know which Thanas share borders. Phase 1 collects this at the Thana level: every Thana entry records a list of its bordering Thanas.

**The cross-district exclusion rule is absolute:**

> Adjacent Thanas must belong to the **same district** as the source Thana. Cross-district adjacency is ignored and must be filtered from DEO input.

**Example:** Thana BBD in Lucknow district physically borders Thana Safedabad in Barabanki district. For data entry in Lucknow's dataset, Safedabad must **not** appear in BBD's adjacent Thana list. Equally, Barabanki's dataset entry for Safedabad must **not** list BBD as adjacent. The cross-district exclusion is symmetric — neither DEO may encode cross-district adjacency, regardless of which side the border lies on.

**Rationale:** Excise administration is organized by district chains of command. Allowing cross-district adjacency in the optimization model would create pressure to merge territories across district lines, which violates administrative accountability structures. Phase 2's optimizer is district-bounded by design.

**Storage format:** Adjacent Thanas are stored in `adjacentThanasRaw` as a comma-separated string (e.g., `"Gomti Nagar,Chinhat,Alambagh"`). The frontend parses this into interactive pills for DEO review. The raw string is retained in D1 for simplicity; Phase 2 will parse and normalize it.

### 2.4 Coordinate Input & Normalization Rules

Legacy Excise spreadsheets record coordinates in **Degrees, Minutes, Seconds (DMS)** format, inherited from survey maps. Modern GIS tools require **Decimal Degrees (DD)**. The system must handle both without friction.

**Rule:** The database stores coordinates **exclusively in Decimal Degrees**. The frontend performs all conversion before transmission. No DMS values reach the Cloudflare Worker.

**Supported input formats:**

| Input Format | Example | Handled By |
|---|---|---|
| Decimal Degrees (DD) | `26.8467, 80.9462` | Accepted as-is, validated for UP bounding box |
| DMS — Textual | `26°50'48.1"N, 80°56'46.3"E` | Converted to DD by frontend parser |
| DMS — Numeric fields | `26 / 50 / 48.1` (separate fields) | Converted to DD by frontend parser |

**Bounding box validation for UP:** After conversion, the frontend validates that coordinates fall within the approximate geographic envelope of Uttar Pradesh:
- Latitude: `23.8° N` to `30.4° N`
- Longitude: `77.1° E` to `84.6° E`

Records outside this bounding box are flagged with a warning and held in the DEO verification queue — they are not silently dropped or auto-corrected.

### 2.5 Data Entry Language Constraint

> **All data entered into the system must be in English.** Hindi, Devanagari script, Urdu, or any other language or script is not accepted. This constraint applies to all text fields including shop names, Thana names, district names, DEO identifiers, and any free-text notes fields that may be added in future iterations.

This constraint is enforced at the UI level with input validation and is documented here so that DEO training materials align with it from day one.

### 2.6 DEO Identity & Accountability

The District Excise Officer (DEO) is the most senior excise post at the district level. They oversee all Excise Inspectors across every circle and sector in their district. In the context of this system, the DEO is the sole authenticated portal user for their district — they receive Inspector-filled Excel files, upload and verify them, and are the single entity that commits data to D1 for their district.

Every record written to D1 carries `uploadedByDeo` — a non-nullable string identifier for the submitting DEO. This is an audit tag, not an authentication mechanism. DEO identifiers will be assigned by the department and distributed alongside portal credentials.

---

### 2.7 Circle/Sector Pre-Registration & Inspector-Level Upload Delegation

A district typically comprises multiple circles and sectors, each overseen by an individual Excise Inspector. Requiring the DEO to compile a single monolithic district-wide Excel file is operationally impractical at scale. The system supports a **delegated upload model** that keeps the DEO as the sole submitting authority while enabling per-circle/sector data collection by Inspectors.

**Workflow:**

1. **Pre-registration:** The DEO logs into the portal and registers all circles and sectors in their district (e.g., "Circle 1", "Sector A", "Sector B") through the Circle/Sector Management UI. These are stored in D1 in the `district_circles_sectors` table, scoped to the DEO's district.

2. **Template generation:** For each registered unit, the portal generates a pre-labeled Excel template (`.xlsx`) with the district name and circle/sector name pre-filled in the header. The DEO downloads and distributes each template to the respective Inspector.

3. **Inspector fill:** Each Inspector fills the template with shop details for their jurisdiction only. They return the completed file to the DEO. Inspectors have no portal access — all portal interactions are the DEO's responsibility.

4. **Per-unit upload:** The DEO uploads each returned Excel file individually. On upload, the DEO selects the corresponding circle/sector from a dropdown (pre-populated from the registered units). The system parses the file, tags all rows with that circle/sector, and writes them to IndexedDB.

5. **Grouped verification UI:** The staging interface organizes rows in tabs or collapsible sections by circle/sector. The DEO reviews each unit's data independently — correcting coordinates, removing invalid adjacency pills, verifying revenue totals.

6. **Collective district submission:** The final submit action batches all staged rows across all circle/sector uploads and transmits them to the Worker as a single district submission. The Worker treats the district as one atomic unit — individual circle/sector boundaries are metadata tags on the rows, not separate submission events.

**HQ-level view:** At the headquarters dashboard, data is aggregated and displayed at the **district level only**. Circles and sectors are available as a drill-down dimension within the DEO's portal view but are not surfaced at the state-level summary. HQ sees: "Lucknow — 587 vends — ₹X total revenue."

**Completeness gate:** The submission button is active only when every registered circle/sector for the district has at least one uploaded and verified file. Partial district submissions are blocked — the Phase 2 optimization baseline cannot be built on incomplete district data.

---

## 3. Edge Architecture & Zero-Cost Strategy

### 3.1 The Cloudflare Free Tier Constraint

Phase 1 must operate with **zero infrastructure cost**. This is not a preference — it is a hard budget constraint for the data collection phase. The architecture is engineered specifically around Cloudflare's free tier limits:

| Resource | Free Tier Limit | Our Strategy |
|---|---|---|
| **Workers CPU Time** | 10ms per request | All heavy compute (Excel parsing, DMS conversion) runs in the browser, not the Worker. The Worker only performs inserts. |
| **Workers Request Count** | 100,000/day | Chunked batch uploads minimize request count per DEO session. |
| **D1 Write Rows** | 100,000/day | `db.batch()` groups multiple inserts into a single transaction, dramatically reducing write operation count. |
| **D1 Read Rows** | 5,000,000/day | Dashboard queries use indexed columns only (`districtName`, `thanaName`, `shopId`). Full table scans are prohibited in Phase 1. |
| **Pages Bandwidth** | 500GB/month | The Next.js frontend is static-first; JS bundles are kept lean. SheetJS and Dexie.js are the heaviest dependencies and are loaded client-side only on the upload page. |
| **Cloudflare Pages Builds** | 500/month | CI is managed; no runaway build pipelines. |

### 3.2 System Architecture Overview

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
│                      │   Survives: tab close, refresh, power cut  │ │
│                      └─────────────────────────────────┬──────────┘ │
│                                                        │             │
│   ┌────────────────────────────────────────────────────▼──────────┐ │
│   │              Next.js Verification UI                          │ │
│   │  • Staged data table with inline edit capability              │ │
│   │  • Adjacent Thana pill/tag component (intra-district only)    │ │
│   │  • Revenue auto-calculation display per shop type             │ │
│   │  • Coordinate validation with bounding box warning            │ │
│   │  • Chunk progress indicator (500 rows/batch)                  │ │
│   └────────────────────────────────────────────────────┬──────────┘ │
└───────────────────────────────────────────────────────┼─────────────┘
                                                        │ HTTPS
                                                        │ Chunked JSON
                                                        │ (500 rows/batch)
                              ┌─────────────────────────▼──────────────┐
                              │        Cloudflare Worker (Hono)        │
                              │                                        │
                              │  • Validates payload structure         │
                              │  • Rejects cross-district adjacency    │
                              │  • Calls db.batch() for atomic insert  │
                              │  • Returns chunk ACK with row counts   │
                              └─────────────────────────┬──────────────┘
                                                        │
                              ┌─────────────────────────▼──────────────┐
                              │         Cloudflare D1 (SQLite)         │
                              │                                        │
                              │  • phase1_raw_collection table         │
                              │  • Indexed on district, thana, shop_id │
                              │  • Append-only during Phase 1          │
                              └────────────────────────────────────────┘
```

### 3.3 The Excel Ingestion Pipeline — Step by Step

**Step 1: Client-Side Excel Parsing (SheetJS)**

The DEO selects a standardized `.xlsx` file. The browser loads SheetJS (`xlsx` package) and parses the binary workbook entirely in memory. No file data is transmitted to any server at this stage. The parser extracts rows into a typed JavaScript array matching the Phase 1 schema.

This is the critical architectural decision that keeps the Cloudflare Worker within its 10ms CPU budget. A Worker that attempted to parse a 30,000-row Excel file would time out catastrophically. By running the parse in the browser, we consume the DEO's machine CPU — which has no limits — and send the Worker only clean, structured JSON.

**Step 2: Coordinate Normalization**

Immediately after parsing, a coordinate normalizer runs over every row. The normalizer handles:
- Pure DD input: passes through with bounding box validation.
- DMS in a single text field: regex-parsed, converted via the standard formula:
  `DD = Degrees + (Minutes / 60) + (Seconds / 3600)`
- DMS in separate numeric fields: combined and converted using the same formula.
- Hemisphere indicators (`N`/`S` for latitude, `E`/`W` for longitude) are handled: Southern and Western values produce negative DD.

After normalization, `latitudeDecimal` and `longitudeDecimal` are populated for every row that had valid coordinate input. Rows with invalid or missing coordinates are flagged — not dropped — and surface in the verification UI with a visual warning.

**Step 3: IndexedDB Persistence (Dexie.js)**

The normalized dataset is immediately written to the browser's IndexedDB via Dexie.js. This local store acts as a durable staging area. The DEO can:
- Close the browser tab and reopen it — data is recovered.
- Lose network connectivity — data is safe.
- Partially submit (some chunks uploaded, session interrupted) — the IndexedDB store tracks which rows have been acknowledged by the Worker so that resumption skips already-committed rows.

**Step 4: Verification UI**

The Next.js interface renders the staged data in a paginated table. Key interactions:
- **Adjacent Thana Pills:** The `adjacentThanasRaw` string is split on commas and rendered as removable pill components. The DEO can delete incorrect adjacencies before submission. The district-boundary filter (Section 2.3) runs here — pills referencing out-of-district Thanas are highlighted in red and must be removed before the row is cleared for submission.
- **Revenue Preview:** For each row, the system computes and displays the expected `totalRevenue` based on `shopType` and `hasCl5cc` using the formulas in Section 4.3. This lets the DEO visually verify that financial inputs are correct before committing.
- **Row-Level Edit:** The DEO can correct any field inline. Changes update the IndexedDB store in real time.

**Step 5: Chunked Batch Submission**

Once the DEO approves the staged data, the frontend transmits it to the Cloudflare Worker in sequential chunks of 500 rows. Each chunk is a single HTTPS POST request with a JSON body. The Worker receives the chunk, validates structure, and calls `db.batch()` to insert all 500 rows in a single D1 transaction. The Worker returns an acknowledgment with the count of successfully inserted rows.

The frontend marks acknowledged rows in IndexedDB. If the session is interrupted mid-upload, the next session resumes from the first unacknowledged chunk.

**Why 500 rows per chunk?**

| Factor | Analysis |
|---|---|
| Worker 10ms CPU limit | At 500 rows, the Worker performs ~500 lightweight SQL inserts via `db.batch()`. D1's batch interface is specifically optimized for this pattern and keeps the Worker well within its CPU window. |
| Payload size | A 500-row JSON payload for this schema is approximately 150–200KB. Well within the 100MB Worker request body limit with massive headroom. |
| Error recovery granularity | A chunk failure affects at most 500 rows. The DEO does not lose an entire district's upload. |

### 3.4 Cloudflare Worker Implementation Notes (Hono)

The Worker is built with [Hono](https://hono.dev/) — a lightweight, TypeScript-first web framework purpose-built for Cloudflare Workers. Hono adds minimal overhead and provides clean routing, middleware, and type-safe request handling.

**Key Worker routes:**

| Route | Method | Purpose |
|---|---|---|
| `/api/upload/chunk` | `POST` | Accepts a 500-row batch (tagged with circle/sector), validates, inserts via `db.batch()` |
| `/api/districts` | `GET` | Returns district list for DEO dropdown |
| `/api/districts/:district/units` | `POST` | DEO registers a new circle or sector for their district |
| `/api/districts/:district/units` | `GET` | Lists all circles/sectors registered for a district |
| `/api/districts/:district/units/:unitId/template` | `GET` | Returns a pre-labeled Excel template for a specific circle/sector |
| `/api/stats/district/:name` | `GET` | Returns summary counts for a district (used by dashboard) |

**Worker validation checklist (enforced before any D1 write):**

- `districtName`, `circleSectorName`, `thanaName`, `shopId`, `shopName`, `shopType`, `uploadedByDeo` must be non-empty strings.
- `shopType` must be one of: `MODEL_SHOP`, `COMPOSITE_SHOP`, `BHANG_SHOP`, `PRV`, `COUNTRY_LIQUOR`.
- `hasCl5cc` must be a boolean; if `true`, `shopType` must be `COUNTRY_LIQUOR`.
- `latitudeDecimal` and `longitudeDecimal`, if present, must be finite numbers within the UP bounding box.
- `totalRevenue` must match the server-side recomputed value from the financial fields — the Worker recomputes revenue independently and rejects rows where the client-sent `totalRevenue` does not match. This prevents silent data corruption.

### 3.5 D1 Database Operational Notes

**Append-only in Phase 1:** The Phase 1 collection table is write-once from a data integrity standpoint. If a DEO re-uploads a corrected dataset for their district, a `UNIQUE` constraint on `shopId` + `districtName` can be used to trigger an upsert rather than a duplicate insert. The deduplication strategy will be finalized during implementation (see Milestone M-3).

**Index strategy:** Three indexes cover the primary query patterns for Phase 1 dashboards:
- `p1_district_idx` — powers district-level summary queries (total vends per district, total revenue per district).
- `p1_thana_idx` — powers Thana-level aggregation queries (vend count per Thana, for Phase 2 load-balancing).
- `p1_shop_idx` — powers individual vend lookups and deduplication checks.

Full-table scans are expected during Phase 2 analysis but are not a production concern during Phase 1 data collection.

---

### 3.6 Security Architecture & Constraints

Security is applied at every layer. No single control is treated as sufficient.

**Transmission Security:**
- All mutations (upload chunk, circle/sector registration, district submission) use HTTP POST with a JSON body. No sensitive or structured data is ever transmitted via URL query parameters. GET endpoints return only read-only reference data.
- All traffic is HTTPS-only. Mixed content is blocked by CSP. The Worker rejects any non-HTTPS origin.
- The Worker validates and sanitizes all inbound fields before any D1 write: string fields are trimmed and length-bounded; numeric fields are type-coerced and range-checked; enum fields are verified against an allowlist.
- Worker responses never expose stack traces or internal state. Only structured error objects are returned: `{ error: string, rejectedRows?: [...] }`.

**Secret & Credential Management:**
- No API keys, secrets, or service credentials are embedded in the frontend bundle, committed to source, or returned in API responses.
- Clerk's publishable key (safe for frontend exposure by design) is the only credential in the frontend environment. All Clerk secret keys and the Clerk webhook signing secret live in Cloudflare Workers Secrets — never in `wrangler.toml`.
- D1 is accessed exclusively via the Workers binding. It has no public connection string and is not reachable from the internet directly.

**Content Security Policy (CSP):**
Declared in `public/_headers` for Cloudflare Pages:
```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://cdn.tailwindcss.com; style-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://<worker-domain>.workers.dev; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```
No `unsafe-inline` or `unsafe-eval` directives are permitted.

**Subresource Integrity (SRI):**
Every CDN-served `<script>` and `<link>` tag must include `integrity` and `crossorigin="anonymous"` attributes. SRI hashes are pinned to a specific library version and committed to the codebase. Updating a library requires regenerating and committing the corresponding hash. A CI step fails the build if any CDN asset tag is missing its `integrity` attribute.

```html
<!-- Example — DaisyUI from jsDelivr with SRI -->
<link rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/daisyui@5/dist/full.min.css"
  integrity="sha384-<hash>"
  crossorigin="anonymous">
```

**Rate Limiting:**
Cloudflare built-in rate limiting applied to Worker routes:
- Upload endpoint: max 20 requests/minute per IP.
- Webhook receiver: max 5 requests/minute per IP.

**Session Credential Storage:**
- Clerk session tokens are stored in HttpOnly, Secure, SameSite=Strict cookies — never in localStorage or sessionStorage.
- IndexedDB stores only DEO-entered shop data. Session credentials never touch IndexedDB.

---

### 3.7 Authentication — Clerk Magic-Link & Session Model

**Provider:** Clerk. Chosen for: magic-link/OTP support, single-session enforcement, webhook event emission, and Cloudflare Workers SDK compatibility.

**Passwordless Magic-Link Flow:**
1. DEO navigates to the portal login page and enters their email address.
2. Clerk sends a unique, single-use magic link to that email. The link expires in 10 minutes if unused.
3. DEO clicks the link. Clerk authenticates the session in the same browser window. No password is set or required — ever.
4. A 24-hour session is established. The DEO can close and reopen the browser tab within 24 hours without re-authenticating.

**Single Active Session Enforcement:**
Clerk is configured to allow exactly one active session per user at a time. If the DEO authenticates on a second device, browser, or tab, all other active sessions for that user are immediately invalidated. This prevents concurrent uploads from multiple devices that could produce duplicate or conflicting data.

**Session Expiry & Data Preservation:**
- Sessions expire after 24 hours of issue (not inactivity). On expiry, the DEO sees a re-authentication prompt.
- IndexedDB staged data is fully preserved across re-authentication. The DEO resumes exactly where they left off after re-login.
- Connection loss, tab close, device sleep, or network change do not trigger session expiry. Expiry is clock-based only.

**User Provisioning:**
- DEO accounts are created by the system administrator before the upload campaign using Clerk's management API. No self-registration is available.
- Each account is bound to a department-issued email address and carries a `districtName` metadata claim in Clerk, which the Worker uses to scope data access to that district only.
- Account creation is scripted and run once during the M-5 pre-rollout phase.

**Audit Log — Clerk Webhook → D1:**
Clerk emits webhook events for: `session.created`, `session.ended`, `session.revoked`, `user.updated`. A Worker endpoint (`POST /api/webhooks/clerk`) receives these events, validates the Clerk webhook signature (SVIX HMAC), and writes a record to the `audit_log` D1 table.

Application-level events (upload chunk, district submission, circle/sector registration) are also written to `audit_log` directly by the Worker on every successful operation.

**Audit Log Retention — Cron Purge:**
A Cloudflare Cron Trigger (`0 2 * * *` — 02:00 UTC daily) runs a Worker that deletes all `audit_log` rows where `created_at < NOW - 45 days`. Defined in `wrangler.toml` under `[triggers]`. This prevents D1 from accumulating unbounded audit data.

---

### 3.8 Frontend Asset & Bundle Strategy

The guiding principle is **CDN-first**: every substantial asset is loaded from jsDelivr (or the library's official CDN where that is faster/canonical). Cloudflare Pages serves only the Next.js JavaScript bundle, which contains React, the app's component logic, and nothing else. This minimises Cloudflare Pages bandwidth usage.

**Design System — Loaded from CDN:**

| Asset | CDN Source | Size (gzip) | Notes |
|---|---|---|---|
| DaisyUI CSS | `cdn.jsdelivr.net/npm/daisyui@x/dist/full.min.css` | ~25KB | Semantic component classes: `btn`, `card`, `table`, `modal`, `badge`, `drawer`, etc. |
| Tailwind Play CDN | `cdn.tailwindcss.com` | ~50KB | Runtime utility class generation for any Tailwind utilities used in JSX. Scans rendered HTML. |

Both are loaded in `<head>` via `_document.tsx` with SRI attributes. Tailwind is not processed via PostCSS at build time — no Tailwind in the build pipeline, no purge step, no PostCSS config. The Play CDN handles this at runtime.

> **Why Tailwind Play CDN instead of build-time?** The Next.js bundle (React + app logic) is the only asset Cloudflare Pages serves. Removing PostCSS + Tailwind from the build pipeline keeps the bundle exclusively application code. Bandwidth cost for the Tailwind CDN script is borne by jsDelivr, not by Cloudflare.

**Data Layer Libraries — Loaded from CDN:**

| Library | CDN Source | Load Strategy |
|---|---|---|
| SheetJS (`xlsx`) | `cdn.jsdelivr.net/npm/xlsx@x/dist/xlsx.full.min.js` | Dynamically injected on upload page mount (`ssr: false`) — loads only when the DEO reaches the upload screen |
| Dexie.js | `cdn.jsdelivr.net/npm/dexie@x/dist/dexie.min.js` | `<script>` tag in `_document.tsx` — loaded on every DEO page; cached by Service Worker after first load |

**What ships in the Next.js bundle:**
- React + Next.js App Router runtime
- App-specific TypeScript components and logic
- Clerk frontend SDK (React components for auth UI)
- No CSS frameworks, no data libraries, no Excel parsers

**SRI Pin Workflow (for library version upgrades):**
```bash
# Generate SRI hash for a CDN file
curl -s https://cdn.jsdelivr.net/npm/daisyui@5/dist/full.min.css | \
  openssl dgst -sha384 -binary | openssl base64 -A
```
Update the `integrity` attribute and commit the hash alongside the version bump. CI blocks merge if any CDN tag is missing `integrity`.

---

### 3.9 PWA & Offline Architecture

**Progressive Web App:**
The DEO portal is a full PWA. Installed on an iPad or Android tablet, it loads from the Service Worker cache with no network dependency after the first visit.

**`public/manifest.json`:**
```json
{
  "name": "UP Excise Portal",
  "short_name": "Excise Portal",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1d4ed8",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Service Worker Responsibilities:**
- **App shell caching:** On install, pre-caches the Next.js static HTML, JS bundle, and all CDN assets (DaisyUI CSS, Tailwind CDN script, Dexie.js, SheetJS). After first load, the entire app and all its dependencies run offline.
- **Offline detection:** Posts `{ type: 'connectivity', online: boolean }` messages to the active page. The connection status indicator reacts to these messages.
- **Background Sync:** When a chunk upload fails due to connectivity loss, the chunk payload is written to an IndexedDB queue and registered with the Background Sync API (`sync.register('upload-queue')`). On connectivity restoration, the Service Worker retries all queued chunks sequentially. No DEO action is required.
- **Cache invalidation:** Service Worker version is tied to the Next.js build hash. On deployment, the new Service Worker installs and takes over, replacing the cached app shell.

**IndexedDB-First Data Rules:**
- Every DEO action (row edit, pill deletion, field change, unit mark-verified) writes to IndexedDB synchronously — before any network call is made or awaited.
- The network upload is a secondary step. A failed upload changes the row status to `'error'` in IndexedDB; the data itself is never lost.
- On page load, the app always reads from IndexedDB first. Network state has no bearing on what the DEO sees.
- Connection drop, network change, tab sleep, or device screen-off never trigger a session clear, IndexedDB wipe, or logout. Only Clerk's 24-hour clock-based expiry touches the session — and even then, IndexedDB data is preserved through re-authentication.

**Supported Devices:**
| Device | Status | Notes |
|---|---|---|
| iPad (Safari, Chrome) | Fully supported — primary field device | PWA install via Safari "Add to Home Screen"; Background Sync supported in Chrome for iOS |
| Android tablet 10"+ (Chrome) | Fully supported — primary field device | Full PWA install + Background Sync |
| Desktop PC/Mac (Chrome, Firefox, Edge, Safari) | Fully supported — office use | |
| Small-screen mobile (< 768px) | Not supported | Verification table not usable. App does not break but no mobile layouts will be built. |

---

### 3.10 Accessibility, UX Standards & User Preferences

**Dark & Light Mode:**
DaisyUI's built-in theme system defines two themes: `excise-light` and `excise-dark`. Applied by setting `data-theme` on `<html>`. An inline script in `<head>` reads `localStorage` and sets the theme before first paint — no flash of wrong theme on load.

**User Preferences (localStorage):**
| Key | Values | Purpose |
|---|---|---|
| `theme` | `'excise-light' \| 'excise-dark'` | UI theme, persisted across sessions |
| `verificationPageSize` | `25 \| 50 \| 100` | Rows per page in the verification table |
| `connectionBannerDismissed` | `'true'` | Whether the DEO has acknowledged the offline banner |

**ARIA & Keyboard Accessibility:**
- All interactive elements (pill delete buttons, inline edit fields, modal dialogs, upload dropzone, accordion sections) have `aria-label` or `aria-labelledby`.
- The verification table uses `role="grid"`, `role="row"`, `role="gridcell"` for keyboard navigation.
- Dynamic updates (upload progress, live revenue recalculation, pill removal) announced via `aria-live="polite"` regions.
- After a modal closes, focus returns explicitly to the trigger element.
- Color is never the sole status indicator — coordinate warnings use color plus an icon glyph.
- Touch targets are minimum 44×44px (WCAG 2.5.8).

**Connection Status Indicator:**
Persistent banner in the app header:
- **Green — "Online"**: network available, Worker reachable.
- **Amber — "Offline — data saved locally"**: no network; all edits write to IndexedDB; nothing is lost.
- **Amber — "Slow connection"**: ping latency > 2s detected; uploads will retry automatically.
The banner is informational and does not interrupt the DEO's workflow.

**Print View:**
A `@media print` stylesheet renders a clean, paginated layout of the verification table. UI controls (edit buttons, pill delete icons, upload actions, navigation) are hidden. Revenue totals and coordinate status are preserved. DEOs can print their staged data as a paper backup before submission.

**Tablet-First Layout:**
- Minimum supported viewport: **768px** (iPad portrait). No `sm` or `xs` breakpoints are used in DEO-facing layouts.
- Breakpoints: `md` (768px) — tablet portrait; `lg` (1024px) — tablet landscape/desktop.
- Horizontal scroll on the verification table is expected on tablet — it is not a layout bug.
- All Tailwind responsive prefixes in JSX use `md:` or `lg:` only.

---

### 3.11 Search Architecture

**DEO-Level Search (Client-Side, IndexedDB):**
DEOs search their own district's staged data without any network request. Dexie.js `where()` and `filter()` APIs query the local IndexedDB store directly.

Searchable fields:
| Field | Match Type |
|---|---|
| Shop name | Substring, case-insensitive |
| Shop ID | Exact or prefix |
| Thana name | Substring |
| Shop type | Enum filter (dropdown) |
| Circle/sector | Filter from registered units |
| Row status | `pending \| uploaded \| error` |

Results render inline in the verification table. Zero Worker calls.

**Admin/HQ Search (Server-Side, D1):**
Admin users access the separate admin portal. Search queries go to `GET /api/admin/search` (Worker, guarded by Clerk `admin` role):

| Parameter | Type | Description |
|---|---|---|
| `district` | string | Filter by district name (indexed) |
| `thana` | string | Filter by Thana name (indexed) |
| `shopType` | string | Enum filter |
| `circleSector` | string | Filter by circle/sector name |
| `q` | string | Free-text shop name (SQLite `LIKE '%q%'`) |
| `page` | integer | Pagination, default 50 rows/page |

Free-text `LIKE` requires a column scan on `shop_name`. Acceptable at 30,000 rows for infrequent admin use. If response time exceeds 1s, a SQLite FTS5 virtual table (`phase1_fts`) will be added in a post-Phase-1 migration.

---

### 3.12 Admin/HQ Portal Separation

The admin portal is a **separate application** from the DEO portal. It shares `packages/schema` but has its own deployment, auth scope, and Worker route namespace.

| Concern | DEO Portal | Admin Portal |
|---|---|---|
| App | `apps/web` | `apps/admin` |
| Deployment | Cloudflare Pages — DEO domain | Cloudflare Pages — Admin domain |
| Auth | Clerk — `deo` role | Clerk — `admin` role, separate Clerk organization |
| Worker routes | `/api/*` | `/api/admin/*` |
| Data access | Own district only (scoped by Clerk `districtName` claim) | All 75 districts, read-only |

**Admin Capabilities (Phase 1):**
- State-wide dashboard: total vends ingested, per-district upload progress, missing coordinate counts, revenue aggregated by district and shop type.
- D1-backed search across all districts (Section 3.11).
- CSV export of full or filtered D1 dataset (streamed from Worker to browser).
- Audit log viewer: read-only, last 45 days of DEO login and upload activity.
- Circle/sector pre-registration status per district (which DEOs have registered their units).

**Admin Cannot (Phase 1):**
- Edit, correct, or delete any vend records — Phase 1 data is DEO-submitted and read-only from the admin side.
- Trigger re-uploads or corrections on a DEO's behalf.
- Access DEO session tokens or Clerk credential details.

---

## 4. Data Dictionary & Shop Classification Matrix

### 4.1 Administrative Fields

| Field | Type | Rules | Notes |
|---|---|---|---|
| `districtName` | String | Non-null, English only | Canonical district name (e.g., `Lucknow`, `Kanpur Nagar`) |
| `circleSectorName` | String | Non-null, English only | The Excise circle or sector name. Free-text; not normalized against a master list in Phase 1. |
| `thanaName` | String | Non-null, English only | Excise-authoritative Thana name. See Section 2.1. |
| `adjacentThanasRaw` | String | Nullable, intra-district only | Comma-separated list of adjacent Thana names within the same district. |
| `shopId` | String | Non-null, unique per district | Alphanumeric license/registration identifier assigned by the department. |
| `shopName` | String | Non-null, English only | Official name of the retail vend. |
| `uploadedByDeo` | String | Non-null | DEO identifier assigned by the department for this upload campaign. |
| `createdAt` | Timestamp | Non-null, set by system | Unix timestamp (seconds) of record insertion. Not editable by DEO. |

### 4.2 Spatial Fields

| Field | Type | Rules | Notes |
|---|---|---|---|
| `latitudeDms` | String | Nullable | Raw DMS input as entered by DEO, retained for audit. Not used in Phase 2 computation. |
| `longitudeDms` | String | Nullable | Raw DMS input as entered by DEO, retained for audit. |
| `latitudeDecimal` | Real | Nullable, validated against UP bounding box | Computed from DMS or accepted as DD. This is the field used for GIS operations. |
| `longitudeDecimal` | Real | Nullable, validated against UP bounding box | Computed from DMS or accepted as DD. |

### 4.3 Shop Classification & Revenue Matrix

The five retail vend categories, their active financial fields, and their revenue calculation formulas:

#### MODEL_SHOP

| Field | Active? | Description |
|---|---|---|
| `licenseFeeLf` | Yes | Annual license fee paid to the department |
| `mgrAmount` | Yes | Minimum guaranteed revenue commitment |
| All other financial fields | No (default 0) | Not applicable to this shop type |

**Revenue formula:**
```
totalRevenue = licenseFeeLf + mgrAmount
```

---

#### COMPOSITE_SHOP

| Field | Active? | Description |
|---|---|---|
| `licenseFeeLf` | Yes | Annual license fee |
| `mgrAmount` | Yes | Minimum guaranteed revenue commitment |
| All other financial fields | No (default 0) | Not applicable |

**Revenue formula:**
```
totalRevenue = licenseFeeLf + mgrAmount
```

---

#### PRV (Premium Retail Vend)

| Field | Active? | Description |
|---|---|---|
| `licenseFeeLf` | Yes | Annual license fee |
| `mgrAmount` | Yes | Minimum guaranteed revenue commitment |
| All other financial fields | No (default 0) | Not applicable |

**Revenue formula:**
```
totalRevenue = licenseFeeLf + mgrAmount
```

---

#### BHANG_SHOP

| Field | Active? | Description |
|---|---|---|
| `licenseFeeLf` | Yes | Annual license fee |
| `mgqQuantity` | Yes | Minimum guaranteed quantity (units) |
| All other financial fields | No (default 0) | Not applicable |

**Revenue formula:**
```
totalRevenue = licenseFeeLf + (mgqQuantity × 20)
```

The multiplier `20` represents the per-unit value applied to the minimum guaranteed quantity. This value is encoded as a named constant in the application and must not be hardcoded as a magic number in implementation.

---

#### COUNTRY_LIQUOR (Standard)

| Field | Active? | Description |
|---|---|---|
| `basicLicenseFeeBlf` | Yes | Basic license fee for country liquor license |
| `considerationFee` | Yes | Consideration fee component |
| All other financial fields | No (default 0) | Not applicable |

**Revenue formula:**
```
totalRevenue = basicLicenseFeeBlf + considerationFee
```

---

#### COUNTRY_LIQUOR with CL5CC Endorsement (`hasCl5cc = true`)

This is **not a separate shop type**. A Country Liquor shop with a beer endorsement is stored as `shopType = COUNTRY_LIQUOR` with `hasCl5cc = true`. The CL5CC flag activates additional revenue fields and modifies the revenue formula.

| Field | Active? | Description |
|---|---|---|
| `basicLicenseFeeBlf` | Yes | Basic license fee for country liquor license |
| `considerationFee` | Yes | Consideration fee. Note: for CL5CC shops, MGQ-related components may be embedded in the consideration fee per department conventions — verify with department before finalizing. |
| `specialBeerLf` | Yes (CL5CC only) | Special license fee for the beer endorsement |
| `specialBeerMgr` | Yes (CL5CC only) | Minimum guaranteed revenue specific to beer sales |
| All other financial fields | No (default 0) | Not applicable |

**Revenue formula:**
```
totalRevenue = basicLicenseFeeBlf + considerationFee + specialBeerLf + specialBeerMgr
```

**UI enforcement:** The frontend must dynamically show/hide financial input fields based on `shopType` and `hasCl5cc`. When `hasCl5cc` is checked, `specialBeerLf` and `specialBeerMgr` fields must become visible and required. When `hasCl5cc` is unchecked, they must be hidden and their values set to 0 before submission.

### 4.4 Complete Revenue Dispatch Table (Quick Reference)

| Shop Type | `hasCl5cc` | Formula |
|---|---|---|
| `MODEL_SHOP` | false | `LF + MGR` |
| `COMPOSITE_SHOP` | false | `LF + MGR` |
| `PRV` | false | `LF + MGR` |
| `BHANG_SHOP` | false | `LF + (MGQ × 20)` |
| `COUNTRY_LIQUOR` | false | `BLF + Consideration Fee` |
| `COUNTRY_LIQUOR` | **true** | `BLF + Consideration Fee + Special Beer LF + Special Beer MGR` |

### 4.5 Data Classification Summary

| Field Name | Column Name | Type | Nullable | Default |
|---|---|---|---|---|
| Primary ID | `id` | Integer (PK, Auto) | No | — |
| District Name | `district_name` | Text | No | — |
| Circle/Sector Name | `circle_sector_name` | Text | No | — |
| Thana Name | `thana_name` | Text | No | — |
| Adjacent Thanas (Raw) | `adjacent_thanas_raw` | Text | Yes | null |
| Shop ID | `shop_id` | Text | No | — |
| Shop Name | `shop_name` | Text | No | — |
| Shop Type | `shop_type` | Text (Enum) | No | — |
| CL5CC Flag | `has_cl5cc` | Integer (Boolean) | No | 0 (false) |
| Latitude DMS | `latitude_dms` | Text | Yes | null |
| Longitude DMS | `longitude_dms` | Text | Yes | null |
| Latitude (DD) | `latitude_decimal` | Real | Yes | null |
| Longitude (DD) | `longitude_decimal` | Real | Yes | null |
| License Fee (LF) | `license_fee_lf` | Integer | Yes | 0 |
| Basic License Fee (BLF) | `basic_license_fee_blf` | Integer | Yes | 0 |
| MGR Amount | `mgr_amount` | Integer | Yes | 0 |
| MGQ Quantity | `mgq_quantity` | Integer | Yes | 0 |
| Consideration Fee | `consideration_fee` | Integer | Yes | 0 |
| Special Beer LF | `special_beer_lf` | Integer | Yes | 0 |
| Special Beer MGR | `special_beer_mgr` | Integer | Yes | 0 |
| Total Revenue | `total_revenue` | Integer | No | 0 |
| Uploaded By DEO | `uploaded_by_deo` | Text | No | — |
| Created At | `created_at` | Integer (Timestamp) | No | — |

---

## 5. Phase 1 Database Schema

The schema is implemented in Drizzle ORM targeting Cloudflare D1 (SQLite). The design is intentionally **flat and denormalized** for Phase 1. Relational normalization of circles, sectors, and Thana boundaries is deferred to Phase 2, after name variations across 75 districts have been cleaned and reconciled.

### 5.1 Design Rationale

Strict relational foreign keys at this stage (e.g., a `thanas` reference table that `phase1_raw_collection` must satisfy) would create upload blockers. District offices use legacy spreadsheets with minor naming inconsistencies — "Gomti Nagar" vs "Gomatinagar" vs "GOMTINAGAR" — that cannot be pre-predicted and pre-seeded. By accepting Thana names as free text and indexing them for fast lookups, Phase 1 completes without DEO friction. Phase 2's data cleaning pass resolves canonical names before relational constraints are enforced.

Revenue fields are stored as individual integers (in Indian Rupees, paise-truncated) rather than a JSON blob to allow direct SQL-level aggregation: `SUM(license_fee_lf)`, `SUM(mgr_amount)` etc. without application-layer parsing.

### 5.2 Drizzle ORM Schema

```typescript
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const phase1RawCollection = sqliteTable('phase1_raw_collection', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Regional & Jurisdictional Identifiers
  districtName: text('district_name').notNull(),
  circleSectorName: text('circle_sector_name').notNull(),
  thanaName: text('thana_name').notNull(),

  // Adjacent Thanas saved as a comma-separated token string for frontend pill-parsing
  adjacentThanasRaw: text('adjacent_thanas_raw'),

  // Shop Classification Details
  shopId: text('shop_id').notNull(),
  shopName: text('shop_name').notNull(),
  shopType: text('shop_type').notNull(),       // MODEL_SHOP | COMPOSITE_SHOP | COUNTRY_LIQUOR | BHANG_SHOP | PRV
  hasCl5cc: integer('has_cl5cc', { mode: 'boolean' }).default(false).notNull(), // CL5CC Privilege Tracker

  // Spatial Coordinates — DMS retained for audit; DD used for all computation
  latitudeDms: text('latitude_dms'),
  longitudeDms: text('longitude_dms'),
  latitudeDecimal: real('latitude_decimal'),
  longitudeDecimal: real('longitude_decimal'),

  // Isolated Financial Variable Tracking (INR, paise-truncated)
  licenseFeeLf: integer('license_fee_lf').default(0),           // MODEL_SHOP, COMPOSITE_SHOP, PRV, BHANG_SHOP
  basicLicenseFeeBlf: integer('basic_license_fee_blf').default(0), // COUNTRY_LIQUOR (standard & CL5CC)
  mgrAmount: integer('mgr_amount').default(0),                   // MODEL_SHOP, COMPOSITE_SHOP, PRV
  mgqQuantity: integer('mgq_quantity').default(0),               // BHANG_SHOP (units, not INR)
  considerationFee: integer('consideration_fee').default(0),     // COUNTRY_LIQUOR (standard & CL5CC)
  specialBeerLf: integer('special_beer_lf').default(0),         // COUNTRY_LIQUOR + hasCl5cc only
  specialBeerMgr: integer('special_beer_mgr').default(0),       // COUNTRY_LIQUOR + hasCl5cc only

  // Aggregated Verification Field — computed by application, validated by Worker
  totalRevenue: integer('total_revenue').notNull().default(0),

  // Operational Audit Tracking
  uploadedByDeo: text('uploaded_by_deo').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),

}, (table) => ({
  // High-performance read indices for state-level dashboards and Phase 2 queries
  districtIdx: index('p1_district_idx').on(table.districtName),
  thanaIdx: index('p1_thana_idx').on(table.thanaName),
  shopIdIdx: index('p1_shop_idx').on(table.shopId),
}));
```

### 5.3 Circle/Sector Reference Table

The `district_circles_sectors` table stores the circles and sectors registered by each DEO before the upload campaign. It is a lightweight reference table — its rows are created by the DEO through the Circle/Sector Management UI and are then used to populate dropdowns, pre-label templates, and enforce the completeness gate at submission.

```typescript
export const districtCirclesSectors = sqliteTable('district_circles_sectors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  districtName: text('district_name').notNull(),
  name: text('name').notNull(),               // e.g. "Circle 1", "Sector A"
  type: text('type').notNull(),               // 'circle' | 'sector'
  createdByDeo: text('created_by_deo').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  districtIdx: index('dcs_district_idx').on(table.districtName),
}));
```

The `circle_sector_name` field in `phase1_raw_collection` (Section 5.2) references a value from this table by name (not by FK, for the same flexibility rationale as Thana names — see Section 5.1). The Worker validates that the `circleSectorName` on each uploaded chunk matches a registered unit for the DEO's district before inserting.

### 5.4 Audit Log Table

Every significant event in the system — DEO login, session revocation, upload chunk, district submission, circle/sector registration — is recorded here. Clerk webhook events and application-level events both write to this table. Records are purged after 45 days by the Cron Trigger defined in Section 3.7.

```typescript
export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // 'login' | 'logout' | 'session_revoked' | 'upload_chunk' | 'district_submitted' | 'unit_registered'
  eventType: text('event_type').notNull(),

  deoId: text('deo_id').notNull(),
  districtName: text('district_name'),

  // Captured from the request context on every Worker event
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),

  // JSON string for event-specific detail (e.g., chunk index, row count, unit name)
  metadata: text('metadata'),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),

}, (table) => ({
  deoIdx: index('al_deo_idx').on(table.deoId),
  // Indexed for efficient range-delete in the daily cron purge
  createdAtIdx: index('al_created_at_idx').on(table.createdAt),
}));
```

### 5.5 Schema Notes & Constraints

**`shopType` enum enforcement:** Drizzle ORM on SQLite does not enforce CHECK constraints via the ORM layer by default. The Worker validation layer (Section 3.4) enforces the enum at runtime. A migration file will include an explicit `CHECK (shop_type IN (...))` constraint for defense-in-depth.

**`totalRevenue` dual-verification:** This field is computed by the browser using the formulas in Section 4.3, transmitted with the row, and then **independently recomputed by the Worker** before insert. If the values differ by more than a tolerance of 0 (exact match required), the Worker rejects the row. This prevents silent data corruption from formula bugs in the frontend that could compromise Phase 2 revenue analysis.

**`mgqQuantity` is units, not INR:** For `BHANG_SHOP`, `mgqQuantity` stores the number of units (quantity), not a rupee value. The `× 20` multiplier in the formula converts it to INR for `totalRevenue`. This distinction must be documented in the DEO training materials so the correct value is entered.

**Coordinate nullability:** Both DMS and DD coordinate pairs are nullable. Not all vends in legacy records have coordinates. Phase 1 does not block uploads on missing coordinates — it surfaces them in a "missing coordinates" dashboard view so the department can prioritize ground-truth verification in Phase 2.

**`createdAt` as Unix timestamp (seconds):** Stored as an integer in seconds-since-epoch rather than a formatted string, for efficient range queries in D1.

---

## 6. Development Milestones & Action Plan

Phase 1 development is organized into six milestones. Each milestone has a clear entry criterion (what must be true before it starts) and exit criterion (what must be delivered before the next begins).

### Milestone Overview

```
M-0: Foundation & Repo Setup              [Week 1]
M-1: Schema, Migrations & Worker Skeleton [Week 1-2]
M-2: Excel Ingestion & Coordinate Engine  [Week 2-3]
M-3: Verification UI & IndexedDB Layer    [Week 3-4]
M-4: Worker Batch API & D1 Integration    [Week 4-5]
M-5: Dashboard, Testing & DEO Handoff     [Week 5-6]
```

---

### M-0: Foundation & Repository Setup

**Objective:** Establish the development environment, project structure, and CI baseline.

**Deliverables:**

- [ ] Monorepo structure initialized (`apps/web`, `apps/admin`, `apps/worker`, `packages/schema`).
- [ ] `wrangler.toml` configured for Cloudflare Pages + Workers + D1 binding + Cron Trigger (`0 2 * * *` for audit log purge).
- [ ] Drizzle ORM configured with D1 adapter.
- [ ] GitHub Actions CI pipeline: type-check, lint, Wrangler dry-run deploy, and SRI attribute presence check on every PR.
- [ ] Cloudflare Pages projects created: DEO portal + Admin portal; preview deploys enabled on both.
- [ ] D1 database provisioned (`phase1-dev` and `phase1-prod`).
- [ ] All secrets (Clerk secret key, Clerk webhook signing secret) stored in Cloudflare Workers Secrets — not in `wrangler.toml` or source.
- [ ] Clerk project created: magic-link auth enabled, single-session enforcement configured, `deo` and `admin` roles defined, separate Clerk organization for admin.
- [ ] `public/_headers` committed with full CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- [ ] `public/manifest.json` committed with PWA metadata (name, icons, display: standalone, theme color).
- [ ] Service Worker skeleton (`public/sw.js`) committed: app shell cache strategy stubbed, registered in `_document.tsx`.
- [ ] `_document.tsx` stubbed with CDN `<link>` and `<script>` tags for DaisyUI and Tailwind Play CDN (with SRI attribute placeholders).

**Exit criterion:** `wrangler deploy --dry-run` passes on CI. `GET /healthz` returns `200 OK`. CI fails if any CDN tag is missing an `integrity` attribute. PWA manifest validates in Chrome DevTools Lighthouse.

---

### M-1: Schema, Migrations & Worker Skeleton

**Objective:** Establish the database schema in D1 and a functional Worker that can receive requests.

**Deliverables:**

- [ ] Drizzle schema file (`packages/schema/src/phase1.ts`) finalized per Sections 5.2, 5.3, and 5.4 (`phase1_raw_collection`, `district_circles_sectors`, `audit_log`).
- [ ] Migration file generated and applied to `phase1-dev` and `phase1-prod` — covers all three tables.
- [ ] SQLite `CHECK` constraint for `shop_type` added to migration.
- [ ] Hono Worker skeleton: `/api/upload/chunk`, `/api/districts/:district/units` (GET + POST), `/api/webhooks/clerk` (POST — Clerk event receiver), `/api/healthz`, CORS configured for Pages preview domains.
- [ ] Clerk webhook Worker route implemented: validates SVIX signature, writes `session.created` / `session.ended` / `session.revoked` events to `audit_log`.
- [ ] Cron Trigger Worker function implemented: deletes `audit_log` rows older than 45 days.
- [ ] Admin Worker route skeleton `/api/admin/*` with Clerk `admin` role guard middleware stub.
- [ ] Worker unit tests for: revenue recomputation logic, SRI hash validation helper, Clerk role guard.

**Exit criterion:** All three D1 tables exist with correct column names. Clerk webhook fires and a test event appears in `audit_log`. Cron Trigger purge function deletes test records older than 45 days in local dev.

---

### M-2: Excel Ingestion & Coordinate Conversion Engine

**Objective:** Build the browser-side data processing pipeline — the most critical component of the architecture.

**Deliverables:**

- [ ] SheetJS integrated in `apps/web` as a client-side-only import (dynamic import with `ssr: false`).
- [ ] Excel column-to-schema field mapping defined and documented. The standardized DEO spreadsheet template columns are mapped to `phase1_raw_collection` fields.
- [ ] Coordinate normalizer implemented and unit-tested:
  - Parses DMS strings (e.g., `26°50'48.12"N`) to DD.
  - Parses space/slash-separated DMS numeric fields to DD.
  - Accepts pure DD input directly.
  - Validates against UP bounding box.
  - Returns structured result: `{ latitudeDecimal, longitudeDecimal, warning?: string }`.
- [ ] Revenue calculator implemented and unit-tested for all six formula variants (Section 4.4).
- [ ] Row-level validation function implemented: checks required fields, enum values, cross-field constraints (e.g., `hasCl5cc = true` requires `shopType = COUNTRY_LIQUOR`).
- [ ] Standardized base Excel template (`.xlsx`) created and version-controlled in `docs/templates/`. This is the blank canonical layout.
- [ ] Per-circle/sector template generation: Worker route `/api/districts/:district/units/:unitId/template` returns the base template with district name and circle/sector name pre-filled in designated header cells.

**Exit criterion:** A test Excel file with 100 rows covering all shop types and both DMS/DD input formats parses correctly in a Storybook/JSDOM test. Revenue totals match expected values. Coordinate conversions match reference values to 4 decimal places. A generated per-circle/sector template downloads with correct pre-filled headers.

---

### M-3: Verification UI & IndexedDB Persistence Layer

**Objective:** Build the DEO-facing frontend — the staging, review, and submission interface.

**Deliverables:**

- [ ] Clerk magic-link auth integrated in DEO portal login page. Post-auth redirect to verification UI. Unauthenticated routes redirect to login.
- [ ] Single-session enforcement verified: authenticating in Browser B invalidates the session in Browser A.
- [ ] Dexie.js configured: `phase1_staging` IndexedDB table mirrors the schema. Each row carries `status: 'pending' | 'uploaded' | 'error'` and `circleSectorName`.
- [ ] Circle/Sector Management UI: DEO creates and lists circles/sectors, downloads pre-labeled Excel templates per unit.
- [ ] File upload component: DEO selects a registered circle/sector, uploads Inspector-filled Excel — drag-and-drop + click-to-upload, triggers SheetJS parse (loaded from jsDelivr CDN dynamically), writes to IndexedDB tagged with the selected unit.
- [ ] Parse progress indicator (parsing 5,000 rows can take 1–2 seconds; shown as a DaisyUI progress bar).
- [ ] Verification table component — grouped by circle/sector (DaisyUI tab or collapse components):
  - Paginated display (user-preference rows per page: 25/50/100).
  - Inline edit for all DEO-editable fields.
  - Revenue preview column (computed live from financial inputs).
  - Coordinate status indicator — color + icon glyph (never color alone).
- [ ] Adjacent Thana pill component:
  - Parses `adjacentThanasRaw` into removable DaisyUI badge/pill components.
  - Cross-district pills highlighted red; must be removed before the row is marked clean.
  - Deletion updates `adjacentThanasRaw` in IndexedDB immediately.
- [ ] Shop type field toggling: financial inputs show/hide based on `shopType` and `hasCl5cc`.
- [ ] Completeness gate: district submit button disabled until all registered units have at least one verified file. Per-unit status summary panel displayed.
- [ ] Session recovery: on page load, IndexedDB is read first; staged data and UI state are restored regardless of network.
- [ ] Service Worker fully implemented: app shell cache, CDN asset cache (DaisyUI, Tailwind CDN, Dexie.js, SheetJS), offline detection message relay.
- [ ] Background Sync registered on failed chunk uploads; retries transparently on reconnect.
- [ ] Dark/light mode toggle (DaisyUI themes); `localStorage` persistence; inline `<head>` script to apply theme before first paint.
- [ ] User preferences (theme, page size) read and written to `localStorage` on every change.
- [ ] Connection status indicator (Online / Offline / Slow) in app header using DaisyUI alert component.
- [ ] `@media print` stylesheet for verification table.
- [ ] ARIA attributes on all interactive components (pill buttons, edit fields, upload dropzone, modals).
- [ ] PWA install prompt surfaced on iPad Safari and Android Chrome.
- [ ] Client-side search in the verification UI (IndexedDB-powered, no network call).
- [ ] Audit events written: `upload_chunk` and `unit_registered` events logged to `audit_log` via Worker.

**Exit criterion:** DEO can register two circles, upload a separate Excel for each (parsed from jsDelivr-served SheetJS), review grouped rows, remove a red adjacency pill, toggle dark mode, force-refresh the page, and see all data and theme preference restored from IndexedDB/localStorage. Submit button is blocked until both circles are verified. PWA install prompt appears on an iPad browser.

---

### M-4: Worker Batch API & D1 Integration

**Objective:** Complete the server-side ingestion path — Worker validation, batch insert, and acknowledgment.

**Deliverables:**

- [ ] `/api/upload/chunk` Worker route fully implemented:
  - Accepts JSON body: `{ rows: Phase1Row[], deoId: string, circleSectorName: string, chunkIndex: number }`.
  - Validates that `circleSectorName` matches a registered unit for the DEO's district (`district_circles_sectors` lookup).
  - Validates each row per the checklist in Section 3.4.
  - Recomputes `totalRevenue` per row and rejects mismatches.
  - Calls `db.batch()` for atomic insert of the entire chunk.
  - Returns `{ accepted: number, rejected: [{ rowIndex, reason }] }`.
- [ ] Upsert strategy implemented: if `shopId` + `districtName` already exists, update rather than duplicate. Strategy to be confirmed with department (overwrite vs. versioning).
- [ ] Frontend upload orchestrator:
  - Splits IndexedDB `pending` rows per circle/sector into 500-row chunks.
  - Sends chunks sequentially across all units (not parallel — prevents Worker rate-limit pressure).
  - Marks rows as `'uploaded'` in IndexedDB on acknowledgment.
  - Marks rows as `'error'` on rejection, surfaces rejection reason in UI.
  - Progress bar shows both per-unit progress and overall district progress.
- [ ] End-to-end integration test: upload 1,000 test rows across 2 circles via the full browser → Worker → D1 path in a Wrangler local dev environment.

**Exit criterion:** 1,000 test rows across 2 circles appear in D1 after a full upload cycle. IndexedDB shows all rows as `'uploaded'`. A forced mid-upload interruption followed by session recovery and resume results in no duplicate rows in D1. A circle not yet uploaded prevents final district submission.

---

### M-5: Dashboard, Testing & DEO Handoff

**Objective:** Deliver monitoring visibility, complete testing coverage, and prepare DEO training materials.

**Deliverables:**

- [ ] Admin portal (`apps/admin`) fully functional:
  - State-wide dashboard: total vends, per-district progress, missing coordinate counts, revenue by district and shop type.
  - D1-backed search across all districts with pagination (Section 3.11).
  - CSV export of full or filtered D1 dataset streamed from Worker.
  - Audit log viewer: read-only table of last 45 days of DEO activity.
  - Circle/sector pre-registration status per district.
- [ ] DEO accounts provisioned in Clerk from department email list using management API script (run once).
- [ ] End-to-end test suite (Playwright):
  - Happy path: login via magic link → register circle/sector → download template → upload Inspector Excel → verify → submit, for each of the 5 shop types.
  - Multi-file district submission: register 2 circles, upload separate Excels, verify grouped view, complete submission.
  - Completeness gate: submission blocked when one circle is missing — verified.
  - CL5CC endorsement flow: `specialBeerLf` and `specialBeerMgr` visible and contributing to `totalRevenue`.
  - Cross-district adjacency pill rejection.
  - Session recovery: forced page refresh mid-verification — all data and theme preference restored.
  - Session invalidation: second login from a different browser revokes the first session.
  - Offline scenario: disconnect network mid-verification, continue editing, reconnect — Background Sync retries queued upload chunks.
  - Mid-upload interruption and resume (no duplicate rows in D1).
  - PWA offline: installed app shell loads with no network.
- [ ] Load test: 75 simultaneous DEO sessions each uploading 500 rows. Worker stays within free tier CPU and D1 write quota.
- [ ] SRI audit: CI build fails if any CDN `<script>` or `<link>` tag is missing `integrity`. All SRI hashes verified against live jsDelivr responses.
- [ ] Lighthouse audit on DEO portal: PWA score ≥ 90, Accessibility score ≥ 90.
- [ ] ARIA audit using axe-core: all critical violations resolved.
- [ ] Audit log verified: login, upload chunk, and submission events written correctly. 45-day purge cron tested.
- [ ] DEO training documentation (`docs/deo-guide.md`):
  - Screenshot-annotated walkthrough: magic-link login → circle/sector registration → template download → Inspector distribution → per-unit upload → grouped verification → district submission.
  - Excel template column specifications.
  - Coordinate input instructions (DMS and DD with examples).
  - Adjacent Thana instructions with symmetric cross-district exclusion rule explained plainly.
  - PWA install instructions for iPad and Android tablet.
  - Dark/light mode toggle and preference saving.
  - Offline usage: what works without internet, what requires connectivity.
  - Contact and escalation procedure for upload errors.
- [ ] Standardized Excel templates distributed to all 75 district offices.
- [ ] DEO pilot: 3–5 districts complete the full workflow before state-wide rollout.

**Exit criterion:** Pilot districts complete upload with zero Worker errors. Admin dashboard reflects accurate counts. Lighthouse PWA and Accessibility scores ≥ 90. Department signs off on data completeness for pilot districts. System cleared for state-wide rollout.

---

### Timeline Summary

| Milestone | Duration | Key Dependency |
|---|---|---|
| M-0: Foundation & Repo Setup | 4 days | Cloudflare account access, GitHub repo, Clerk account, DEO email list from department |
| M-1: Schema, Migrations & Worker Skeleton | 5 days | M-0 complete |
| M-2: Excel Ingestion & Coordinate Engine | 5 days | DEO Excel template finalized with department |
| M-3: Verification UI, Auth, PWA & IndexedDB | 10 days | M-2 complete |
| M-4: Worker Batch API & D1 Integration | 5 days | M-3 complete |
| M-5: Admin Portal, Testing & DEO Handoff | 10 days | M-4 complete, pilot district identified |
| **Total** | **~39 working days** | |

### Pre-Campaign Blockers (Must Resolve Before M-2)

The following require department action before engineering can proceed past M-1:

1. **DEO email addresses:** The department must supply all 75 DEO email addresses before M-0 can close. Clerk accounts are provisioned from this list. Without it, the auth system cannot be configured and no DEO can log in.
2. **Excel template column layout:** The DEO spreadsheet format must be locked down. Column names, order, and data types must be confirmed with the department before the SheetJS column-mapping is built. Changes to the template after M-2 require code changes.
2. **Thana master list (best-effort):** A reference list of Thana names per district, even if incomplete, is valuable for building the adjacent Thana cross-district filter. If unavailable, the filter will use a runtime check against already-uploaded Thana names for the same district.
3. **Shop count estimates per district:** Knowing the expected vend count per district allows the dashboard to display accurate "X of Y uploaded" progress metrics.
4. **DEO credential and identifier assignment:** The department must assign and distribute DEO portal credentials and their `uploadedByDeo` identifiers before the upload campaign begins. DEOs must also complete circle/sector pre-registration before distributing templates to Inspectors.
5. **Circle/sector naming convention:** DEOs need a consistent naming convention for circles and sectors (e.g., "Circle 1" vs "Circle I" vs "Kotwali Circle") so that the pre-registration step produces clean, unambiguous unit names across districts.
6. **Upsert vs. versioning decision:** If a DEO re-uploads corrected data for their district, does the system overwrite existing records or create versioned entries? This must be decided before M-4 implementation.

---

## Appendix A: Technology Stack Summary

| Layer | Technology | Rationale |
|---|---|---|
| Frontend Framework | Next.js (App Router) | Static-first, Cloudflare Pages compatible, strong TypeScript support |
| Deployment | Cloudflare Pages | Zero-cost CDN, global edge, integrates with Workers and D1 |
| Backend Runtime | Cloudflare Workers | Serverless edge compute, 0ms cold start, free tier sufficient for Phase 1 |
| Backend Framework | Hono | Lightweight, TypeScript-first, built for Workers, minimal overhead |
| Database | Cloudflare D1 (SQLite) | Serverless SQLite at the edge, native `db.batch()`, free tier covers Phase 1 |
| ORM | Drizzle ORM | Type-safe, SQLite-native, generates clean migrations, zero runtime overhead |
| Authentication | Clerk | Passwordless magic-link auth, single-session enforcement, webhook events, Cloudflare Workers SDK |
| UI Components | DaisyUI | Tailwind CSS plugin — semantic component classes, zero JS runtime, loaded from jsDelivr CDN |
| CSS Utilities | Tailwind Play CDN | Runtime utility class generation; loaded from CDN — no PostCSS build step, keeps CF Pages bundle pure app logic |
| Excel Parsing | SheetJS (`xlsx`) | Loaded from jsDelivr CDN dynamically on upload page; ~900KB, never bundled |
| Local Persistence | Dexie.js (IndexedDB) | Loaded from jsDelivr CDN; offline-first staging layer for all DEO-entered data |
| Offline / PWA | Service Worker + Background Sync | App shell cache, CDN asset cache, transparent upload retry on reconnect |
| Scheduled Tasks | Cloudflare Cron Triggers | Daily audit log purge at 45-day threshold; defined in `wrangler.toml` |
| Coordinate Conversion | Custom utility | DMS-to-DD is a 3-line formula; no library needed |
| Testing | Vitest + Playwright | Unit tests for business logic; E2E for full upload and auth flows |

## Appendix B: Glossary

| Term | Definition |
|---|---|
| DEO | District Excise Officer. The most senior excise post at the district level, overseeing all Excise Inspectors across every circle and sector in their district. The sole authenticated portal user for their district. |
| Inspector | Excise Inspector. The ground-level officer assigned to one or more circles/sectors. Fills the Excel template for their jurisdiction and hands it to the DEO. No portal access. |
| Thana | The atomic geographic unit. Named after police station jurisdictions but interpreted under Excise administrative authority. |
| DD | Decimal Degrees. Coordinate format used for all GIS operations (e.g., `26.8467°N`). |
| DMS | Degrees, Minutes, Seconds. Legacy coordinate format in historical Excise records (e.g., `26°50'48.1"N`). Converted to DD by the frontend before any data leaves the browser. |
| LF | License Fee. Annual fee for Model Shop, Composite Shop, PRV, and Bhang Shop licenses. |
| MGR | Minimum Guaranteed Revenue. Revenue floor commitment for Model Shop, Composite Shop, and PRV. |
| MGQ | Minimum Guaranteed Quantity. Unit-based floor for Bhang Shop, multiplied by `BHANG_MGQ_MULTIPLIER` (20) to derive INR value. |
| BLF | Basic License Fee. Base fee for Country Liquor licenses. |
| CL5CC | Country Liquor license with beer endorsement. Stored as `COUNTRY_LIQUOR` with `hasCl5cc = true`. |
| Magic Link | A single-use, time-limited authentication link sent to the DEO's email. Clicking it in the same browser establishes a 24-hour session. No password is ever set. |
| PWA | Progressive Web App. The DEO portal is installable on iPad or Android tablet and functions offline via Service Worker + IndexedDB. |
| Service Worker | A browser background script that caches the app shell and CDN assets, detects connectivity changes, and retries queued uploads via Background Sync when connectivity is restored. |
| Background Sync | A Web API that queues failed network requests (upload chunks) and retries them automatically when the browser regains connectivity. Requires Service Worker. |
| SRI | Subresource Integrity. A browser security mechanism that verifies CDN-served assets against a cryptographic hash before executing them. All CDN assets in this project include SRI attributes. |
| CSP | Content Security Policy. An HTTP header that restricts which scripts, styles, and connections the browser allows. Declared in `public/_headers` for Cloudflare Pages. |
| Audit Log | The `audit_log` D1 table. Records every DEO login, session event, upload chunk, and district submission. Purged after 45 days by Cron Trigger. |
| Admin Portal | The separate `apps/admin` application deployed on its own Cloudflare Pages domain. Read-only access to all district data; used by HQ/department administration. |
| D1 | Cloudflare D1. Serverless SQLite database at the edge. |
| Workers | Cloudflare Workers. Serverless TypeScript runtime. 10ms CPU limit per request. |
| `db.batch()` | D1 API for executing multiple SQL statements in a single transaction. Used to minimize write operation count against the free tier quota. |
| Phase 2 | The subsequent boundary optimization phase. Uses Phase 1 data to remap Inspector jurisdictions. Out of scope for this document. |

---

*Document maintained by SIBIN Tech Solutions. For technical queries contact the engineering team. For scope or business rule queries escalate to the Department of Excise, Government of Uttar Pradesh.*
