"""
test_api.py – Standalone API integration test.
Discovers .xlsx files in ../databases/, sends them to /reconcile, and prints the result.
No hardcoded filenames.
"""
import sys
import pathlib
import requests

BASE_URL = "http://localhost:8000"
DB_DIR = pathlib.Path(__file__).parent.parent / "databases"

def find_xlsx_files():
    files = sorted(DB_DIR.glob("*.xlsx"))
    if len(files) < 2:
        print(f"ERROR: Need at least 2 .xlsx files in {DB_DIR}, found {len(files)}:")
        for f in files:
            print(f"  - {f.name}")
        sys.exit(1)
    return files[0], files[1]

def test_reconcile():
    sap_path, bank_path = find_xlsx_files()
    print(f"SAP file  : {sap_path.name}")
    print(f"Bank file : {bank_path.name}")
    print(f"Posting to: {BASE_URL}/reconcile\n")

    with open(sap_path, "rb") as sap_f, open(bank_path, "rb") as bank_f:
        response = requests.post(
            f"{BASE_URL}/reconcile",
            files={
                "sap_file":  ("sap.xlsx",  sap_f,  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                "bank_file": ("bank.xlsx", bank_f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            },
            data={
                "tolerance_days": "45",
                "amount_tolerance": "0",
                "amount_tolerance_pct": "0",
                "sap_date_field": "Data pagamento",
            },
            timeout=60,
        )

    print(f"HTTP status : {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        summary = data.get("summary", {})
        print("\n--- Summary ---")
        for k, v in summary.items():
            print(f"  {k:25s}: {v}")
        excel_b64 = data.get("excel_base64", "")
        print(f"\n  excel_base64 length : {len(excel_b64)} chars")
        matched_rows = len(data.get("data", {}).get("matched", []))
        unmatched_sap = len(data.get("data", {}).get("unmatched_sap", []))
        unmatched_bnk = len(data.get("data", {}).get("unmatched_bnk", []))
        ambiguous = len(data.get("data", {}).get("ambiguous_matches", []))
        print("\n--- Data rows ---")
        print(f"  matched       : {matched_rows}")
        print(f"  ambiguous     : {ambiguous}")
        print(f"  unmatched_sap : {unmatched_sap}")
        print(f"  unmatched_bnk : {unmatched_bnk}")
        print("\n[OK] API is working correctly.")
    else:
        print("\nResponse body:")
        print(response.text[:2000])
        print("\n[FAIL] API returned an error.")
        sys.exit(1)

if __name__ == "__main__":
    test_reconcile()
