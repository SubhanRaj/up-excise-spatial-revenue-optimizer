"""
Flattens the local MariaDB clone (docs/local-analysis-db.md) into a
district > circle/sector > thana hierarchy, with shop counts and shop-type
breakdowns at every level (thana, circle/sector, district, state).

Source of truth is phase1_raw_collection + district_circles_sectors + districts
in the local clone, queried as-is via the `mysql` CLI (TSV output) -- no
normalization, no merging of near-duplicate names, no invented fields.
Every count is a straight COUNT(*)/GROUP BY over raw column values.

Run: python3 scripts/export-flattened.py
Reads DB creds from ../.env.local-analysis-db. Writes to ./analysis-export/
(gitignored -- this is real department revenue data, not code), in three
formats built from the same in-memory structures so they can't drift from
each other:
  - state-hierarchy.json  (nested, with a `_meta` block explaining every field)
  - districts.csv / circles_sectors.csv / thanas.csv / shop_type_breakdown.csv
    (flat, each with a leading `#`-comment header describing its columns --
    strip those lines first if your tool doesn't skip `#` lines on its own)
  - flattened.sql  (plain CREATE TABLE + INSERT, no vendor-specific syntax --
    no AUTOINCREMENT/SERIAL, no quoted identifiers, BOOLEAN via TRUE/FALSE
    keywords -- runs unmodified on SQLite, MySQL, and PostgreSQL)
"""
import csv
import datetime
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE = os.path.join(ROOT, ".env.local-analysis-db")
OUT_DIR = os.path.join(ROOT, "analysis-export")


def load_env(path):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k] = v
    return env


