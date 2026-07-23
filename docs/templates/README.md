# Excel Templates — UP Excise Portal Phase 1

Two templates are used in the Phase 1 data collection campaign. Both are generated in-browser by ExcelJS (`apps/web/src/lib/excel.ts`) — there is no static template file committed to this repo for either; `demo-district-data.xlsx` alongside this file is sample data for local testing only, not a template to distribute.

---

## 1. DEO Provision Template (Admin use)

**Who uses it:** HQ Administrator/Superadmin, for initial campaign setup or large batches of DEO accounts.

**Where to get it:** `/admin/provision` ("District Master" in the nav) → "Download Blank Template" button. The download is pre-filled with all 75 District Name + Division rows from the live `districts` table — the admin only fills in the DEO columns. Superadmin/owner-only page; the underlying `POST /api/admin/bulk-provision` route 403s a plain `admin` session.

**What it contains:** Sheet "DEO List" (data) + sheet "Column Guide" (descriptions). Fill in the DEO columns for each district row, then upload the file on the same page.

| Column | Description | Notes |
|---|---|---|
| `District Name` | Canonical district name | Must be unique and match `districts.name` exactly. Pre-filled. |
| `Division` | Administrative division | Bare division name (e.g. `Lucknow`, not "Lucknow Division") — 18 divisions in UP. Pre-filled. |
| `DEO Name` | Full name of the District Excise Officer | Display only, for admin portal reference. |
| `DEO Email` | Department-issued email for this DEO | Creates/updates the `auth_users` row (custom HMAC magic-link auth — there is no external auth provider). Must be unique across all rows. |
| `DEO Identifier` | Department-assigned alphanumeric ID | Stored as `uploaded_by_deo` on every shop record. Must be unique. |
| `Expected Vend Count` | Approximate retail vend count for the district | Used for "X of Y uploaded" progress display. |

