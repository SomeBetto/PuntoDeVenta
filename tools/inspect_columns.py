import sys
import os

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import fdb

fb_client = r"C:\Program Files (x86)\AbarrotesPDV\fbclient.dll"
fdb.load_api(fb_client)

db_path = os.path.abspath(r"data\temp_eleventa.fdb")
con = fdb.connect(dsn=db_path, user='SYSDBA', password='masterkey', charset='NONE')
cur = con.cursor()

def describe_table(t):
    print(f"\n=================== TABLE: {t} ===================")
    cur.execute(f"SELECT * FROM {t}")
    col_names = [d[0] for d in cur.description]
    print("Columns:", col_names)
    cur.execute(f"SELECT FIRST 3 * FROM {t}")
    for row in cur.fetchall():
        # Print clean dict
        row_dict = {col: (val.decode('latin1', errors='replace') if isinstance(val, bytes) else str(val)) for col, val in zip(col_names, row)}
        print("Sample row:", row_dict)

for table in ["PRODUCTOS", "DEPARTAMENTOS", "CLIENTESV2", "CLIENTESV2_CREDITO", "VENTATICKETS", "VENTATICKETS_ARTICULOS", "TURNOS"]:
    try:
        describe_table(table)
    except Exception as e:
        print(f"Error describing {table}: {e}")

con.close()
