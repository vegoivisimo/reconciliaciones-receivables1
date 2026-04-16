import base64
import io
import json
import re
from typing import Dict, Iterable, List, Set, Tuple

import numpy as np
import pandas as pd


class ReconciliadorService:
    SAP_REQUIRED_COLUMNS = {
        "Numero documento",
        "Riferimento",
        "Data documento",
        "Divisa documento",
        "Importo in divisa docum.",
        "Testo",
    }

    DUCO_REQUIRED_COLUMNS = {
        "Curr",
        "Amount",
        "BookDate",
        "ValueDate",
        "Theirreference1",
        "Bookingtext1",
        "Comments",
    }

    STOPWORDS = {
        "DEL", "REFER", "REFERENCE", "OPERACION", "RECEPTOR", "PAYMENT",
        "PRINCIPAL", "SWIFT", "OUTSTANDING", "COMMENTED", "AT",
        "THEIRREFERENCE", "BOOKINGTEXT", "COMMENTS", "EUR", "USD", "GBP",
        "SRL", "SPA", "FATTURA", "FACTURA", "DOCUMENTO", "DOCUMENT",
        "BANK", "BANCO", "REF", "SU", "ETSER", "VARI", "RATA", "MILAN",
        "PARIS", "FRANKFURT", "MADRID",
    }

    def __init__(
        self,
        tolerance_days: int = 45,
        amount_tolerance: float = 0.0,
        amount_tolerance_pct: float = 0.0,
        sap_date_field: str = "Data pagamento",
    ):
        self.tolerance_days = max(int(tolerance_days), 0)
        self.amount_tolerance = max(float(amount_tolerance), 0.0)
        self.amount_tolerance_pct = max(float(amount_tolerance_pct), 0.0)
        self.sap_date_field = sap_date_field

    def _validate_columns(self, df: pd.DataFrame, required: Set[str], source_name: str) -> None:
        missing = [c for c in required if c not in df.columns]
        if missing:
            raise ValueError(f"Faltan columnas en {source_name}: {missing}")

    def _clean_numeric(self, series: pd.Series) -> pd.Series:
        if pd.api.types.is_numeric_dtype(series):
            return pd.to_numeric(series, errors="coerce").abs().fillna(0.0).round(2)

        s = series.astype(str).str.strip().str.replace(r"\s+", "", regex=True)
        european_mask = s.str.contains(",", na=False)
        s_eu = s.where(
            ~european_mask,
            s.str.replace(".", "", regex=False).str.replace(",", ".", regex=False),
        )
        s_std = s_eu.where(european_mask, s_eu.str.replace(",", "", regex=False))
        return pd.to_numeric(s_std, errors="coerce").abs().fillna(0.0).round(2)

    def _to_datetime(self, series: pd.Series) -> pd.Series:
        return pd.to_datetime(series, errors="coerce").dt.normalize()

    def _norm_text(self, value) -> str:
        if pd.isna(value):
            return ""
        text = str(value).upper()
        text = re.sub(r"[^A-Z0-9/\- ]+", " ", text)
        return re.sub(r"\s+", " ", text).strip()

    def _extract_tokens(self, values: Iterable) -> List[str]:
        tokens = set()
        for value in values:
            text = self._norm_text(value)
            if not text:
                continue
            for raw in re.findall(r"(?<![A-Z0-9])([A-Z0-9]+(?:[/-][A-Z0-9]+)*)(?![A-Z0-9])", text):
                canon = re.sub(r"[^A-Z0-9]", "", raw)
                if len(canon) < 5 or canon in self.STOPWORDS:
                    continue
                if canon.isdigit():
                    if len(canon) >= 6:
                        tokens.add(canon)
                elif any(ch.isdigit() for ch in canon) or len(canon) >= 7:
                    tokens.add(canon)
        return sorted(tokens)

    def _prepare_sap(self, df_estr: pd.DataFrame) -> pd.DataFrame:
        df = df_estr.copy()
        df["ESTR_ID"] = df.index.astype(str) + "_sap"
        df["Abs_Amount"] = self._clean_numeric(df["Importo in divisa docum."])
        df["Curr"] = df["Divisa documento"].astype(str).str.strip().str.upper()
        if self.sap_date_field not in df.columns:
            raise ValueError(f"La columna de fecha SAP configurada no existe: {self.sap_date_field}")
        df["Date"] = self._to_datetime(df[self.sap_date_field])
        sap_text_cols = ["Riferimento", "Numero documento", "Testo"]
        df["Semantic_Text"] = df[sap_text_cols].fillna("").astype(str).agg(" | ".join, axis=1)
        df["Semantic_Tokens"] = df.apply(
            lambda r: self._extract_tokens([r.get("Riferimento"), r.get("Numero documento"), r.get("Testo")]),
            axis=1,
        )
        return df

    def _prepare_duco(self, df_duco: pd.DataFrame) -> pd.DataFrame:
        df = df_duco.copy()
        df["DUCO_ID"] = df.index.astype(str) + "_bnk"
        df["Abs_Amount"] = self._clean_numeric(df["Amount"])
        df["Curr"] = df["Curr"].astype(str).str.strip().str.upper()
        value_date = self._to_datetime(df["ValueDate"]) if "ValueDate" in df.columns else pd.Series(pd.NaT, index=df.index)
        book_date = self._to_datetime(df["BookDate"])
        df["Date"] = value_date.fillna(book_date)

        duco_text_cols = ["Theirreference1", "Bookingtext1", "Comments", "CommentsClearers", "Ourreference1", "Comment"]
        for col in duco_text_cols:
            if col not in df.columns:
                df[col] = np.nan

        df["Semantic_Text"] = df[duco_text_cols].fillna("").astype(str).agg(" | ".join, axis=1)
        df["Semantic_Tokens"] = df.apply(
            lambda r: self._extract_tokens(
                [
                    r.get("Theirreference1"), r.get("Bookingtext1"), r.get("Comments"),
                    r.get("CommentsClearers"), r.get("Ourreference1"), r.get("Comment"),
                ]
            ),
            axis=1,
        )
        return df

    def _explode_tokens(self, df: pd.DataFrame, id_col: str) -> pd.DataFrame:
        tmp = df[[id_col, "Abs_Amount", "Curr", "Date", "Semantic_Tokens"]].copy()
        tmp = tmp.explode("Semantic_Tokens")
        tmp = tmp.rename(columns={"Semantic_Tokens": "Semantic_Token"})
        tmp = tmp.dropna(subset=["Semantic_Token"])
        return tmp[tmp["Semantic_Token"].astype(str) != ""]

    def _amount_limit(self, amount: pd.Series) -> pd.Series:
        pct_limit = amount.abs() * (self.amount_tolerance_pct / 100.0)
        return np.maximum(self.amount_tolerance, pct_limit).round(2)

    def _filter_candidate_window(self, candidates: pd.DataFrame) -> pd.DataFrame:
        if candidates.empty:
            return candidates

        work = candidates.copy()
        if "Date_sap" not in work.columns and "Date" in work.columns:
            work["Date_sap"] = work["Date"]
        if "Date_bnk" not in work.columns and "Date" in work.columns:
            work["Date_bnk"] = work["Date"]

        work["amount_diff"] = (work["Abs_Amount_sap"] - work["Abs_Amount_bnk"]).abs().round(2)
        work["amount_tolerance_used"] = self._amount_limit(work["Abs_Amount_sap"])
        work["date_diff_days"] = (work["Date_sap"] - work["Date_bnk"]).abs().dt.days
        work = work[work["amount_diff"] <= work["amount_tolerance_used"]].copy()
        return work[work["date_diff_days"] <= self.tolerance_days].copy()

    def _add_candidate_scores(self, candidates: pd.DataFrame) -> pd.DataFrame:
        if candidates.empty:
            return candidates

        candidates = candidates.copy()
        if "date_diff_days" not in candidates.columns:
            candidates["date_diff_days"] = (candidates["Date_sap"] - candidates["Date_bnk"]).abs().dt.days
        if "amount_diff" not in candidates.columns and {"Abs_Amount_sap", "Abs_Amount_bnk"}.issubset(candidates.columns):
            candidates["amount_diff"] = (candidates["Abs_Amount_sap"] - candidates["Abs_Amount_bnk"]).abs().round(2)

        def overlap(a, b):
            sa = set(a) if isinstance(a, list) else set()
            sb = set(b) if isinstance(b, list) else set()
            return len(sa & sb)

        candidates["semantic_overlap"] = candidates.apply(
            lambda r: overlap(r.get("Semantic_Tokens_sap"), r.get("Semantic_Tokens_bnk")),
            axis=1,
        )

        def text_contains(a, b):
            a = self._norm_text(a)
            b = self._norm_text(b)
            if not a or not b:
                return 0
            return int(a in b or b in a)

        candidates["text_affinity"] = candidates.apply(
            lambda r: max(
                text_contains(r.get("Riferimento", ""), r.get("Semantic_Text_bnk", "")),
                text_contains(r.get("Semantic_Text_sap", ""), r.get("Semantic_Text_bnk", "")),
            ),
            axis=1,
        )
        candidates["semantic_score"] = candidates["semantic_overlap"] * 10 + candidates["text_affinity"]
        candidates["confidence_score"] = (
            candidates["semantic_score"] * 100
            - candidates["date_diff_days"].fillna(9999)
            - candidates["amount_diff"].fillna(0)
        )
        return candidates

    def _pair_candidates(self, sap_df: pd.DataFrame, bnk_df: pd.DataFrame) -> pd.DataFrame:
        results = []
        for curr in sap_df["Curr"].unique():
            sap_curr = sap_df[sap_df["Curr"] == curr]
            bnk_curr = bnk_df[bnk_df["Curr"] == curr]
            if sap_curr.empty or bnk_curr.empty:
                continue
            max_tol = max(
                self.amount_tolerance,
                float(sap_curr["Abs_Amount"].max()) * self.amount_tolerance_pct / 100.0,
            )
            lo = float(sap_curr["Abs_Amount"].min()) - max_tol
            hi = float(sap_curr["Abs_Amount"].max()) + max_tol
            bnk_curr = bnk_curr[bnk_curr["Abs_Amount"].between(lo, hi)]
            if bnk_curr.empty:
                continue
            min_sap_date = sap_curr["Date"].min()
            if pd.notna(min_sap_date):
                max_sap_date = sap_curr["Date"].max()
                delta = pd.Timedelta(days=self.tolerance_days)
                bnk_curr = bnk_curr[
                    bnk_curr["Date"].isna()
                    | bnk_curr["Date"].between(min_sap_date - delta, max_sap_date + delta)
                ]
            if bnk_curr.empty:
                continue
            cand = pd.merge(sap_curr, bnk_curr, on=["Curr"], how="inner", suffixes=("_sap", "_bnk"))
            cand = self._filter_candidate_window(cand)
            cand = self._add_candidate_scores(cand)
            if not cand.empty:
                results.append(cand)
        if not results:
            return pd.DataFrame()
        return pd.concat(results, ignore_index=True, sort=False)

    def _resolve_candidates_greedily(
        self,
        candidates: pd.DataFrame,
        phase_name: str,
        sort_cols: List[str],
        ascending: List[bool],
    ) -> pd.DataFrame:
        if candidates.empty:
            return candidates

        work = candidates.sort_values(sort_cols, ascending=ascending).copy()
        used_sap = set()
        used_bnk = set()
        picked_idx = []

        for idx, row in work.iterrows():
            sap_id = row["ESTR_ID"]
            bnk_id = row["DUCO_ID"]
            if sap_id in used_sap or bnk_id in used_bnk:
                continue
            used_sap.add(sap_id)
            used_bnk.add(bnk_id)
            picked_idx.append(idx)

        result = work.loc[picked_idx].copy()
        result["Phase"] = phase_name
        return result

    def _remove_matched(
        self,
        unmatched_sap: pd.DataFrame,
        unmatched_bnk: pd.DataFrame,
        matched_df: pd.DataFrame,
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        if matched_df.empty:
            return unmatched_sap, unmatched_bnk
        sap_ids = matched_df["ESTR_ID"].dropna().unique().tolist()
        bnk_ids = matched_df["DUCO_ID"].dropna().unique().tolist()
        return (
            unmatched_sap[~unmatched_sap["ESTR_ID"].isin(sap_ids)].copy(),
            unmatched_bnk[~unmatched_bnk["DUCO_ID"].isin(bnk_ids)].copy(),
        )

    def _phase0_reference_exact(self, sap_df: pd.DataFrame, bnk_df: pd.DataFrame) -> pd.DataFrame:
        sap_tok = self._explode_tokens(sap_df, "ESTR_ID")
        bnk_tok = self._explode_tokens(bnk_df, "DUCO_ID")
        if sap_tok.empty or bnk_tok.empty:
            return pd.DataFrame()

        cand = pd.merge(
            sap_tok[["ESTR_ID", "Abs_Amount", "Curr", "Date", "Semantic_Token"]],
            bnk_tok[["DUCO_ID", "Abs_Amount", "Curr", "Date", "Semantic_Token"]],
            on=["Semantic_Token", "Curr"],
            how="inner",
            suffixes=("_sap", "_bnk"),
        )
        cand = self._filter_candidate_window(cand)
        if cand.empty:
            return pd.DataFrame()

        sap_meta_cols = ["ESTR_ID", "Riferimento", "Semantic_Text", "Semantic_Tokens"]
        for extra in ["Numero documento", "Testo"]:
            if extra in sap_df.columns and extra not in sap_meta_cols:
                sap_meta_cols.append(extra)
        sap_meta = sap_df[sap_meta_cols].rename(
            columns={"Semantic_Text": "Semantic_Text_sap", "Semantic_Tokens": "Semantic_Tokens_sap"}
        )
        bnk_meta_cols = ["DUCO_ID", "Semantic_Text", "Semantic_Tokens"]
        for extra in ["Theirreference1", "Bookingtext1"]:
            if extra in bnk_df.columns and extra not in bnk_meta_cols:
                bnk_meta_cols.append(extra)
        bnk_meta = bnk_df[bnk_meta_cols].rename(
            columns={"Semantic_Text": "Semantic_Text_bnk", "Semantic_Tokens": "Semantic_Tokens_bnk"}
        )

        cand = cand.merge(sap_meta, on="ESTR_ID", how="left")
        cand = cand.merge(bnk_meta, on="DUCO_ID", how="left")
        cand = self._add_candidate_scores(cand)
        return self._resolve_candidates_greedily(
            cand,
            phase_name="0_Reference_Amount_Date",
            sort_cols=["semantic_score", "date_diff_days", "amount_diff"],
            ascending=[False, True, True],
        )

    def _phase_date_exact_with_semantics(self, sap_df: pd.DataFrame, bnk_df: pd.DataFrame) -> pd.DataFrame:
        cand = pd.merge(sap_df, bnk_df, on=["Curr", "Date"], how="inner", suffixes=("_sap", "_bnk"))
        cand = self._filter_candidate_window(cand)
        cand = self._add_candidate_scores(cand)
        cand = cand[cand["semantic_score"] > 0].copy() if not cand.empty else cand
        return self._resolve_candidates_greedily(
            cand,
            phase_name="1_Exact_Date_With_Semantics",
            sort_cols=["semantic_score", "amount_diff"],
            ascending=[False, True],
        )

    def _phase_date_tolerance_with_semantics(self, sap_df: pd.DataFrame, bnk_df: pd.DataFrame) -> pd.DataFrame:
        cand = self._pair_candidates(sap_df, bnk_df)
        cand = cand[cand["semantic_score"] > 0].copy() if not cand.empty else cand
        return self._resolve_candidates_greedily(
            cand,
            phase_name="2_Date_Tolerance_Semantic",
            sort_cols=["date_diff_days", "semantic_score", "amount_diff"],
            ascending=[True, False, True],
        )

    def _phase_unique_amount_date_window(self, sap_df: pd.DataFrame, bnk_df: pd.DataFrame) -> pd.DataFrame:
        cand = self._pair_candidates(sap_df, bnk_df)
        if cand.empty:
            return pd.DataFrame()

        cand["sap_candidate_count"] = cand.groupby("ESTR_ID")["DUCO_ID"].transform("nunique")
        cand["bnk_candidate_count"] = cand.groupby("DUCO_ID")["ESTR_ID"].transform("nunique")
        unique = cand[(cand["sap_candidate_count"] == 1) & (cand["bnk_candidate_count"] == 1)].copy()
        return self._resolve_candidates_greedily(
            unique,
            phase_name="3_Unique_Amount_Date_Window",
            sort_cols=["date_diff_days", "amount_diff", "semantic_score"],
            ascending=[True, True, False],
        )

    def _phase_grouped_many_to_one(self, sap_df: pd.DataFrame, bnk_df: pd.DataFrame) -> pd.DataFrame:
        if sap_df.empty or bnk_df.empty:
            return pd.DataFrame()

        grouped = sap_df.groupby(["Date", "Curr", "Riferimento"], as_index=False).agg(
            {
                "Abs_Amount": "sum",
                "ESTR_ID": lambda x: list(x),
                "Semantic_Tokens": lambda rows: sorted(
                    set(t for lst in rows for t in (lst if isinstance(lst, list) else []))
                ),
                "Semantic_Text": lambda x: " | ".join([str(v) for v in x if pd.notna(v)]),
            }
        )
        grouped["GROUP_ID"] = grouped.index.astype(str) + "_grp"

        cand = pd.merge(grouped, bnk_df, on=["Curr"], how="inner", suffixes=("_sap", "_bnk"))
        cand = self._filter_candidate_window(cand)
        cand = self._add_candidate_scores(cand)
        cand = cand[cand["semantic_score"] > 0].copy() if not cand.empty else cand
        if cand.empty:
            return pd.DataFrame()

        work = cand.sort_values(["date_diff_days", "semantic_score", "amount_diff"], ascending=[True, False, True]).copy()
        used_groups = set()
        used_bnk = set()
        picked = []

        for idx, row in work.iterrows():
            if row["GROUP_ID"] in used_groups or row["DUCO_ID"] in used_bnk:
                continue
            used_groups.add(row["GROUP_ID"])
            used_bnk.add(row["DUCO_ID"])
            picked.append(idx)

        p4 = work.loc[picked].copy()
        p4["Phase"] = "4_Many_to_One_Grouped_Semantic"
        return p4

    def _phase_ambiguous_candidates(self, sap_df: pd.DataFrame, bnk_df: pd.DataFrame) -> pd.DataFrame:
        cand = self._pair_candidates(sap_df, bnk_df)
        if cand.empty:
            return pd.DataFrame()

        cand["sap_candidate_count"] = cand.groupby("ESTR_ID")["DUCO_ID"].transform("nunique")
        cand["bnk_candidate_count"] = cand.groupby("DUCO_ID")["ESTR_ID"].transform("nunique")
        cand["ambiguity_reason"] = np.select(
            [
                (cand["sap_candidate_count"] > 1) & (cand["bnk_candidate_count"] > 1),
                cand["sap_candidate_count"] > 1,
                cand["bnk_candidate_count"] > 1,
            ],
            [
                "multiple_sap_and_duco_candidates",
                "multiple_duco_candidates_for_sap",
                "multiple_sap_candidates_for_duco",
            ],
            default="low_semantic_evidence",
        )
        cand["Phase"] = "Review_Ambiguous"
        return cand.sort_values(
            ["ambiguity_reason", "ESTR_ID", "date_diff_days", "amount_diff", "semantic_score"],
            ascending=[True, True, True, True, False],
        ).copy()

    def process(self, file_estr_bytes: bytes, file_duco_bytes: bytes) -> Dict:
        df_estr = pd.read_excel(io.BytesIO(file_estr_bytes))
        df_duco = pd.read_excel(io.BytesIO(file_duco_bytes))
        self._validate_columns(df_estr, self.SAP_REQUIRED_COLUMNS, "SAP")
        self._validate_columns(df_duco, self.DUCO_REQUIRED_COLUMNS, "DUCO")

        sap = self._prepare_sap(df_estr)
        bnk = self._prepare_duco(df_duco)
        unmatched_sap = sap.copy()
        unmatched_bnk = bnk.copy()
        matches = []

        phases = (
            (self._phase0_reference_exact, False),
            (self._phase_date_exact_with_semantics, False),
            (self._phase_date_tolerance_with_semantics, False),
            (self._phase_unique_amount_date_window, False),
            (self._phase_grouped_many_to_one, True),
        )
        for phase, is_grouped in phases:
            matched = phase(unmatched_sap, unmatched_bnk)
            matches.append(matched)
            if is_grouped and not matched.empty:
                ids_in_group = [
                    item
                    for sublist in matched["ESTR_ID"].tolist()
                    for item in (sublist if isinstance(sublist, list) else [sublist])
                ]
                unmatched_sap = unmatched_sap[~unmatched_sap["ESTR_ID"].isin(ids_in_group)].copy()
                unmatched_bnk = unmatched_bnk[~unmatched_bnk["DUCO_ID"].isin(matched["DUCO_ID"])].copy()
            else:
                unmatched_sap, unmatched_bnk = self._remove_matched(unmatched_sap, unmatched_bnk, matched)

        non_empty = [m for m in matches if m is not None and not m.empty]
        all_matches = pd.concat(non_empty, ignore_index=True, sort=False) if non_empty else pd.DataFrame()
        ambiguous = self._phase_ambiguous_candidates(unmatched_sap, unmatched_bnk)

        matched_sap_ids = set()
        if not all_matches.empty:
            for _, row in all_matches.iterrows():
                estr_val = row.get("ESTR_ID")
                if isinstance(estr_val, list):
                    matched_sap_ids.update(estr_val)
                elif pd.notna(estr_val):
                    matched_sap_ids.add(estr_val)

        total_sap = len(sap)
        matched_sap_count = len(matched_sap_ids)
        success_rate = (matched_sap_count / total_sap * 100) if total_sap > 0 else 0.0

        return {
            "summary": {
                "total_sap": total_sap,
                "total_bnk": len(bnk),
                "matched_rows": len(all_matches),
                "matched_sap_count": matched_sap_count,
                "unmatched_sap_count": len(unmatched_sap),
                "unmatched_bnk_count": len(unmatched_bnk),
                "ambiguous_candidate_count": len(ambiguous),
                "success_rate_sap": f"{success_rate:.2f}%",
                "tolerance_days": self.tolerance_days,
                "amount_tolerance": self.amount_tolerance,
                "amount_tolerance_pct": self.amount_tolerance_pct,
                "date_logic": f"SAP {self.sap_date_field} vs DUCO ValueDate fallback BookDate",
            },
            "files": {
                "matched": all_matches,
                "ambiguous_matches": ambiguous,
                "unmatched_sap": unmatched_sap,
                "unmatched_bnk": unmatched_bnk,
            },
        }


def df_to_records(df: pd.DataFrame):
    if df.empty:
        return []
    return json.loads(df.to_json(orient="records", date_format="iso"))
