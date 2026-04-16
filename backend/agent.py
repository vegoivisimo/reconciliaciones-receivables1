import os
from openai import OpenAI
from typing import Optional

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
MODEL = "gpt-4o-mini"

TIER_DESC = {
    "MATCH_EXACT":            "Alias exacto + deudor validado + importe dentro del tramo (auto-reconciliado)",
    "MATCH_CROSS_PREFIX":     "Sin alias directo — deudor y OA coinciden con un único tramo en otro programa (auto-reconciliado)",
    "REVIEW_OVERFLOW":        "Alias exacto y deudor OK, pero el importe pagado supera el Original Amount del tramo — revisar",
    "REVIEW_DEBTOR_MISMATCH": "Alias exacto encontrado, pero el deudor del tramo no coincide con el grupo SANTIX — revisar asignación",
    "SUGGESTED":              "Múltiples candidatos cross-prefix ambiguos — el operador debe elegir manualmente",
    "NO_MATCH":               "Sin alias ni candidatos cross-prefix — investigación manual obligatoria",
    "LEARNED_MATCH":          "Match resuelto a partir de una decisión manual anterior (re-validado automáticamente)",
    "MANUAL_OVERRIDE":        "Override manual del operador registrado en el audit trail",
}

_ALGO_RULES = """
REGLAS DEL ALGORITMO (inmutables):
  Constantes: DEBTOR_FUZZY_GATE=80 (token_set_ratio), OA_PAID_TOL=0.02€

  1. MATCH_EXACT: Alias LOANIQ == LIQ ID DISPO  AND  deudor fuzzy >= 80  AND  sum_paid <= OA
     → Current Amount := sum_paid_eur
  2. REVIEW_OVERFLOW: mismas condiciones pero sum_paid > OA
     → No actualizar, el tramo es insuficiente para cubrir el pago
  3. REVIEW_DEBTOR_MISMATCH: Alias existe pero deudor fuzzy < 80 en todos los tramos
     → El alias apunta a otro deudor; posible error de asignación en SANTIX
  4. MATCH_CROSS_PREFIX: sin alias directo, UN único tramo con deudor fuzzy>=80 Y OA==sum_paid (±0.02€)
     → Current Amount := sum_paid_eur
  5. SUGGESTED: varios candidatos cross-prefix ambiguos
  6. NO_MATCH: sin alias ni cross-prefix válido
"""


def _build_system_prompt(group_context: Optional[dict]) -> str:
    base = (
        "Eres un agente de IA especializado en reconciliación financiera SANTIX ↔ LOANIQ "
        "para Santander Factoring.\n"
        "Tu función: explicar al operador el estado de un grupo y ayudarle a decidir.\n\n"
        + _ALGO_RULES
        + "\nResponde en español, tono profesional, máximo 150 palabras."
    )

    if not group_context:
        return base

    santix = group_context.get("santix", {})
    loaniq = group_context.get("loaniq")
    cands  = group_context.get("candidates", [])
    tier   = group_context.get("tier", "")

    ctx = f"""

=== GRUPO ACTIVO ===
Clave (LIQ ID DISPO): {group_context.get("group_key")}
Tier: {tier} — {TIER_DESC.get(tier, tier)}
Razón: {group_context.get("reason")}

SANTIX ({santix.get("invoice_count", 0)} facturas):
  Seller: {santix.get("seller")} | Deudor: {santix.get("debtor")}
  Σ Pagado EUR: {santix.get("sum_paid_eur", 0):,.2f} €
  Outstanding: {santix.get("sum_outstanding_eur", 0):,.2f} €
  Recon date: {santix.get("reconciliation_date", "—")}"""

    if loaniq:
        ctx += f"""

LOANIQ MATCH:
  Alias: {loaniq.get("alias")}
  Facility: {loaniq.get("facility")}
  Original Amount: {loaniq.get("original_amount") or 0:,.2f} €
  Status: {loaniq.get("status")} | CCY: {loaniq.get("ccy")}
  Δ EUR vs SANTIX: {group_context.get("delta_eur", 0):,.2f} € ({group_context.get("delta_pct", 0):.1f}%)"""

    if cands:
        ctx += f"\n\nCANDIDATOS ({len(cands)}):"
        for i, c in enumerate(cands[:4], 1):
            amt = c.get("original_amount") or c.get("host_bank_gross") or 0
            ctx += f"\n  {i}. {c.get('alias')} | OA={amt:,.2f} € | {c.get('facility', '')}"

    return base + ctx


