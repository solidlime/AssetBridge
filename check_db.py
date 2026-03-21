import sqlite3

db_path = 'dataassetbridge_v2.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# List all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print("Tables:")
for table in tables:
    print(f"  - {table[0]}")
    
# Check portfolio_snapshots table if exists
try:
    cursor.execute("SELECT COUNT(*) FROM portfolio_snapshots")
    count = cursor.fetchone()[0]
    
    cursor.execute('''
        SELECT COUNT(*) as total,
               SUM(CASE WHEN current_price_jpy IS NOT NULL THEN 1 ELSE 0 END) as with_price
        FROM portfolio_snapshots
    ''')
    result = cursor.fetchone()
    print(f"\nPortfolio snapshots: {result[0]} total, {result[1]} with currentPriceJpy")
    
    # Show sample
    cursor.execute('''
        SELECT asset_id, date, price_jpy, current_price_jpy
        FROM portfolio_snapshots
        ORDER BY date DESC
        LIMIT 3
    ''')
    
    print("\nSample rows:")
    for row in cursor.fetchall():
        print(f"  Asset {row[0]}, {row[1]}: price={row[2]}, current_price={row[3]}")
except Exception as e:
    print(f"Error checking portfolio_snapshots: {e}")

conn.close()
