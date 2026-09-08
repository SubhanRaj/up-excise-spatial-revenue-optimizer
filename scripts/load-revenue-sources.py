"""
Loads two department source files into the local MariaDB clone
(docs/local-analysis-db.md), untouched:

  - revenue_data/from_elottery/2025-26 e-Lottery Data.xlsx
    The e-Lottery portal's own shop register -- shop ID/name, circle or
    sector, and every license-fee/MGQ component per shop. This is what
    actually establishes and sets up a shop, independent of what a DEO
    later reports through the portal's own upload flow.
    -> table elottery_shops

  - revenue_data/from_Stats/Final Achievement Districtwise 2025-26.xlsx
    The Statistics (JDS) section's district-wise target vs. achieved
    revenue for FY 2025-26, including the state GrandTotal row.
    -> table jds_district_achievement

Both source files are read exactly as they are -- no row dropped, no
figure recalculated. Two normalizations are applied, both documented at
their call sites below and neither touching a revenue figure:
  - The literal text "NULL" in two e-Lottery columns is stored as a real
    SQL NULL instead of the four-character string, since that string was
    already being used in the source file as a null marker, not a figure.
  - Both files spell district names their own way -- the e-Lottery file
    runs names together or abbreviates them ("Kanpurnagar", "PrayagRaj",
    "Sknagar"), and the JDS file uses short forms ("Kanpur Ngr.",
    "S.R. Nagar"). DISTRICT_NAME_FIXES below maps every one of those
    spellings to the exact name in the app's own `districts` table, so
    both new tables join cleanly against it and against each other.

Run: python3 scripts/load-revenue-sources.py
Reads DB creds from ../.env.local-analysis-db and both source workbooks
under ./revenue_data/ (gitignored -- real department data, not code).
Drops and recreates both tables every run, so it is safe to re-run after
replacing either source file with a corrected version.
"""
import os
import subprocess
import sys

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE = os.path.join(ROOT, ".env.local-analysis-db")
ELOTTERY_FILE = os.path.join(ROOT, "revenue_data", "from_elottery", "2025-26 e-Lottery Data.xlsx")
JDS_FILE = os.path.join(ROOT, "revenue_data", "from_Stats", "Final Achievement Districtwise 2025-26.xlsx")

# Maps every district spelling found in either source file to the exact
# name in the app's own `districts` table (both files use "Bhadohi" or a
# short form of it for what the app itself renamed from "Sant Ravidas
# Nagar" -- see CLAUDE.md's GeoJSON name-normalisation table).
DISTRICT_NAME_FIXES = {
    # from_elottery
    "Ambedkarnagar": "Ambedkar Nagar",
    "Auraya": "Auraiya",
    "Badaun": "Budaun",
    "Bagpat": "Baghpat",
    "Behraich": "Bahraich",
    "Bulandshahar": "Bulandshahr",
    "Gbnagar": "Gautam Buddha Nagar",
    "Kanpurdehat": "Kanpur Dehat",
    "Kanpurnagar": "Kanpur Nagar",
    "Kaushambhi": "Kaushambi",
    "Kheri": "Lakhimpur Kheri",
    "PrayagRaj": "Prayagraj",
    "Raebareli": "Rae Bareli",
    "Shamali": "Shamli",
    "Sidharthnagar": "Siddharth Nagar",
    "Sknagar": "Sant Kabir Nagar",
    # from_Stats (JDS)
    "Amb. Nagar": "Ambedkar Nagar",
    "B.Shahar": "Bulandshahr",
    "Badaun": "Budaun",
    "Bijnore": "Bijnor",
    "Chandoli": "Chandauli",
    "Chitrakut": "Chitrakoot",
    "G.B. Nagar": "Gautam Buddha Nagar",
    "Gazipur": "Ghazipur",
    "Kanpur Deh.": "Kanpur Dehat",
    "Kanpur Ngr.": "Kanpur Nagar",
    "Kansganj": "Kasganj",
    "Khiri": "Lakhimpur Kheri",
    "Muzz.Nagar": "Muzaffarnagar",
    "Orraiyya": "Auraiya",
    "R.Bareilly": "Rae Bareli",
    "S.K. Nagar": "Sant Kabir Nagar",
    "S.R. Nagar": "Bhadohi",
    "Sdh. Nagar": "Siddharth Nagar",
    "Shahjhanpur": "Shahjahanpur",
    "Srawasti": "Shravasti",
}


def fix_district_name(name):
    return DISTRICT_NAME_FIXES.get(name, name)


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


