import uuid
import math
import datetime
import re
from difflib import SequenceMatcher
from typing import Dict, List, Any, Optional
from fastapi import APIRouter, HTTPException, Request
import unicodedata
import json

try:
    from rapidfuzz import fuzz as _rfuzz
except Exception:
    _rfuzz = None

from duco_agent import interpret_duco_ai_rule

router = APIRouter(prefix="/api/duco", tags=["DUCO Dataset Pagination"])

# In-memory storage for datasets (identical to Node.js map)
# Key: datasetId, Value: {"fileName": str, "fields": List[Dict], "rows": List[Dict], "createdAt": str}
uploaded_datasets: Dict[str, Dict[str, Any]] = {}

def create_dataset_id() -> str:
    return f"ds_{int(datetime.datetime.now().timestamp() * 1000)}_{uuid.uuid4().hex[:8]}"

def parse_numeric(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    if isinstance(val, (int, float)):
        return float(val) if not math.isnan(val) else None
    text = str(val).strip()
    if not text:
        return None

    import re
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"[^0-9,.-]", "", text)
    if not text or text in {".", ",", "-", "--"}:
        return None

    has_dot = "." in text
    has_comma = "," in text

    if has_dot and has_comma:
        last_dot = text.rfind(".")
        last_comma = text.rfind(",")
        decimal_sep = "." if last_dot > last_comma else ","
        thousand_sep = "," if decimal_sep == "." else "."
        text = text.replace(thousand_sep, "")
        if decimal_sep == ",":
            text = text.replace(",", ".")
    elif has_comma and not has_dot:
        if text.count(",") > 1:
            text = text.replace(",", "")
        else:
            text = text.replace(",", ".")
    elif has_dot and not has_comma:
        if text.count(".") > 1:
            text = text.replace(".", "")

    try:
        return float(text)
    except ValueError:
        return None

def parse_date(val: Any) -> Optional[datetime.datetime]:
    if val is None or val == "":
        return None
    if isinstance(val, datetime.datetime):
        return val
    text = str(val).strip()
    if not text:
        return None
    # Handle dd.mm.yyyy
    import re
    if re.match(r"^\d{2}\.\d{2}\.\d{4}$", text):
        parts = text.split(".")
        try:
            return datetime.datetime(int(parts[2]), int(parts[1]), int(parts[0]))
        except ValueError:
            return None
    try:
        # ISO format or simple date parsing fallback
        # simplified date parser
        from dateutil import parser
        try:
            return parser.parse(text)
        except:
            return None
    except:
        return None

def normalize_text(text: str) -> str:
    if text is None:
        return ""
    text = str(text).strip().lower()
    return "".join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')

def get_field_type(field_key: str, fields: List[Dict]) -> str:
    for f in fields:
        if f.get("key") == field_key:
            return f.get("type", "string")
    return "string"

def match_numeric(row_value: Any, filter_rule: Dict) -> bool:
    numeric_value = parse_numeric(row_value)
    if numeric_value is None:
        return False
    
    op = filter_rule.get("operator")
    vmin = filter_rule.get("min")
    if vmin is None:
        vmin = parse_numeric(filter_rule.get("value"))
    vmax = filter_rule.get("max")
    if vmax is None:
        vmax = parse_numeric(filter_rule.get("valueTo"))

    if op == "equals":
        target = vmin if vmin is not None else vmax
        return target is None or abs(numeric_value - target) <= 0.000001
    if op == "greaterThan":
        return vmin is None or numeric_value >= vmin
    elif op == "lessThan":
        return vmax is None or numeric_value <= vmax
    elif op == "between":
        lower = vmin if vmin is not None else float('-inf')
        upper = vmax if vmax is not None else float('inf')
        return lower <= numeric_value <= upper
    
    # Defaults
    if vmin is not None and vmax is not None:
        return vmin <= numeric_value <= vmax
    if vmin is not None:
        return numeric_value >= vmin
    if vmax is not None:
        return numeric_value <= vmax
        
    return True

def match_date(row_value: Any, filter_rule: Dict) -> bool:
    d = parse_date(row_value)
    if not d:
        return False
    value_timestamp = d.timestamp() * 1000

    def to_ts(v):
        pd = parse_date(v)
        return pd.timestamp() * 1000 if pd else None

    from_ts = filter_rule.get("dateFrom")
    if isinstance(from_ts, str):
        from_ts = to_ts(from_ts)
    if from_ts is None:
        from_ts = to_ts(filter_rule.get("value"))

    to_ts_val = filter_rule.get("dateTo")
    if isinstance(to_ts_val, str):
        to_ts_val = to_ts(to_ts_val)
    if to_ts_val is None:
        to_ts_val = to_ts(filter_rule.get("valueTo"))

    op = filter_rule.get("operator")
    
    if op == "before":
        return to_ts_val is None or value_timestamp <= to_ts_val
    elif op == "after":
        return from_ts is None or value_timestamp >= from_ts
    elif op == "between":
        lower = from_ts if from_ts is not None else float('-inf')
        upper = to_ts_val if to_ts_val is not None else float('inf')
        return lower <= value_timestamp <= upper

    if from_ts is not None and to_ts_val is not None:
        return from_ts <= value_timestamp <= to_ts_val
    if from_ts is not None:
        return value_timestamp >= from_ts
    if to_ts_val is not None:
        return value_timestamp <= to_ts_val
        
    return True

