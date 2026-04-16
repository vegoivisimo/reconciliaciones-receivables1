"""
matching.py - Motor de reconciliacion SANTIX vs LOANIQ

Algoritmo verificado sobre datos reales:
  1) MATCH_EXACT            : alias coincide + debtor_gate OK + sum_paid <= OA + tol
  2) REVIEW_OVERFLOW        : alias coincide + debtor_gate OK + sum_paid > OA + tol
  3) REVIEW_DEBTOR_MISMATCH : alias coincide pero ningun tramo pasa debtor_gate
  4) MATCH_CROSS_PREFIX     : sin alias, unico tramo con debtor_gate OK y OA==paid
  5) SUGGESTED              : sin alias, multiples candidatos cross-prefix
  6) NO_MATCH               : sin alias, sin candidatos cross-prefix
  7) LEARNED_MATCH          : BD devuelve alias aprendido (revalidado)
  8) MANUAL_OVERRIDE        : override manual del operador (gestionado aguas arriba)
"""

import pandas as pd
from typing import Optional

try:
    from rapidfuzz import fuzz as _rfuzz
    _RAPIDFUZZ = True
except ImportError:
    _RAPIDFUZZ = False

try:
    from database import get_alias_match as _get_alias_match
    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False


# ------------------------------------------------------------------ #
# Constantes del algoritmo
# ------------------------------------------------------------------ #
DEBTOR_FUZZY_GATE = 80      # gate booleano con token_set_ratio
OA_PAID_TOL_EUR = 0.02      # tolerancia absoluta en euros

TIER_MATCH_EXACT = "MATCH_EXACT"
TIER_MATCH_CROSS_PREFIX = "MATCH_CROSS_PREFIX"
TIER_REVIEW_OVERFLOW = "REVIEW_OVERFLOW"
TIER_REVIEW_DEBTOR_MISMATCH = "REVIEW_DEBTOR_MISMATCH"
TIER_SUGGESTED = "SUGGESTED"
TIER_NO_MATCH = "NO_MATCH"
TIER_LEARNED_MATCH = "LEARNED_MATCH"
TIER_MANUAL_OVERRIDE = "MANUAL_OVERRIDE"

_APPLY_CA_TIERS = {
    TIER_MATCH_EXACT,
    TIER_MATCH_CROSS_PREFIX,
    TIER_LEARNED_MATCH,
    TIER_MANUAL_OVERRIDE,
}


# ------------------------------------------------------------------ #
# Helpers basicos
# ------------------------------------------------------------------ #
def _safe_str(x) -> str:
    if x is None:
        return ""
    try:
        if isinstance(x, float) and pd.isna(x):
            return ""
    except Exception:
        pass
    return str(x).strip()


def _safe_float(x) -> float:
    try:
        if x is None:
            return 0.0
        if isinstance(x, str):
            x = x.replace(",", "").strip()
            if not x:
                return 0.0
        v = float(x)
        if pd.isna(v):
            return 0.0
        return v
    except Exception:
        return 0.0


def _extract_debtor_abbrev(facility: str) -> str:
    """
    Extrae el deudor del campo Facility/Borrower de LOANIQ.
    Formato esperado: "SELLER / PREFIX-DEBTOR"
      - split por '/', coger parte derecha
      - split por primer '-', coger parte derecha
      - Si no hay '/' o '-', devolver el input completo
    """
    s = _safe_str(facility)
    if not s:
        return ""
    if "/" not in s:
        return s
    right = s.split("/", 1)[1].strip()
    if "-" not in right:
        return right
    return right.split("-", 1)[1].strip()


def _debtor_matches(a: str, b: str) -> bool:
    """Gate booleano de deudor. Falla segura si no hay rapidfuzz."""
    if not _RAPIDFUZZ:
        return False
    a_s = _safe_str(a)
    b_s = _safe_str(b)
    if not a_s or not b_s:
        return False
    try:
        score = _rfuzz.token_set_ratio(a_s, b_s)
    except Exception:
        return False
    return score >= DEBTOR_FUZZY_GATE


