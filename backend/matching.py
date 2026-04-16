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

# ── Constantes ────────────────────────────────────────────────────────────────
DEBTOR_FUZZY_GATE        = 70    # gate para alias exacto (70: LoanIQ trunca nombres)
CROSS_PREFIX_FUZZY_GATE  = 75    # gate más alto para cross-prefix (sin alias como ancla)
OA_PAID_TOL_EUR          = 0.02  # tolerancia absoluta en euros para match exacto


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_debtor_abbrev(facility: str) -> str:
    """Extrae el deudor de 'SELLER / PREFIX-DEBTOR'. Robusto ante formatos raros."""
    if not facility or not isinstance(facility, str):
        return ""
    parts = facility.split("/")
    right = parts[-1].strip() if len(parts) >= 2 else facility.strip()
    dash = right.find("-")
    return right[dash + 1:].strip() if dash != -1 else right


def _suffix_num(alias: str) -> int:
    """Extrae el sufijo numérico de un alias (ej: 'SAN00T6CU-27320' → 27320)."""
    if not alias or not isinstance(alias, str):
        return 0
    suffix = alias.split('-')[-1] if '-' in alias else alias
    digits = ''.join(c for c in suffix if c.isdigit())
    return int(digits) if digits else 0


def _debtor_matches(santix_debtor: str, loaniq_facility: str) -> bool:
    """Gate booleano: True si token_set_ratio >= DEBTOR_FUZZY_GATE."""
    if not _RAPIDFUZZ:
        return False
    if not santix_debtor or not loaniq_facility:
        return False
    loaniq_debtor = _extract_debtor_abbrev(loaniq_facility)
    if not loaniq_debtor:
        return False
    score = _rfuzz.token_set_ratio(santix_debtor.upper(), loaniq_debtor.upper())
    return score >= DEBTOR_FUZZY_GATE


def _row_to_match(row) -> dict:
    """Convierte fila DataFrame a dict limpio."""
    d = row.to_dict() if not isinstance(row, dict) else row

    def safe(val, default=None):
        try:
            if pd.isna(val):
                return default
        except (ValueError, TypeError):
            pass
        return val

    return {
        "alias":          str(d.get("Alias", "") or ""),
        "facility":       str(d.get("Facility/Borrower", "") or ""),
        "pricing_option": safe(d.get("Pricing Option")),
        "status":         safe(d.get("Status")),
        "ccy":            str(d.get("CCY", "EUR") or "EUR"),
        "current_amount": safe(d.get("Current Amount")),
        "original_amount": safe(d.get("Original Amount")),
        "host_bank_gross": safe(d.get("Host Bank Gross")),
        "effective_date":  str(d.get("Effective Date", "") or ""),
        "maturity_date":   str(d.get("Maturity Date", "") or ""),
    }


def _best_oa(match: dict) -> float:
    """Devuelve el mejor Original Amount disponible (fallback a host_bank_gross)."""
    for key in ("original_amount", "host_bank_gross"):
        val = match.get(key)
        if val is not None:
            try:
                f = float(val)
                if f > 0:
                    return f
            except (TypeError, ValueError):
                pass
    return 0.0


def _pick_same_alias(candidates: list[dict], sum_paid: float) -> dict:
    """
    Entre varios tramos con mismo alias y debtor OK, elige:
    - El de menor OA que sea >= sum_paid (caso MATCH_EXACT posible)
    - Si ninguno >= sum_paid, el de mayor OA (caso REVIEW_OVERFLOW con ref mas cercana)
    """
    viable = [c for c in candidates if _best_oa(c) >= sum_paid - OA_PAID_TOL_EUR]
    if viable:
        return min(viable, key=_best_oa)
    return max(candidates, key=_best_oa)