def sql_str(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def sql_num(v):
    if v is None:
        return "NULL"
    if isinstance(v, str) and v.strip().upper() == "NULL":
        return "NULL"
    return str(v)


def insert_batch(f, table, columns, rows, row_to_values):
    col_list = ", ".join(columns)
    for i in range(0, len(rows), 200):
        chunk = rows[i:i + 200]
        f.write(f"INSERT INTO {table} ({col_list}) VALUES\n")
        f.write(",\n".join(f"({row_to_values(r)})" for r in chunk))
        f.write(";\n")


def load_elottery_shops(f):
    wb = openpyxl.load_workbook(ELOTTERY_FILE, data_only=True, read_only=True)
    ws = wb["Sheet1"]
    rows = ws.iter_rows(values_only=True)
    next(rows)  # header row, already known below

    f.write("DROP TABLE IF EXISTS elottery_shops;\n")
    # Same collation as the cloned D1 tables (docs/local-analysis-db.md) --
    # MariaDB's own default collation differs, which breaks a plain "="
    # join against phase1_raw_collection.district_name/shop_id.
    f.write("""CREATE TABLE elottery_shops (
    shop_id BIGINT PRIMARY KEY,
    district_name VARCHAR(255),
    shop_type VARCHAR(64),
    shop_name_e VARCHAR(255),
    shop_name_h VARCHAR(255),
    thana_name VARCHAR(255),
    tehsil_name VARCHAR(255),
    circle_type VARCHAR(64),
    sector_type VARCHAR(64),
    license_fees_1 BIGINT,
    license_fees_2 BIGINT,
    license_fees BIGINT,
    annual_mgr_beer BIGINT,
    annual_mgr_fl BIGINT,
    mgq DOUBLE,
    basic_license_fees DOUBLE,
    consideration_fees DOUBLE,
    annual_mgr_ms BIGINT,
    consumption_on_premises_fees BIGINT
) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;\n""")

    columns = [
        "shop_id", "district_name", "shop_type", "shop_name_e", "shop_name_h",
        "thana_name", "tehsil_name", "circle_type", "sector_type",
        "license_fees_1", "license_fees_2", "license_fees",
        "annual_mgr_beer", "annual_mgr_fl", "mgq",
        "basic_license_fees", "consideration_fees",
        "annual_mgr_ms", "consumption_on_premises_fees",
    ]

    def to_values(r):
        (district_name, shop_type, shop_id, shop_name_e, shop_name_h, thana_name,
         tehsil_name, circle_type, sector_type, license_fees_1, license_fees_2,
         license_fees, annual_mgr_beer, annual_mgr_fl, mgq, basic_license_fees,
         consideration_fees, annual_mgr_ms, consumption_on_premises_fees) = r[:19]
        return ", ".join([
            sql_num(shop_id), sql_str(fix_district_name(district_name)), sql_str(shop_type),
            sql_str(shop_name_e), sql_str(shop_name_h), sql_str(thana_name),
            sql_str(tehsil_name), sql_str(circle_type), sql_str(sector_type),
            sql_num(license_fees_1), sql_num(license_fees_2), sql_num(license_fees),
            sql_num(annual_mgr_beer), sql_num(annual_mgr_fl), sql_num(mgq),
            sql_num(basic_license_fees), sql_num(consideration_fees),
            sql_num(annual_mgr_ms), sql_num(consumption_on_premises_fees),
        ])

    all_rows = list(rows)
    insert_batch(f, "elottery_shops", columns, all_rows, to_values)
    return len(all_rows)


def load_jds_achievement(f):
    wb = openpyxl.load_workbook(JDS_FILE, data_only=True, read_only=True)
    ws = wb["Sheet1"]
    rows = list(ws.iter_rows(values_only=True))
    data_rows = rows[4:]  # skip title, subtitle, header, and the numeric column-index row

    f.write("DROP TABLE IF EXISTS jds_district_achievement;\n")
    f.write("""CREATE TABLE jds_district_achievement (
    sno BIGINT,
    district_name VARCHAR(255),
    revenue_target_2025_26 DOUBLE,
    total_revenue_achieved_2025_26 DOUBLE,
    pct_achievement_vs_target DOUBLE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;\n""")

    columns = ["sno", "district_name", "revenue_target_2025_26",
               "total_revenue_achieved_2025_26", "pct_achievement_vs_target"]

    def to_values(r):
        sno, district_name, target, achieved, pct = r[:5]
        return ", ".join([
            sql_num(sno), sql_str(fix_district_name(district_name)),
            sql_num(target), sql_num(achieved), sql_num(pct),
        ])

    insert_batch(f, "jds_district_achievement", columns, data_rows, to_values)
    return len(data_rows)


def run_sql_file(cnf, path):
    result = subprocess.run(
        ["mysql", "-h", cnf["DB_HOST"], "-P", cnf["DB_PORT"],
         "-u", cnf["DB_USERNAME"], f"-p{cnf['DB_PASSWORD']}", cnf["DB_DATABASE"]],
        stdin=open(path), capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.exit(f"Import failed: {result.stderr}")


def table_count(cnf, table):
    result = subprocess.run(
        ["mysql", "-h", cnf["DB_HOST"], "-P", cnf["DB_PORT"],
         "-u", cnf["DB_USERNAME"], f"-p{cnf['DB_PASSWORD']}", "-N",
         cnf["DB_DATABASE"], "-e", f"SELECT COUNT(*) FROM {table}"],
        capture_output=True, text=True,
    )
    return int(result.stdout.strip())


def main():
    cnf = load_env(ENV_FILE)
    sql_path = os.path.join(ROOT, "revenue_data", "load-revenue-sources.sql")

    with open(sql_path, "w") as f:
        elottery_n = load_elottery_shops(f)
        jds_n = load_jds_achievement(f)

    run_sql_file(cnf, sql_path)

    elottery_loaded = table_count(cnf, "elottery_shops")
    jds_loaded = table_count(cnf, "jds_district_achievement")
    assert elottery_loaded == elottery_n, f"elottery_shops: loaded {elottery_loaded}, expected {elottery_n}"
    assert jds_loaded == jds_n, f"jds_district_achievement: loaded {jds_loaded}, expected {jds_n}"

    print(f"elottery_shops: {elottery_loaded} rows (source had {elottery_n})")
    print(f"jds_district_achievement: {jds_loaded} rows (source had {jds_n})")


if __name__ == "__main__":
    main()