def _row_to_match(row) -> dict:
    """Convierte una fila del DataFrame LOANIQ a dict limpio."""
    def g(key):
        try:
            return row[key]
        except Exception:
            return None

    return {
        "alias": _safe_str(g("Alias")),
        "facility": _safe_str(g("Facility/Borrower")),
        "pricing_option": _safe_str(g("Pricing Option")),
        "status": _safe_str(g("Status")),
        "ccy": _safe_str(g("CCY")),
        "current_amount": _safe_float(g("Current Amount")),
        "original_amount": _safe_float(g("Original Amount")),
        "host_bank_gross": _safe_float(g("Host Bank Gross")),
        "host_bank_net": _safe_float(g("Host Bank Net")),
        "effective_date": _safe_str(g("Effective Date")),
        "maturity_date": _safe_str(g("Maturity Date")),
    }


def _pick_same_alias(tramos_debtor_ok: list, sum_paid: float) -> tuple:
    """
    Entre varios tramos con mismo alias + debtor OK:
      - preferir el de menor OA que sea >= sum_paid
      - si ninguno alcanza, el de mayor OA (referencia mas cercana para overflow)
    Devuelve (idx, match_dict).
    """
    ge = [
        (i, m) for (i, m) in tramos_debtor_ok
        if m["original_amount"] + OA_PAID_TOL_EUR >= sum_paid
    ]
    if ge:
        return min(ge, key=lambda t: t[1]["original_amount"])
    return max(tramos_debtor_ok, key=lambda t: t[1]["original_amount"])


def _find_cross_prefix_candidates(
    loaniq_rows: list, debtor_santix: str, sum_paid: float
) -> list:
    """
    Candidatos cross-prefix: debtor_gate OK y |OA - sum_paid| <= tol.
    Devuelve lista de (idx, match_dict).
    """
    out = []
    for idx, m in loaniq_rows:
        if not _debtor_matches(debtor_santix, _extract_debtor_abbrev(m["facility"])):
            continue
        if abs(m["original_amount"] - sum_paid) <= OA_PAID_TOL_EUR:
            out.append((idx, m))
    return out


def _delta_pct(sum_paid: float, new_ca: Optional[float]) -> float:
    if new_ca is None:
        return 0.0
    base = new_ca if abs(new_ca) > 1e-9 else sum_paid
    if abs(base) < 1e-9:
        return 0.0
    return (sum_paid - new_ca) / base * 100.0


# ------------------------------------------------------------------ #
# Learned match (BD)
# ------------------------------------------------------------------ #
def _try_learned_match(group: dict, by_alias: dict) -> Optional[tuple]:
    """
    Consulta BD por resolucion previa. Si existe y revalida
    (debtor_gate + sum_paid <= OA), devuelve (idx, match_dict).
    Si la revalidacion falla, devuelve None (flujo normal).
    """
    if not _DB_AVAILABLE:
        return None
    try:
        learned = _get_alias_match(group.get("group_key"))
    except Exception:
        return None
    if not learned:
        return None

    alias = learned.get("alias") if isinstance(learned, dict) else learned
    alias = _safe_str(alias)
    if not alias:
        return None

    tramos = by_alias.get(alias, [])
    if not tramos:
        return None

    debtor_santix = group.get("debtor", "")
    sum_paid = _safe_float(group.get("sum_paid_eur"))

    valid = []
    for idx, m in tramos:
        if not _debtor_matches(debtor_santix, _extract_debtor_abbrev(m["facility"])):
            continue
        if sum_paid > m["original_amount"] + OA_PAID_TOL_EUR:
            continue
        valid.append((idx, m))

    if not valid:
        return None

    return min(valid, key=lambda t: t[1]["original_amount"])


