"""
Cross-checks what DEOs uploaded through the portal (phase1_raw_collection,
FY 2026-27) against the e-Lottery portal's own shop register
(elottery_shops, FY 2025-26) and the JDS achievement figures
(jds_district_achievement, FY 2025-26) -- all three already loaded into
the local clone by scripts/load-revenue-sources.py.

What this checks, shop by shop:
  - Does the DEO's shop_id exist in the e-Lottery register for the same
    district?
  - Does the DEO's shop_type match what the e-Lottery register has on
    file for that shop?
  - Does the thana name match?
  - Does the circle/sector number match (DEO free-text name vs.
    e-Lottery's own circle/sector number)?
  - Do the license-fee/MGR/BLF components match, field by field, per the
    revenue formula for that shop type (CLAUDE.md's Revenue Formulas
    table)?

What this deliberately does NOT check yet, and why:
  - consideration_fee, and the MGQ-driven Bhang component -- these come
    from a fixed per-unit policy price times a quantity, and the
    quantity is coming from a source not loaded into this database yet.
  - CL5CC's special_beer_lf/special_beer_mgr -- no e-Lottery column was
    found that corresponds to these (see FIELD_MAP below); every CL5CC
    row is recorded with a note explaining why.
  - PRV and HBR shops -- the e-Lottery file has no rows of either type at
    all, so there's nothing to compare them against.

A field comparison is never assumed to be exact. DEO data is for FY
2026-27; e-Lottery is FY 2025-26 -- a genuine year-over-year fee increase
is expected between the two, and a spot check across sample rows found
that increase sitting consistently around 5-11% for real matches. This
script does not decide what counts as a "wrong" figure -- it computes the
raw values, the difference, and the percent difference for every
compared field, and leaves judging the numbers to the report.

Run: python3 scripts/compare-revenue-sources.py
Reads DB creds from ../.env.local-analysis-db. Writes two result tables
into that same local database (revenue_comparison_shops,
revenue_comparison_districts), dropping and recreating both on every run,
and a single self-contained HTML report (revenue-comparison/report.html,
gitignored -- this is real department revenue data) with the full dataset
embedded, viewable by opening the file directly in a browser.
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE = os.path.join(ROOT, ".env.local-analysis-db")
OUT_DIR = os.path.join(ROOT, "revenue-comparison")

# DEO shop_type -> the exact label the e-Lottery file uses for it.
# PRV and HBR map to None because no e-Lottery row uses either type --
# confirmed by SELECT DISTINCT shop_type against elottery_shops.
EXPECTED_ELOTTERY_TYPE = {
    "MODEL_SHOP": "Model Shop",
    "COMPOSITE_SHOP": "Composite Shop",
    "BHANG_SHOP": "Bhang Shop",
    "COUNTRY_LIQUOR": "Country Liquor",
    "PRV": None,
    "HBR": None,
}

# (phase1 column, elottery column) pairs to compare, per shop type.
# Confirmed empirically (not by name-guessing) by comparing matched rows
# and checking the ratio between the two sides holds consistent across
# many shops of the same type -- see docs/revenue-comparison.md.
FIELD_MAP = {
    "MODEL_SHOP": [
        ("license_fee_lf", "license_fees"),
        ("mgr_amount", "annual_mgr_ms"),
    ],
    "COMPOSITE_SHOP": [
        ("composite_lf_fl", "license_fees_1"),
        ("composite_lf_beer", "license_fees_2"),
        ("composite_mgr_fl", "annual_mgr_fl"),
        ("composite_mgr_beer", "annual_mgr_beer"),
    ],
    "BHANG_SHOP": [
        ("license_fee_lf", "license_fees"),
    ],
    "COUNTRY_LIQUOR": [
        ("basic_license_fee_blf", "basic_license_fees"),
    ],
}

# A convenience threshold for the viewer's "mismatching" filter. It exists to
# make browsing easier and doesn't represent the real policy tolerance. Real
# matches ran ~5-11% above their e-Lottery figure on inspection (the expected
# FY25-26 -> FY26-27 increase); this just needs to sit comfortably above that band.
ISSUE_PCT_THRESHOLD = 20

DEFERRED_NOTE = ("deferred: quantity-based component, priced at a fixed "
                  "per-unit policy rate -- comparing once the quantity source is loaded")
CL5CC_NOTE = "no matching e-Lottery column found for the CL5CC special-beer add-on"
NO_TYPE_COVERAGE_NOTE = "e-Lottery data has no shops of this type to compare against"


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


def run_sql_file(cnf, path):
    result = subprocess.run(
        ["mysql", "-h", cnf["DB_HOST"], "-P", cnf["DB_PORT"],
         "-u", cnf["DB_USERNAME"], f"-p{cnf['DB_PASSWORD']}", cnf["DB_DATABASE"]],
        stdin=open(path), capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.exit(f"Import failed: {result.stderr}")


def sql_str(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def sql_num(v):
    return "NULL" if v is None else str(v)


def sql_bool(v):
    if v is None:
        return "NULL"
    return "TRUE" if v else "FALSE"


def norm_thana(name):
    if not name:
        return ""
    return re.sub(r"\s+", " ", name).strip().lower()


CIRCLE_RE = re.compile(r"^Circle\s+(\d+)\s*-", re.IGNORECASE)
SECTOR_RE = re.compile(r"^Sector\s*-\s*(\d+)$", re.IGNORECASE)
ELOTTERY_UNIT_RE = re.compile(r"^(Circle|Sector)\s*-\s*(\d+)$", re.IGNORECASE)


def parse_deo_unit(raw):
    """Returns (kind, number) from the DEO's free-text circle/sector name."""
    if not raw:
        return (None, None)
    m = CIRCLE_RE.match(raw)
    if m:
        return ("Circle", int(m.group(1)))
    m = SECTOR_RE.match(raw)
    if m:
        return ("Sector", int(m.group(1)))
    return (None, None)


