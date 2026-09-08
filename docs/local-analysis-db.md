# Local analysis DB (offline clone of prod D1)

A read-only local MariaDB copy of prod D1, for GIS/analysis work that doesn't
belong in the app itself — per-district flattening, thana/circle-sector
rollups, eventually joining in KML/GeoJSON boundary files to plot shops on a
map. Unrelated to the app's own runtime, validation, or revenue logic; never
written back to prod D1.

Credentials are in `.env.local-analysis-db` (gitignored, not committed —
this repo is public). Regenerate the DB/user with a `CREATE DATABASE` /
`CREATE USER` pair scoped to that one database, same as any other app's
local DB on the dev box.

## Cloning D1 into it

```bash
# 1. Export prod D1 as SQLite-flavored SQL
cd apps/web
npx wrangler d1 export up-excise-spatial-revenue-optimizer-prod --remote --output=/tmp/d1-export.sql

# 2. Translate to MariaDB DDL + INSERTs
python3 ../../scripts/sqlite-dump-to-mysql.py /tmp/d1-export.sql /tmp/mysql-import.sql

# 3. Import
mysql -u<user> -p<pass> <db_name> < /tmp/mysql-import.sql
```

`scripts/sqlite-dump-to-mysql.py` loads the dump into an in-memory SQLite DB
(Python's stdlib `sqlite3`) and introspects real column types and indexes via
`PRAGMA table_info`/`PRAGMA index_list` rather than regexing the dump text,
so it stays correct if the schema changes shape.

### Type translation

| SQLite | MariaDB | Why |
|---|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `BIGINT PRIMARY KEY AUTO_INCREMENT` | direct equivalent |
| `INTEGER` | `BIGINT` | covers both unix-epoch timestamps and 0/1 booleans (`has_cl5cc`, `verification_phase_open`) |
| `REAL` | `DOUBLE` | direct equivalent |
| `TEXT` | `LONGTEXT`, or `VARCHAR(255)` if the column is indexed or unique | InnoDB refuses a key on `TEXT`/`LONGTEXT` without an explicit prefix length; every indexed/unique text column here is a hash or short ID (≤64 chars), so 255 is safe headroom |

Every index — including SQLite's implicit ones behind an inline `UNIQUE`
column — is recreated as a real named MariaDB index. No foreign key
constraints exist in the D1 schema (`auth_sessions.user_id` is a plain
column, unenforced in SQLite too), so none were added here either — this is
a structural clone, not a redesign.

## Verifying a clone

Compare row counts per table against live D1 (not just the export file —
the export could itself be stale if something wrote between export and
import):

```bash
for t in phase1_raw_collection districts district_circles_sectors audit_log \
         auth_users auth_magic_links auth_sessions district_unlock_requests \
         login_attempts app_settings; do
  echo -n "$t: "
  npx wrangler d1 execute up-excise-spatial-revenue-optimizer-prod --remote \
    --command="SELECT COUNT(*) n FROM $t" --json 2>/dev/null \
    | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['results'][0]['n'])"
done
```

`wrangler d1 execute --remote` rejects a single query with more than a few
`UNION ALL` terms (`SQLITE_ERROR: too many terms in compound SELECT`) — run
one `SELECT COUNT(*)` per table instead of unioning them.

## Why this exists

The revenue a DEO enters through the portal's own upload flow is for the
current fiscal year (2026-27), which is too early in the year to use for
layout or planning decisions. To get a real prior-year revenue picture,
this database also holds two source files from outside the portal
entirely — see "External revenue source tables" below.

## External revenue source tables

Two department source files, loaded verbatim into this database by
`scripts/load-revenue-sources.py` — no row dropped, no figure
recalculated, no district name corrected. Both are FY 2025-26 data,
independent of anything a DEO has typed into this portal.

| Source file | Table | What it is |
|---|---|---|
| `revenue_data/from_elottery/2025-26 e-Lottery Data.xlsx` | `elottery_shops` | The e-Lottery portal's own shop register: shop ID/name (English and Hindi), thana, tehsil, circle or sector, and every license-fee/MGQ component per shop. This is what actually establishes and sets up a shop, independent of a DEO's own upload. 27,423 rows, one per shop, `shop_id` as primary key. |
| `revenue_data/from_Stats/Final Achievement Districtwise 2025-26.xlsx` | `jds_district_achievement` | The Statistics (JDS) section's district-wise revenue target vs. achieved figures for FY 2025-26, including the state `GrandTotal` row. 76 rows (75 districts + the total). |

Both files live in `revenue_data/` (gitignored — real department revenue
data, not code) and are not tracked in git.

Two normalizations are applied, neither touching a revenue figure:

- Two `elottery_shops` columns (`basic_license_fees`,
  `consideration_fees`) carry the literal text `"NULL"` in the source
  file for shops where that fee doesn't apply — that string was already
  being used as a null marker in the source, not as a figure, so the
  loader stores it as a real SQL `NULL` instead of the four-character
  string.
- Both source files spell district names their own way — the e-Lottery
  file runs names together or abbreviates them (`"Kanpurnagar"`,
  `"PrayagRaj"`, `"Sknagar"`), and the JDS file uses short forms
  (`"Kanpur Ngr."`, `"S.R. Nagar"`). `DISTRICT_NAME_FIXES` in
  `scripts/load-revenue-sources.py` maps every one of those spellings to
  the exact name in `districts.name`, so `elottery_shops.district_name`
  and `jds_district_achievement.district_name` both join cleanly against
  the app's own district list and against each other. `jds_district_achievement`'s
  `"GrandTotal"` row is left alone — it isn't a district name.

Re-running `python3 scripts/load-revenue-sources.py` drops and reloads
both tables from whatever is currently in `revenue_data/` — safe to
re-run after swapping in a corrected source file.