# ------------------------------------------------------------------ #
# Resolucion de un grupo
# ------------------------------------------------------------------ #
def _resolve_group(group: dict, by_alias: dict, all_loaniq: list) -> dict:
    group_key = _safe_str(group.get("group_key"))
    debtor_santix = _safe_str(group.get("debtor"))
    sum_paid = _safe_float(group.get("sum_paid_eur"))

    result = {
        "group_key": group_key,
        "facility_prefix": _safe_str(group.get("facility_prefix")),
        "tier": TIER_NO_MATCH,
        "reason": "",
        "delta_eur": sum_paid,
        "delta_pct": 0.0,
        "santix": dict(group),
        "loaniq": None,
        "candidates": [],
        "new_current_amount": None,
        "_loaniq_idx": None,
    }

    # 0) LEARNED MATCH
    learned = _try_learned_match(group, by_alias)
    if learned is not None:
        idx, m = learned
        new_ca = sum_paid
        result.update({
            "tier": TIER_LEARNED_MATCH,
            "reason": f"Aprendido BD: alias {m['alias']} revalidado",
            "loaniq": m,
            "new_current_amount": new_ca,
            "delta_eur": sum_paid - new_ca,
            "delta_pct": _delta_pct(sum_paid, new_ca),
            "_loaniq_idx": idx,
        })
        return result

    # 1) ALIAS == LIQ_ID_DISPO
    tramos_alias = by_alias.get(group_key, [])
    if tramos_alias:
        debtor_ok = [
            (idx, m) for idx, m in tramos_alias
            if _debtor_matches(debtor_santix, _extract_debtor_abbrev(m["facility"]))
        ]
        if debtor_ok:
            pick_idx, pick = _pick_same_alias(debtor_ok, sum_paid)
            if sum_paid <= pick["original_amount"] + OA_PAID_TOL_EUR:
                new_ca = sum_paid
                result.update({
                    "tier": TIER_MATCH_EXACT,
                    "reason": "Alias coincide, deudor OK, sum_paid <= OA",
                    "loaniq": pick,
                    "new_current_amount": new_ca,
                    "delta_eur": sum_paid - new_ca,
                    "delta_pct": _delta_pct(sum_paid, new_ca),
                    "_loaniq_idx": pick_idx,
                })
                return result
            result.update({
                "tier": TIER_REVIEW_OVERFLOW,
                "reason": (
                    f"Alias coincide, deudor OK, pero sum_paid "
                    f"({sum_paid:.2f}) > OA ({pick['original_amount']:.2f})"
                ),
                "loaniq": pick,
                "new_current_amount": None,
                "delta_eur": sum_paid - pick["original_amount"],
                "delta_pct": _delta_pct(sum_paid, pick["original_amount"]),
                "_loaniq_idx": pick_idx,
            })
            return result

        # Alias existe pero ningun tramo pasa debtor_gate -> intentar cross-prefix
        cross = _find_cross_prefix_candidates(all_loaniq, debtor_santix, sum_paid)
        if len(cross) == 1:
            idx, m = cross[0]
            new_ca = sum_paid
            result.update({
                "tier": TIER_MATCH_CROSS_PREFIX,
                "reason": "Alias no paso debtor_gate; unico tramo cross-prefix casa OA",
                "loaniq": m,
                "new_current_amount": new_ca,
                "delta_eur": sum_paid - new_ca,
                "delta_pct": _delta_pct(sum_paid, new_ca),
                "_loaniq_idx": idx,
            })
            return result
        if len(cross) > 1:
            result.update({
                "tier": TIER_SUGGESTED,
                "reason": f"{len(cross)} candidatos cross-prefix ambiguos",
                "candidates": [m for _, m in cross],
            })
            return result

        # Alias existe, debtor fallo, sin cross -> REVIEW_DEBTOR_MISMATCH
        ref_idx, ref_m = tramos_alias[0]
        result.update({
            "tier": TIER_REVIEW_DEBTOR_MISMATCH,
            "reason": "Alias coincide pero ningun tramo pasa debtor_gate",
            "loaniq": ref_m,
            "_loaniq_idx": ref_idx,
        })
        return result

    # 2) SIN ALIAS: CROSS-PREFIX
    cross = _find_cross_prefix_candidates(all_loaniq, debtor_santix, sum_paid)
    if len(cross) == 1:
        idx, m = cross[0]
        new_ca = sum_paid
        result.update({
            "tier": TIER_MATCH_CROSS_PREFIX,
            "reason": "Sin alias; unico tramo con debtor OK y OA==paid",
            "loaniq": m,
            "new_current_amount": new_ca,
            "delta_eur": sum_paid - new_ca,
            "delta_pct": _delta_pct(sum_paid, new_ca),
            "_loaniq_idx": idx,
        })
        return result
    if len(cross) > 1:
        result.update({
            "tier": TIER_SUGGESTED,
            "reason": f"{len(cross)} candidatos cross-prefix ambiguos",
            "candidates": [m for _, m in cross],
        })
        return result

    # 3) NO MATCH
    result.update({
        "tier": TIER_NO_MATCH,
        "reason": "Sin alias y sin candidatos cross-prefix",
    })
    return result