def parse_elottery_unit(circle_type, sector_type):
    """Returns (kind, number) from e-Lottery's own CircleType/SectorType columns."""
    for raw in (circle_type, sector_type):
        if raw and raw != "N/A":
            m = ELOTTERY_UNIT_RE.match(raw)
            if m:
                return (m.group(1).capitalize(), int(m.group(2)))
    return (None, None)


def main():
    cnf = load_env(ENV_FILE)
    os.makedirs(OUT_DIR, exist_ok=True)

    print("Loading e-Lottery rows into memory for lookup...")
    elottery_rows = run_query(cnf, "SELECT * FROM elottery_shops")
    by_id_district = {}
    by_id_any = {}
    for r in elottery_rows:
        sid = int(r["shop_id"])
        by_id_district[(sid, r["district_name"])] = r
        by_id_any.setdefault(sid, []).append(r)

    print("Loading DEO shop rows...")
    deo_rows = run_query(cnf, "SELECT * FROM phase1_raw_collection")

    shop_results = []  # list of dicts, one row per (shop, field-or-summary)

    for p in deo_rows:
        district = p["district_name"]
        shop_id_raw = p["shop_id"]
        deo_type = p["shop_type"]
        base = {
            "district_name": district,
            "shop_id": shop_id_raw,
            "deo_shop_type": deo_type,
        }

        if not re.fullmatch(r"\d+", shop_id_raw):
            shop_results.append({**base, "match_status": "non_numeric_shop_id",
                                  "note": "DEO shop_id isn't a plain number, can't look up in e-Lottery's numeric register"})
            continue

        sid = int(shop_id_raw)
        e = by_id_district.get((sid, district))
        if e is None:
            other = by_id_any.get(sid)
            if other:
                shop_results.append({**base, "match_status": "district_mismatch",
                                      "note": f"shop_id {sid} exists in e-Lottery under a different district: "
                                              + ", ".join(sorted({o['district_name'] for o in other}))})
            else:
                shop_results.append({**base, "match_status": "no_elottery_match",
                                      "note": "shop_id not found in e-Lottery register for this district at all"})
            continue

        expected_type = EXPECTED_ELOTTERY_TYPE.get(deo_type)
        if expected_type is None:
            shop_results.append({**base, "match_status": "no_type_coverage",
                                  "elottery_shop_type": e["shop_type"], "note": NO_TYPE_COVERAGE_NOTE})
            continue
        if e["shop_type"] != expected_type:
            shop_results.append({**base, "match_status": "shop_type_mismatch",
                                  "elottery_shop_type": e["shop_type"],
                                  "note": f"DEO says {deo_type}, e-Lottery has it as {e['shop_type']}"})
            continue

        thana_deo, thana_el = p["thana_name"], e["thana_name"]
        thana_match = norm_thana(thana_deo) == norm_thana(thana_el)

        unit_kind_deo, unit_num_deo = parse_deo_unit(p["circle_sector_name"])
        unit_kind_el, unit_num_el = parse_elottery_unit(e["circle_type"], e["sector_type"])
        unit_match = (unit_kind_deo, unit_num_deo) == (unit_kind_el, unit_num_el)

        location = {
            "thana_deo": thana_deo, "thana_elottery": thana_el, "thana_match": thana_match,
            "unit_deo_raw": p["circle_sector_name"],
            "unit_kind_deo": unit_kind_deo, "unit_number_deo": unit_num_deo,
            "unit_kind_elottery": unit_kind_el, "unit_number_elottery": unit_num_el,
            "unit_match": unit_match,
        }

        for deo_col, el_col in FIELD_MAP[deo_type]:
            dv = float(p[deo_col]) if p[deo_col] is not None else None
            ev = float(e[el_col]) if e[el_col] is not None else None
            diff = (dv - ev) if (dv is not None and ev is not None) else None
            pct = (diff / ev * 100) if (diff is not None and ev not in (None, 0)) else None
            shop_results.append({**base, **location, "match_status": "matched",
                                  "elottery_shop_type": e["shop_type"],
                                  "field_name": f"{deo_col}_vs_{el_col}",
                                  "deo_value": dv, "elottery_value": ev,
                                  "diff": diff, "pct_diff": pct, "comparable": True})

        if deo_type == "COUNTRY_LIQUOR" and int(p["has_cl5cc"]) == 1:
            for deo_col in ("special_beer_lf", "special_beer_mgr"):
                dv = float(p[deo_col]) if p[deo_col] is not None else None
                shop_results.append({**base, **location, "match_status": "matched",
                                      "elottery_shop_type": e["shop_type"],
                                      "field_name": deo_col, "deo_value": dv,
                                      "comparable": False, "note": CL5CC_NOTE})

        if deo_type == "COUNTRY_LIQUOR":
            shop_results.append({**base, **location, "match_status": "matched",
                                  "elottery_shop_type": e["shop_type"], "field_name": "consideration_fee",
                                  "deo_value": float(p["consideration_fee"]), "comparable": False,
                                  "note": DEFERRED_NOTE})
        if deo_type == "BHANG_SHOP":
            shop_results.append({**base, **location, "match_status": "matched",
                                  "elottery_shop_type": e["shop_type"], "field_name": "mgq_quantity",
                                  "deo_value": float(p["mgq_quantity"]),
                                  "elottery_value": float(e["mgq"]) if e["mgq"] is not None else None,
                                  "comparable": False, "note": DEFERRED_NOTE})

    print(f"Built {len(shop_results)} comparison rows across {len(deo_rows)} DEO shops.")

    print("Building district-level totals...")
    deo_totals = run_query(cnf, """
        SELECT district_name, COUNT(*) AS shop_count, SUM(total_revenue) AS total_revenue
        FROM phase1_raw_collection GROUP BY district_name
    """)
    deo_by_district = {r["district_name"]: r for r in deo_totals}

    # Per shop type, so PRV and HBR -- absent from e-Lottery entirely, but
    # still real money in a district's total -- show up in the district
    # view instead of silently vanishing between the two sources.
    deo_type_rows = run_query(cnf, """
        SELECT district_name, shop_type, COUNT(*) AS n, SUM(total_revenue) AS revenue
        FROM phase1_raw_collection GROUP BY district_name, shop_type
    """)
    deo_type_by_district = {}
    for r in deo_type_rows:
        deo_type_by_district.setdefault(r["district_name"], {})[r["shop_type"]] = {
            "count": int(r["n"]), "revenue": float(r["revenue"]) if r["revenue"] is not None else 0.0,
        }

    print("Building circle/sector breakdown...")
    unit_type_rows = run_query(cnf, """
        SELECT district_name, circle_sector_name, shop_type, COUNT(*) AS n, SUM(total_revenue) AS revenue
        FROM phase1_raw_collection GROUP BY district_name, circle_sector_name, shop_type
    """)
    unit_thana_rows = run_query(cnf, """
        SELECT district_name, circle_sector_name, COUNT(DISTINCT thana_name) AS n
        FROM phase1_raw_collection GROUP BY district_name, circle_sector_name
    """)
    registered_units = run_query(cnf, "SELECT district_name, name, type FROM district_circles_sectors")

    unit_key = lambda d, n: (d, n)  # noqa: E731
    units = {}  # (district, name) -> accumulator
    for r in registered_units:
        units[unit_key(r["district_name"], r["name"])] = {
            "district": r["district_name"], "name": r["name"], "type": r["type"],
            "registered": True, "shopTypeBreakdown": {}, "shopCount": 0, "revenue": 0.0, "distinctThanaCount": 0,
        }
    for r in unit_type_rows:
        key = unit_key(r["district_name"], r["circle_sector_name"])
        if key not in units:
            # A shop references a circle/sector name that was never registered --
            # kept as its own row, not matched to a registered name (same
            # convention as CLAUDE.md's "Unregistered / Mismatched" card).
            kind, _num = parse_deo_unit(r["circle_sector_name"])
            units[key] = {
                "district": r["district_name"], "name": r["circle_sector_name"], "type": kind,
                "registered": False, "shopTypeBreakdown": {}, "shopCount": 0, "revenue": 0.0, "distinctThanaCount": 0,
            }
        n = int(r["n"])
        revenue = float(r["revenue"]) if r["revenue"] is not None else 0.0
        units[key]["shopTypeBreakdown"][r["shop_type"]] = {"count": n, "revenue": revenue}
        units[key]["shopCount"] += n
        units[key]["revenue"] += revenue
    for r in unit_thana_rows:
        key = unit_key(r["district_name"], r["circle_sector_name"])
        if key in units:
            units[key]["distinctThanaCount"] = int(r["n"])
    circle_sectors_out = sorted(units.values(), key=lambda u: (u["district"], u["name"]))
    print(f"Built {len(circle_sectors_out)} circle/sector rows across {len(set(u['district'] for u in circle_sectors_out))} districts.")

    elottery_counts = run_query(cnf, "SELECT district_name, COUNT(*) AS n FROM elottery_shops GROUP BY district_name")
    elottery_count_by_district = {r["district_name"]: int(r["n"]) for r in elottery_counts}

    jds_rows = run_query(cnf, "SELECT * FROM jds_district_achievement WHERE district_name != 'GrandTotal'")

    district_results = []
    for j in jds_rows:
        d = j["district_name"]
        deo = deo_by_district.get(d)
        deo_shop_count = int(deo["shop_count"]) if deo else 0
        deo_revenue = float(deo["total_revenue"]) if deo and deo["total_revenue"] is not None else 0.0
        achieved_crore = float(j["total_revenue_achieved_2025_26"]) if j["total_revenue_achieved_2025_26"] is not None else None
        achieved_rupees_assuming_crore = achieved_crore * 1e7 if achieved_crore is not None else None
        type_breakdown = deo_type_by_district.get(d, {})
        prv_hbr_count = sum(type_breakdown.get(t, {}).get("count", 0) for t in ("PRV", "HBR"))
        prv_hbr_revenue = sum(type_breakdown.get(t, {}).get("revenue", 0.0) for t in ("PRV", "HBR"))
        # The actual comparison this whole exercise is for: what's filed on
        # the SRO portal against the JDS section's own achieved figure for
        # that district (not the target -- see docs/revenue-comparison.md).
        sro_vs_achieved_diff = (deo_revenue - achieved_rupees_assuming_crore) if achieved_rupees_assuming_crore is not None else None
        sro_vs_achieved_pct = (sro_vs_achieved_diff / achieved_rupees_assuming_crore * 100) if (sro_vs_achieved_diff is not None and achieved_rupees_assuming_crore) else None
        district_results.append({
            "district_name": d,
            "deo_shop_count": deo_shop_count,
            "elottery_shop_count": elottery_count_by_district.get(d, 0),
            "deo_total_revenue_fy2627_rupees": deo_revenue,
            "jds_revenue_achieved_2025_26_crore": achieved_crore,
            "jds_revenue_achieved_2025_26_rupees_assuming_crore": achieved_rupees_assuming_crore,
            "sro_vs_achieved_diff_rupees": sro_vs_achieved_diff,
            "sro_vs_achieved_pct": sro_vs_achieved_pct,
            "shop_type_breakdown": type_breakdown,
            "prv_hbr_shop_count": prv_hbr_count,
            "prv_hbr_revenue_fy2627_rupees": prv_hbr_revenue,
        })

    with open(os.path.join(ROOT, "revenue-comparison", "load-comparison.sql"), "w") as f:
        f.write("DROP TABLE IF EXISTS revenue_comparison_shops;\n")
        f.write("""CREATE TABLE revenue_comparison_shops (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    district_name VARCHAR(255),
    shop_id VARCHAR(255),
    deo_shop_type VARCHAR(64),
    elottery_shop_type VARCHAR(64),
    match_status VARCHAR(32),
    thana_deo VARCHAR(255),
    thana_elottery VARCHAR(255),
    thana_match BOOLEAN,
    unit_deo_raw VARCHAR(255),
    unit_kind_deo VARCHAR(16),
    unit_number_deo INT,
    unit_kind_elottery VARCHAR(16),
    unit_number_elottery INT,
    unit_match BOOLEAN,
    field_name VARCHAR(64),
    deo_value DOUBLE,
    elottery_value DOUBLE,
    diff DOUBLE,
    pct_diff DOUBLE,
    comparable BOOLEAN,
    note VARCHAR(255)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;\n""")
        cols = ["district_name", "shop_id", "deo_shop_type", "elottery_shop_type", "match_status",
                "thana_deo", "thana_elottery", "thana_match", "unit_deo_raw", "unit_kind_deo",
                "unit_number_deo", "unit_kind_elottery", "unit_number_elottery", "unit_match",
                "field_name", "deo_value", "elottery_value", "diff", "pct_diff", "comparable", "note"]
        for i in range(0, len(shop_results), 200):
            chunk = shop_results[i:i + 200]
            f.write(f"INSERT INTO revenue_comparison_shops ({', '.join(cols)}) VALUES\n")
            values = []
            for r in chunk:
                row = [
                    sql_str(r.get("district_name")), sql_str(r.get("shop_id")),
                    sql_str(r.get("deo_shop_type")), sql_str(r.get("elottery_shop_type")),
                    sql_str(r.get("match_status")), sql_str(r.get("thana_deo")),
                    sql_str(r.get("thana_elottery")), sql_bool(r.get("thana_match")),
                    sql_str(r.get("unit_deo_raw")), sql_str(r.get("unit_kind_deo")),
                    sql_num(r.get("unit_number_deo")), sql_str(r.get("unit_kind_elottery")),
                    sql_num(r.get("unit_number_elottery")), sql_bool(r.get("unit_match")),
                    sql_str(r.get("field_name")), sql_num(r.get("deo_value")),
                    sql_num(r.get("elottery_value")), sql_num(r.get("diff")),
                    sql_num(r.get("pct_diff")), sql_bool(r.get("comparable")), sql_str(r.get("note")),
                ]
                values.append("(" + ", ".join(row) + ")")
            f.write(",\n".join(values))
            f.write(";\n")

        f.write("DROP TABLE IF EXISTS revenue_comparison_districts;\n")
        f.write("""CREATE TABLE revenue_comparison_districts (
    district_name VARCHAR(255) PRIMARY KEY,
    deo_shop_count INT,
    elottery_shop_count INT,
    deo_total_revenue_fy2627_rupees DOUBLE,
    jds_revenue_achieved_2025_26_crore DOUBLE,
    jds_revenue_achieved_2025_26_rupees_assuming_crore DOUBLE,
    sro_vs_achieved_diff_rupees DOUBLE,
    sro_vs_achieved_pct DOUBLE,
    prv_hbr_shop_count INT,
    prv_hbr_revenue_fy2627_rupees DOUBLE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;\n""")
        dcols = ["district_name", "deo_shop_count", "elottery_shop_count",
                 "deo_total_revenue_fy2627_rupees",
                 "jds_revenue_achieved_2025_26_crore",
                 "jds_revenue_achieved_2025_26_rupees_assuming_crore",
                 "sro_vs_achieved_diff_rupees", "sro_vs_achieved_pct",
                 "prv_hbr_shop_count", "prv_hbr_revenue_fy2627_rupees"]
        f.write(f"INSERT INTO revenue_comparison_districts ({', '.join(dcols)}) VALUES\n")
        drows = []
        for r in district_results:
            drows.append("(" + ", ".join([
                sql_str(r["district_name"]), sql_num(r["deo_shop_count"]), sql_num(r["elottery_shop_count"]),
                sql_num(r["deo_total_revenue_fy2627_rupees"]),
                sql_num(r["jds_revenue_achieved_2025_26_crore"]),
                sql_num(r["jds_revenue_achieved_2025_26_rupees_assuming_crore"]),
                sql_num(r["sro_vs_achieved_diff_rupees"]), sql_num(r["sro_vs_achieved_pct"]),
                sql_num(r["prv_hbr_shop_count"]), sql_num(r["prv_hbr_revenue_fy2627_rupees"]),
            ]) + ")")
        f.write(",\n".join(drows))
        f.write(";\n")

    run_sql_file(cnf, os.path.join(OUT_DIR, "load-comparison.sql"))

    shop_loaded = int(run_query(cnf, "SELECT COUNT(*) AS n FROM revenue_comparison_shops")[0]["n"])
    district_loaded = int(run_query(cnf, "SELECT COUNT(*) AS n FROM revenue_comparison_districts")[0]["n"])
    assert shop_loaded == len(shop_results), f"revenue_comparison_shops: loaded {shop_loaded}, expected {len(shop_results)}"
    assert district_loaded == len(district_results), f"revenue_comparison_districts: loaded {district_loaded}, expected {len(district_results)}"
    print(f"revenue_comparison_shops: {shop_loaded} rows")
    print(f"revenue_comparison_districts: {district_loaded} rows")

    print("Building the report data...")
    by_shop = {}
    order = []
    for r in shop_results:
        key = (r["district_name"], r["shop_id"])
        if key not in by_shop:
            by_shop[key] = {"base": r, "fields": []}
            order.append(key)
        if r.get("field_name"):
            by_shop[key]["fields"].append({
                "name": r["field_name"], "deoValue": r.get("deo_value"), "elotteryValue": r.get("elottery_value"),
                "pctDiff": r.get("pct_diff"), "comparable": r.get("comparable"), "note": r.get("note"),
            })

    shops_out = []
    for key in order:
        b = by_shop[key]["base"]
        fields = by_shop[key]["fields"]
        has_issue = (
            b["match_status"] != "matched"
            or b.get("thana_match") is False
            or b.get("unit_match") is False
            or any(f["comparable"] and f["pctDiff"] is not None and abs(f["pctDiff"]) > ISSUE_PCT_THRESHOLD for f in fields)
        )
        shops_out.append({
            "district": b["district_name"], "shopId": b["shop_id"], "deoType": b["deo_shop_type"],
            "elotteryType": b.get("elottery_shop_type"), "matchStatus": b["match_status"],
            "thana": {"deo": b.get("thana_deo"), "elottery": b.get("thana_elottery"), "match": b.get("thana_match")},
            "unit": {
                "deoRaw": b.get("unit_deo_raw"), "deoKind": b.get("unit_kind_deo"), "deoNumber": b.get("unit_number_deo"),
                "elotteryKind": b.get("unit_kind_elottery"), "elotteryNumber": b.get("unit_number_elottery"),
                "match": b.get("unit_match"),
            },
            "note": b.get("note"), "fields": fields, "hasIssue": has_issue,
        })

    districts_out = [{
        "district": r["district_name"],
        "sroShopCount": r["deo_shop_count"], "elotteryShopCount": r["elottery_shop_count"],
        "sroTotalRevenue": r["deo_total_revenue_fy2627_rupees"],
        "jdsAchievedCrore": r["jds_revenue_achieved_2025_26_crore"],
        "jdsAchievedRupees": r["jds_revenue_achieved_2025_26_rupees_assuming_crore"],
        "sroVsAchievedDiff": r["sro_vs_achieved_diff_rupees"],
        "sroVsAchievedPct": r["sro_vs_achieved_pct"],
        "shopTypeBreakdown": {t: {"count": v["count"], "revenue": v["revenue"]} for t, v in r["shop_type_breakdown"].items()},
        "prvHbrShopCount": r["prv_hbr_shop_count"], "prvHbrRevenue": r["prv_hbr_revenue_fy2627_rupees"],
    } for r in district_results]

    report_data = {
        "generatedAt": __import__("datetime").datetime.now().isoformat(),
        "issuePctThreshold": ISSUE_PCT_THRESHOLD,
        "shops": shops_out,
        "districts": districts_out,
        "circleSectors": circle_sectors_out,
    }
    html_path = write_report_html(report_data)
    size_mb = os.path.getsize(html_path) / (1024 * 1024)
    print(f"Wrote {html_path} ({size_mb:.1f} MB, {len(shops_out)} shops)")