def run_query(cnf, sql):
    """Runs sql via the mysql CLI, tab-separated, header row included."""
    result = subprocess.run(
        ["mysql", "-h", cnf["DB_HOST"], "-P", cnf["DB_PORT"],
         "-u", cnf["DB_USERNAME"], f"-p{cnf['DB_PASSWORD']}",
         "-B", cnf["DB_DATABASE"], "-e", sql],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.exit(f"Query failed: {result.stderr}")
    lines = result.stdout.rstrip("\n").split("\n")
    header = lines[0].split("\t")
    rows = []
    for line in lines[1:]:
        cells = line.split("\t")
        rows.append({h: (None if c == "NULL" else c) for h, c in zip(header, cells)})
    return rows


def sql_str(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def sql_bool(v):
    return "TRUE" if v else "FALSE"


def sql_num(v):
    return "NULL" if v is None else str(v)


def write_sql(out_dir, generated_at, state, districts_out):
    """
    Writes one portable .sql file: plain CREATE TABLE + multi-row INSERT,
    deliberately avoiding anything vendor-specific --
      - no AUTOINCREMENT / SERIAL / AUTO_INCREMENT (no primary keys at all;
        this is flat read-only analysis data, not a transactional schema)
      - no quoted identifiers (SQLite/MySQL/Postgres each quote differently --
        every column/table name here is a plain lowercase word, so quoting
        was never needed)
      - BOOLEAN written as bare TRUE/FALSE keywords, which SQLite (3.23+),
        MySQL, and PostgreSQL all accept as literals
      - REAL/INTEGER/TEXT/BOOLEAN are recognized by all three engines
    Tables mirror the four CSVs exactly (same columns, same rows) -- both
    come from the same in-memory data built earlier in this script.
    """
    lines = [
        "-- Flattened, read-only offline export of the UP Excise portal's shop data.",
        f"-- Generated {generated_at} by scripts/export-flattened.py from the local",
        "-- MariaDB clone (docs/local-analysis-db.md) of prod Cloudflare D1 -- never",
        "-- written back to D1. Every row is a plain COUNT(*)/GROUP BY over raw column",
        "-- values: no typo-clustering, no fuzzy matching, no invented fields.",
        "--",
        "-- Portable: no AUTOINCREMENT/SERIAL, no quoted identifiers, BOOLEAN via",
        "-- TRUE/FALSE keyword literals -- runs unmodified on SQLite, MySQL, and",
        "-- PostgreSQL. No primary/foreign keys -- this is flat analysis data with",
        "-- no relations to enforce, by design (see docs/local-analysis-db.md).",
        "",
        "-- One row per district. bbox_* is D1's stored bounding box; center_lat/lon",
        "-- is COMPUTED here as the bbox midpoint (same method the live app's admin",
        "-- API uses), not a value stored in D1.",
        "CREATE TABLE districts (",
        "  district TEXT,",
        "  division TEXT,",
        "  status TEXT,",
        "  bbox_min_lat REAL,",
        "  bbox_max_lat REAL,",
        "  bbox_min_lon REAL,",
        "  bbox_max_lon REAL,",
        "  center_lat REAL,",
        "  center_lon REAL,",
        "  circle_sector_count INTEGER,",
        "  distinct_thana_count INTEGER,",
        "  shop_count INTEGER",
        ");",
        "",
        "-- One row per circle/sector registered in D1, plus any circle_sector_name",
        "-- found in shop data that was never registered (registered=FALSE -- a real",
        "-- data-quality gap, see CLAUDE.md's M-49 note; kept here as its own row,",
        "-- not matched to a registered name). type is NULL when unregistered.",
        "CREATE TABLE circles_sectors (",
        "  district TEXT,",
        "  circle_sector_name TEXT,",
        "  type TEXT,",
        "  registered BOOLEAN,",
        "  distinct_thana_count INTEGER,",
        "  shop_count INTEGER",
        ");",
        "",
        "-- One row per (district, circle/sector, thana) with at least one shop.",
        "-- thana_name is copied verbatim -- case/whitespace variants are NOT",
        "-- merged. '(blank)' means the source value was NULL or empty.",
        "CREATE TABLE thanas (",
        "  district TEXT,",
        "  circle_sector_name TEXT,",
        "  thana_name TEXT,",
        "  shop_count INTEGER",
        ");",
        "",
        "-- Shop-type counts at three levels: 'state' (district/circle_sector_name",
        "-- NULL), 'district' (circle_sector_name NULL), and 'circle_sector'.",
        "-- Only rows with shop_count > 0 are present.",
        "CREATE TABLE shop_type_breakdown (",
        "  level TEXT,",
        "  district TEXT,",
        "  circle_sector_name TEXT,",
        "  shop_type TEXT,",
        "  shop_count INTEGER",
        ");",
        "",
    ]

    def insert_batch(table, columns, rows, batch_size=200):
        stmts = []
        col_list = ", ".join(columns)
        for i in range(0, len(rows), batch_size):
            chunk = rows[i:i + batch_size]
            values = ",\n  ".join("(" + ", ".join(row) + ")" for row in chunk)
            stmts.append(f"INSERT INTO {table} ({col_list}) VALUES\n  {values};")
        return stmts

    district_rows = []
    for d in districts_out:
        c = d["center_computed_from_bbox_midpoint"] or {}
        district_rows.append([
            sql_str(d["name"]), sql_str(d["division"]), sql_str(d["status"]),
            sql_num(d["bbox"]["min_lat"]), sql_num(d["bbox"]["max_lat"]),
            sql_num(d["bbox"]["min_lon"]), sql_num(d["bbox"]["max_lon"]),
            sql_num(c.get("lat")), sql_num(c.get("lon")),
            sql_num(d["circle_sector_count"]), sql_num(d["distinct_thana_count"]),
            sql_num(d["shop_count"]),
        ])
    lines.extend(insert_batch(
        "districts",
        ["district", "division", "status", "bbox_min_lat", "bbox_max_lat",
         "bbox_min_lon", "bbox_max_lon", "center_lat", "center_lon",
         "circle_sector_count", "distinct_thana_count", "shop_count"],
        district_rows,
    ))
    lines.append("")

    unit_rows = []
    thana_rows = []
    for d in districts_out:
        for u in d["circles_sectors"]:
            unit_rows.append([
                sql_str(d["name"]), sql_str(u["name"]), sql_str(u["type"]),
                sql_bool(u["registered"]), sql_num(u["distinct_thana_count"]),
                sql_num(u["shop_count"]),
            ])
            for t in u["thanas"]:
                thana_rows.append([
                    sql_str(d["name"]), sql_str(u["name"]), sql_str(t["thana_name"]),
                    sql_num(t["shop_count"]),
                ])
    lines.extend(insert_batch(
        "circles_sectors",
        ["district", "circle_sector_name", "type", "registered",
         "distinct_thana_count", "shop_count"],
        unit_rows,
    ))
    lines.append("")
    lines.extend(insert_batch(
        "thanas",
        ["district", "circle_sector_name", "thana_name", "shop_count"],
        thana_rows,
    ))
    lines.append("")

    type_rows = []
    for shop_type, count in state["shop_type_breakdown"].items():
        type_rows.append(["'state'", "NULL", "NULL", sql_str(shop_type), sql_num(count)])
    for d in districts_out:
        for shop_type, count in d["shop_type_breakdown"].items():
            type_rows.append(["'district'", sql_str(d["name"]), "NULL", sql_str(shop_type), sql_num(count)])
        for u in d["circles_sectors"]:
            for shop_type, count in u["shop_type_breakdown"].items():
                type_rows.append(["'circle_sector'", sql_str(d["name"]), sql_str(u["name"]), sql_str(shop_type), sql_num(count)])
    lines.extend(insert_batch(
        "shop_type_breakdown",
        ["level", "district", "circle_sector_name", "shop_type", "shop_count"],
        type_rows,
    ))

    with open(os.path.join(out_dir, "flattened.sql"), "w") as f:
        f.write("\n".join(lines) + "\n")


def main():
    cnf = load_env(ENV_FILE)
    os.makedirs(OUT_DIR, exist_ok=True)

    total_shops_raw = int(run_query(cnf, "SELECT COUNT(*) n FROM phase1_raw_collection")[0]["n"])

    districts_raw = run_query(
        cnf,
        "SELECT name, division, status, bbox_min_lat, bbox_max_lat, "
        "bbox_min_lon, bbox_max_lon, expected_vend_count, cached_vend_count, "
        "cached_total_revenue FROM districts ORDER BY name",
    )

    units_raw = run_query(
        cnf,
        "SELECT district_name, name, type FROM district_circles_sectors "
        "ORDER BY district_name, name",
    )

    # One aggregate query drives every shop-count/shop-type-breakdown figure at
    # every level -- district/circle-sector/state totals are all sums over
    # these same rows, so they can never drift from each other.
    agg_raw = run_query(
        cnf,
        "SELECT district_name, circle_sector_name, thana_name, shop_type, "
        "COUNT(*) cnt FROM phase1_raw_collection "
        "GROUP BY district_name, circle_sector_name, thana_name, shop_type "
        "ORDER BY district_name, circle_sector_name, thana_name, shop_type",
    )

    check_sum = sum(int(r["cnt"]) for r in agg_raw)
    assert check_sum == total_shops_raw, (
        f"Aggregate query sums to {check_sum}, raw COUNT(*) is {total_shops_raw} -- "
        "stopping here instead of writing an export with mismatched totals"
    )

    # Registered units per district. Used below to flag any shop row whose
    # circle_sector_name doesn't match a registered unit -- see CLAUDE.md's
    # M-49 note. Those rows stay in the export, marked unregistered.
    registered = {}
    for u in units_raw:
        registered.setdefault(u["district_name"], set()).add(u["name"])

    def blank(v):
        return v if v not in (None, "") else "(blank)"

    # thana_key: (district, circle_sector, thana) -> { shop_type: count }
    thana_key = {}
    for r in agg_raw:
        key = (r["district_name"], r["circle_sector_name"], blank(r["thana_name"]))
        thana_key.setdefault(key, {})[r["shop_type"]] = int(r["cnt"])

    def merge_counts(dst, src):
        for k, v in src.items():
            dst[k] = dst.get(k, 0) + v

    def totals_of(type_counts):
        return sum(type_counts.values())

    # Build circle/sector nodes: registered units first (even if zero shops),
    # then any circle_sector_name that appears in shop data but isn't
    # registered for that district.
    district_units = {}  # district_name -> { unit_name: {"type": .., "thanas": {...}} }
    for u in units_raw:
        district_units.setdefault(u["district_name"], {})[u["name"]] = {
            "type": u["type"], "registered": True, "thanas": {},
        }

    for (dist, unit, thana), type_counts in thana_key.items():
        d = district_units.setdefault(dist, {})
        node = d.get(unit)
        if node is None:
            node = {"type": None, "registered": unit in registered.get(dist, set()), "thanas": {}}
            d[unit] = node
        node["thanas"].setdefault(thana, {})
        merge_counts(node["thanas"][thana], type_counts)

    districts_out = []
    state_type_breakdown = {}
    state_thana_names = set()
    state_shop_total = 0
    state_unit_total = 0

    for drow in districts_raw:
        dname = drow["name"]
        units = district_units.get(dname, {})
        units_out = []
        district_type_breakdown = {}
        district_thana_names = set()
        district_shop_total = 0

        for uname in sorted(units.keys()):
            node = units[uname]
            unit_type_breakdown = {}
            thanas_out = []
            unit_shop_total = 0
            for tname in sorted(node["thanas"].keys()):
                tcounts = node["thanas"][tname]
                tcount = totals_of(tcounts)
                thanas_out.append({
                    "thana_name": tname,
                    "shop_count": tcount,
                    "shop_type_breakdown": dict(sorted(tcounts.items())),
                })
                merge_counts(unit_type_breakdown, tcounts)
                unit_shop_total += tcount
                district_thana_names.add(tname)

            units_out.append({
                "name": uname,
                "type": node["type"],
                "registered": node["registered"],
                "shop_count": unit_shop_total,
                "distinct_thana_count": len(node["thanas"]),
                "shop_type_breakdown": dict(sorted(unit_type_breakdown.items())),
                "thanas": thanas_out,
            })
            merge_counts(district_type_breakdown, unit_type_breakdown)
            district_shop_total += unit_shop_total

        bbox = {
            "min_lat": float(drow["bbox_min_lat"]) if drow["bbox_min_lat"] is not None else None,
            "max_lat": float(drow["bbox_max_lat"]) if drow["bbox_max_lat"] is not None else None,
            "min_lon": float(drow["bbox_min_lon"]) if drow["bbox_min_lon"] is not None else None,
            "max_lon": float(drow["bbox_max_lon"]) if drow["bbox_max_lon"] is not None else None,
        }
        center = None
        if None not in bbox.values():
            center = {
                "lat": (bbox["min_lat"] + bbox["max_lat"]) / 2,
                "lon": (bbox["min_lon"] + bbox["max_lon"]) / 2,
            }

        districts_out.append({
            "name": dname,
            "division": drow["division"],
            "status": drow["status"],
            "bbox": bbox,
            "center_computed_from_bbox_midpoint": center,
            "circle_sector_count": len(units_out),
            "shop_count": district_shop_total,
            "distinct_thana_count": len(district_thana_names),
            "shop_type_breakdown": dict(sorted(district_type_breakdown.items())),
            "circles_sectors": units_out,
        })

        merge_counts(state_type_breakdown, district_type_breakdown)
        state_thana_names |= district_thana_names
        state_shop_total += district_shop_total
        state_unit_total += len(units_out)

    assert state_shop_total == total_shops_raw, (
        f"Rebuilt state total {state_shop_total} != raw COUNT(*) {total_shops_raw}"
    )
    assert state_unit_total == len(units_raw), (
        f"Rebuilt unit total {state_unit_total} != district_circles_sectors row count {len(units_raw)}"
    )

    generated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # JSON has no native comment syntax, so the documentation lives in this
    # one `_meta` block instead of being repeated on every district/unit/
    # thana node (which would ~4x the file size for no new information).
    # Read this once; every node below follows the same shape it describes.
    meta = {
        "_comment": (
            "Flattened, read-only offline export of the UP Excise portal's shop data. "
            "Generated by scripts/export-flattened.py from the local MariaDB clone "
            "(docs/local-analysis-db.md) of prod Cloudflare D1 -- never written back to D1. "
            "Every count here is a plain COUNT(*)/GROUP BY over raw column values: no "
            "typo-clustering, no fuzzy matching, no invented fields. Two independent "
            "checks ran before this file was written: the sum of all (district, circle/ "
            "sector, thana, shop_type) group counts equals a bare COUNT(*) on the shop "
            "table, and it equals the rebuilt state-level total -- the export script "
            "aborts instead of writing a file if either check fails."
        ),
        "generated_at": generated_at,
        "source": "local MariaDB clone of D1 database up-excise-spatial-revenue-optimizer-prod",
        "structure": (
            "state -> districts[] -> circles_sectors[] -> thanas[]. shop_count and "
            "shop_type_breakdown at every level are the sum of that node's own children "
            "-- a district's shop_count is the sum of its circles_sectors' shop_counts, "
            "which is in turn the sum of that unit's thanas' shop_counts."
        ),
        "field_notes": {
            "bbox": "district's registered bounding box (districts.bbox_min_lat etc. in D1) -- null if never set for that district.",
            "center_computed_from_bbox_midpoint": "NOT a stored value -- computed here as (min+max)/2 of the bbox, same method GET /api/admin/districts already uses in the live app. Null if bbox is null.",
            "circles_sectors[].registered": "true if this name exists as a row in D1's district_circles_sectors table (the DEO's actual registration). false means shop data references a circle/sector name that was never registered for this district -- a real data-quality issue (see the app's CLAUDE.md, milestone M-49). It gets its own row here, kept as reported, with no attempt to match it to a registered name.",
            "circles_sectors[].type": "'circle' or 'sector', from D1. Null when the unit is unregistered (registered: false) -- there is no type to report for a name that was never registered.",
            "distinct_thana_count": "count of distinct raw thana_name strings, case-sensitive, no normalization -- 'Kotwali' and 'kotwali ' count as two if that is how the data was actually entered.",
            "thanas[].thana_name": "literal (blank) placeholder used only where the source thana_name column was NULL or an empty string -- never a made-up name.",
            "shop_type_breakdown": "counts per shop_type (MODEL_SHOP | COMPOSITE_SHOP | BHANG_SHOP | PRV | COUNTRY_LIQUOR | HBR), keys omitted where the count is zero at that node.",
        },
    }

    state = {
        "_meta": meta,
        "state": "Uttar Pradesh",
        "district_count": len(districts_out),
        "circle_sector_count": state_unit_total,
        "distinct_thana_count": len(state_thana_names),
        "shop_count": state_shop_total,
        "shop_type_breakdown": dict(sorted(state_type_breakdown.items())),
        "districts": districts_out,
    }

    with open(os.path.join(OUT_DIR, "state-hierarchy.json"), "w") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)

    def comment_header(f, lines):
        # `#`-prefixed lines are a common convention for self-describing CSVs
        # (e.g. VCF/GFF files) -- most GIS/analysis tools either skip them
        # automatically (pandas: comment='#') or a human can delete them in
        # a few seconds; the real header is always the first non-# line.
        for line in lines:
            f.write(f"# {line}\n")

    # Flat CSVs -- same numbers as the JSON, no nesting, for GIS/spreadsheet tools.
    with open(os.path.join(OUT_DIR, "districts.csv"), "w", newline="") as f:
        comment_header(f, [
            f"Generated {generated_at} from the local MariaDB clone of D1 (see docs/local-analysis-db.md).",
            "One row per district. bbox_* is D1's stored bounding box; center_lat/lon is COMPUTED here as the",
            "bbox midpoint (same method the live app's admin API uses), not a value stored in D1.",
            "shop_count / circle_sector_count / distinct_thana_count are sums over this district's own rows",
            "in circles_sectors.csv / thanas.csv -- see shop_type_breakdown.csv for the type-level split.",
        ])
        w = csv.writer(f)
        w.writerow(["district", "division", "status", "bbox_min_lat", "bbox_max_lat",
                    "bbox_min_lon", "bbox_max_lon", "center_lat", "center_lon",
                    "circle_sector_count", "distinct_thana_count", "shop_count"])
        for d in districts_out:
            c = d["center_computed_from_bbox_midpoint"] or {}
            w.writerow([d["name"], d["division"], d["status"],
                        d["bbox"]["min_lat"], d["bbox"]["max_lat"],
                        d["bbox"]["min_lon"], d["bbox"]["max_lon"],
                        c.get("lat"), c.get("lon"),
                        d["circle_sector_count"], d["distinct_thana_count"], d["shop_count"]])

    with open(os.path.join(OUT_DIR, "circles_sectors.csv"), "w", newline="") as f:
        comment_header(f, [
            f"Generated {generated_at} from the local MariaDB clone of D1 (see docs/local-analysis-db.md).",
            "One row per circle/sector registered in D1 (district_circles_sectors), plus any",
            "circle_sector_name found in shop data that was never registered (registered=False -- a real",
            "data-quality gap, see the app's CLAUDE.md M-49 note; kept as its own row here).",
            "type is 'circle' or 'sector', empty when registered=False (nothing to report).",
        ])
        w = csv.writer(f)
        w.writerow(["district", "circle_sector_name", "type", "registered",
                    "distinct_thana_count", "shop_count"])
        for d in districts_out:
            for u in d["circles_sectors"]:
                w.writerow([d["name"], u["name"], u["type"], u["registered"],
                            u["distinct_thana_count"], u["shop_count"]])

    with open(os.path.join(OUT_DIR, "thanas.csv"), "w", newline="") as f:
        comment_header(f, [
            f"Generated {generated_at} from the local MariaDB clone of D1 (see docs/local-analysis-db.md).",
            "One row per (district, circle/sector, thana) combination that has at least one uploaded shop.",
            "thana_name is copied verbatim from phase1_raw_collection.thana_name -- case/whitespace variants",
            "are NOT merged (e.g. 'Kotwali' and 'kotwali ' are two separate rows if entered that way).",
            "'(blank)' means the source thana_name was NULL or empty, not a real thana name.",
        ])
        w = csv.writer(f)
        w.writerow(["district", "circle_sector_name", "thana_name", "shop_count"])
        for d in districts_out:
            for u in d["circles_sectors"]:
                for t in u["thanas"]:
                    w.writerow([d["name"], u["name"], t["thana_name"], t["shop_count"]])

    with open(os.path.join(OUT_DIR, "shop_type_breakdown.csv"), "w", newline="") as f:
        comment_header(f, [
            f"Generated {generated_at} from the local MariaDB clone of D1 (see docs/local-analysis-db.md).",
            "Shop-type counts (MODEL_SHOP | COMPOSITE_SHOP | BHANG_SHOP | PRV | COUNTRY_LIQUOR | HBR) at",
            "three levels: 'state' (district/circle_sector_name blank), 'district' (circle_sector_name",
            "blank), and 'circle_sector'. A (shop_type, count) pair is only present where count > 0.",
        ])
        w = csv.writer(f)
        w.writerow(["level", "district", "circle_sector_name", "shop_type", "shop_count"])
        for shop_type, count in state["shop_type_breakdown"].items():
            w.writerow(["state", "", "", shop_type, count])
        for d in districts_out:
            for shop_type, count in d["shop_type_breakdown"].items():
                w.writerow(["district", d["name"], "", shop_type, count])
            for u in d["circles_sectors"]:
                for shop_type, count in u["shop_type_breakdown"].items():
                    w.writerow(["circle_sector", d["name"], u["name"], shop_type, count])

    write_sql(OUT_DIR, generated_at, state, districts_out)

    print(f"State: {state['district_count']} districts, {state['circle_sector_count']} circles/sectors, "
          f"{state['distinct_thana_count']} distinct thana names, {state['shop_count']} shops")
    print(f"Verified: shop_count sums match raw COUNT(*) ({total_shops_raw}) at every level")
    unregistered = [u["name"] for d in districts_out for u in d["circles_sectors"] if not u["registered"]]
    if unregistered:
        print(f"WARNING: {len(unregistered)} circle/sector name(s) in shop data have no matching "
              f"district_circles_sectors row (unregistered/mismatched, per CLAUDE.md's M-49 note): "
              f"{unregistered}")
    print(f"Written to {OUT_DIR}/")


if __name__ == "__main__":
    main()