def _find_cross_prefix_candidates(
    santix_debtor: str,
    sum_paid: float,
    loaniq_df: pd.DataFrame,
    exclude_aliases: set,
    group_key: str = "",
    used_aliases: set = None,
    fuzzy_gate: int = None,
) -> list[dict]:
    """
    Busca tramos donde:
      - debtor fuzzy >= fuzzy_gate
      - sum_paid <= original_amount (no supera capacidad del tramo)
      - alias no esta en exclude_aliases ni en used_aliases
    Devuelve candidatos ordenados por (OA exacto, sufijo cercano).
    """
    if used_aliases is None:
        used_aliases = set()
    if fuzzy_gate is None:
        fuzzy_gate = CROSS_PREFIX_FUZZY_GATE
    candidates = []
    for _, row in loaniq_df.iterrows():
        alias = str(row.get("Alias", "") or "")
        if alias in exclude_aliases or alias in used_aliases or alias in ("", "nan"):
            continue
        facility = str(row.get("Facility/Borrower", "") or "")
        if not _RAPIDFUZZ or not santix_debtor or not facility:
            continue
        loaniq_debtor = _extract_debtor_abbrev(facility)
        if not loaniq_debtor:
            continue
        score = _rfuzz.token_set_ratio(santix_debtor.upper(), loaniq_debtor.upper())
        if score < fuzzy_gate:
            continue
        oa = 0.0
        for key in ("Original Amount", "Host Bank Gross"):
            try:
                v = float(row.get(key, 0) or 0)
                if v > 0:
                    oa = v
                    break
            except (TypeError, ValueError):
                pass
        if oa > 0 and sum_paid <= oa + OA_PAID_TOL_EUR:
            match = _row_to_match(row)
            match["_oa"] = oa
            candidates.append(match)
    # Ordenar con criterio doble del contable:
    #   1. OA exacto (|OA - paid| < 1€) siempre primero
    #   2. Proximidad de sufijo como desempate
    gk_num = _suffix_num(group_key)
    candidates.sort(key=lambda c: (
        0 if abs(c.get("_oa", 0) - sum_paid) < 1.0 else 1,  # exacto primero
        abs(_suffix_num(c.get("alias", "")) - gk_num),       # sufijo cercano
    ))
    return candidates


def _try_learned_match(
    group: dict,
    loaniq_df: pd.DataFrame,
    by_alias: dict,
) -> Optional[dict]:
    """
    Intenta aplicar un alias aprendido de la BD.
    Re-valida debtor gate Y sum_paid <= OA antes de aplicar.
    Devuelve el dict de resultado o None si no aplica/falla.
    """
    if not _DB_AVAILABLE:
        return None
    debtor = group.get("debtor", "")
    prefix = group.get("facility_prefix", "")
    learned_alias = _get_alias_match(debtor, prefix)
    if not learned_alias:
        return None

    tramos = by_alias.get(learned_alias, [])
    if not tramos:
        return None

    sum_paid = float(group.get("sum_paid_eur", 0))
    debtor_ok = [t for t in tramos if _debtor_matches(debtor, t["facility"])]
    if not debtor_ok:
        return None  # debtor gate falla — no propagar

    chosen = _pick_same_alias(debtor_ok, sum_paid)
    oa = _best_oa(chosen)

    if sum_paid > oa + OA_PAID_TOL_EUR:
        return None  # overflow — no propagar

    delta = round(sum_paid - oa, 2)
    delta_pct = round(abs(delta) / sum_paid * 100, 1) if sum_paid else 0.0
    return {
        **group,
        "tier": "LEARNED_MATCH",
        "reason": f"Alias aprendido de override previo: {learned_alias}.",
        "loaniq": chosen,
        "loaniq_matches": [chosen],
        "candidates": [],
        "new_current_amount": round(sum_paid, 2),
        "delta_eur": delta,
        "delta_pct": delta_pct,
    }


# ── Core: reconcile_group ─────────────────────────────────────────────────────

