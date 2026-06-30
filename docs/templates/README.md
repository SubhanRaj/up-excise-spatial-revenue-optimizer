# Excel Templates — UP Excise Portal Phase 1

Two templates are used in the Phase 1 data collection campaign.

---

## 1. DEO Provision Template (Admin use)

**Who uses it:** HQ Administrator, once before the campaign.

**Where to get it:** Download from the portal at `/admin/provision` → "Download Blank Template" button.

**What it contains:** One row per district (75 rows for UP). Fill all 75 rows, then upload the file on the same page to create Clerk accounts and populate the `districts` table.

| Column | Description | Notes |
|---|---|---|
| `District Name` | Canonical district name | Must be unique. Used as primary key across the system. |
| `Division` | Administrative division | e.g. "Lucknow Division". 18 divisions in UP. |
| `DEO Name` | Full name of the District Excise Officer | Display only — for admin portal reference. |
| `DEO Email` | Department-issued email for this DEO | Used to create the Clerk account. Must be unique. |
| `DEO Identifier` | Department-assigned alphanumeric ID | Stored as `uploaded_by_deo` on every shop record. Must be unique. |
| `Expected Vend Count` | Approximate retail vend count for the district | Used for "X of Y uploaded" progress display. |

**Validation rules:**
- All 75 district rows must be present before provisioning.
- `DEO Email` and `DEO Identifier` must be unique across all rows.
- Operation is idempotent — re-uploading updates metadata without creating duplicate Clerk accounts.

---

## 2. District Upload Template (DEO + Inspector use)

**Who uses it:** DEO downloads and distributes to Inspectors. Inspectors fill their section and return it. DEO consolidates all sections into one file and uploads it.

**Where to get it:** Download from the portal at `/units` → "Download District Template" button (only available after at least one circle/sector is registered).

**Template structure:**
- Sheet **"[District] Data"** — the data entry sheet. Row 1 = column headers. Rows 2–7 = one example row per shop type (delete these before filling real data, or overwrite them).
- Sheet **"Column Guide"** — description of every column, which shop types require it, and validation notes.

### Required columns (all shop types)

| Column | Description |
|---|---|
| `circle_sector_name` | Must exactly match a pre-registered unit name |
| `thana_name` | Excise-authoritative Thana name. English only. |
| `shop_id` | Department-assigned license/registration ID. Unique per district. |
| `shop_name` | Official name of the vend. English only. |
| `shop_type` | Exact value: `MODEL_SHOP`, `COMPOSITE_SHOP`, `PRV`, `BHANG_SHOP`, or `COUNTRY_LIQUOR` |
| `has_cl5cc` | `1` if Country Liquor shop has CL5CC beer endorsement, `0` otherwise |

### Optional columns (all shop types)

| Column | Description |
|---|---|
| `adjacent_thanas_raw` | Comma-separated adjacent Thana names in the same district |
| `latitude_dms` | Latitude in DMS format — e.g. `26°50'48.12"N` |
| `longitude_dms` | Longitude in DMS format — e.g. `80°56'46.3"E` |
| `latitude_decimal` | Latitude in decimal degrees — e.g. `26.8467` |
| `longitude_decimal` | Longitude in decimal degrees — e.g. `80.9462` |

Use either DMS or decimal degree columns — not both. DMS takes precedence when both are filled.

### Financial columns by shop type

| Shop Type | Active Financial Columns |
|---|---|
| `MODEL_SHOP` | `license_fee_lf`, `mgr_amount` |
| `COMPOSITE_SHOP` | `composite_lf_fl`, `composite_lf_beer`, `composite_mgr_fl`, `composite_mgr_beer` |
| `PRV` | `license_fee_lf`, `mgr_amount` |
| `BHANG_SHOP` | `license_fee_lf`, `mgq_quantity` |
| `COUNTRY_LIQUOR` (standard) | `basic_license_fee_blf`, `consideration_fee` |
| `COUNTRY_LIQUOR` + CL5CC | `basic_license_fee_blf`, `consideration_fee`, `special_beer_lf`, `special_beer_mgr` |

**Important for BHANG_SHOP:** `mgq_quantity` is the **quantity in units**, not a rupee amount. The portal multiplies by ₹20/unit automatically.

**Important for COMPOSITE_SHOP:** Enter the four sub-component values (`composite_lf_fl`, `composite_lf_beer`, `composite_mgr_fl`, `composite_mgr_beer`). Leave `license_fee_lf` and `mgr_amount` as 0 — the portal computes them.

All financial values are **annual figures in whole Indian Rupees** (no paise). Enter full values — e.g. `100000` for one lakh.

---

## Key constraints

- **English only** — all text fields (shop names, Thana names, district names) must be in English. No Devanagari, Hindi, or Urdu.
- **Adjacent Thanas must be in the same district** — cross-district Thana names are automatically rejected.
- **CL5CC requires `shop_type = COUNTRY_LIQUOR`** — `has_cl5cc = 1` is invalid for any other shop type.
- **Coordinates** — UP bounding box: latitude `23.8°–30.4°N`, longitude `77.1°–84.6°E`. Out-of-bounds coordinates are flagged with a warning but not rejected.
