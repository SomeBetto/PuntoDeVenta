import sys
import os

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import fdb

fb_client = r"C:\Program Files (x86)\AbarrotesPDV\fbclient.dll"
fdb.load_api(fb_client)

db_path = os.path.abspath(r"data\temp_eleventa.fdb")
print("Connecting to:", db_path)

con = fdb.connect(dsn=db_path, user='SYSDBA', password='masterkey', charset='NONE')
cur = con.cursor()

# Get user tables
cur.execute("SELECT RDB$RELATION_NAME FROM RDB$RELATIONS WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL")
tables = [row[0].strip() for row in cur.fetchall()]
print(f"\n--- Total User Tables: {len(tables)} ---")
for t in sorted(tables):
    try:
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        cnt = cur.fetchone()[0]
        print(f" - {t}: {cnt} rows")
    except Exception as e:
        print(f" - {t}: (error reading count: {e})")

con.close()
