#!/usr/bin/env python3
import json
import sys

print("=" * 80)
print("API レスポンス分析")
print("=" * 80)

# 1. holdings レスポンス
print("\n1. HOLDINGS エンドポイント")
print("-" * 80)
with open('api_response.json', 'r', encoding='utf-8') as f:
    holdings_data = json.load(f)

first_holding = holdings_data['result']['data'][0]
print(f"最初の要素（最初の1000文字）:")
print(json.dumps(first_holding, ensure_ascii=False, indent=2)[:1000])
print("...")

print(f"\n✓ priceJpy 存在: {'priceJpy' in first_holding} (値: {first_holding.get('priceJpy')})")
print(f"✓ currentPriceJpy 存在: {'currentPriceJpy' in first_holding}")
print(f"✓ 全フィールド数: {len(first_holding)}")
print(f"✓ データ件数: {len(holdings_data['result']['data'])}")

# 2. upcoming-withdrawals レスポンス
print("\n\n2. UPCOMING-WITHDRAWALS エンドポイント")
print("-" * 80)

# curl で取得
import subprocess
response = subprocess.run(
    ['curl.exe', '--noproxy', '*', '-s', 
     'http://localhost:8000/trpc/incomeExpense.upcomingWithdrawals?input=%7B%22days%22%3A60%7D'],
    capture_output=True,
    text=True
)
withdrawals_data = json.loads(response.stdout)
first_withdrawal = withdrawals_data['result']['data']['withdrawals'][0] if withdrawals_data['result']['data']['withdrawals'] else None

if first_withdrawal:
    print(f"最初の要素:")
    print(json.dumps(first_withdrawal, ensure_ascii=False, indent=2))
    print(f"\n✓ bankAccount 存在: {'bankAccount' in first_withdrawal}")
    print(f"✓ bankAccount 値: {first_withdrawal.get('bankAccount')}")
else:
    print("No withdrawals data")

# 3. cc-account-mapping レスポンス
print("\n\n3. CC-ACCOUNT-MAPPING エンドポイント")
print("-" * 80)

response = subprocess.run(
    ['curl.exe', '--noproxy', '*', '-s', 
     'http://localhost:8000/trpc/incomeExpense.getCcAccountMapping'],
    capture_output=True,
    text=True
)
mapping_data = json.loads(response.stdout)
accounts = mapping_data['result']['data']['accounts']
print(f"アカウント件数: {len(accounts)}")
print(f"最初の3件:")
for acc in accounts[:3]:
    print(f"  - {acc['name']}: {acc['balanceJpy']} JPY (assetId: {acc['assetId']})")

print("\n" + "=" * 80)
print("分析完了")
print("=" * 80)