# ------------------------------------------------------------------ #
# Entrypoint publico
# ------------------------------------------------------------------ #
def reconcile_all(
    groups: list,
    loaniq_df: pd.DataFrame,
    santix_invoice_count: Optional[int] = None,
) -> dict:
    """
    Reconcilia grupos SANTIX contra tramos LOANIQ.
    Devuelve dict con summary, groups, loaniq_updated.
    """
    if loaniq_df is None:
        loaniq_df = pd.DataFrame()

    # Normalizar LOANIQ a lista (idx, match_dict) + copia editable
    loaniq_rows: list = []
    loaniq_updated: list = []
    df_reset = loaniq_df.reset_index(drop=True) if len(loaniq_df) else loaniq_df
    for idx, row in df_reset.iterrows():
        m = _row_to_match(row)
        loaniq_rows.append((idx, m))
        row_dict = row.to_dict() if hasattr(row, "to_dict") else dict(row)
        row_dict["_tier"] = "UNMATCHED"
        loaniq_updated.append(row_dict)

    # Indice por alias para evitar escaneos repetidos
    by_alias: dict = {}
    for idx, m in loaniq_rows:
        alias = m["alias"]
        if not alias:
            continue
        by_alias.setdefault(alias, []).append((idx, m))

    # Resolver cada grupo
    resolved: list = []
    for g in groups or []:
        resolved.append(_resolve_group(g, by_alias, loaniq_rows))

    # Aplicar actualizaciones sobre loaniq_updated
    for res in resolved:
        idx = res.get("_loaniq_idx")
        tier = res.get("tier")
        if idx is None or idx >= len(loaniq_updated):
            continue
        if tier in _APPLY_CA_TIERS and res.get("new_current_amount") is not None:
            loaniq_updated[idx]["Current Amount"] = res["new_current_amount"]
            loaniq_updated[idx]["_tier"] = tier
        elif tier in (TIER_REVIEW_OVERFLOW, TIER_REVIEW_DEBTOR_MISMATCH):
            if loaniq_updated[idx].get("_tier") == "UNMATCHED":
                loaniq_updated[idx]["_tier"] = tier

    # Summary
    counts = {
        TIER_MATCH_EXACT: 0,
        TIER_MATCH_CROSS_PREFIX: 0,
        TIER_REVIEW_OVERFLOW: 0,
        TIER_REVIEW_DEBTOR_MISMATCH: 0,
        TIER_SUGGESTED: 0,
        TIER_NO_MATCH: 0,
        TIER_LEARNED_MATCH: 0,
        TIER_MANUAL_OVERRIDE: 0,
    }
    total_santix_eur = 0.0
    for r in resolved:
        counts[r["tier"]] = counts.get(r["tier"], 0) + 1
        total_santix_eur += _safe_float(r["santix"].get("sum_paid_eur"))

    total_loaniq_eur = 0.0
    for _, m in loaniq_rows:
        total_loaniq_eur += m["current_amount"]

    n_groups = len(resolved)
    stp_numer = (
        counts[TIER_MATCH_EXACT]
        + counts[TIER_MATCH_CROSS_PREFIX]
        + counts[TIER_LEARNED_MATCH]
    )
    stp_rate = (stp_numer / n_groups) * 100.0 if n_groups else 0.0

    invoices_total = (
        santix_invoice_count
        if santix_invoice_count is not None
        else sum(int(r["santix"].get("invoice_count") or 0) for r in resolved)
    )

    summary = {
        "santix_invoices": invoices_total,
        "santix_groups": n_groups,
        "loaniq_rows": len(loaniq_rows),
        "match_exact": counts[TIER_MATCH_EXACT],
        "match_cross_prefix": counts[TIER_MATCH_CROSS_PREFIX],
        "review_overflow": counts[TIER_REVIEW_OVERFLOW],
        "review_debtor_mismatch": counts[TIER_REVIEW_DEBTOR_MISMATCH],
        "suggested": counts[TIER_SUGGESTED],
        "no_match": counts[TIER_NO_MATCH],
        "learned_match": counts[TIER_LEARNED_MATCH],
        "manual_override": counts[TIER_MANUAL_OVERRIDE],
        "total_santix_eur": round(total_santix_eur, 2),
        "total_loaniq_eur": round(total_loaniq_eur, 2),
        "stp_rate_pct": round(stp_rate, 2),
    }

    # Limpiar campos internos
    for r in resolved:
        r.pop("_loaniq_idx", None)

    return {
        "summary": summary,
        "groups": resolved,
        "loaniq_updated": loaniq_updated,
    }