**Validation rules:**
- `DEO Email` and `DEO Identifier` must be unique across all rows.
- Operation is atomic per row (`db.transaction`) and idempotent by district name — re-uploading updates metadata and syncs the `auth_users` row rather than creating duplicates.
- A DEO account created this way can sign in via magic-link email, or (more commonly — see CLAUDE.md's "CUG-hashed login") via their department CUG mobile number if a `deoCugHash` was separately seeded via `pnpm seed:deo-accounts`. Bulk-provision itself only sets up email-based login.

---

## 2. District Upload Template (DEO + Inspector use)

**Who uses it:** DEO downloads and distributes to Inspectors. Inspectors fill their section and return it. DEO consolidates all sections into one file and uploads it as a single `.xlsx`.

**Where to get it:** `/units` → "Download District Template" button — only available after circles/sectors have been registered (locked). One file per district, pre-filled with that district's own registered unit names.

**Template structure (3 sheets):**
- **"Data Entry"** — the data entry sheet. Row 1 = merged title (district name). Row 2 = bilingual (English/Hindi) column headers, locked via sheet protection (no password — a guardrail, not a security boundary) so it can't be overtyped by mistake; every data cell below it stays unlocked. Each header cell also carries a hover tooltip (Excel cell comment) restating that column's rules.
- **"Instructions"** — bilingual description of every column: what it means, which shop types require it, and any notes.
- **"Reference Data"** (hidden) — the district's registered circle/sector unit names, feeding the `circle_sector_name` dropdown on Data Entry. Sheet-protected read-only; rebuilt fresh from the live unit list on every download, so there is never a reason to edit it directly.

There is no separate "Demo Data" sheet with example rows — an earlier version of this template had one, and DEOs mistook it for a second copy of their own data.

### Required columns (all shop types)

| Column | Description |
|---|---|
| `circle_sector_name` | Dropdown — must select a pre-registered unit name (fed from the hidden Reference Data sheet). |
| `thana_name` | Excise-authoritative Thana name. English only, free text — no state-wide Thana master list exists yet, so nothing is checked against a reference list. |
| `shop_id` | Department-assigned license/registration ID. Unique per district. |
| `shop_name` | Official name of the vend. English only. |
| `shop_type` | Dropdown, friendly labels: `Model Shop`, `Composite Shop (FL + Beer)`, `PRV (Premium Retail Vend)`, `Bhang Shop`, `Country Liquor`. Maps back to the exact backend enum (`MODEL_SHOP`, `COMPOSITE_SHOP`, `PRV`, `BHANG_SHOP`, `COUNTRY_LIQUOR`) on parse. |
| `has_cl5cc` | Dropdown: `TRUE` or `FALSE`. `TRUE` is only valid when Shop Type is Country Liquor — any other combination is rejected on upload by the Worker, not by the cell itself (a plain dropdown can't carry that conditional). |

### Optional columns (all shop types)

| Column | Description |
|---|---|
| `adjacent_thanas_raw` | Comma-separated adjacent Thana names, same district only (e.g. `Kotwali, Hazratganj`). On `/verify`, a name is flagged red only if it doesn't yet appear as a Thana elsewhere in this district's own uploaded data — a same-district, same-upload typo hint, not an enforced cross-district check. It does **not** block submission and is not checked against any master list (none exists yet). |
| `latitude` | Latitude — either DMS (`26°50'48.12"N`) or decimal degrees (`26.8467`). One column handles both formats via automatic parsing. |
| `longitude` | Longitude — either DMS (`80°56'46.3"E`) or decimal degrees (`80.9462`). |

Internally the parsed coordinate is retained in both DMS and decimal-degree form (`latitudeDms`/`latitudeDecimal` etc. on the staged row) as an audit failsafe, but the DEO only ever sees and fills the two combined columns above.

### Financial columns by shop type

| Shop Type | Active Financial Columns |
|---|---|
| `MODEL_SHOP` | `license_fee_lf`, `mgr_amount` |
| `COMPOSITE_SHOP` | `composite_lf_fl`, `composite_lf_beer`, `composite_mgr_fl`, `composite_mgr_beer` |
| `PRV` | `license_fee_lf`, `mgr_amount` |
| `BHANG_SHOP` | `license_fee_lf`, `mgq_quantity` |
| `COUNTRY_LIQUOR` (standard) | `basic_license_fee_blf`, `consideration_fee` |
| `COUNTRY_LIQUOR` + CL5CC (`has_cl5cc = TRUE`) | `basic_license_fee_blf`, `consideration_fee`, `special_beer_lf`, `special_beer_mgr` |

Every financial column has a per-cell data-validation gate: it only accepts a value when the row's `shop_type` (and, for the two CL5CC fields, `has_cl5cc = TRUE`) matches the shop types above — Excel itself rejects an entry in a field that doesn't apply to that row's shop type, not just the Worker on upload.

**Important for BHANG_SHOP:** `mgq_quantity` is the **quantity in units**, not a rupee amount. The portal multiplies by ₹20/unit automatically.

**Important for COMPOSITE_SHOP:** Enter the four sub-component values (`composite_lf_fl`, `composite_lf_beer`, `composite_mgr_fl`, `composite_mgr_beer`). Leave `license_fee_lf` and `mgr_amount` as 0 — the portal computes them.

All financial values are **annual figures in whole Indian Rupees** (no paise). Enter full values — e.g. `100000` for one lakh.

---

## Key constraints

- **English only** — all text fields (shop names, Thana names, district names, circle/sector names) must be in English. No Devanagari, Hindi, or Urdu — the Instructions sheet and the DEO portal's own UI carry Hindi subtitles for readability, but that's UI copy, not stored data.
- **Adjacent Thanas must belong to the same district** — this is the policy target, but it is **not enforced** by the Worker (no state-wide Thana master list exists yet). The Verify page's red-pill flag is a same-district, non-blocking heuristic only — see the `adjacent_thanas_raw` row above.
- **CL5CC requires `shop_type = COUNTRY_LIQUOR`** — `has_cl5cc = TRUE` for any other shop type is rejected by the Worker on upload.
- **Coordinates** — UP bounding box: latitude `23.8°–30.4°N`, longitude `77.1°–84.6°E`. Out-of-bounds coordinates are flagged with a warning but not rejected.
- **Revenue dual-verification** — the browser computes `total_revenue` and sends it with each row; the Worker independently recomputes it from the raw financial fields and rejects the row (zero tolerance) if the two don't match.