def _resolve_group(group: dict, loaniq_df: pd.DataFrame, by_alias: dict,
                   used_aliases: set = None) -> dict:
    if used_aliases is None:
        used_aliases = set()
    liq_id   = group["group_key"]
    debtor   = group.get("debtor", "")
    sum_paid = float(group.get("sum_paid_eur", 0))

    # 0. LEARNED_MATCH
    learned = _try_learned_match(group, loaniq_df, by_alias)
    if learned:
        return learned

    # 1. Buscar tramos con Alias == LIQ_ID_DISPO
    alias_tramos = by_alias.get(liq_id, [])

    if alias_tramos:
        debtor_ok = [t for t in alias_tramos if _debtor_matches(debtor, t["facility"])]

        if debtor_ok:
            chosen = _pick_same_alias(debtor_ok, sum_paid)
            oa = _best_oa(chosen)

            if sum_paid <= oa + OA_PAID_TOL_EUR:
                # Regla 1: MATCH_EXACT
                delta = round(sum_paid - oa, 2)
                delta_pct = round(abs(delta) / sum_paid * 100, 1) if sum_paid else 0.0
                return {
                    **group,
                    "tier": "MATCH_EXACT",
                    "reason": f"Alias exacto y deudor validado. OA={oa:,.2f} €",
                    "loaniq": chosen,
                    "loaniq_matches": [chosen],
                    "candidates": [],
                    "new_current_amount": round(sum_paid, 2),
                    "delta_eur": delta,
                    "delta_pct": delta_pct,
                }
            else:
                # Regla 2: REVIEW_OVERFLOW
                delta = round(sum_paid - oa, 2)
                delta_pct = round(abs(delta) / sum_paid * 100, 1) if sum_paid else 0.0
                return {
                    **group,
                    "tier": "REVIEW_OVERFLOW",
                    "reason": f"Alias exacto y deudor OK, pero sum_paid ({sum_paid:,.2f} €) supera OA ({oa:,.2f} €). Revisar.",
                    "loaniq": chosen,
                    "loaniq_matches": [chosen],
                    "candidates": [],
                    "new_current_amount": None,
                    "delta_eur": delta,
                    "delta_pct": delta_pct,
                }

        # Alias existe pero ningún tramo pasa el debtor gate (Regla 3)
        # Intentar cross-prefix antes de REVIEW_DEBTOR_MISMATCH
        # Usa gate bajo (70) porque ya tenemos el alias como ancla de confianza
        exclude = {t["alias"] for t in alias_tramos}
        cross = _find_cross_prefix_candidates(debtor, sum_paid, loaniq_df, exclude,
                                              group_key=liq_id, used_aliases=used_aliases,
                                              fuzzy_gate=DEBTOR_FUZZY_GATE)

        if cross:
            # Tomar el mejor candidato (menor delta OA-paid)
            best = cross[0]
            oa = _best_oa(best)
            delta = round(sum_paid - oa, 2)
            delta_pct = round(abs(delta) / sum_paid * 100, 1) if sum_paid else 0.0
            return {
                **group,
                "tier": "MATCH_CROSS_PREFIX",
                "reason": f"Alias con deudor no coincidente. Cross-prefix resuelto: {best['alias']}.",
                "loaniq": best,
                "loaniq_matches": [best],
                "candidates": cross[1:] if len(cross) > 1 else [],
                "new_current_amount": round(sum_paid, 2),
                "delta_eur": delta,
                "delta_pct": delta_pct,
            }

        return {
            **group,
            "tier": "REVIEW_DEBTOR_MISMATCH",
            "reason": f"Alias exacto encontrado pero el deudor del tramo no coincide con '{debtor}'. Revisar asignación.",
            "loaniq": alias_tramos[0],  # devolver el alias para que el operador lo vea
            "loaniq_matches": alias_tramos,
            "candidates": [],
            "new_current_amount": None,
            "delta_eur": round(sum_paid, 2),
            "delta_pct": 100.0,
        }

    # 2. Sin alias exacto: cross-prefix
    cross = _find_cross_prefix_candidates(debtor, sum_paid, loaniq_df, set(),
                                          group_key=liq_id, used_aliases=used_aliases)

    if cross:
        # Tomar el mejor candidato (menor delta OA-paid, ya ordenados)
        best = cross[0]
        oa = _best_oa(best)
        delta = round(sum_paid - oa, 2)
        delta_pct = round(abs(delta) / sum_paid * 100, 1) if sum_paid else 0.0
        return {
            **group,
            "tier": "MATCH_CROSS_PREFIX",
            "reason": f"Sin alias exacto. Cross-prefix resuelto por deudor + paid<=OA: {best['alias']}.",
            "loaniq": best,
            "loaniq_matches": [best],
            "candidates": cross[1:] if len(cross) > 1 else [],
            "new_current_amount": round(sum_paid, 2),
            "delta_eur": delta,
            "delta_pct": delta_pct,
        }

    return {
        **group,
        "tier": "NO_MATCH",
        "reason": "Sin alias exacto ni candidatos cross-prefix con deudor y OA coincidentes.",
        "loaniq": None,
        "loaniq_matches": [],
        "candidates": [],
        "new_current_amount": None,
        "delta_eur": round(sum_paid, 2),
        "delta_pct": 100.0,
    }


# ── Orquestador ───────────────────────────────────────────────────────────────

