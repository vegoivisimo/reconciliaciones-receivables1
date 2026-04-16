import json
import os
import re
from typing import Any, Dict, List, Optional

import requests
from fastapi import HTTPException

try:
    from rapidfuzz import fuzz, process
except Exception:
    fuzz = None
    process = None

try:
    from openai import OpenAI
except Exception:
    OpenAI = None


DUCO_AGENT_PROVIDER = os.getenv("DUCO_AGENT_PROVIDER", "openai").strip().lower() or "openai"
DUCO_AI_MODEL = os.getenv("DUCO_AGENT_MODEL", "").strip()
_duco_openai_key = os.getenv("OPENAI_API_KEY", "").strip()
_duco_gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
duco_openai_client = OpenAI(api_key=_duco_openai_key) if (OpenAI and _duco_openai_key) else None


def get_duco_model(provider: str) -> str:
    if DUCO_AI_MODEL:
        return normalize_gemini_model_name(DUCO_AI_MODEL) if provider == "gemini" else DUCO_AI_MODEL
    if provider == "gemini":
        return "gemini-2.5-flash"
    return "gpt-4o-mini"


def normalize_gemini_model_name(model_name: str) -> str:
    model_name = str(model_name or "").strip()
    model_name = re.split(r"\s+", model_name, maxsplit=1)[0].strip()
    if model_name.startswith("models/"):
        return model_name.split("/", 1)[1]
    return model_name


def extract_gemini_text_payload(response_json: Dict[str, Any]) -> str:
    candidates = response_json.get("candidates") or []
    if not candidates:
        return ""
    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    if not parts:
        return ""
    text = parts[0].get("text")
    return str(text or "")


def build_field_hints(fields: List[Dict], rows: List[Dict]) -> List[Dict[str, Any]]:
    hints: List[Dict[str, Any]] = []
    sample_rows = rows[:40]

    for field in fields:
        key = str(field.get("key", "")).strip()
        if not key:
            continue

        examples: List[str] = []
        for row in sample_rows:
            raw_val = row.get(key)
            if raw_val is None:
                continue
            text = str(raw_val).strip()
            if not text:
                continue
            examples.append(text)
            if len(examples) >= 6:
                break

        hints.append(
            {
                "fieldKey": key,
                "type": field.get("type", "string"),
                "examples": examples,
            }
        )

    return hints


def _normalize_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    return re.sub(r"\s+", " ", text)


def _best_fuzzy_text_match(term: str, candidates: List[str], min_score: int = 82) -> Optional[str]:
    if not process or not fuzz:
        return None

    clean_term = _normalize_text(term)
    if not clean_term:
        return None

    unique_candidates = [candidate for candidate in dict.fromkeys(candidates) if _normalize_text(candidate)]
    if not unique_candidates:
        return None

    match = process.extractOne(clean_term, unique_candidates, scorer=fuzz.partial_ratio)
    if not match:
        return None

    candidate, score, _ = match
    return candidate if score >= min_score else None


def _collect_string_field_values(rows: List[Dict], field_key: str) -> List[str]:
    values: List[str] = []
    for row in rows:
        raw_value = row.get(field_key)
        if raw_value is None:
            continue
        text = str(raw_value).strip()
        if text:
            values.append(text)
    return values


def _maybe_correct_text_value(field_key: str, operator: str, value: str, rows: List[Dict], field_type: str) -> str:
    if field_type != "string" or not value:
        return value
    if operator not in {"contains", "equals"}:
        return value
    if re.search(r"\s*(?:\||\bor\b|\bo\b|/)\s*", value, flags=re.IGNORECASE):
        return value

    candidates = _collect_string_field_values(rows, field_key)
    if not candidates:
        return value

    normalized_value = _normalize_text(value)
    if any(normalized_value in _normalize_text(candidate) for candidate in candidates):
        return value

    best_match = _best_fuzzy_text_match(value, candidates)
    return best_match or value


