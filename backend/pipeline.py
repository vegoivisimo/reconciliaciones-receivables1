import pandas as pd
from io import BytesIO
from datetime import datetime
from typing import Optional

SANTIX_KEY = "LIQ ID DISPO"


def _parse_date(val) -> Optional[str]:
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
    except:
        pass
    if isinstance(val, str):
        val = val.strip()
        # Excel numeric serial dates (e.g. "44834.0" or "44834")
        try:
            serial = float(val)
            if 20000 < serial < 60000:  # ~1954–2064, rango razonable para facturas
                from datetime import timedelta
                return (datetime(1899, 12, 30) + timedelta(days=int(serial))).strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            pass
        for fmt in ["%d.%m.%Y", "%Y-%m-%d", "%d-%b-%Y", "%d/%m/%Y", "%Y%m%d"]:
            try:
                return datetime.strptime(val, fmt).strftime("%Y-%m-%d")
            except:
                pass
        return val
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    if hasattr(val, 'date'):
        return val.date().isoformat()
    return str(val)


def _safe_float(val, default=0.0) -> float:
    try:
        if pd.isna(val):
            return default
    except:
        pass
    try:
        if isinstance(val, str):
            val = val.replace(",", ".").strip()
        return float(val)
    except:
        return default


def _safe_int(val, default=0) -> int:
    try:
        if pd.isna(val):
            return default
    except:
        pass
    try:
        return int(float(val))
    except:
        return default


def load_santix(file: BytesIO) -> pd.DataFrame:
    df = pd.read_excel(file, sheet_name=0, dtype=str)
    df.columns = df.columns.str.strip()
    numeric_cols = [
        "PAID AMOUNT EUR", "100% AMOUNT EUR", "ELEGIBLE AMOUNT EUR",
        "OUTSTANDING EUR", "PURCHASE PRICE", "DAYS OF PAYMENT DELAY",
        "DAYS OVERDUE FROM RECONCILIATION DATE", "INVOICE AMOUNT"
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col].str.replace(",", ".", regex=False), errors="coerce").fillna(0.0)
    return df


def load_loaniq(file: BytesIO) -> pd.DataFrame:
    df = pd.read_excel(file, sheet_name=0)
    df.columns = df.columns.str.strip()
    amount_cols = ["Current Amount", "Original Amount", "Host Bank Gross", "Host Bank Net"]
    for col in amount_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    date_cols = ["Effective Date", "Repricing Date", "Actual Expiry", "Maturity Date", "Adjusted Expiry"]
    for col in date_cols:
        if col in df.columns:
            df[col] = df[col].apply(_parse_date)
    if "Alias" in df.columns:
        df["Alias"] = df["Alias"].astype(str).str.strip()
    return df


def build_groups(df: pd.DataFrame) -> list:
    if SANTIX_KEY not in df.columns:
        raise ValueError(f"Column '{SANTIX_KEY}' not found. Available: {list(df.columns)[:20]}")
    groups = []
    for liq_id, grp in df.groupby(SANTIX_KEY):
        invoices = []
        for _, row in grp.iterrows():
            invoices.append({
                "invoice_number": str(row.get("INVOICE NUMBER", "") or ""),
                "debtor": str(row.get("DEBTOR", "") or ""),
                "due_date": _parse_date(row.get("DUE DATE")),
                "paid_eur": _safe_float(row.get("PAID AMOUNT EUR")),
                "purchase_price": _safe_float(row.get("PURCHASE PRICE")),
                "outstanding_eur": _safe_float(row.get("OUTSTANDING EUR")),
                "days_overdue": _safe_int(row.get("DAYS OF PAYMENT DELAY")),
            })
        liq_id_str = str(liq_id)
        groups.append({
            "group_key": liq_id_str,
            "facility_prefix": liq_id_str.split("-")[0] if "-" in liq_id_str else liq_id_str,
            "seller": str(grp["SELLER"].iloc[0]) if "SELLER" in grp.columns else "",
            "glcs_code": str(grp["GLCS CODE"].iloc[0]) if "GLCS CODE" in grp.columns else "",
            "debtor": str(grp["DEBTOR"].iloc[0]) if "DEBTOR" in grp.columns else "",
            "currency": str(grp["CCY"].iloc[0]) if "CCY" in grp.columns else "EUR",
            "invoice_count": len(grp),
            "sum_paid_eur": float(grp["PAID AMOUNT EUR"].sum()) if "PAID AMOUNT EUR" in grp.columns else 0.0,
            "sum_purchase_price": float(grp["PURCHASE PRICE"].sum()) if "PURCHASE PRICE" in grp.columns else 0.0,
            "sum_outstanding_eur": float(grp["OUTSTANDING EUR"].sum()) if "OUTSTANDING EUR" in grp.columns else 0.0,
            "min_purchase_date": _parse_date(grp["PURCHASE DATE"].min()) if "PURCHASE DATE" in grp.columns else None,
            "reconciliation_date": _parse_date(grp["RECONCILIATION DATE"].iloc[0]) if "RECONCILIATION DATE" in grp.columns else None,
            "invoices": invoices,
        })
    return groups