def reconcile_all(groups: list, loaniq_df: pd.DataFrame) -> dict:
    # Índice por alias para O(1) lookup
    by_alias: dict[str, list[dict]] = {}
    for _, row in loaniq_df.iterrows():
        alias = str(row.get("Alias", "") or "")
        if alias and alias != "nan":
            by_alias.setdefault(alias, []).append(_row_to_match(row))

    # Set global de aliases usados para evitar asignar el mismo tramo a 2 grupos
    used_aliases: set[str] = set()
    results = []
    for g in groups:
        r = _resolve_group(g, loaniq_df, by_alias, used_aliases)
        # Marcar alias usado si fue auto-reconciliado
        if r["tier"] in ("MATCH_EXACT", "MATCH_CROSS_PREFIX", "LEARNED_MATCH"):
            liq = r.get("loaniq")
            if liq and liq.get("alias"):
                used_aliases.add(liq["alias"])
        results.append(r)

    # Conteos por tier
    tier_counts: dict[str, int] = {}
    for r in results:
        t = r["tier"]
        tier_counts[t] = tier_counts.get(t, 0) + 1

    total = len(results)
    stp = (
        tier_counts.get("MATCH_EXACT", 0)
        + tier_counts.get("MATCH_CROSS_PREFIX", 0)
        + tier_counts.get("LEARNED_MATCH", 0)
    )
    total_s_eur = sum(float(r.get("sum_paid_eur", 0)) for r in results)
    total_l_eur = sum(
        _best_oa(r["loaniq"]) if r.get("loaniq") else 0.0
        for r in results
        if r["tier"] in ("MATCH_EXACT", "MATCH_CROSS_PREFIX", "LEARNED_MATCH")
    )

    # Grupos limpios para el response
    clean_groups = []
    for r in results:
        clean_groups.append({
            "group_key":      r["group_key"],
            "facility_prefix": r.get("facility_prefix", ""),
            "tier":           r["tier"],
            "reason":         r["reason"],
            "delta_eur":      r.get("delta_eur", 0),
            "delta_pct":      r.get("delta_pct", 0),
            "new_current_amount": r.get("new_current_amount"),
            "santix": {
                "seller":              r.get("seller", ""),
                "glcs_code":           r.get("glcs_code", ""),
                "debtor":              r.get("debtor", ""),
                "currency":            r.get("currency", "EUR"),
                "invoice_count":       r.get("invoice_count", 0),
                "sum_paid_eur":        r.get("sum_paid_eur", 0),
                "sum_purchase_price":  r.get("sum_purchase_price", 0),
                "sum_outstanding_eur": r.get("sum_outstanding_eur", 0),
                "min_purchase_date":   r.get("min_purchase_date"),
                "reconciliation_date": r.get("reconciliation_date"),
                "invoices":            r.get("invoices", []),
            },
            "loaniq":      r.get("loaniq"),
            "loaniq_matches": r.get("loaniq_matches", []),
            "candidates":  r.get("candidates", []),
        })

    # loaniq_updated: copia del DataFrame con Current Amount actualizado
    alias_to_new_ca: dict[str, float] = {}
    alias_to_tier:   dict[str, str]   = {}
    for r in results:
        if r.get("new_current_amount") is not None and r.get("loaniq"):
            alias = r["loaniq"].get("alias", "")
            if alias:
                alias_to_new_ca[alias] = r["new_current_amount"]
                alias_to_tier[alias]   = r["tier"]

    loaniq_updated = []
    for _, row in loaniq_df.iterrows():
        alias = str(row.get("Alias", "") or "")
        rec: dict = {}
        for col in loaniq_df.columns:
            val = row[col]
            try:
                rec[col] = None if pd.isna(val) else val
            except Exception:
                rec[col] = val
        if alias in alias_to_new_ca:
            rec["Current Amount"] = round(alias_to_new_ca[alias], 2)
            rec["_tier"] = alias_to_tier[alias]
        else:
            rec["_tier"] = "UNMATCHED"
        loaniq_updated.append(rec)

    return {
        "summary": {
            "santix_invoices":       sum(r.get("invoice_count", 0) for r in results),
            "santix_groups":         total,
            "loaniq_rows":           len(loaniq_df),
            "match_exact":           tier_counts.get("MATCH_EXACT", 0),
            "match_cross_prefix":    tier_counts.get("MATCH_CROSS_PREFIX", 0),
            "review_overflow":       tier_counts.get("REVIEW_OVERFLOW", 0),
            "review_debtor_mismatch": tier_counts.get("REVIEW_DEBTOR_MISMATCH", 0),
            "suggested":             tier_counts.get("SUGGESTED", 0),
            "no_match":              tier_counts.get("NO_MATCH", 0),
            "learned_match":         tier_counts.get("LEARNED_MATCH", 0),
            "manual_override":       tier_counts.get("MANUAL_OVERRIDE", 0),
            "total_santix_eur":      round(total_s_eur, 2),
            "total_loaniq_eur":      round(total_l_eur, 2),
            "stp_rate_pct":          round(stp / total * 100, 1) if total else 0.0,
        },
        "groups":         clean_groups,
        "loaniq_updated": loaniq_updated,
    }