def interpret_duco_ai_rule(dataset: Dict[str, Any], prompt: str) -> Dict[str, Any]:
    dataset_id = str(dataset.get("datasetId", "")).strip()
    if not dataset_id:
        raise HTTPException(status_code=400, detail="datasetId is required")

    prompt = str(prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    provider = DUCO_AGENT_PROVIDER
    model = get_duco_model(provider)
    if provider not in {"openai", "gemini"}:
        raise HTTPException(status_code=422, detail="DUCO_AGENT_PROVIDER must be 'openai' or 'gemini'")

    if provider == "openai" and duco_openai_client is None:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured in backend")
    if provider == "gemini" and not _duco_gemini_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured in backend")

    fields = dataset.get("fields", [])
    rows = dataset.get("rows", [])
    field_keys = [str(field.get("key", "")).strip() for field in fields if field.get("key")]
    if not field_keys:
        raise HTTPException(status_code=422, detail="Dataset fields are empty")

    field_types = {
        str(field.get("key", "")).strip(): str(field.get("type", "string")).strip() or "string"
        for field in fields
        if field.get("key")
    }

    field_hints = build_field_hints(fields, rows)

    system_prompt = (
        "You convert natural language into one DUCO filter rule. "
        "You must return a single JSON object only, with keys: fieldKey, operator, value, valueTo, note, confidence. "
        "Allowed operators: contains, equals, greaterThan, lessThan, between, before, after. "
        "Use only fieldKey values present in the provided schema. "
        "For operators that need one value, populate value and leave valueTo empty. "
        "For between, fill both value and valueTo. "
        "Do not add markdown or explanations outside JSON."
    )

    user_payload = {
        "instruction": prompt,
        "fieldSchema": field_hints,
        "allowedFieldKeys": field_keys,
    }

    try:
        if provider == "openai":
            response = duco_openai_client.chat.completions.create(
                model=model,
                temperature=0.1,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(user_payload, ensure_ascii=True)},
                ],
            )
            content = (response.choices[0].message.content or "{}").strip()
        else:
            requested_model = normalize_gemini_model_name(model)
            model_candidates = [
                requested_model,
                "gemini-2.5-flash",
                "gemini-flash-latest",
                "gemini-2.5-flash-lite",
            ]
            tried: List[str] = []
            content = ""
            gemini_err_text = ""

            for candidate in model_candidates:
                if not candidate or candidate in tried:
                    continue
                tried.append(candidate)
                gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{candidate}:generateContent?key={_duco_gemini_key}"
                gemini_body = {
                    "systemInstruction": {"parts": [{"text": system_prompt}]},
                    "contents": [
                        {
                            "role": "user",
                            "parts": [{"text": json.dumps(user_payload, ensure_ascii=True)}],
                        }
                    ],
                    "generationConfig": {
                        "temperature": 0.1,
                        "responseMimeType": "application/json",
                    },
                }

                gemini_resp = requests.post(gemini_url, json=gemini_body, timeout=45)
                if gemini_resp.status_code < 400:
                    model = candidate
                    content = extract_gemini_text_payload(gemini_resp.json()).strip() or "{}"
                    break

                gemini_err_text = gemini_resp.text
                if gemini_resp.status_code == 404:
                    continue

                raise Exception(f"Gemini error code: {gemini_resp.status_code} - {gemini_err_text}")

            if not content:
                raise Exception(f"Gemini error code: 404 - {gemini_err_text}")

        if content.startswith("```"):
            content = content.strip("`")
            if content.lower().startswith("json"):
                content = content[4:]
            content = content.strip()

        parsed = json.loads(content)

        field_key = str(parsed.get("fieldKey", "")).strip()
        operator = str(parsed.get("operator", "")).strip()
        value_raw = parsed.get("value")
        value_to_raw = parsed.get("valueTo")
        note = str(parsed.get("note", "")).strip() or "Regla interpretada por AI Agent."
        confidence = parsed.get("confidence", 0.0)

        allowed_operators = {"contains", "equals", "greaterThan", "lessThan", "between", "before", "after"}
        if field_key not in field_keys:
            raise HTTPException(status_code=422, detail="AI selected an invalid fieldKey")
        if operator not in allowed_operators:
            raise HTTPException(status_code=422, detail="AI selected an invalid operator")

        value = "" if value_raw is None else str(value_raw)
        value_to = "" if value_to_raw is None else str(value_to_raw)
        value = _maybe_correct_text_value(field_key, operator, value, rows, field_types.get(field_key, "string"))
        value_to = _maybe_correct_text_value(field_key, operator, value_to, rows, field_types.get(field_key, "string"))
        try:
            confidence_num = float(confidence)
        except (TypeError, ValueError):
            confidence_num = 0.0

        return {
            "fieldKey": field_key,
            "operator": operator,
            "value": value,
            "valueTo": value_to,
            "note": note,
            "confidence": max(0.0, min(1.0, confidence_num)),
            "model": model,
            "provider": provider,
        }
    except HTTPException:
        raise
    except Exception as exc:
        msg = str(exc)
        msg_lower = msg.lower()
        if "gemini error code: 429" in msg_lower or "resource_exhausted" in msg_lower:
            raise HTTPException(
                status_code=429,
                detail="Gemini quota exceeded for GEMINI_API_KEY. Check billing/quotas in Google AI Studio.",
            )
        if "gemini error code: 401" in msg_lower or "gemini error code: 403" in msg_lower or "api key not valid" in msg_lower:
            raise HTTPException(
                status_code=401,
                detail="Gemini authentication failed. Verify GEMINI_API_KEY.",
            )
        if "insufficient_quota" in msg_lower or "error code: 429" in msg_lower:
            raise HTTPException(
                status_code=429,
                detail="OpenAI quota exceeded for OPENAI_API_KEY. Check billing/credits in OpenAI project.",
            )
        if "invalid_api_key" in msg_lower or "error code: 401" in msg_lower:
            raise HTTPException(
                status_code=401,
                detail="OpenAI authentication failed. Verify OPENAI_API_KEY.",
            )
        raise HTTPException(status_code=502, detail=f"AI rule interpretation failed: {msg}")