def write_report_html(data):
    """A single self-contained HTML file: the full dataset embedded as JSON, rendered
    client-side with plain JS. No build step, no dev server -- open the file directly.
    Kept deliberately simple (no framework) since this is an occasional local analysis
    tool, not an app anyone deploys or revisits daily."""
    json_blob = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
    html = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SRO vs. e-Lottery vs. JDS -- Revenue Comparison</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, Segoe UI, Arial, sans-serif; margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .meta { color: #64748b; font-size: 12px; margin-bottom: 20px; }
  .cards { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; min-width: 140px; }
  .card .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .04em; }
  .card .value { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .card .value.err { color: #dc2626; }
  .card .value.ok { color: #16a34a; }
  section { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 18px; }
  section h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; margin: 0 0 10px; }
  .match-stats { display: flex; flex-wrap: wrap; gap: 16px; }
  .match-stats button { border: none; background: none; cursor: pointer; font: inherit; padding: 0; text-align: left; }
  .match-stats button:hover { text-decoration: underline; }
  .match-stats .n { font-weight: 700; font-variant-numeric: tabular-nums; }
  .match-stats .n.warn { color: #d97706; } .match-stats .n.err { color: #dc2626; } .match-stats .n.ok { color: #16a34a; } .match-stats .n.dim { color: #64748b; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
  .filters input, .filters select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 8px; font-size: 12.5px; }
  table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
  th, td { border-bottom: 1px solid #eef2f7; padding: 5px 8px; text-align: left; white-space: nowrap; }
  th { position: sticky; top: 0; background: #f1f5f9; cursor: pointer; user-select: none; }
  tr:hover td { background: #f8fafc; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .wrap-fields td { white-space: normal; }
  .fields-row { display: none; background: #f8fafc; }
  .fields-row.open { display: table-row; }
  .fields-row td { white-space: normal; }
  .field-chip { display: inline-block; margin: 2px 6px 2px 0; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; border: 1px solid #e2e8f0; }
  .expandBtn { cursor: pointer; color: #2563eb; }
  .loadmore { margin-top: 10px; padding: 6px 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; cursor: pointer; font-size: 12.5px; }
  .scroll { max-height: 70vh; overflow: auto; border: 1px solid #eef2f7; border-radius: 6px; }
  .rowcount { font-size: 11.5px; color: #64748b; margin-top: 6px; }
</style>
</head>
<body>
<h1>SRO vs. e-Lottery vs. JDS -- revenue comparison</h1>
<div class="meta" id="generatedAt"></div>

<div class="cards" id="stateCards"></div>

<section>
  <h2>Shop match status, statewide (click a number to filter the shop table below)</h2>
  <div class="match-stats" id="matchStats"></div>
</section>

<section>
  <h2>Districts</h2>
  <div class="filters">
    <input id="districtSearch" placeholder="Search district...">
  </div>
  <div class="scroll">
    <table id="districtsTable">
      <thead><tr>
        <th data-k="district">District</th>
        <th data-k="sroShopCount" class="num">SRO shops</th>
        <th data-k="elotteryShopCount" class="num">e-Lottery shops</th>
        <th data-k="sroTotalRevenue" class="num">SRO total revenue</th>
        <th data-k="jdsAchievedCrore" class="num">JDS achieved (Cr)</th>
        <th data-k="sroVsAchievedPct" class="num">SRO vs. achieved</th>
      </tr></thead>
      <tbody></tbody>
    </table>
  </div>
</section>

<section>
  <h2>Shops</h2>
  <div class="filters">
    <input id="shopDistrict" placeholder="District...">
    <select id="shopStatus"></select>
    <input id="shopId" placeholder="Shop ID...">
  </div>
  <div class="scroll" id="shopsScroll">
    <table id="shopsTable">
      <thead><tr>
        <th>District</th><th>Shop ID</th><th>DEO type</th><th>e-Lottery type</th><th>Status</th><th>Thana match</th><th>Unit match</th><th></th>
      </tr></thead>
      <tbody></tbody>
    </table>
  </div>
  <div class="rowcount" id="shopRowCount"></div>
  <button class="loadmore" id="loadMoreBtn">Load 500 more</button>
</section>

<script id="report-data" type="application/json">__DATA__</script>
<script>
const DATA = JSON.parse(document.getElementById('report-data').textContent);
const fmtInt = n => (n ?? 0).toLocaleString('en-IN');
const fmtMoney = n => n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN');
const fmtPct = n => n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%';

document.getElementById('generatedAt').textContent =
  'Generated ' + new Date(DATA.generatedAt).toLocaleString('en-IN') +
  ' · ' + DATA.districts.length + ' districts · ' + DATA.shops.length + ' shops';

// ---- state cards ----
const totals = DATA.districts.reduce((a, r) => {
  a.sro += r.sroShopCount; a.el += r.elotteryShopCount;
  a.sroRev += r.sroTotalRevenue; a.achieved += (r.jdsAchievedRupees ?? 0);
  return a;
}, { sro: 0, el: 0, sroRev: 0, achieved: 0 });
const vsPct = totals.achieved ? ((totals.sroRev - totals.achieved) / totals.achieved) * 100 : null;
const cardsEl = document.getElementById('stateCards');
[
  ['Districts', DATA.districts.length, ''],
  ['SRO shops', fmtInt(totals.sro), ''],
  ['e-Lottery shops', fmtInt(totals.el), ''],
  ['SRO total revenue', fmtMoney(totals.sroRev), ''],
  ['JDS achieved revenue', fmtMoney(totals.achieved), 'ok'],
  ['SRO vs. JDS achieved', fmtPct(vsPct), vsPct < 0 ? 'err' : 'ok'],
].forEach(([label, value, cls]) => {
  const c = document.createElement('div'); c.className = 'card';
  c.innerHTML = `<div class="label">${label}</div><div class="value ${cls}">${value}</div>`;
  cardsEl.appendChild(c);
});

// ---- match status stats (clickable) ----
const MATCH_LABEL = {
  matched: ['Matched', 'ok'], no_elottery_match: ['Not found in e-Lottery', 'warn'],
  shop_type_mismatch: ['Shop type mismatch', 'err'], district_mismatch: ['Found under a different district', 'err'],
  no_type_coverage: ['No e-Lottery coverage (PRV/HBR)', 'dim'], non_numeric_shop_id: ['Non-numeric shop ID', 'dim'],
};
const matchCounts = {};
for (const s of DATA.shops) matchCounts[s.matchStatus] = (matchCounts[s.matchStatus] ?? 0) + 1;
const matchStatsEl = document.getElementById('matchStats');
Object.entries(MATCH_LABEL).forEach(([status, [label, cls]]) => {
  const b = document.createElement('button');
  b.innerHTML = `<span class="n ${cls}">${fmtInt(matchCounts[status])}</span> ${label}`;
  b.onclick = () => { document.getElementById('shopStatus').value = status; applyShopFilter(); document.getElementById('shopsScroll').scrollIntoView({ behavior: 'smooth' }); };
  matchStatsEl.appendChild(b);
});

// ---- districts table ----
let districtSort = { k: 'district', dir: 1 };
function renderDistricts() {
  const q = document.getElementById('districtSearch').value.trim().toLowerCase();
  const rows = DATA.districts.filter(d => !q || d.district.toLowerCase().includes(q))
    .sort((a, b) => (a[districtSort.k] > b[districtSort.k] ? 1 : -1) * districtSort.dir);
  const tbody = document.querySelector('#districtsTable tbody');
  tbody.innerHTML = rows.map(d => `<tr>
    <td>${d.district}</td>
    <td class="num">${fmtInt(d.sroShopCount)}</td>
    <td class="num">${fmtInt(d.elotteryShopCount)}</td>
    <td class="num">${fmtMoney(d.sroTotalRevenue)}</td>
    <td class="num">${d.jdsAchievedCrore == null ? '—' : d.jdsAchievedCrore.toLocaleString('en-IN')}</td>
    <td class="num">${fmtPct(d.sroVsAchievedPct)}</td>
  </tr>`).join('');
}
document.querySelectorAll('#districtsTable th').forEach(th => th.onclick = () => {
  const k = th.dataset.k;
  districtSort = { k, dir: districtSort.k === k ? -districtSort.dir : 1 };
  renderDistricts();
});
document.getElementById('districtSearch').oninput = renderDistricts;
renderDistricts();

// ---- shops table (paginated client-side) ----
const statusSel = document.getElementById('shopStatus');
statusSel.innerHTML = '<option value="">All statuses</option>' +
  Object.entries(MATCH_LABEL).map(([v, [l]]) => `<option value="${v}">${l}</option>`).join('');

let filteredShops = DATA.shops;
let shownCount = 0;
const PAGE = 500;

function applyShopFilter() {
  const district = document.getElementById('shopDistrict').value.trim().toLowerCase();
  const status = statusSel.value;
  const shopId = document.getElementById('shopId').value.trim().toLowerCase();
  filteredShops = DATA.shops.filter(s =>
    (!district || s.district.toLowerCase().includes(district)) &&
    (!status || s.matchStatus === status) &&
    (!shopId || String(s.shopId).toLowerCase().includes(shopId)));
  shownCount = 0;
  document.querySelector('#shopsTable tbody').innerHTML = '';
  renderMoreShops();
}
[document.getElementById('shopDistrict'), statusSel, document.getElementById('shopId')].forEach(el => el.oninput = applyShopFilter);

function fieldChips(fields) {
  if (!fields || !fields.length) return '<span style="color:#94a3b8">no compared fields</span>';
  return fields.map(f => {
    const pct = f.pctDiff == null ? '' : ` (${fmtPct(f.pctDiff)})`;
    return `<span class="field-chip">${f.name}: SRO ${f.deoValue ?? '—'} / e-Lottery ${f.elotteryValue ?? '—'}${pct}${f.note ? ' — ' + f.note : ''}</span>`;
  }).join(' ');
}

function renderMoreShops() {
  const tbody = document.querySelector('#shopsTable tbody');
  const next = filteredShops.slice(shownCount, shownCount + PAGE);
  next.forEach((s, i) => {
    const idx = shownCount + i;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.district}</td><td>${s.shopId}</td><td>${s.deoType}</td><td>${s.elotteryType ?? '—'}</td>
      <td>${MATCH_LABEL[s.matchStatus]?.[0] ?? s.matchStatus}</td>
      <td>${s.thana?.match === undefined ? '—' : (s.thana.match ? 'yes' : 'no')}</td>
      <td>${s.unit?.match === undefined ? '—' : (s.unit.match ? 'yes' : 'no')}</td>
      <td class="expandBtn" data-idx="${idx}">details ↓</td>`;
    tbody.appendChild(tr);
    const fr = document.createElement('tr');
    fr.className = 'fields-row';
    fr.innerHTML = `<td colspan="8">${fieldChips(s.fields)}${s.note ? `<div style="margin-top:4px;color:#64748b">${s.note}</div>` : ''}</td>`;
    tbody.appendChild(fr);
    tr.querySelector('.expandBtn').onclick = () => fr.classList.toggle('open');
  });
  shownCount += next.length;
  document.getElementById('shopRowCount').textContent = `Showing ${shownCount.toLocaleString('en-IN')} of ${filteredShops.length.toLocaleString('en-IN')} shops`;
  document.getElementById('loadMoreBtn').style.display = shownCount >= filteredShops.length ? 'none' : '';
}
document.getElementById('loadMoreBtn').onclick = renderMoreShops;
applyShopFilter();
</script>
</body>
</html>"""
    html = html.replace("__DATA__", json_blob)
    out_path = os.path.join(OUT_DIR, "report.html")
    with open(out_path, "w") as f:
        f.write(html)
    return out_path


if __name__ == "__main__":
    main()