def match_string(row_value: Any, filter_rule: Dict) -> bool:
    raw = str(row_value) if row_value is not None else ""
    norm_val = normalize_text(raw)

    def fuzzy_score(a: str, b: str) -> float:
        if not a or not b:
            return 0.0
        if _rfuzz:
            return float(_rfuzz.ratio(a, b))
        return SequenceMatcher(None, a, b).ratio() * 100.0

    def split_or_terms(term: Any) -> List[str]:
        norm_term = normalize_text(term)
        if not norm_term:
            return []
        parts = re.split(r"\s*(?:\||\bor\b|\bo\b|/)\s*", norm_term)
        parts = [part.strip() for part in parts if part and part.strip()]
        return parts or [norm_term]

    def fuzzy_contains(term: str) -> bool:
        if len(term) < 4:
            return False

        if _rfuzz and _rfuzz.partial_ratio(term, norm_val) >= 84:
            return True

        # Compare against individual tokens to catch typos in multi-word cells,
        # e.g. "franfurt" against "Execution Frankfurt".
        tokens = [tok for tok in re.split(r"[^a-z0-9]+", norm_val) if tok]
        if any(fuzzy_score(term, tok) >= 82 for tok in tokens):
            return True

        # Fallback against the full value when rapidfuzz is unavailable.
        return fuzzy_score(term, norm_val) >= 84

    def fuzzy_equals(term: str) -> bool:
        if len(term) < 4:
            return False
        if _rfuzz:
            return _rfuzz.token_set_ratio(term, norm_val) >= 90
        return fuzzy_score(term, norm_val) >= 90

    def matches_term(term: Any, operator: str) -> bool:
        terms = split_or_terms(term)
        if not terms:
            return True

        if operator == "equals":
            return any(norm_val == part or fuzzy_equals(part) for part in terms)

        return any(part in norm_val or fuzzy_contains(part) for part in terms)
    
    selected = filter_rule.get("selected", [])
    text_logic = str(filter_rule.get("textLogic") or "").upper()
    secondary_search_text = filter_rule.get("secondarySearchText")

    if isinstance(selected, list) and len(selected) > 0:
        primary_match = any(str(item) == raw for item in selected)
        if text_logic == "OR" and secondary_search_text:
            return primary_match or matches_term(secondary_search_text, filter_rule.get("operator") or "equals")
        return primary_match

    search_text = filter_rule.get("searchText")
    if search_text is None:
        search_text = filter_rule.get("value", "")
    operator = filter_rule.get("operator") or "contains"

    if text_logic == "OR" and secondary_search_text is not None:
        return matches_term(search_text, operator) or matches_term(secondary_search_text, operator)

    return matches_term(search_text, operator)

def match_filter(row: Dict, filter_rule: Dict, fields: List[Dict]) -> bool:
    field_key = filter_rule.get("fieldKey")
    if not field_key:
        if "field" in filter_rule and isinstance(filter_rule["field"], dict):
            field_key = filter_rule["field"].get("key")
    if not field_key:
        return True

    ftype = filter_rule.get("type")
    if not ftype and "field" in filter_rule and isinstance(filter_rule["field"], dict):
        ftype = filter_rule["field"].get("type")
    if not ftype:
        ftype = get_field_type(field_key, fields)

    row_val = row.get(field_key)
    if ftype == "numeric":
        return match_numeric(row_val, filter_rule)
    elif ftype == "date":
        return match_date(row_val, filter_rule)
    else:
        return match_string(row_val, filter_rule)

def apply_filters(rows: List[Dict], filters: List[Dict], params: Dict, fields: List[Dict]) -> List[Dict]:
    active_filters = filters if isinstance(filters, list) else []
    filtered = [row for row in rows if all(match_filter(row, f, fields) for f in active_filters)]

    sort_by = str(params.get("sortBy") or "").strip()
    if sort_by:
        sort_dir = params.get("sortDir")
        sort_type = get_field_type(sort_by, fields)
        if params.get("sortType"):
            sort_type = params.get("sortType")
        
        sign = -1 if sort_dir == "desc" else 1

        def sort_key(row):
            val = row.get(sort_by)
            if sort_type == "numeric":
                n = parse_numeric(val)
                return (1 if n is None else 0, n if n is not None else 0)
            elif sort_type == "date":
                d = parse_date(val)
                return (1 if d is None else 0, d.timestamp() if d else 0)
            else:
                return str(val or "").lower()

        filtered.sort(key=sort_key, reverse=(sort_dir == "desc"))

    return filtered

