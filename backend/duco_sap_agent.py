import os
from typing import Any

from openai import OpenAI


OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
MODEL = os.getenv("DUCO_SAP_AGENT_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"

_ALGO_RULES = """
REGLAS DEL ALGORITMO DUCO-SAP (inmutables):
  1. Fase 0: referencia + importe + divisa + ventana de fechas.
  2. Fase 1: fecha exacta, importe/divisa y evidencia semantica.
  3. Fase 2: tolerancia temporal, importe/divisa y evidencia semantica.
  4. Fase 3: importe unico dentro de ventana temporal cuando no hay ambiguedad.
  5. Fase 4: agrupacion many-to-one de partidas SAP contra un unico movimiento DUCO.
  6. Revision_Ambigua: candidatos plausibles no auto-aprobados por multiplicidad o baja evidencia.
  7. Pendientes SAP/DUCO: sin contrapartida aceptada por el motor.

El resumen no debe inventar causas externas. Debe distinguir hechos medidos, riesgos y accion operativa.
"""


def _safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _safe_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _phase_breakdown(rows: list[dict]) -> list[tuple[str, int]]:
    counts: dict[str, int] = {}
    for row in rows:
        phase = str(row.get("Fase") or row.get("Phase") or "Sin fase")
        counts[phase] = counts.get(phase, 0) + 1
    return sorted(counts.items(), key=lambda item: item[1], reverse=True)


def _top_amounts(rows: list[dict], amount_keys: tuple[str, ...], label_keys: tuple[str, ...]) -> list[dict]:
    enriched = []
    for row in rows:
        amount = 0.0
        for key in amount_keys:
            if key in row:
                amount = _safe_float(row.get(key))
                break

        label = ""
        for key in label_keys:
            if row.get(key):
                label = str(row.get(key))
                break

        enriched.append({"label": label[:80], "amount": round(abs(amount), 2)})

    return sorted(enriched, key=lambda item: item["amount"], reverse=True)[:3]


def _build_fallback(summary: dict, data: dict) -> str:
    total_sap = _safe_int(summary.get("total_sap"))
    matched = _safe_int(summary.get("matched_sap_count") or summary.get("matched_count") or summary.get("matched_rows"))
    ambiguous = len(data.get("ambiguous_matches") or [])
    unmatched_sap = len(data.get("unmatched_sap") or [])
    unmatched_duco = len(data.get("unmatched_bnk") or [])
    success_rate = (matched / total_sap * 100) if total_sap else 0.0

    return (
        f"La conciliacion DUCO-SAP alcanza un {success_rate:.1f}% de exito sobre SAP, "
        f"con {matched} partidas conciliadas de {total_sap}. El motor mantiene {ambiguous} candidatos en revision "
        f"y conserva trazabilidad por fase para separar matches automaticos de casos no concluyentes.\n\n"
        f"La prioridad operativa es revisar {unmatched_sap} pendientes SAP y {unmatched_duco} movimientos DUCO sin match, "
        f"empezando por importes altos y candidatos ambiguos con mejor evidencia semantica."
    )


def generate_duco_sap_ai_summary(summary: dict, data: dict) -> str:
    matched_rows = data.get("matched") or []
    ambiguous_rows = data.get("ambiguous_matches") or []
    unmatched_sap_rows = data.get("unmatched_sap") or []
    unmatched_duco_rows = data.get("unmatched_bnk") or []

    total_sap = _safe_int(summary.get("total_sap"))
    total_duco = _safe_int(summary.get("total_bnk"))
    matched_sap = _safe_int(summary.get("matched_sap_count") or summary.get("matched_count") or summary.get("matched_rows"))
    success_rate = (matched_sap / total_sap * 100) if total_sap else 0.0

    phase_breakdown = _phase_breakdown(matched_rows)[:5]
    top_sap = _top_amounts(
        unmatched_sap_rows,
        ("SAP Importe", "Importo in divisa docum.", "Abs_Amount"),
        ("SAP Riferimento", "SAP N Doc", "Numero documento"),
    )
    top_duco = _top_amounts(
        unmatched_duco_rows,
        ("DUCO Importe", "Amount", "Abs_Amount"),
        ("DUCO ID", "DUCO Descripcion", "DUCO Descripci\u00f3n", "Bookingtext1"),
    )

    prompt = f"""Genera un resumen ejecutivo breve para el dashboard DUCO-SAP Validation.

{_ALGO_RULES}

Datos:
  - Total SAP: {total_sap}
  - Total DUCO: {total_duco}
  - SAP conciliado: {matched_sap} ({success_rate:.2f}%)
  - Filas match auto: {len(matched_rows)}
  - Candidatos en revision manual: {len(ambiguous_rows)}
  - Pendientes SAP: {len(unmatched_sap_rows)}
  - Pendientes DUCO: {len(unmatched_duco_rows)}
  - Desglose de fases conciliadas: {phase_breakdown}
  - Logica de fecha: {summary.get("date_logic", "")}
  - Tolerancia dias: {summary.get("tolerance_days", 0)}
  - Tolerancia importe: {summary.get("amount_tolerance", 0)}
  - Tolerancia porcentaje: {summary.get("amount_tolerance_pct", 0)}
  - Top pendientes SAP por importe: {top_sap}
  - Top pendientes DUCO por importe: {top_duco}

Formato obligatorio:
  - Espanol profesional.
  - Dos parrafos breves, sin bullets ni numeracion.
  - Entre 60 y 90 palabras en total.
  - Primer parrafo: cobertura, calidad del match y fases.
  - Segundo parrafo: riesgos, pendientes y siguiente accion prioritaria.
  - No inventes causas; usa "sugiere", "requiere revision" o "conviene validar" cuando sea inferencia."""

    if client is None:
        return _build_fallback(summary, data)

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            max_tokens=220,
            temperature=0.25,
            messages=[
                {
                    "role": "system",
                    "content": "Analista financiero senior de Santander. Redacta solo el resumen ejecutivo solicitado.",
                },
                {"role": "user", "content": prompt},
            ],
        )
        return resp.choices[0].message.content or _build_fallback(summary, data)
    except Exception:
        return _build_fallback(summary, data)
