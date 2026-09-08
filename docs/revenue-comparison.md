# Revenue source comparison (SRO portal vs. e-Lottery vs. JDS achieved)

Cross-checks what's on the SRO portal (the app this repo builds, filled
in by DEOs) against two sources outside the portal entirely: the
e-Lottery portal's own shop register and the Statistics (JDS) section's
actual achieved revenue per district. Purely a local analysis exercise
against the MariaDB clone described in `docs/local-analysis-db.md` —
nothing here reads from or writes to prod D1, and none of it runs as
part of the app.

**Why:** SRO-reported revenue is for the year still in progress, so a
district's SRO total can be incomplete or still changing — not a sound
basis for setting a revenue limit on its own. The e-Lottery register and
the JDS achieved figures are both from the last closed year,
independent of anything filed on the SRO portal, so they're the real
check: e-Lottery for shop-by-shop accuracy, JDS achieved for whether the
district's SRO total is anywhere close to what actually came in. There's
no target or percent-of-target anywhere in this comparison — only the
actual achieved figure, which is what was asked for.

## Running it

```bash
python3 scripts/load-revenue-sources.py     # loads the two source files, if not already done
python3 scripts/compare-revenue-sources.py  # builds the comparison
```

`compare-revenue-sources.py` reads `phase1_raw_collection`,
`elottery_shops`, and `jds_district_achievement` from the local clone,
and writes:

- `revenue_comparison_shops` / `revenue_comparison_districts` — two
  tables in that same local database, dropped and recreated on every
  run.
- `revenue-comparison/report.html` — a single self-contained HTML file
  with the full dataset embedded as JSON and rendered client-side with
  plain JavaScript. No build step, no server, no dependency — open the
  file directly in a browser.

## Viewing it

```bash
python3 scripts/compare-revenue-sources.py
xdg-open revenue-comparison/report.html   # or just open the file in a browser
```

The report shows, all on one page:

- **State totals** — districts, SRO shops, e-Lottery shops, SRO total
  revenue, JDS achieved revenue, and the SRO-vs-achieved percent
  difference across all 75 districts.
- **Shop match status, statewide** — the six-way breakdown (`matched`,
  `no_elottery_match`, `shop_type_mismatch`, `district_mismatch`,
  `no_type_coverage`, `non_numeric_shop_id`), each count clickable to
  filter the shop table below it.
- **Districts** — one sortable, searchable row per district: SRO shop
  count, e-Lottery shop count, SRO total revenue, JDS achieved revenue,
  and the percent difference between the two. See "Why SRO's own total
  isn't the baseline" below for why that difference isn't automatically
  a problem.
- **Shops** — one row per shop on the SRO portal, filterable by
  district, match status, and shop ID, loaded 500 at a time to keep the
  page responsive against ~30K rows. Click "details" on a row to expand
  every compared field, with its SRO value, e-Lottery value, and percent
  difference.

Circle/sector-level data (`circleSectors` — name, type, distinct thana
count, shop count, revenue, per-type breakdown) is embedded in the same
JSON blob but has no dedicated table in the report; read it from the
browser console (`DATA.circleSectors`) if needed.

This is an occasional local analysis tool, not something anyone deploys
or revisits daily — a static file was the right size for that, not a
served app. `revenue-comparison/` (the HTML report and the SQL loader
output) is gitignored, since it embeds real department revenue figures.

## Why SRO's own total isn't the baseline

SRO uploads are for the year still in progress, so a district's SRO
total can be incomplete or still changing, and isn't a sound basis for
setting a revenue limit on its own. The JDS achieved figure is from the
last closed year, and covers every shop type in the district including
PRV and HBR — even though neither type appears in the e-Lottery register
at all (its only four `shop_type` values are `Model Shop`, `Composite
Shop`, `Bhang Shop`, `Country Liquor`). The viewer computes
`sroVsAchievedPct` per district for exactly this reason: a district
still mid-upload will usually show SRO running behind JDS achieved, and
that gap is the actual thing worth looking at, not a defect to explain
away. A district where SRO runs
*above* JDS achieved, or where the gap is unusually large even accounting
for how much of the year's uploads are in, is the more interesting case
to check first.

## How a DEO shop gets matched to an e-Lottery row

Joined on `shop_id` (cast to a number) plus `district_name`. A DEO
`shop_id` that isn't a plain number (every HBR ID under the
`HBR`/`HBR001` convention, and a handful of PRV IDs) can't be looked up
this way at all — the e-Lottery register only uses numeric IDs — and is
recorded as `non_numeric_shop_id`.

For every DEO shop with a numeric ID, the match falls into one of:

| `match_status` | Meaning |
|---|---|
| `matched` | Found in e-Lottery under the same shop_id and district, with a shop type e-Lottery actually has |
| `no_elottery_match` | Shop_id not found in e-Lottery for that district, or at all |
| `district_mismatch` | Shop_id exists in e-Lottery, but filed under a different district |
| `shop_type_mismatch` | Shop_id and district match, but the shop type doesn't |
| `no_type_coverage` | The DEO's shop type is `PRV` or `HBR` — e-Lottery has no rows of either type, confirmed by `SELECT DISTINCT shop_type` against `elottery_shops` |
| `non_numeric_shop_id` | DEO shop_id isn't a plain number |

A `matched` shop also gets a thana check (both names trimmed,
whitespace-collapsed, lowercased, then compared) and a circle/sector
check (the DEO's free-text name — `"Circle 2 - Fatehabad"`, `"Sector -
6"` — parsed for its kind and number with a plain regex, compared
against e-Lottery's own `CircleType`/`SectorType` columns the same way).

## Field mapping — how license-fee components line up

The e-Lottery file's columns don't share names with `phase1_raw_collection`'s,
so the mapping below was found by matching real shops (same shop_id, same
district) and checking whether the ratio between the two sides held
steady across many shops of the same type — not by guessing from column
names. It did: DEO figures (FY 2026-27) ran consistently about 5-11%
above the matching e-Lottery figures (FY 2025-26) for genuine matches,
which is the year-over-year fee increase you'd expect between the two
years, not a mismatch.

| DEO shop type | `phase1_raw_collection` column | `elottery_shops` column |
|---|---|---|
| `MODEL_SHOP` | `license_fee_lf` | `license_fees` |
| `MODEL_SHOP` | `mgr_amount` | `annual_mgr_ms` |
| `COMPOSITE_SHOP` | `composite_lf_fl` | `license_fees_1` |
| `COMPOSITE_SHOP` | `composite_lf_beer` | `license_fees_2` |
| `COMPOSITE_SHOP` | `composite_mgr_fl` | `annual_mgr_fl` |
| `COMPOSITE_SHOP` | `composite_mgr_beer` | `annual_mgr_beer` |
| `BHANG_SHOP` | `license_fee_lf` | `license_fees` |
| `COUNTRY_LIQUOR` | `basic_license_fee_blf` | `basic_license_fees` |

Every compared field gets its raw DEO value, raw e-Lottery value, the
difference, and the percent difference — no pass/fail verdict baked in.
The report's "only rows with an unresolved issue" checkbox uses a >20%
difference as a convenience filter to surface rows worth a second look;
that threshold exists to make browsing easier — it doesn't represent the
real policy tolerance.

## What's shown but not judged yet

- **`consideration_fee`** (`COUNTRY_LIQUOR`, `HBR`) and **`mgq_quantity`**
  (`BHANG_SHOP`) — both price a fixed per-unit policy rate against a
  quantity. The quantity is coming from a source not yet loaded into
  this database. Every row for these fields carries a `deferred` note.
- **CL5CC's `special_beer_lf` / `special_beer_mgr`** (`COUNTRY_LIQUOR`
  with `has_cl5cc = 1`) — no e-Lottery column was found that corresponds
  to either. Checked against every numeric e-Lottery column for CL5CC
  shops; none held a steady relationship the way the fields in the table
  above did. Recorded with a note explaining why, not compared.
- **`PRV` and `HBR` shop types entirely** — the e-Lottery file has no
  rows of either type (confirmed: its only four `shop_type` values are
  `Model Shop`, `Composite Shop`, `Bhang Shop`, `Country Liquor`), so
  there's nothing to compare these shops against.

## District totals — the SRO-vs-achieved comparison, and the Crore assumption

`sroTotalRevenue` (whole rupees, a straight `SUM(total_revenue)` from
`phase1_raw_collection`) sits next to `jdsAchievedCrore`, read from the
JDS source file exactly as stored, with no target column anywhere in
the output — the raw `jds_district_achievement` table (loaded by
`load-revenue-sources.py`) still keeps `revenue_target_2025_26` intact,
since that table is a faithful clone of the source file, but nothing in
this comparison's JSON or SQL output surfaces it.

`jdsAchievedRupees` converts that figure to rupees, on the assumption
that the JDS file's unit is Crore (₹1,00,00,000) — that assumption comes
from the file's own magnitude (a state-wide total around 57,569 in the
file's own units, which only makes sense for UP excise revenue as
Crore). It's a separate field from the raw Crore figure, named to say
exactly what it assumes.

`sroVsAchievedDiff` and `sroVsAchievedPct` are `sroTotalRevenue` minus
`jdsAchievedRupees`, and that difference as a percentage of
`jdsAchievedRupees` — the actual comparison this whole tool is for. Both
stay `null` for a district with no JDS achieved figure to compare
against.

Per-district PRV/HBR counts and revenue (`prvHbrShopCount`,
`prvHbrRevenue`) come only from `phase1_raw_collection` — there's no
other source to check them against, per "Why SRO's own total isn't the
baseline" above.