def generate_ai_summary(summary: dict, groups: list) -> str:
    total = summary.get("santix_groups", 0) or 0
    stp_n = (
        summary.get("match_exact", 0)
        + summary.get("match_cross_prefix", 0)
        + summary.get("learned_match", 0)
    )
    stp_pct = round(stp_n / total * 100, 1) if total else 0.0
    overflow_n = summary.get("review_overflow", 0)
    mismatch_n = summary.get("review_debtor_mismatch", 0)
    suggested_n = summary.get("suggested", 0)
    no_match_n = summary.get("no_match", 0)

    review_groups = [
        g for g in groups
        if g.get("tier") in ("REVIEW_OVERFLOW", "REVIEW_DEBTOR_MISMATCH", "SUGGESTED", "NO_MATCH")
    ]
    top_review = sorted(review_groups, key=lambda x: abs(x.get("delta_eur", 0)), reverse=True)[:3]

    prompt = f"""Genera un resumen ejecutivo breve de esta reconciliacion SANTIX-LOANIQ.

Datos:
  - {total} grupos SANTIX | {summary.get("santix_invoices", 0)} facturas
  - STP auto-reconciliado: {stp_pct}% ({stp_n}/{total} grupos)
  - Desglose STP: MATCH_EXACT={summary.get("match_exact", 0)} | CROSS_PREFIX={summary.get("match_cross_prefix", 0)} | LEARNED={summary.get("learned_match", 0)}
  - Requieren revision: OVERFLOW={overflow_n} | DEBTOR_MISMATCH={mismatch_n} | SUGGESTED={suggested_n} | NO_MATCH={no_match_n}
  - Top grupos pendientes por delta: {[(g.get("group_key"), g.get("delta_eur")) for g in top_review]}

Formato: dos parrafos breves en espanol, tono ejecutivo, sin bullets ni numeracion, entre 55 y 80 palabras en total.
El primer parrafo debe cubrir STP y grupos auto-reconciliados. El segundo debe cubrir riesgos, grupos pendientes y accion prioritaria."""

    if client is None:
        return (
            f"STP alcanzo un {stp_pct}%, con {stp_n} de {total} grupos SANTIX auto-reconciliados.\n\n"
            f"{overflow_n + mismatch_n + suggested_n + no_match_n} grupos requieren revision manual por riesgos de importe, deudor, candidatos ambiguos o falta de match. "
            f"Conviene priorizar los casos con mayor delta para reducir exposicion financiera."
        )

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            max_tokens=200,
            temperature=0.3,
            messages=[
                {"role": "system", "content": "Analista financiero senior de Santander. Responde solo con dos parrafos ejecutivos, sin bullets ni numeracion."},
                {"role": "user", "content": prompt},
            ],
        )
        return resp.choices[0].message.content or ""
    except Exception:
        return (
            f"STP alcanzo un {stp_pct}% con {stp_n} grupos reconciliados automaticamente.\n\n"
            f"{overflow_n + mismatch_n} grupos mantienen alertas de importe o deudor pendientes. "
            f"La revision debe centrarse en los casos REVIEW_OVERFLOW y SUGGESTED de mayor importe."
        )


def chat_with_agent(messages: list, group_context: Optional[dict] = None) -> str:
    system = _build_system_prompt(group_context)
    openai_msgs = [{"role": "system", "content": system}] + [
        {"role": m["role"], "content": m["content"]}
        for m in messages
        if m.get("role") in ("user", "assistant")
    ]
    if client is None:
        return "Agente IA no configurado: falta OPENAI_API_KEY en el entorno del backend."
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            max_tokens=400,
            temperature=0.2,
            messages=openai_msgs,
        )
        return resp.choices[0].message.content or ""
    except Exception as e:
        return f"Error del agente: {str(e)}"
