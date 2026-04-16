import base64
import io
from typing import List, Tuple

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from duco_erp_v3 import ReconciliadorService, df_to_records
from duco_sap_agent import generate_duco_sap_ai_summary


router = APIRouter(tags=["ERP DUCO Reconciliation"])


# ---------------------------------------------------------------------------
# Column curation — map raw pandas columns to clean user-facing names
# ---------------------------------------------------------------------------

def _first_present(df: pd.DataFrame, candidates: List[str]):
    """Return the first column name that exists in df, or None."""
    for c in candidates:
        if c in df.columns:
            return c
    return None


def _curate_matched(df: pd.DataFrame) -> pd.DataFrame:
    """Select and rename columns for the Matched tab."""
    if df.empty:
        return df

    col_map: List[Tuple[str, List[str]]] = [
        ("Fase", ["Phase"]),
        ("SAP Nº Doc", ["Numero documento_sap", "Numero documento"]),
        ("SAP Riferimento", ["Riferimento_sap", "Riferimento"]),
        ("SAP Importe", ["Importo in divisa docum._sap", "Abs_Amount_sap"]),
        ("SAP Divisa", ["Divisa documento_sap", "Curr_sap", "Curr"]),
        ("SAP Fecha", ["Data pagamento_sap", "Date_sap"]),
        ("SAP Testo", ["Testo_sap", "Testo"]),
        ("DUCO ID Original", ["ID_bnk", "ID", "Id_bnk", "Id", "id_bnk", "id", "ItemId_bnk", "ItemId",
                              "Item ID_bnk", "Item ID", "StmtN_bnk", "StmtN",
                              "GIn_bnk", "GIn"]),
        ("DUCO ID", ["DUCO_ID"]),
        ("DUCO Importe", ["Amount_bnk", "Abs_Amount_bnk"]),
        ("DUCO Divisa", ["Curr_bnk", "Curr"]),
        ("DUCO Fecha", ["BookDate_bnk", "Date_bnk", "BookDate"]),
        ("DUCO Descripción", ["Bookingtext1_bnk", "Bookingtext1",
                              "Theirreference1_bnk", "Theirreference1"]),
        ("Δ Importe", ["amount_diff"]),
        ("Δ Días", ["date_diff_days"]),
        ("Score Semántico", ["semantic_score"]),
    ]

    return _apply_col_map(df, col_map)


def _curate_ambiguous(df: pd.DataFrame) -> pd.DataFrame:
    """Select and rename columns for the Ambiguous tab.

    Keeps ESTR_ID / DUCO_ID because the frontend needs them
    for accept/reject actions.
    """
    if df.empty:
        return df

    col_map: List[Tuple[str, List[str]]] = [
        ("ESTR_ID", ["ESTR_ID"]),
        ("DUCO_ID", ["DUCO_ID"]),
        ("SAP Nº Doc", ["Numero documento_sap", "Numero documento"]),
        ("SAP Riferimento", ["Riferimento_sap", "Riferimento"]),
        ("SAP Importe", ["Importo in divisa docum._sap", "Abs_Amount_sap"]),
        ("SAP Divisa", ["Divisa documento_sap", "Curr_sap", "Curr"]),
        ("SAP Fecha", ["Data pagamento_sap", "Date_sap"]),
        ("SAP Testo", ["Testo_sap", "Testo"]),
        ("DUCO ID Original", ["ID_bnk", "ID", "Id_bnk", "Id", "id_bnk", "id", "ItemId_bnk", "ItemId",
                              "Item ID_bnk", "Item ID", "StmtN_bnk", "StmtN",
                              "GIn_bnk", "GIn"]),
        ("DUCO Importe", ["Amount_bnk", "Abs_Amount_bnk"]),
        ("DUCO Fecha", ["BookDate_bnk", "Date_bnk", "BookDate"]),
        ("DUCO Descripción", ["Bookingtext1_bnk", "Bookingtext1",
                              "Theirreference1_bnk", "Theirreference1",
                              "Semantic_Text_bnk", "Description_bnk"]),
        ("Motivo Ambigüedad", ["ambiguity_reason"]),
        ("Candidatos SAP", ["sap_candidate_count"]),
        ("Candidatos DUCO", ["bnk_candidate_count"]),
        ("Δ Importe", ["amount_diff"]),
        ("Δ Días", ["date_diff_days"]),
        ("Score Semántico", ["semantic_score"]),
        ("Confianza", ["confidence_score"]),
        ("Fase", ["Phase"]),
    ]

    return _apply_col_map(df, col_map)


