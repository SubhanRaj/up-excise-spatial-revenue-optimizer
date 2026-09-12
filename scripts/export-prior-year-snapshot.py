"""
One-time export of the FY 2025-26 shop data out of the local MariaDB clone
(docs/local-analysis-db.md) into a SQL file that loads phase1_prior_year_snapshot
on remote D1 (migrations/0014_add_phase1_prior_year_snapshot.sql).

The local clone's phase1_raw_collection is the snapshot taken just before the
M-101 FY 2026-27 cleanup wiped the real table -- it was never re-synced since,
so it's still FY 2025-26 data. This script does not touch the local clone; it
only reads it and writes revenue_data/prior-year-snapshot.sql.

Run: python3 scripts/export-prior-year-snapshot.py
Then load it onto remote D1 from apps/web:
  npx wrangler d1 execute up-excise-spatial-revenue-optimizer-prod --remote \
    --file=../../revenue_data/prior-year-snapshot.sql
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE = os.path.join(ROOT, ".env.local-analysis-db")
OUT_PATH = os.path.join(ROOT, "revenue_data", "prior-year-snapshot.sql")


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


def sql_str(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def sql_num(v):
    return "NULL" if v is None else str(v)


def main():
    cnf = load_env(ENV_FILE)
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

    print("Reading phase1_raw_collection from the local clone (pre-cleanup FY 2025-26 snapshot)...")
    rows = run_query(cnf, """
        SELECT district_name, shop_id, shop_name, shop_type, circle_sector_name,
               thana_name, total_revenue
        FROM phase1_raw_collection
    """)
    print(f"{len(rows)} rows.")

    cols = ["district_name", "shop_id", "shop_name", "shop_type", "circle_sector_name", "thana_name", "total_revenue"]
    with open(OUT_PATH, "w") as f:
        f.write("DELETE FROM phase1_prior_year_snapshot;\n")
        for i in range(0, len(rows), 200):
            chunk = rows[i:i + 200]
            f.write(f"INSERT INTO phase1_prior_year_snapshot ({', '.join(cols)}) VALUES\n")
            values = []
            for r in chunk:
                values.append("(" + ", ".join([
                    sql_str(r["district_name"]), sql_str(r["shop_id"]), sql_str(r["shop_name"]),
                    sql_str(r["shop_type"]), sql_str(r["circle_sector_name"]), sql_str(r["thana_name"]),
                    sql_num(r["total_revenue"]),
                ]) + ")")
            f.write(",\n".join(values))
            f.write(";\n")

    print(f"Wrote {OUT_PATH} ({len(rows)} rows).")
    print("Load it onto remote D1 (from apps/web):")
    print("  npx wrangler d1 execute up-excise-spatial-revenue-optimizer-prod --remote \\")
    print("    --file=../../revenue_data/prior-year-snapshot.sql")


if __name__ == "__main__":
    main()