def summarize_rows(rows: List[Dict]) -> Dict:
    total_amt = 0.0
    currency_totals = {}
    for r in rows:
        amt = parse_numeric(r.get("AMOUNT"))
        if amt is not None:
            total_amt += amt
            curr = str(r.get("CURRENCY") or "").strip()
            if curr:
                currency_totals[curr] = currency_totals.get(curr, 0) + amt
    return {
        "amountTotal": total_amt,
        "currencyTotals": currency_totals
    }

def paginate_rows(rows: List[Dict], page: Any, page_size: Any) -> Dict:
    try:
        p = max(0, int(page))
    except (TypeError, ValueError):
        p = 0
    try:
        ps = max(1, int(page_size))
    except (TypeError, ValueError):
        ps = 25
    
    start = p * ps
    return {
        "page": p,
        "pageSize": ps,
        "rows": rows[start:start+ps]
    }

@router.get("/schema")
async def get_schema(datasetId: str):
    if not datasetId:
        raise HTTPException(status_code=400, detail="datasetId is required")
    ds = uploaded_datasets.get(datasetId)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"fields": ds["fields"]}

@router.get("/rows")
async def get_rows(
    datasetId: str, 
    filters: Optional[str] = None, 
    sortBy: Optional[str] = None, 
    sortDir: Optional[str] = None,
    sortType: Optional[str] = None,
    page: str = "0", 
    pageSize: str = "25"
):
    if not datasetId:
        raise HTTPException(status_code=400, detail="datasetId is required")
    ds = uploaded_datasets.get(datasetId)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    parsed_filters = []
    if filters:
        try:
            parsed_filters = json.loads(filters)
        except:
            pass

    filtered_rows = apply_filters(ds["rows"], parsed_filters, {
        "sortBy": sortBy,
        "sortDir": sortDir,
        "sortType": sortType
    }, ds["fields"])

    paginated = paginate_rows(filtered_rows, page, pageSize)

    return {
        "total": len(filtered_rows),
        "page": paginated["page"],
        "pageSize": paginated["pageSize"],
        "rows": paginated["rows"],
        "summary": summarize_rows(filtered_rows),
        "fields": ds["fields"]
    }

@router.post("/datasets")
async def create_dataset(req: Request):
    body = await req.json()
    incoming_rows = body.get("rows", [])
    if not isinstance(incoming_rows, list) or len(incoming_rows) == 0:
        raise HTTPException(status_code=400, detail="rows is required and must be a non-empty array")
    
    rows = []
    for idx, r in enumerate(incoming_rows):
        normalized = {"id": int(r.get("id", idx + 1))}
        for k, v in r.items():
            if k == "id": continue
            normalized[k] = v
        rows.append(normalized)

    fields_in = body.get("fields", [])
    if isinstance(fields_in, list) and len(fields_in) > 0:
        fields = []
        for f in fields_in:
            if not f.get("key"): continue
            fields.append({
                "key": str(f["key"]),
                "label": str(f.get("label", f["key"])),
                "type": f.get("type", "string") if f.get("type") in ["numeric", "date"] else "string"
            })
    else:
        # Fallback to simple inference
        fields = []
        if rows:
            for k in rows[0].keys():
                if k == "id": continue
                fields.append({"key": k, "label": k, "type": "string"})

    dataset_id = create_dataset_id()
    file_name = str(body.get("fileName", "Uploaded file")).strip() or "Uploaded file"

    uploaded_datasets[dataset_id] = {
        "datasetId": dataset_id,
        "fileName": file_name,
        "rows": rows,
        "fields": fields,
        "createdAt": datetime.datetime.now().isoformat()
    }

    return {
        "datasetId": dataset_id,
        "total": len(rows),
        "fileName": file_name,
        "fields": fields
    }

@router.post("/filter")
async def filter_post(req: Request):
    body = await req.json()
    datasetId = body.get("datasetId")
    if not datasetId:
        raise HTTPException(status_code=400, detail="datasetId is required")
    ds = uploaded_datasets.get(datasetId)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    filters = body.get("filters", [])
    filtered_rows = apply_filters(ds["rows"], filters, {
        "sortBy": body.get("sortBy"),
        "sortDir": body.get("sortDir"),
        "sortType": body.get("sortType")
    }, ds["fields"])

    paginated = paginate_rows(filtered_rows, body.get("page", 0), body.get("pageSize", 25))

    return {
        "total": len(filtered_rows),
        "page": paginated["page"],
        "pageSize": paginated["pageSize"],
        "rows": paginated["rows"],
        "summary": summarize_rows(filtered_rows),
        "fields": ds["fields"]
    }


@router.post("/ai-rule")
async def ai_rule(req: Request):
    body = await req.json()
    prompt = str(body.get("prompt", "")).strip()
    dataset_id = str(body.get("datasetId", "")).strip()

    ds = uploaded_datasets.get(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return interpret_duco_ai_rule(ds, prompt)
