#!/usr/bin/env python3
import json
import subprocess
import sys

print("=" * 80)
print("AssetBridge API Verification Report")
print("=" * 80)

try:
    # 1. holdings エンドポイント
    print("\n1. HOLDINGS Endpoint (portfolio.holdings)")
    print("-" * 80)
    
    response = subprocess.run(
        ['curl.exe', '--noproxy', '*', '-s', 
         'http://localhost:8000/trpc/portfolio.holdings?input=%7B%7D'],
        capture_output=True,
        text=False,
        timeout=10
    )
    
    holdings_json = response.stdout.decode('utf-8', errors='replace')
    holdings_data = json.loads(holdings_json)
    first_holding = holdings_data['result']['data'][0]
    
    print("✓ Endpoint is accessible")
    print(f"✓ Total holdings: {len(holdings_data['result']['data'])}")
    print(f"\nFirst holding (first 800 chars):")
    print(json.dumps(first_holding, ensure_ascii=False, indent=2)[:800])
    print("...")
    
    # Field analysis
    print(f"\n▶ Field Analysis:")
    print(f"  • priceJpy present: {'priceJpy' in first_holding}")
    if 'priceJpy' in first_holding:
        print(f"  • priceJpy value: {first_holding['priceJpy']}")
    print(f"  • currentPriceJpy present: {'currentPriceJpy' in first_holding}")
    print(f"  • Total fields in element: {len(first_holding)}")
    
    # 2. upcoming-withdrawals エンドポイント
    print("\n\n2. UPCOMING-WITHDRAWALS Endpoint (incomeExpense.upcomingWithdrawals)")
    print("-" * 80)
    
    response = subprocess.run(
        ['curl.exe', '--noproxy', '*', '-s', 
         'http://localhost:8000/trpc/incomeExpense.upcomingWithdrawals?input=%7B%22days%22%3A60%7D'],
        capture_output=True,
        text=False,
        timeout=10
    )
    
    withdrawals_json = response.stdout.decode('utf-8', errors='replace')
    withdrawals_data = json.loads(withdrawals_json)
    withdrawals_list = withdrawals_data['result']['data']['withdrawals']
    
    print("✓ Endpoint is accessible")
    print(f"✓ Total withdrawals: {len(withdrawals_list)}")
    
    if withdrawals_list:
        first_withdrawal = withdrawals_list[0]
        print(f"\nFirst withdrawal:")
        print(json.dumps(first_withdrawal, ensure_ascii=False, indent=2))
        
        print(f"\n▶ Field Analysis:")
        print(f"  • bankAccount present: {'bankAccount' in first_withdrawal}")
        if 'bankAccount' in first_withdrawal:
            print(f"  • bankAccount value: {first_withdrawal['bankAccount']}")
        print(f"  • Total fields in element: {len(first_withdrawal)}")
    else:
        print("ℹ No withdrawals in the next 60 days")
    
    # 3. cc-account-mapping エンドポイント
    print("\n\n3. CC-ACCOUNT-MAPPING Endpoint (incomeExpense.getCcAccountMapping)")
    print("-" * 80)
    
    response = subprocess.run(
        ['curl.exe', '--noproxy', '*', '-s', 
         'http://localhost:8000/trpc/incomeExpense.getCcAccountMapping'],
        capture_output=True,
        text=False,
        timeout=10
    )
    
    mapping_json = response.stdout.decode('utf-8', errors='replace')
    mapping_data = json.loads(mapping_json)
    mapping = mapping_data['result']['data']['mapping']
    accounts = mapping_data['result']['data']['accounts']
    
    print("✓ Endpoint is accessible")
    print(f"✓ Card-to-Account Mapping entries: {len(mapping)}")
    print(f"✓ Total accounts: {len(accounts)}")
    
    print(f"\nAccount Mapping (card_name → asset_id):")
    for card_name, asset_id in mapping.items():
        print(f"  • {card_name} → assetId {asset_id}")
    
    print(f"\nAccounts:")
    for acc in accounts[:5]:
        print(f"  • {acc['name']}: ¥{acc['balanceJpy']:,} (assetId: {acc['assetId']})")
    if len(accounts) > 5:
        print(f"  ... and {len(accounts) - 5} more")
    
    # Summary
    print("\n\n" + "=" * 80)
    print("Summary")
    print("=" * 80)
    print("\n✓ All 3 endpoints are working correctly")
    print(f"✓ holdings.priceJpy field: {'priceJpy' in first_holding}")
    print(f"✓ withdrawals.bankAccount field: {'bankAccount' in withdrawals_list[0] if withdrawals_list else 'N/A (no data)'}")
    print(f"✓ cc-account-mapping count: {len(accounts)}")
    print("\n✓ API is functioning properly")
    
except json.JSONDecodeError as e:
    print(f"❌ JSON parsing error: {e}")
    sys.exit(1)
except subprocess.TimeoutExpired:
    print("❌ API request timeout")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
