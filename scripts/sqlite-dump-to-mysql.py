import sqlite3, sys, re

DUMP = sys.argv[1]
OUT = sys.argv[2]

con = sqlite3.connect(":memory:")
con.executescript(open(DUMP).read())
cur = con.cursor()

tables = [r[0] for r in cur.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('d1_migrations','sqlite_sequence')"
).fetchall()]

def esc_ident(s):
    return f"`{s}`"

def esc_str(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"

def sqlite_type_to_mysql(decl, is_indexed):
    d = (decl or "").upper()
    if "INT" in d:
        return "BIGINT"
    if "REAL" in d or "FLOA" in d or "DOUB" in d:
        return "DOUBLE"
    return "VARCHAR(255)" if is_indexed else "LONGTEXT"

out = ["SET FOREIGN_KEY_CHECKS=0;", "SET NAMES utf8mb4;"]
table_notes = {}
index_stmts = []

for t in tables:
    cols = cur.execute(f"PRAGMA table_info({t})").fetchall()  # cid, name, type, notnull, dflt, pk
    pk_cols = [c[1] for c in cols if c[5] > 0]
    single_int_autopk = len(pk_cols) == 1 and any(
        c[1] == pk_cols[0] and "INT" in (c[2] or "").upper() for c in cols
    )

    # Every index (named + SQLite's auto-index for inline UNIQUE) with real column names.
    idx_list = cur.execute(f"PRAGMA index_list({t})").fetchall()  # seq, name, unique, origin, partial
    indexed_cols = set()
    table_index_stmts = []
    for seq, iname, unique, origin, partial in idx_list:
        if origin == "pk":
            continue
        info = cur.execute(f"PRAGMA index_info({iname})").fetchall()  # seqno, cid, name
        idx_cols = [r[2] for r in info]
        indexed_cols.update(idx_cols)
        kind = "UNIQUE INDEX" if unique else "INDEX"
        cols_sql = ", ".join(esc_ident(c) for c in idx_cols)
        table_index_stmts.append(f"CREATE {kind} {esc_ident(iname)} ON {esc_ident(t)} ({cols_sql});")
    index_stmts.extend(table_index_stmts)

    col_defs = []
    notes = []
    for cid, name, ctype, notnull, dflt, pk in cols:
        is_indexed = name in indexed_cols or name in pk_cols
        myt = sqlite_type_to_mysql(ctype, is_indexed)
        parts = [esc_ident(name), myt]
        if pk and single_int_autopk:
            parts.append("PRIMARY KEY AUTO_INCREMENT")
            notes.append(f"{name}: INTEGER PRIMARY KEY AUTOINCREMENT -> BIGINT PRIMARY KEY AUTO_INCREMENT")
        else:
            if pk:
                parts.append("PRIMARY KEY")
            if notnull:
                parts.append("NOT NULL")
            if dflt is not None:
                d = dflt.strip()
                if re.match(r"^-?\d+(\.\d+)?$", d) or d.startswith("'"):
                    parts.append(f"DEFAULT {d}")
        col_defs.append("  " + " ".join(parts))
        note_type = (ctype or "").upper()
        if note_type != myt:
            notes.append(f"{name}: {note_type or '(untyped)'} -> {myt}" + (" (indexed, capped 255)" if is_indexed and myt == "VARCHAR(255)" else ""))

    if len(pk_cols) > 1:
        col_defs.append("  PRIMARY KEY (" + ", ".join(esc_ident(c) for c in pk_cols) + ")")

    table_notes[t] = notes
    out.append(f"DROP TABLE IF EXISTS {esc_ident(t)};")
    out.append(f"CREATE TABLE {esc_ident(t)} (\n" + ",\n".join(col_defs) + "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;")

out.extend(index_stmts)

for t in tables:
    cols = cur.execute(f"PRAGMA table_info({t})").fetchall()
    colnames = [c[1] for c in cols]
    rows = cur.execute(f"SELECT {', '.join(esc_ident(c) for c in colnames)} FROM {esc_ident(t)}").fetchall()
    if not rows:
        continue
    col_list = ", ".join(esc_ident(c) for c in colnames)
    batch = []
    for i, row in enumerate(rows):
        vals = []
        for v in row:
            if v is None:
                vals.append("NULL")
            elif isinstance(v, (int, float)):
                vals.append(str(v))
            else:
                vals.append(esc_str(str(v)))
        batch.append("(" + ", ".join(vals) + ")")
        if len(batch) >= 500 or i == len(rows) - 1:
            out.append(f"INSERT INTO {esc_ident(t)} ({col_list}) VALUES\n" + ",\n".join(batch) + ";")
            batch = []

out.append("SET FOREIGN_KEY_CHECKS=1;")

with open(OUT, "w") as f:
    f.write("\n".join(out))

print("Tables:", tables)
print()
print("Type translations applied (SQLite -> MySQL):")
for t, notes in table_notes.items():
    if notes:
        print(f"  {t}:")
        for n in notes:
            print(f"    - {n}")

print()
print("Source row counts (from sqlite):")
for t in tables:
    n = cur.execute(f"SELECT COUNT(*) FROM {esc_ident(t)}").fetchone()[0]
    print(f"  {t}: {n}")