def _curate_unmatched_sap(df: pd.DataFrame) -> pd.DataFrame:
    """Select and rename columns for the Unmatched SAP tab."""
    if df.empty:
        return df

    col_map: List[Tuple[str, List[str]]] = [
        ("SAP Nº Doc", ["Numero documento"]),
        ("SAP Riferimento", ["Riferimento"]),
        ("SAP Importe", ["Importo in divisa docum.", "Abs_Amount"]),
        ("SAP Divisa", ["Divisa documento", "Curr"]),
        ("SAP Fecha", ["Data pagamento", "Date"]),
        ("SAP Testo", ["Testo"]),
    ]

    return _apply_col_map(df, col_map)


def _curate_unmatched_bnk(df: pd.DataFrame) -> pd.DataFrame:
    """Select and rename columns for the Unmatched DUCO tab."""
    if df.empty:
        return df

    col_map: List[Tuple[str, List[str]]] = [
        ("DUCO ID Original", ["ID", "Id", "id", "ItemId", "Item ID", "StmtN", "GIn"]),
        ("DUCO ID", ["DUCO_ID"]),
        ("DUCO Importe", ["Amount", "Abs_Amount"]),
        ("DUCO Divisa", ["Curr"]),
        ("DUCO Fecha", ["BookDate", "Date"]),
        ("DUCO Descripción", ["Bookingtext1", "Theirreference1",
                              "Semantic_Text", "Description"]),
    ]

    return _apply_col_map(df, col_map)


def _apply_col_map(
    df: pd.DataFrame,
    col_map: List[Tuple[str, List[str]]],
) -> pd.DataFrame:
    """Build a new DataFrame with only the mapped columns, in order."""
    out = pd.DataFrame(index=df.index)
    for display_name, candidates in col_map:
        src = _first_present(df, candidates)
        if src is not None:
            out[display_name] = df[src]
    return out


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/reconcile", summary="Cruza ERP/SAP vs DUCO y devuelve JSON con Excel en base64")
async def upload_files(
    sap_file: UploadFile = File(..., description="Archivo ERP/SAP (.xlsx)"),
    bank_file: UploadFile = File(..., description="Archivo DUCO (.xlsx)"),
    tolerance_days: int = Form(45, description="Ventana temporal maxima en dias"),
    amount_tolerance: float = Form(0.0, description="Margen absoluto permitido en la divisa del movimiento"),
    amount_tolerance_pct: float = Form(0.0, description="Margen porcentual permitido sobre el importe SAP"),
    sap_date_field: str = Form("Data pagamento", description="Columna de fecha SAP a comparar"),
):
    try:
        sap_bytes = await sap_file.read()
        bank_bytes = await bank_file.read()
        service = ReconciliadorService(
            tolerance_days=tolerance_days,
            amount_tolerance=amount_tolerance,
            amount_tolerance_pct=amount_tolerance_pct,
            sap_date_field=sap_date_field,
        )
        result = service.process(sap_bytes, bank_bytes)

        # Curate columns for display and Excel
        matched_clean = _curate_matched(result["files"]["matched"])
        ambiguous_clean = _curate_ambiguous(result["files"]["ambiguous_matches"])
        unmatched_sap_clean = _curate_unmatched_sap(result["files"]["unmatched_sap"])
        unmatched_bnk_clean = _curate_unmatched_bnk(result["files"]["unmatched_bnk"])

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
            matched_clean.to_excel(writer, sheet_name="Matched", index=False)
            ambiguous_clean.to_excel(writer, sheet_name="Revision_Ambigua", index=False)
            unmatched_sap_clean.to_excel(writer, sheet_name="Pendiente_SAP", index=False)
            unmatched_bnk_clean.to_excel(writer, sheet_name="Pendiente_DUCO", index=False)

        output.seek(0)
        excel_base64 = base64.b64encode(output.read()).decode("utf-8")

        return {
            "summary": result["summary"],
            "excel_base64": excel_base64,
            "data": {
                "matched": df_to_records(matched_clean),
                "ambiguous_matches": df_to_records(ambiguous_clean),
                "unmatched_sap": df_to_records(unmatched_sap_clean),
                "unmatched_bnk": df_to_records(unmatched_bnk_clean),
            },
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/duco-sap/ai-summary", summary="Genera resumen ejecutivo IA para DUCO-SAP")
async def duco_sap_ai_summary(request: Request):
    try:
        body = await request.json()
        summary = body.get("summary", {})
        data = body.get("data", {})
        text = generate_duco_sap_ai_summary(summary, data)
        return {"summary": text}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
