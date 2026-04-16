import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { StandardDropZone } from "@/components/StandardDropZone";
import { StandardLoadingOverlay } from "@/components/StandardLoadingOverlay";
import { ducoApi } from "@/api/duco";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  X,
  Search,
  GripVertical,
  CalendarIcon,
  Hash,
  Type,
  DollarSign,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  Download,
  Plus,
  Wand2,
  Info,
} from "lucide-react";
import * as XLSX from "xlsx";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────
type FieldType = "string" | "numeric" | "date";
type RuleOperator = "contains" | "equals" | "greaterThan" | "lessThan" | "between" | "before" | "after";
type TextLogic = "OR";

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  icon: React.ElementType;
}

interface DucoRow {
  id: number;
  [key: string]: string | number;
}

interface ActiveFilter {
  id: string;
  field: FieldDef;
  operator?: RuleOperator;
  // For numeric range
  min?: number;
  max?: number;
  // For date range
  dateFrom?: Date;
  dateTo?: Date;
  // For multi-select
  selected?: string[];
  // For text search
  searchText?: string;
  secondarySearchText?: string;
  textLogic?: TextLogic;
  value?: string;
  valueTo?: string;
  presetLabel?: string;
}

interface RulePreset {
  id: string;
  label: string;
  fieldKey: string;
  operator: RuleOperator;
  value?: string;
  valueTo?: string;
  secondaryValue?: string;
  textLogic?: TextLogic;
}

interface AIInterpretResult {
  filter: ActiveFilter | null;
  note: string;
}

// ─── Field definitions ──────────────────────────────────────────────────────
const FIELDS: FieldDef[] = [
  { key: "SELLER", label: "SELLER", type: "string", icon: Type },
  { key: "BUYER_NAME", label: "BUYER_NAME", type: "string", icon: Type },
  { key: "INVOICE_NR", label: "INVOICE_NR", type: "string", icon: Hash },
  { key: "INVOICE_DT", label: "INVOICE_DT", type: "date", icon: CalendarIcon },
  { key: "DUE_DATE", label: "DUE_DATE", type: "date", icon: CalendarIcon },
  { key: "AMOUNT", label: "AMOUNT", type: "numeric", icon: DollarSign },
  { key: "CURRENCY", label: "CURRENCY", type: "string", icon: Type },
];

// ─── Mock data generation ────────────────────────────────────────────────────
const SELLERS = [
  "MARCEGAGLIA CARBON STEEL",
  "ACME INDUSTRIES GMBH",
  "NORSK HYDRO ASA",
  "THYSSENKRUPP STEEL",
  "ARCELORMITTAL SA",
];

const BUYERS = [
  "BIEBER + MARBURG GMBH CO. KG",
  "SCHMIDT METALLBAU AG",
  "FERRARI ACCIAI SPA",
  "DUPONT MATERIALS BV",
  "KRAUSE HANDELS GMBH",
  "MÜLLER STAHLWERK AG",
  "ROSSI COSTRUZIONI SRL",
  "BERG INDUSTRIETECHNIK",
  "FONTANA FASTENERS SPA",
  "WEBER LOGISTICS GMBH",
];

const CURRENCIES = ["EUR", "EUR", "EUR", "EUR", "EUR", "USD", "GBP"];

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateMockData(): DucoRow[] {
  const rows: DucoRow[] = [];
  for (let i = 0; i < 50; i++) {
    const invDate = randomDate(new Date(2025, 0, 1), new Date(2026, 2, 15));
    const dueDate = new Date(invDate.getTime() + (30 + Math.floor(Math.random() * 60)) * 86400000);
    rows.push({
      id: i + 1,
      SELLER: SELLERS[Math.floor(Math.random() * SELLERS.length)],
      BUYER_NAME: BUYERS[Math.floor(Math.random() * BUYERS.length)],
      INVOICE_NR: `26${46100000 + Math.floor(Math.random() * 99999)}`,
      INVOICE_DT: format(invDate, "dd.MM.yyyy"),
      DUE_DATE: format(dueDate, "dd.MM.yyyy"),
      AMOUNT: Math.round((150 + Math.random() * 149850) * 100) / 100,
      CURRENCY: CURRENCIES[Math.floor(Math.random() * CURRENCIES.length)],
    });
  }
  return rows;
}

const MOCK_DATA = generateMockData();

// ─── Animated number ─────────────────────────────────────────────────────────
function AnimatedNumber({ value, prefix = "", decimals = 0 }: { value: number; prefix?: string; decimals?: number }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    if (from === to) return;

    const duration = 600;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);

  return (
    <span className="font-mono font-bold tabular-nums">
      {prefix}{decimals > 0 ? display.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(display).toLocaleString("de-DE")}
    </span>
  );
}

// ─── Parse date helper ──────────────────────────────────────────────────────
function parseGermanDate(s: string): Date {
  const [d, m, y] = s.split(".");
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
}

function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const text = String(value ?? "").trim();
  if (!text) return null;

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
    const date = parseGermanDate(text);
    return isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function parseNumericLoose(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let text = String(value).trim();
  if (!text) return null;

  text = text
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!text || text === "." || text === "," || text === "-" || text === "--") return null;

  const hasDot = text.includes(".");
  const hasComma = text.includes(",");

  if (hasDot && hasComma) {
    const lastDot = text.lastIndexOf(".");
    const lastComma = text.lastIndexOf(",");
    const decimalSep = lastDot > lastComma ? "." : ",";
    const thousandSep = decimalSep === "." ? "," : ".";
    text = text.split(thousandSep).join("");
    if (decimalSep === ",") text = text.replace(",", ".");
  } else if (hasComma && !hasDot) {
    const commaCount = (text.match(/,/g) || []).length;
    if (commaCount > 1) {
      text = text.replace(/,/g, "");
    } else {
      text = text.replace(",", ".");
    }
  } else if (hasDot && !hasComma) {
    const dotCount = (text.match(/\./g) || []).length;
    if (dotCount > 1) {
      text = text.replace(/\./g, "");
    }
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFieldKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isIdentifierTextFieldKey(key: string): boolean {
  const normalized = normalizeFieldKey(key);
  return (
    normalized === "id" ||
    normalized === "itemid" ||
    normalized === "cuenta" ||
    normalized === "stmtn" ||
    normalized === "stmtpage" ||
    normalized === "gin"
  );
}

function isAmountLikeFieldKey(key: string): boolean {
  const normalized = normalizeFieldKey(key);
  return normalized.includes("amount") || normalized.includes("importe") || normalized === "amt";
}

function inferFieldType(values: Array<string | number>, fieldKey: string): FieldType {
  if (isIdentifierTextFieldKey(fieldKey)) return "string";
  if (isAmountLikeFieldKey(fieldKey)) return "numeric";

  const nonEmpty = values
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0)
    .slice(0, 100);

  if (nonEmpty.length === 0) return "string";

  const numericCount = nonEmpty.filter((v) => parseNumericLoose(v) !== null).length;
  if (numericCount / nonEmpty.length >= 0.9) return "numeric";

  const dateCount = nonEmpty.filter((v) => parseDateValue(v) !== null).length;
  if (dateCount / nonEmpty.length >= 0.8) return "date";

  return "string";
}

function iconForType(type: FieldType): React.ElementType {
  switch (type) {
    case "numeric":
      return DollarSign;
    case "date":
      return CalendarIcon;
    default:
      return Type;
  }
}

  function normalizeText(value: string) {
    return value.trim().toLowerCase();
  }

  function findFieldByName(fields: FieldDef[], name: string) {
    const target = normalizeForMatch(name).replace(/^(?:la|el|the)?\s*(?:columna|campo|variable|field)\s+/i, "").trim();

    const exact = fields.find((field) => {
      const key = normalizeForMatch(field.key);
      const label = normalizeForMatch(field.label);
      return key === target || label === target;
    });
    if (exact) return exact;

    return fields.find((field) => {
      const key = normalizeForMatch(field.key);
      const label = normalizeForMatch(field.label);
      return key.includes(target) || label.includes(target) || target.includes(key) || target.includes(label);
    });
  }

  function cleanRuleValue(value: string) {
    return value
      .trim()
      .replace(/^['"`]+|['"`]+$/g, "")
      .replace(/[.;,]+$/g, "")
      .trim();
  }

  function parseOperatorToken(token: string): RuleOperator | null {
    switch (token.toLowerCase()) {
      case "contains":
      case "contiene":
        return "contains";
      case "equals":
      case "=":
      case "==":
      case "es":
        return "equals";
      case ">":
      case "greaterthan":
      case "greater":
        return "greaterThan";
      case "<":
      case "lessthan":
      case "less":
        return "lessThan";
      case "between":
      case "entre":
        return "between";
      case "before":
      case "antes":
        return "before";
      case "after":
      case "despues":
      case "después":
        return "after";
      default:
        return null;
    }
  }

  function presetToFilter(preset: RulePreset, fields: FieldDef[]): ActiveFilter | null {
    const field = fields.find((item) => item.key === preset.fieldKey);
    if (!field) return null;

    const filter: ActiveFilter = { id: crypto.randomUUID(), field, operator: preset.operator, presetLabel: preset.label };

    switch (preset.operator) {
      case "contains":
        filter.searchText = preset.value ?? "";
        if (preset.textLogic === "OR" && preset.secondaryValue) {
          filter.secondarySearchText = preset.secondaryValue;
          filter.textLogic = "OR";
        }
        break;
      case "equals":
        if (field.type === "numeric") {
          const parsed = parseNumericLoose(preset.value);
          if (parsed !== null) {
            filter.min = parsed;
            filter.max = parsed;
          }
        } else if (field.type === "date") {
          const parsedDate = preset.value ? parseDateValue(preset.value) : null;
          if (parsedDate) {
            filter.dateFrom = parsedDate;
            filter.dateTo = parsedDate;
          }
        } else {
          filter.selected = preset.value ? [preset.value] : [];
          if (preset.textLogic === "OR" && preset.secondaryValue) {
            filter.secondarySearchText = preset.secondaryValue;
            filter.textLogic = "OR";
          }
        }
        break;
      case "greaterThan":
        if (field.type === "numeric") filter.min = Number(preset.value ?? 0);
        if (field.type === "date" && preset.value) filter.dateFrom = parseDateValue(preset.value) ?? undefined;
        break;
      case "lessThan":
        if (field.type === "numeric") filter.max = Number(preset.value ?? 0);
        if (field.type === "date" && preset.value) filter.dateTo = parseDateValue(preset.value) ?? undefined;
        break;
      case "between":
        if (field.type === "numeric") {
          filter.min = Number(preset.value ?? 0);
          filter.max = Number(preset.valueTo ?? 0);
        }
        if (field.type === "date") {
          filter.dateFrom = preset.value ? parseDateValue(preset.value) ?? undefined : undefined;
          filter.dateTo = preset.valueTo ? parseDateValue(preset.valueTo) ?? undefined : undefined;
        }
        break;
      case "before":
        filter.dateTo = preset.value ? parseDateValue(preset.value) ?? undefined : undefined;
        break;
      case "after":
        filter.dateFrom = preset.value ? parseDateValue(preset.value) ?? undefined : undefined;
        break;
    }

    return filter;
  }

  function parseQuickRule(expression: string, fields: FieldDef[]): ActiveFilter | null {
    const normalized = expression.trim().replace(/\s+/g, " ");
    if (!normalized) return null;

    const betweenMatch = normalized.match(/^(.+?)\s+(?:between|entre)\s+(.+?)\s+(?:and|y)\s+(.+)$/i);
    if (betweenMatch) {
      const field = findFieldByName(fields, betweenMatch[1]);
      if (!field) return null;
      return presetToFilter(
        {
          id: crypto.randomUUID(),
          label: normalized,
          fieldKey: field.key,
          operator: "between",
          value: cleanRuleValue(betweenMatch[2]),
          valueTo: cleanRuleValue(betweenMatch[3]),
        },
        fields
      );
    }

    const compareMatch = normalized.match(/^(.+?)\s*(>=|<=|>|<|=|==)\s*(.+)$/i);
    if (compareMatch) {
      const field = findFieldByName(fields, compareMatch[1]);
      if (!field) return null;
      const op = compareMatch[2];
      const value = cleanRuleValue(compareMatch[3]);
      const operator = op === ">" || op === ">=" ? "greaterThan" : op === "<" || op === "<=" ? "lessThan" : "equals";
      return presetToFilter({ id: crypto.randomUUID(), label: normalized, fieldKey: field.key, operator, value }, fields);
    }

    const compareWords = normalized.match(/^(.+?)\s+(?:mayor que|greater than|menor que|less than)\s+(.+)$/i);
    if (compareWords) {
      const field = findFieldByName(fields, compareWords[1]);
      if (!field) return null;
      const opToken = normalizeForMatch(normalized);
      const operator = opToken.includes("mayor que") || opToken.includes("greater than") ? "greaterThan" : "lessThan";
      return presetToFilter(
        {
          id: crypto.randomUUID(),
          label: normalized,
          fieldKey: field.key,
          operator,
          value: cleanRuleValue(compareWords[2]).replace(/,/g, "."),
        },
        fields
      );
    }

    const containsMatch = normalized.match(/^(.+?)\s+(?:contains|contiene|incluye|includes?)\s+(.+)$/i);
    if (containsMatch) {
      const field = findFieldByName(fields, containsMatch[1]);
      if (!field) return null;
      return presetToFilter(
        { id: crypto.randomUUID(), label: normalized, fieldKey: field.key, operator: "contains", value: cleanRuleValue(containsMatch[2]) },
        fields
      );
    }

    const searchInField = normalized.match(/^(?:buscar|busca|find|search)\s+(.+?)\s+(?:en|in)\s+(.+)$/i);
    if (searchInField) {
      const field = findFieldByName(fields, searchInField[2]);
      if (!field) return null;
      return presetToFilter(
        { id: crypto.randomUUID(), label: normalized, fieldKey: field.key, operator: "contains", value: cleanRuleValue(searchInField[1]) },
        fields
      );
    }

    const exactMatch = normalized.match(/^(.+?)\s+(?:is|es|equals?|igual a|igual)\s+(.+)$/i);
    if (exactMatch) {
      const field = findFieldByName(fields, exactMatch[1]);
      if (!field) return null;
      return presetToFilter(
        { id: crypto.randomUUID(), label: normalized, fieldKey: field.key, operator: "equals", value: cleanRuleValue(exactMatch[2]) },
        fields
      );
    }

    return null;
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findFieldByHint(fields: FieldDef[], hint: string): FieldDef | undefined {
  const normalizedHint = normalizeForMatch(hint);
  if (!normalizedHint) return undefined;

  const exact = fields.find((field) => {
    const key = normalizeForMatch(field.key);
    const label = normalizeForMatch(field.label);
    return key === normalizedHint || label === normalizedHint;
  });
  if (exact) return exact;

  return fields.find((field) => {
    const key = normalizeForMatch(field.key);
    const label = normalizeForMatch(field.label);
    return key.includes(normalizedHint) || label.includes(normalizedHint) || normalizedHint.includes(key) || normalizedHint.includes(label);
  });
}

function pickBestTextField(fields: FieldDef[]): FieldDef | undefined {
  const textFields = fields.filter((field) => field.type === "string");
  if (!textFields.length) return undefined;

  const preferredTokens = ["text", "texto", "desc", "label", "comment", "status", "workflow", "group", "input"];
  const preferred = textFields.find((field) => {
    const key = normalizeForMatch(field.key);
    return preferredTokens.some((token) => key.includes(token));
  });

  return preferred ?? textFields[0];
}

function pickBestTextFieldForTerm(fields: FieldDef[], data: DucoRow[], term: string, hintedField?: FieldDef): FieldDef | undefined {
  if (hintedField && hintedField.type === "string") {
    return hintedField;
  }

  const cleanTerm = normalizeForMatch(term);
  const textFields = fields.filter((field) => field.type === "string");
  if (!textFields.length) return undefined;

  let bestField: FieldDef | undefined;
  let bestScore = -1;

  for (const field of textFields) {
    const score = data.reduce((acc, row) => {
      const value = normalizeForMatch(String((row as any)[field.key] ?? ""));
      return value.includes(cleanTerm) ? acc + 1 : acc;
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestField = field;
    }
  }

  return bestField ?? pickBestTextField(fields);
}

function aiPreset(label: string, field: FieldDef, operator: RuleOperator, value?: string, valueTo?: string): RulePreset {
  return {
    id: crypto.randomUUID(),
    label,
    fieldKey: field.key,
    operator,
    value,
    valueTo,
  };
}

function interpretRuleWithAI(text: string, fields: FieldDef[], data: DucoRow[]): AIInterpretResult {
  const input = text.trim();
  if (!input) return { filter: null, note: "Escribe una instruccion para interpretar." };

  const direct = parseQuickRule(input, fields);
  if (direct) return { filter: direct, note: "Regla interpretada con formato estructurado." };

  const normalized = normalizeForMatch(input);

  const containsInField = normalized.match(/(?:buscar|busca|encuentra|find|search)\s+(.+?)\s+(?:en|in)\s+(?:(?:la|el|the)\s+)?(?:(?:columna|campo|variable|field)\s+)?(.+)$/i);
  if (containsInField) {
    const term = cleanRuleValue(containsInField[1]);
    const hinted = findFieldByHint(fields, containsInField[2]);
    const field = pickBestTextFieldForTerm(fields, data, term, hinted);
    if (field) {
      return {
        filter: presetToFilter(aiPreset(`AI: ${input}`, field, "contains", term), fields),
        note: `Detectado filtro de texto sobre ${field.label}.`,
      };
    }
  }

  const whereEquals = normalized.match(/(?:donde|where)\s+(.+?)\s+(?:es|sea|is|equals?)\s+(.+)$/i);
  if (whereEquals) {
    const field = findFieldByHint(fields, whereEquals[1]);
    const value = whereEquals[2].trim();
    if (field) {
      return {
        filter: presetToFilter(aiPreset(`AI: ${input}`, field, "equals", value), fields),
        note: `Detectada condicion de igualdad en ${field.label}.`,
      };
    }
  }

  const whereContains = normalized.match(/(?:donde|where)\s+(.+?)\s+(?:contiene|contains|incluye|includes?)\s+(.+)$/i);
  if (whereContains) {
    const field = findFieldByHint(fields, whereContains[1]);
    const value = cleanRuleValue(whereContains[2]);
    if (field) {
      return {
        filter: presetToFilter(aiPreset(`AI: ${input}`, field, "contains", value), fields),
        note: `Detectada busqueda de texto en ${field.label}.`,
      };
    }
  }

  const greaterThan = normalized.match(/(.+?)\s+(?:mayor que|greater than)\s+([\d.,]+)$/i);
  if (greaterThan) {
    const field = findFieldByHint(fields, greaterThan[1]);
    const value = greaterThan[2].replace(",", ".");
    if (field && field.type !== "string") {
      return {
        filter: presetToFilter(aiPreset(`AI: ${input}`, field, "greaterThan", value), fields),
        note: `Detectado umbral minimo en ${field.label}.`,
      };
    }
  }

  const lessThan = normalized.match(/(.+?)\s+(?:menor que|less than)\s+([\d.,]+)$/i);
  if (lessThan) {
    const field = findFieldByHint(fields, lessThan[1]);
    const value = lessThan[2].replace(",", ".");
    if (field && field.type !== "string") {
      return {
        filter: presetToFilter(aiPreset(`AI: ${input}`, field, "lessThan", value), fields),
        note: `Detectado umbral maximo en ${field.label}.`,
      };
    }
  }

  const between = normalized.match(/(.+?)\s+(?:entre|between)\s+([\d./-]+)\s+(?:y|and)\s+([\d./-]+)$/i);
  if (between) {
    const field = findFieldByHint(fields, between[1]);
    if (field) {
      return {
        filter: presetToFilter(aiPreset(`AI: ${input}`, field, "between", between[2], between[3]), fields),
        note: `Detectado rango para ${field.label}.`,
      };
    }
  }

  const genericSearch = normalized.match(/(?:buscar|busca|encuentra|find|search)\s+(.+)$/i);
  if (genericSearch) {
    const field = pickBestTextFieldForTerm(fields, data, genericSearch[1]);
    if (field) {
      const term = genericSearch[1].trim();
      const hits = data.reduce((acc, row) => {
        const value = normalizeForMatch(String((row as any)[field.key] ?? ""));
        return value.includes(normalizeForMatch(term)) ? acc + 1 : acc;
      }, 0);

      if (hits === 0) {
        return {
          filter: null,
          note: `No encontre coincidencias para '${term}' en columnas de texto.`,
        };
      }

      return {
        filter: presetToFilter(aiPreset(`AI: ${input}`, field, "contains", term), fields),
        note: `No se indico columna; se uso ${field.label}.`,
      };
    }
  }

  return {
    filter: null,
    note: "No se pudo interpretar automaticamente. Usa AI Agent con una instruccion mas especifica o crea una New rule.",
  };
}

function buildFieldsFromData(rows: DucoRow[]): FieldDef[] {
  if (rows.length === 0) return [];
  const keys = Object.keys(rows[0]).filter((k) => k !== "id");

  return keys.map((key) => {
    const values = rows.map((r) => r[key] ?? "");
    const type = inferFieldType(values, key);
    return {
      key,
      label: key,
      type,
      icon: iconForType(type),
    };
  });
}

function parseUploadedFile(file: File): Promise<DucoRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        if (!data) throw new Error("Unable to read file");

        const wb = XLSX.read(data, { type: "array" });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
          defval: "",
          raw: false,
        });

        const parsedRows: DucoRow[] = rawRows.map((row, idx) => {
          const clean: DucoRow = { id: idx + 1 };
          for (const [key, value] of Object.entries(row)) {
            const normalized = typeof value === "string" ? value.trim() : value;
            const asNumber = Number(String(normalized).replace(/,/g, "."));
            clean[key] = String(normalized ?? "").trim() !== "" && !isNaN(asNumber) ? asNumber : String(normalized ?? "");
          }
          return clean;
        });

        resolve(parsedRows);
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Invalid file"));
      }
    };

    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsArrayBuffer(file);
  });
}

// ─── File upload phase ──────────────────────────────────────────────────────
function FileUploadPhase({ onLoaded }: { onLoaded: (payload: { data: DucoRow[]; fields: FieldDef[]; fileName: string }) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleProcess = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const rows = await parseUploadedFile(file);
      if (rows.length === 0) {
        toast.error("The selected file has no rows");
        return;
      }
      const fields = buildFieldsFromData(rows);
      if (fields.length === 0) {
        toast.error("No columns were detected in the selected file");
        return;
      }

      toast.success(`File processed — ${rows.length} records loaded`);
      onLoaded({ data: rows, fields, fileName: file.name });
    } catch {
      toast.error("Unable to process file. Please upload a valid CSV/XLSX file.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 max-w-2xl mx-auto">
      <div className="text-center">
        <FileSpreadsheet className="h-12 w-12 text-primary mx-auto mb-3" />
        <h2 className="text-2xl font-bold text-foreground">DUCO Selection</h2>
        <p className="text-muted-foreground mt-1 max-w-xl">
          Carga el archivo de <span className="font-medium text-foreground">DUCO</span> y define las{" "}
          <span className="font-medium text-foreground">reglas de filtrado</span> para preparar la cartera antes de la validación.
        </p>
      </div>

      <StandardDropZone
        file={file}
        onFileSelect={setFile}
        title="Archivo DUCO"
        subtitle="Arrastra el archivo o haz clic para seleccionarlo (.csv, .xlsx)"
        accentColor="blue"
      />

      <div className="flex flex-col sm:flex-row justify-center gap-3">
        <Button
          onClick={handleProcess}
          disabled={!file || loading}
          size="lg"
          className="bg-red-600 text-white hover:bg-red-700 min-w-[220px]"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
          Procesar Archivos
        </Button>
        <Button variant="outline" size="lg" className="min-w-[190px]" onClick={() => {
          const fields = buildFieldsFromData(MOCK_DATA);
          onLoaded({ data: MOCK_DATA, fields, fileName: "Sample Data" });
          toast.success("Muestra de datos cargada — 50 registros");
        }}>
          Cargar Demo
        </Button>
      </div>

      <StandardLoadingOverlay
        isVisible={loading}
        title="Procesando fichero"
        subtitle="Analizando el archivo DUCO y extrayendo las columnas para el filtrado dinámico."
      />
    </div>
  );
}

// ─── Draggable Field Pill ────────────────────────────────────────────────────
function FieldPill({ field, isActive, onAdd }: { field: FieldDef; isActive: boolean; onAdd: () => void }) {
  const Icon = field.icon;
  return (
    <motion.div
      draggable
      onDragStart={(e: any) => {
        e.dataTransfer?.setData("field-key", field.key);
      }}
      onClick={onAdd}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95, cursor: "grabbing" }}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg cursor-grab select-none transition-colors text-sm font-medium",
        isActive
          ? "bg-primary/10 text-primary border border-primary/20"
          : "bg-card border border-border text-foreground hover:border-primary/30 hover:bg-accent"
      )}
    >
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      <Icon className="h-3.5 w-3.5" />
      <span className="font-mono text-xs">{field.label}</span>
      {isActive && (
        <div className="ml-auto h-2 w-2 rounded-full bg-primary" />
      )}
    </motion.div>
  );
}

// ─── Filter Controls ─────────────────────────────────────────────────────────
function NumericFilter({ filter, data, onChange }: { filter: ActiveFilter; data: DucoRow[]; onChange: (f: ActiveFilter) => void }) {
  const allAmounts = data
    .map((r) => parseNumericLoose((r as any)[filter.field.key]))
    .filter((v): v is number => v !== null);

  const globalMin = allAmounts.length > 0 ? Math.floor(Math.min(...allAmounts)) : 0;
  const globalMax = allAmounts.length > 0 ? Math.ceil(Math.max(...allAmounts)) : 0;
  const rawMin = typeof filter.min === "number" && !isNaN(filter.min) ? filter.min : globalMin;
  const rawMax = typeof filter.max === "number" && !isNaN(filter.max) ? filter.max : globalMax;
  const min = Math.min(rawMin, rawMax);
  const max = Math.max(rawMin, rawMax);
  const step = Math.max(1, Math.ceil((globalMax - globalMin) / 1000));
  const [minInput, setMinInput] = useState(() => min.toLocaleString("de-DE"));
  const [maxInput, setMaxInput] = useState(() => max.toLocaleString("de-DE"));

  useEffect(() => {
    setMinInput(min.toLocaleString("de-DE"));
  }, [min]);

  useEffect(() => {
    setMaxInput(max.toLocaleString("de-DE"));
  }, [max]);

  if (allAmounts.length === 0) {
    return <p className="text-xs text-muted-foreground">No numeric values available</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Min</label>
          <Input
            type="text"
            value={minInput}
            onChange={(e) => {
              const next = e.target.value;
              setMinInput(next);
              const parsed = parseNumericLoose(next);
              if (parsed !== null) onChange({ ...filter, min: parsed });
            }}
            onBlur={() => {
              const parsed = parseNumericLoose(minInput);
              onChange({ ...filter, min: parsed ?? globalMin });
              setMinInput((parsed ?? globalMin).toLocaleString("de-DE"));
            }}
            className="h-8 text-xs font-mono mt-1"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Max</label>
          <Input
            type="text"
            value={maxInput}
            onChange={(e) => {
              const next = e.target.value;
              setMaxInput(next);
              const parsed = parseNumericLoose(next);
              if (parsed !== null) onChange({ ...filter, max: parsed });
            }}
            onBlur={() => {
              const parsed = parseNumericLoose(maxInput);
              onChange({ ...filter, max: parsed ?? globalMax });
              setMaxInput((parsed ?? globalMax).toLocaleString("de-DE"));
            }}
            className="h-8 text-xs font-mono mt-1"
          />
        </div>
      </div>
      <Slider
        min={globalMin}
        max={globalMax}
        step={step}
        value={[min, max]}
        onValueChange={([newMin, newMax]) => onChange({ ...filter, min: newMin, max: newMax })}
        className="py-1"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
        <span>{globalMin.toLocaleString("de-DE")}</span>
        <span>{globalMax.toLocaleString("de-DE")}</span>
      </div>
    </div>
  );
}

function DateFilter({ filter, onChange, fieldKey }: { filter: ActiveFilter; onChange: (f: ActiveFilter) => void; fieldKey: string }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 text-xs justify-start font-normal w-full min-w-0", !filter.dateFrom && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-1.5 h-3 w-3" />
            {filter.dateFrom ? format(filter.dateFrom, "dd.MM.yyyy") : "From"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={filter.dateFrom} onSelect={(d) => onChange({ ...filter, dateFrom: d || undefined })} className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 text-xs justify-start font-normal w-full min-w-0", !filter.dateTo && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-1.5 h-3 w-3" />
            {filter.dateTo ? format(filter.dateTo, "dd.MM.yyyy") : "To"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={filter.dateTo} onSelect={(d) => onChange({ ...filter, dateTo: d || undefined })} className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function MultiSelectFilter({ filter, data, onChange, fieldKey }: { filter: ActiveFilter; data: DucoRow[]; onChange: (f: ActiveFilter) => void; fieldKey: string }) {
  const uniqueValues = useMemo(() => {
    const vals = data.map((r) => String((r as any)[fieldKey] ?? ""));
    return [...new Set(vals)].sort();
  }, [fieldKey, data]);

  const selected = filter.selected ?? [];

  const toggle = (val: string) => {
    const next = selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val];
    onChange({ ...filter, selected: next });
  };

  return (
    <div className="space-y-1.5 max-h-40 overflow-auto">
      {uniqueValues.map((val) => (
        <label key={val} className="flex items-center gap-2 cursor-pointer text-xs hover:bg-accent rounded px-1.5 py-1 transition-colors">
          <Checkbox checked={selected.includes(val)} onCheckedChange={() => toggle(val)} className="h-3.5 w-3.5" />
          <span className="truncate">{val}</span>
        </label>
      ))}
    </div>
  );
}

function TextSearchFilter({ filter, onChange }: { filter: ActiveFilter; onChange: (f: ActiveFilter) => void }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        placeholder="Search text…"
        value={filter.searchText ?? ""}
        onChange={(e) => onChange({ ...filter, searchText: e.target.value })}
        className="pl-8 h-8 text-xs font-mono"
      />
    </div>
  );
}

function CompoundTextSearchFilter({ filter, onChange }: { filter: ActiveFilter; onChange: (f: ActiveFilter) => void }) {
  return (
    <div className="space-y-2">
      <TextSearchFilter filter={filter} onChange={onChange} />
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        <span className="h-px flex-1 bg-border" />
        OR
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Second text condition…"
          value={filter.secondarySearchText ?? ""}
          onChange={(e) => onChange({ ...filter, secondarySearchText: e.target.value, textLogic: "OR" })}
          className="pl-8 h-8 text-xs font-mono"
        />
      </div>
    </div>
  );
}

function formatFilterExpression(filter: ActiveFilter): string {
  const field = filter.field.label;
  const hasMin = typeof filter.min === "number" && !isNaN(filter.min);
  const hasMax = typeof filter.max === "number" && !isNaN(filter.max);

  if (filter.field.type === "numeric" || hasMin || hasMax) {
    if (filter.operator === "equals" && hasMin) return `${field} = ${filter.min}`;
    if (hasMin && hasMax) return `${field} between ${filter.min} and ${filter.max}`;
    if (hasMin) return `${field} >= ${filter.min}`;
    if (hasMax) return `${field} <= ${filter.max}`;
    return `${field} (numeric)`;
  }

  if (filter.field.type === "date") {
    const from = filter.dateFrom ? format(filter.dateFrom, "yyyy-MM-dd") : "";
    const to = filter.dateTo ? format(filter.dateTo, "yyyy-MM-dd") : "";
    if (from && to) return `${field} between ${from} and ${to}`;
    if (from) return `${field} after ${from}`;
    if (to) return `${field} before ${to}`;
    return `${field} (date)`;
  }

  if (filter.secondarySearchText?.trim() && filter.textLogic === "OR") {
    const primary = filter.searchText?.trim() || "...";
    const secondary = filter.secondarySearchText.trim();
    if (filter.operator === "equals") return `${field} is "${primary}" OR "${secondary}"`;
    return `${field} contains "${primary}" OR "${secondary}"`;
  }
  if (filter.searchText?.trim()) return `${field} contains "${filter.searchText.trim()}"`;
  if (filter.selected && filter.selected.length === 1) return `${field} is "${filter.selected[0]}"`;
  if (filter.selected && filter.selected.length > 1) return `${field} in (${filter.selected.join(", ")})`;
  return `${field} (text)`;
}

function formatRulePreview(field: FieldDef | undefined, operator: RuleOperator, value: string, valueTo: string, secondaryValue = "", textLogic?: TextLogic): string {
  if (!field) return "";
  const v = value.trim();
  const v2 = valueTo.trim();
  const v3 = secondaryValue.trim();
  if (!v && operator !== "between") return `${field.label} ${operator}`;

  if (textLogic === "OR" && v3) {
    if (operator === "equals") return `${field.label} is "${v}" OR "${v3}"`;
    return `${field.label} contains "${v}" OR "${v3}"`;
  }

  switch (operator) {
    case "contains":
      return `${field.label} contains "${v}"`;
    case "equals":
      return `${field.label} is "${v}"`;
    case "greaterThan":
      return `${field.label} > ${v}`;
    case "lessThan":
      return `${field.label} < ${v}`;
    case "before":
      return `${field.label} before ${v}`;
    case "after":
      return `${field.label} after ${v}`;
    case "between":
      return `${field.label} between ${v || "..."} and ${v2 || "..."}`;
    default:
      return `${field.label} ${operator} ${v}`;
  }
}

function isApiKeyFallbackError(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("openai_api_key") ||
    text.includes("authentication failed") ||
    text.includes("invalid_api_key") ||
    text.includes("quota exceeded") ||
    text.includes("insufficient_quota")
  );
}

function canUseNumericRangeForFilter(filter: ActiveFilter, data: DucoRow[]): boolean {
  if (filter.field.type === "numeric") return true;
  if (!isIdentifierTextFieldKey(filter.field.key)) return false;

  const nonEmptyValues = data
    .map((row) => (row as any)[filter.field.key])
    .filter((value) => String(value ?? "").trim().length > 0)
    .slice(0, 120);

  if (nonEmptyValues.length === 0) return false;

  const numericLikeCount = nonEmptyValues.filter((value) => parseNumericLoose(value) !== null).length;
  return numericLikeCount / nonEmptyValues.length >= 0.85;
}

function FilterCard({ filter, data, onChange, onRemove }: { filter: ActiveFilter; data: DucoRow[]; onChange: (f: ActiveFilter) => void; onRemove: () => void }) {
  const Icon = filter.field.icon;
  const expression = useMemo(() => formatFilterExpression(filter), [filter]);
  const showNumericRange = useMemo(() => canUseNumericRangeForFilter(filter, data), [data, filter]);
  const renderControl = () => {
    if (showNumericRange) {
      return <NumericFilter filter={filter} data={data} onChange={onChange} />;
    }

    switch (filter.field.type) {
      case "numeric":
        return <NumericFilter filter={filter} data={data} onChange={onChange} />;
      case "date":
        return <DateFilter filter={filter} onChange={onChange} fieldKey={filter.field.key} />;
      default:
        return filter.textLogic === "OR"
          ? <CompoundTextSearchFilter filter={filter} onChange={onChange} />
          : filter.operator === "contains" || (filter.searchText && !filter.selected?.length)
          ? <TextSearchFilter filter={filter} onChange={onChange} />
          : <MultiSelectFilter filter={filter} data={data} onChange={onChange} fieldKey={filter.field.key} />;
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -10 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="w-full bg-card border border-border rounded-xl p-4 shadow-sm"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-xs font-semibold text-foreground break-all">{filter.field.label}</span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-primary/20 text-primary">
            {filter.field.type}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mb-3 rounded-md border border-border bg-muted/30 px-2 py-1.5">
        <p className="text-[10px] text-muted-foreground">Rule expression</p>
        <p className="text-[11px] font-mono text-foreground break-words">{expression}</p>
      </div>
      {renderControl()}
    </motion.div>
  );
}

// ─── Main Query Builder ──────────────────────────────────────────────────────
function QueryBuilder({ data, fields, fileName, datasetId }: { data: DucoRow[]; fields: FieldDef[]; fileName: string; datasetId: string | null }) {
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [page, setPage] = useState(0);
  const [aiRuleText, setAiRuleText] = useState("");
  const [aiRuleLoading, setAiRuleLoading] = useState(false);
  const [showFallbackGuide, setShowFallbackGuide] = useState(false);
  const [customPresets, setCustomPresets] = useState<RulePreset[]>([]);
  const [draggingPresetId, setDraggingPresetId] = useState<string | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [ruleFieldKey, setRuleFieldKey] = useState("");
  const [ruleOperator, setRuleOperator] = useState<RuleOperator>("contains");
  const [ruleValue, setRuleValue] = useState("");
  const [ruleValueTo, setRuleValueTo] = useState("");
  const [ruleSecondaryValue, setRuleSecondaryValue] = useState("");
  const [ruleTextOr, setRuleTextOr] = useState(false);
  const [serverFilteredData, setServerFilteredData] = useState<DucoRow[]>(data);
  const [serverFilterLoading, setServerFilterLoading] = useState(false);
  const [serverFilterError, setServerFilterError] = useState<string | null>(null);
  const [showHorizontalScroll, setShowHorizontalScroll] = useState(false);
  const [horizontalScrollWidth, setHorizontalScrollWidth] = useState(0);
  const dataGridScrollRef = useRef<HTMLDivElement | null>(null);
  const topHorizontalScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollSyncOriginRef = useRef<"grid" | "top" | null>(null);
  const PAGE_SIZE = 15;

  const activeFieldKeys = filters.map((f) => f.field.key);

  const addFieldByKey = useCallback((key: string) => {
    if (!key) return;
    const field = fields.find((f) => f.key === key);
    if (!field) return;
    setFilters((prev) => [...prev, { id: crypto.randomUUID(), field }]);
    setPage(0);
  }, [fields]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const key = e.dataTransfer.getData("field-key");
    addFieldByKey(key);
  }, [addFieldByKey]);

  useEffect(() => {
    setFilters([]);
    setPage(0);
    setServerFilteredData(data);
    setServerFilterError(null);
  }, [data, fields]);

  const updateFilter = useCallback((index: number, updated: ActiveFilter) => {
    setFilters((prev) => prev.map((f, i) => (i === index ? updated : f)));
    setPage(0);
  }, []);

  const removeFilter = useCallback((index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index));
    setPage(0);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!datasetId) {
      setServerFilteredData(data);
      setServerFilterLoading(false);
      setServerFilterError("No backend dataset id available for filtering.");
      return () => {
        cancelled = true;
      };
    }

    const resolveOperator = (filter: ActiveFilter): RuleOperator => {
      if (filter.operator) return filter.operator;

      const hasMin = typeof filter.min === "number" && !isNaN(filter.min);
      const hasMax = typeof filter.max === "number" && !isNaN(filter.max);
      if (hasMin && hasMax) return "between";
      if (hasMin) return "greaterThan";
      if (hasMax) return "lessThan";

      if (filter.field.type === "numeric") {
        return "between";
      }

      if (filter.field.type === "date") {
        if (filter.dateFrom && filter.dateTo) return "between";
        if (filter.dateFrom) return "after";
        if (filter.dateTo) return "before";
        return "between";
      }

      if (filter.selected && filter.selected.length > 0) return "equals";
      return "contains";
    };

    const runServerFilter = async () => {
      setServerFilterLoading(true);
      setServerFilterError(null);

      try {
        const payload = {
          datasetId,
          filters: filters.map((filter) => ({
            fieldKey: filter.field.key,
            type: (typeof filter.min === "number" && !isNaN(filter.min)) || (typeof filter.max === "number" && !isNaN(filter.max))
              ? "numeric"
              : filter.field.type,
            operator: resolveOperator(filter),
            min: filter.min,
            max: filter.max,
            dateFrom: filter.dateFrom ? format(filter.dateFrom, "dd.MM.yyyy") : undefined,
            dateTo: filter.dateTo ? format(filter.dateTo, "dd.MM.yyyy") : undefined,
            selected: filter.selected,
            searchText: filter.searchText,
            secondarySearchText: filter.secondarySearchText,
            textLogic: filter.textLogic,
          })),
          page: 0,
          pageSize: Math.max(data.length, 1),
        };

        const result = await ducoApi.filter(payload);
        if (!cancelled) {
          setServerFilteredData(Array.isArray(result.rows) ? result.rows : []);
          setPage(0);
        }
      } catch {
        if (!cancelled) {
          setServerFilterError("Backend filtering failed. Check backend_miguel service.");
          setServerFilteredData([]);
          setPage(0);
        }
      } finally {
        if (!cancelled) {
          setServerFilterLoading(false);
        }
      }
    };

    runServerFilter();

    return () => {
      cancelled = true;
    };
  }, [data, datasetId, filters]);

  const filteredData = serverFilteredData;

  const totalField = useMemo(() => fields.find((f) => f.key.toUpperCase() === "AMOUNT" && f.type === "numeric") ?? fields.find((f) => f.type === "numeric"), [fields]);
  const visibleFields = useMemo(() => {
    return fields.filter((field) => {
      return data.some((row) => String((row as any)[field.key] ?? "").trim().length > 0);
    });
  }, [data, fields]);

  const ruleField = useMemo(() => fields.find((field) => field.key === ruleFieldKey) ?? fields[0], [fields, ruleFieldKey]);

  useEffect(() => {
    if (!fields.length) return;
    setRuleFieldKey((current) => (current && fields.some((field) => field.key === current) ? current : fields[0].key));
  }, [fields]);

  useEffect(() => {
    if (!ruleField) return;
    if (!ruleDialogOpen) return;
    if (!ruleName) {
      const defaultOperator: RuleOperator = ruleField.type === "string" ? "contains" : "between";
      setRuleName(`${ruleField.label} ${defaultOperator}`);
    }
  }, [ruleDialogOpen, ruleField, ruleName]);

  useEffect(() => {
    if (!ruleField || ruleField.type !== "string") {
      setRuleTextOr(false);
      setRuleSecondaryValue("");
      return;
    }
    if (!ruleTextOr) setRuleSecondaryValue("");
  }, [ruleField, ruleTextOr]);

  const addActiveFilter = useCallback((filter: ActiveFilter) => {
    if (!filter.field) return;
    setFilters((prev) => [...prev, { ...filter, id: filter.id || crypto.randomUUID() }]);
    setPage(0);
  }, []);

  const applyPreset = useCallback((preset: RulePreset) => {
    const filter = presetToFilter(preset, fields);
    if (!filter) {
      toast.error("Unable to apply the selected rule");
      return;
    }
    addActiveFilter(filter);
  }, [addActiveFilter, fields]);

  const removeCustomPreset = useCallback((presetId: string) => {
    setCustomPresets((prev) => prev.filter((preset) => preset.id !== presetId));
  }, []);

  const reorderCustomPresets = useCallback((sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setCustomPresets((prev) => {
      const sourceIndex = prev.findIndex((item) => item.id === sourceId);
      const targetIndex = prev.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;

      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }, []);

  const handleAIRule = useCallback(async () => {
    const prompt = aiRuleText.trim();
    if (!prompt) {
      toast.error("Escribe una instruccion para el AI Agent");
      return;
    }
    if (!datasetId) {
      toast.error("No hay dataset activo para interpretar reglas");
      return;
    }

    setAiRuleLoading(true);
    try {
      const result = await ducoApi.interpretAIRule({ datasetId, prompt });
      const field = fields.find((item) => item.key === result.fieldKey);
      if (!field) {
        throw new Error("AI selected an unknown field");
      }

      const filter = presetToFilter(
        aiPreset(`AI: ${prompt}`, field, result.operator, result.value ?? "", result.valueTo ?? ""),
        fields
      );

      if (!filter) {
        throw new Error("Unable to convert AI rule into filter");
      }

      addActiveFilter(filter);
      setAiRuleText("");
      setShowFallbackGuide(false);
      toast.success(result.note || "Regla creada por AI Agent");
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI Agent no pudo interpretar la regla";
      const apiKeyFailure = isApiKeyFallbackError(message);
      const local = interpretRuleWithAI(prompt, fields, data);
      if (local.filter) {
        addActiveFilter(local.filter);
        setAiRuleText("");
        setShowFallbackGuide(apiKeyFailure);
        toast.success(apiKeyFailure ? `Fallback local activado: ${local.note}` : `Fallback local: ${local.note}`);
      } else {
        setShowFallbackGuide(apiKeyFailure);
        toast.error(`${message}. Ademas, el fallback local no pudo interpretar la instruccion.`);
      }
    } finally {
      setAiRuleLoading(false);
    }
  }, [addActiveFilter, aiRuleText, data, datasetId, fields]);

  const createPreset = useCallback(() => {
    if (!ruleField) {
      toast.error("Select a field first");
      return;
    }

    if ((ruleOperator === "between" && (!ruleValue || !ruleValueTo)) || ((ruleOperator === "greaterThan" || ruleOperator === "lessThan" || ruleOperator === "before" || ruleOperator === "after" || ruleOperator === "contains" || ruleOperator === "equals") && !ruleValue)) {
      toast.error("Fill in the rule values first");
      return;
    }

    if (ruleField.type === "string" && ruleTextOr && !ruleSecondaryValue.trim()) {
      toast.error("Fill in the second text condition for OR");
      return;
    }

    const preset: RulePreset = {
      id: crypto.randomUUID(),
      label: ruleName.trim() || `${ruleField.label} ${ruleOperator}`,
      fieldKey: ruleField.key,
      operator: ruleOperator,
      value: ruleValue.trim(),
      valueTo: ruleValueTo.trim(),
      secondaryValue: ruleField.type === "string" && ruleTextOr ? ruleSecondaryValue.trim() : undefined,
      textLogic: ruleField.type === "string" && ruleTextOr ? "OR" : undefined,
    };

    setCustomPresets((prev) => [preset, ...prev]);
    setRuleDialogOpen(false);
    setRuleName("");
    setRuleValue("");
    setRuleValueTo("");
    setRuleSecondaryValue("");
    setRuleTextOr(false);
    setRuleOperator(ruleField.type === "string" ? "contains" : "between");
    toast.success("New rule created");
  }, [ruleField, ruleName, ruleOperator, ruleSecondaryValue, ruleTextOr, ruleValue, ruleValueTo]);

  const fieldOperatorOptions: RuleOperator[] = ruleField?.type === "string"
    ? ["contains", "equals"]
    : ruleField?.type === "numeric"
      ? ["greaterThan", "lessThan", "equals", "between"]
      : ["before", "after", "between"];

  useEffect(() => {
    if (!ruleField) return;
    if (fieldOperatorOptions.includes(ruleOperator)) return;
    setRuleOperator(fieldOperatorOptions[0]);
  }, [fieldOperatorOptions, ruleField, ruleOperator]);

  const rulePreviewExpression = useMemo(
    () => formatRulePreview(ruleField, ruleOperator, ruleValue, ruleValueTo, ruleSecondaryValue, ruleTextOr ? "OR" : undefined),
    [ruleField, ruleOperator, ruleSecondaryValue, ruleTextOr, ruleValue, ruleValueTo]
  );

  const activeCustomPresets = useMemo(() => customPresets, [customPresets]);
  const totalValue = useMemo(() => {
    if (!totalField) return 0;
    return filteredData.reduce((s, r) => s + (parseNumericLoose((r as any)[totalField.key]) ?? 0), 0);
  }, [filteredData, totalField]);
  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const paginated = filteredData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const syncHorizontalMetrics = useCallback(() => {
    const grid = dataGridScrollRef.current;
    if (!grid) return;

    const hasOverflow = grid.scrollWidth > grid.clientWidth + 1;
    setShowHorizontalScroll(hasOverflow);
    setHorizontalScrollWidth(grid.scrollWidth);

    if (hasOverflow && topHorizontalScrollRef.current) {
      topHorizontalScrollRef.current.scrollLeft = grid.scrollLeft;
    }
  }, []);

  const handleGridScroll = useCallback(() => {
    const grid = dataGridScrollRef.current;
    const top = topHorizontalScrollRef.current;
    if (!grid || !top) return;

    if (scrollSyncOriginRef.current === "top") {
      scrollSyncOriginRef.current = null;
      return;
    }

    scrollSyncOriginRef.current = "grid";
    top.scrollLeft = grid.scrollLeft;
    scrollSyncOriginRef.current = null;
  }, []);

  const handleTopHorizontalScroll = useCallback(() => {
    const grid = dataGridScrollRef.current;
    const top = topHorizontalScrollRef.current;
    if (!grid || !top) return;

    if (scrollSyncOriginRef.current === "grid") {
      scrollSyncOriginRef.current = null;
      return;
    }

    scrollSyncOriginRef.current = "top";
    grid.scrollLeft = top.scrollLeft;
    scrollSyncOriginRef.current = null;
  }, []);

  useEffect(() => {
    syncHorizontalMetrics();
  }, [syncHorizontalMetrics, fields, filteredData.length, paginated.length]);

  useEffect(() => {
    const onResize = () => syncHorizontalMetrics();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [syncHorizontalMetrics]);

  return (
    <div className="grid min-h-full gap-3 p-4 lg:grid-cols-[240px_minmax(0,1fr)_300px]">
      <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-4 shadow-sm overflow-hidden lg:col-start-1 lg:row-start-1">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Active Rules</h3>
                <p className="text-[10px] text-muted-foreground">Rules applied to the current file</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] border-primary/20 text-primary">
              {filters.length} active
            </Badge>
          </div>

          <div
            className={cn(
              "flex-1 rounded-xl border-2 border-dashed p-3 transition-colors overflow-hidden",
              isDragOver ? "border-primary/40 bg-primary/5" : "border-border bg-background/40"
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);

              const fieldKey = e.dataTransfer.getData("field-key");
              if (fieldKey) {
                addFieldByKey(fieldKey);
                return;
              }

              const presetId = e.dataTransfer.getData("custom-preset-id");
              if (presetId) {
                const preset = customPresets.find((item) => item.id === presetId);
                if (preset) applyPreset(preset);
                setDraggingPresetId(null);
              }
            }}
          >
            {filters.length === 0 ? (
              <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 text-center">
                <Filter className="h-6 w-6 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Drop fields here to build the active rule set</p>
                <p className="text-[10px] text-muted-foreground/70 max-w-[240px]">
                  Use the right panel to add fields, ask AI Agent, or create reusable rules.
                </p>
              </div>
            ) : (
              <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
                <AnimatePresence mode="popLayout">
                  {filters.map((filter, i) => (
                    <FilterCard
                      key={filter.id}
                      filter={filter}
                      data={data}
                      onChange={(updated) => updateFilter(i, updated)}
                      onRemove={() => removeFilter(i)}
                    />
                  ))}
                </AnimatePresence>

                <motion.div
                  className={cn(
                    "flex min-h-[72px] items-center justify-center rounded-xl border-2 border-dashed transition-colors",
                    isDragOver ? "border-primary/40 bg-primary/5" : "border-border/70 bg-background/30"
                  )}
                >
                  <span className="text-[10px] text-muted-foreground">Drop more fields here</span>
                </motion.div>
              </div>
            )}
          </div>
        </div>

      <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-4 shadow-sm overflow-hidden lg:col-start-3 lg:row-start-1">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Rule Library</h3>
                <p className="text-[10px] text-muted-foreground">Prebuilt rules, AI Agent, and new rules</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setRuleDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New rule
            </Button>
          </div>

          <div className="grid gap-3 overflow-y-auto pr-1">
            <div className="rounded-xl border border-border p-3 bg-background/60 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-foreground">
                <div className="flex items-center gap-2">
                <Wand2 className="h-3.5 w-3.5 text-primary" />
                AI Agent
                </div>
                {showFallbackGuide && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        aria-label="Fallback local activo"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[320px]">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-foreground">Fallback local activo</p>
                        <p className="text-[11px] text-muted-foreground">
                          El AI Agent usa interpretacion local porque OpenAI no esta disponible con la API key actual.
                        </p>
                        <p className="text-[11px] text-muted-foreground">Escribe con estos formatos:</p>
                        <div className="rounded-md border border-border bg-muted/30 p-2 space-y-1.5">
                          <p className="text-[11px] font-mono">buscar versalis en BUYER_NAME</p>
                          <p className="text-[11px] font-mono">CURRENCY = EUR</p>
                          <p className="text-[11px] font-mono">AMOUNT &gt; 1000</p>
                          <p className="text-[11px] font-mono">AMOUNT entre 1000 y 5000</p>
                          <p className="text-[11px] font-mono">INVOICE_DT between 01.01.2026 and 31.01.2026</p>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              <Input
                value={aiRuleText}
                onChange={(e) => setAiRuleText(e.target.value)}
                placeholder="Ej: buscar versalis en la variable texto"
                className="h-8 text-xs"
                disabled={aiRuleLoading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !aiRuleLoading) {
                    e.preventDefault();
                    handleAIRule();
                  }
                }}
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Interpreta lenguaje natural con GPT-4o mini y crea un filtro automaticamente.
                </p>
                <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={handleAIRule} disabled={aiRuleLoading}>
                  {aiRuleLoading ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      Interpretando
                    </>
                  ) : (
                    "Interpretar"
                  )}
                </Button>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Filter className="h-4 w-4 text-primary" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Available Fields</h4>
              </div>
              <div className="space-y-2 overflow-y-auto pr-1 max-h-[52vh]">
                {visibleFields.map((field) => (
                  <FieldPill
                    key={field.key}
                    field={field}
                    isActive={activeFieldKeys.includes(field.key)}
                    onAdd={() => addFieldByKey(field.key)}
                  />
                ))}
              </div>
            </div>

            {activeCustomPresets.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2 pt-1 border-t border-border">
                  <Wand2 className="h-4 w-4 text-primary" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Custom Rules</h4>
                </div>
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {activeCustomPresets.map((preset) => (
                    <div
                      key={preset.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("custom-preset-id", preset.id);
                        setDraggingPresetId(preset.id);
                      }}
                      onDragEnd={() => setDraggingPresetId(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceId = event.dataTransfer.getData("custom-preset-id") || draggingPresetId;
                        if (sourceId) reorderCustomPresets(sourceId, preset.id);
                        setDraggingPresetId(null);
                      }}
                      className={cn(
                        "relative rounded-lg border border-border bg-background px-3 py-2 transition-colors",
                        "hover:border-primary/30 hover:bg-accent",
                        draggingPresetId === preset.id && "opacity-60"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className="w-full pr-7 text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground truncate">{preset.label}</span>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{preset.operator}</Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 truncate">
                          {preset.fieldKey}{preset.value ? ` · ${preset.value}` : ""}{preset.valueTo ? ` → ${preset.valueTo}` : ""}
                        </p>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-1.5 right-1.5 h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeCustomPreset(preset.id);
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground leading-relaxed pt-1 border-t border-border">
              New rule is for building and saving a reusable rule in a guided way.
            </p>
          </div>
        </div>
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create a new rule</DialogTitle>
            <DialogDescription>
              Define a reusable rule for the current DUCO file. This is the guided option when you want to create a rule without writing text manually.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <label className="text-xs font-medium text-foreground">Rule name</label>
              <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="Text contains Versalis" className="h-9" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-xs font-medium text-foreground">Column</label>
                <Select
                  value={ruleField?.key ?? ruleFieldKey}
                  onValueChange={(value) => {
                    setRuleFieldKey(value);
                    const selectedField = fields.find((field) => field.key === value);
                    if (selectedField) {
                      setRuleOperator(selectedField.type === "string" ? "contains" : selectedField.type === "numeric" ? "between" : "between");
                    }
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select a column" />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((field) => (
                      <SelectItem key={field.key} value={field.key}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-medium text-foreground">Operator</label>
                <Select value={ruleOperator} onValueChange={(value) => setRuleOperator(value as RuleOperator)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select an operator" />
                  </SelectTrigger>
                  <SelectContent>
                    {fieldOperatorOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className={cn("grid gap-4", ruleOperator === "between" ? "md:grid-cols-2" : "md:grid-cols-1")}>
              <div className="grid gap-2">
                <label className="text-xs font-medium text-foreground">Value</label>
                <Input
                  value={ruleValue}
                  onChange={(e) => setRuleValue(e.target.value)}
                  placeholder={ruleField?.type === "date" ? "dd.mm.yyyy" : ruleField?.type === "numeric" ? "1000" : "Versalis"}
                  className="h-9"
                />
              </div>
              {ruleOperator === "between" && (
                <div className="grid gap-2">
                  <label className="text-xs font-medium text-foreground">Value to</label>
                  <Input
                    value={ruleValueTo}
                    onChange={(e) => setRuleValueTo(e.target.value)}
                    placeholder={ruleField?.type === "date" ? "dd.mm.yyyy" : "2000"}
                    className="h-9"
                  />
                </div>
              )}
            </div>

            {ruleField?.type === "string" && (
              <div className="grid gap-3 rounded-lg border border-border bg-background/60 p-3">
                <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <Checkbox checked={ruleTextOr} onCheckedChange={(checked) => setRuleTextOr(Boolean(checked))} />
                  Add second condition with OR
                </label>
                {ruleTextOr && (
                  <div className="grid gap-2">
                    <label className="text-xs font-medium text-foreground">Second value</label>
                    <Input
                      value={ruleSecondaryValue}
                      onChange={(e) => setRuleSecondaryValue(e.target.value)}
                      placeholder={ruleOperator === "equals" ? "Versalis" : "Pending"}
                      className="h-9"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Examples: <span className="font-mono">STATUS contains Pending</span>, <span className="font-mono">AMOUNT &gt; 1000</span>, <span className="font-mono">AGE between 10 and 20</span>
            </div>

            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Preview expression</p>
              <p className="text-xs font-mono text-foreground break-words">{rulePreviewExpression || "-"}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
            <Button onClick={createPreset}>Create rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Content */}
      <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card lg:col-start-2 lg:row-start-1">
        {/* Header Bar */}
        <div className="border-b border-border bg-card px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium font-mono text-foreground">{fileName}</span>
              <Badge variant="outline" className="text-[10px] border-success/20 text-success bg-success/5">{data.length} rows</Badge>
            </div>
            <div className="flex items-center gap-6">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={filteredData.length === 0}
                onClick={() => {
                  const ws = XLSX.utils.json_to_sheet(filteredData.map(({ id, ...rest }) => rest));
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, "Filtered Data");
                  XLSX.writeFile(wb, `DUCO_filtered_${filteredData.length}_rows.xlsx`);
                  toast.success(`Exported ${filteredData.length} rows to Excel`);
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Export Excel
              </Button>
              <div className="h-8 w-px bg-border" />
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Matched Rows</p>
                <p className="text-lg text-foreground">
                  {serverFilterLoading && <Loader2 className="inline-block h-3.5 w-3.5 mr-1 animate-spin" />}
                  <AnimatedNumber value={filteredData.length} />
                  <span className="text-xs text-muted-foreground font-normal ml-1">/ {data.length}</span>
                </p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  {totalField ? `Total ${totalField.label}` : "Total Value"}
                </p>
                <p className="text-lg text-foreground">
                  <AnimatedNumber value={totalValue} prefix="€" decimals={2} />
                </p>
              </div>
            </div>
          </div>
        </div>

        {serverFilterError && (
          <div className="mx-6 mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {serverFilterError}
          </div>
        )}

        {showHorizontalScroll && (
          <div className="px-6 pt-2">
            <div
              ref={topHorizontalScrollRef}
              onScroll={handleTopHorizontalScroll}
              className="h-3 overflow-x-auto overflow-y-hidden rounded-md border border-border/70 bg-muted/25"
              aria-label="DUCO horizontal scrollbar"
            >
              <div style={{ width: horizontalScrollWidth, height: 1 }} />
            </div>
          </div>
        )}

        {/* Data Grid */}
        <div ref={dataGridScrollRef} onScroll={handleGridScroll} className="flex-1 overflow-auto">
          <div className="[&>div]:overflow-visible">
          <Table className="w-max min-w-full">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider w-8">#</TableHead>
                {fields.map((field) => (
                  <TableHead
                    key={field.key}
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wider",
                      field.type === "numeric" ? "text-right" : ""
                    )}
                  >
                    {field.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {paginated.map((row) => (
                  <motion.tr
                    key={row.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="border-b border-border hover:bg-muted/30 text-sm"
                  >
                    <TableCell className="text-[10px] text-muted-foreground font-mono">{row.id}</TableCell>
                    {fields.map((field) => {
                      const raw = (row as any)[field.key];
                      const display = raw === undefined || raw === null || raw === "" ? "-" : String(raw);
                      if (field.type === "numeric") {
                        const numeric = parseNumericLoose(raw);
                        return (
                          <TableCell key={field.key} className="text-right font-mono text-xs">
                            {numeric === null ? display : numeric.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                        );
                      }
                      return (
                        <TableCell key={field.key} className="text-xs truncate max-w-[220px]">
                          {display}
                        </TableCell>
                      );
                    })}
                  </motion.tr>
                ))}
              </AnimatePresence>
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={fields.length + 1} className="h-32 text-center text-muted-foreground">
                    No records match the current filters
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </div>

        {/* Pagination */}
        <div className="border-t border-border bg-card px-6 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {filteredData.length > 0 ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, filteredData.length)} of {filteredData.length} records
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const pageNum = totalPages <= 5 ? i : Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
              return (
                <Button
                  key={pageNum}
                  variant={pageNum === page ? "default" : "outline"}
                  size="icon"
                  className={cn("h-7 w-7 text-[10px]", pageNum === page && "bg-primary text-primary-foreground")}
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum + 1}
                </Button>
              );
            })}
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function DucoPage() {
  const [phase, setPhase] = useState<"upload" | "loading" | "ready">("upload");
  const [loadedData, setLoadedData] = useState<DucoRow[]>([]);
  const [availableFields, setAvailableFields] = useState<FieldDef[]>([]);
  const [loadedFileName, setLoadedFileName] = useState("-");
  const [loadedDatasetId, setLoadedDatasetId] = useState<string | null>(null);

  const handleLoaded = async ({ data, fields, fileName }: { data: DucoRow[]; fields: FieldDef[]; fileName: string }) => {
    setPhase("loading");

    try {
      const payload = {
        fileName,
        rows: data,
        fields: fields.map((field) => ({ key: field.key, label: field.label, type: field.type })),
      };

      const result = await ducoApi.createDataset(payload);
      const datasetId = typeof result.datasetId === "string" ? result.datasetId : null;

      if (!datasetId) {
        throw new Error("Dataset id not returned by backend");
      }

      setLoadedData(data);
      setAvailableFields(fields);
      setLoadedFileName(fileName);
      setLoadedDatasetId(datasetId);
      setPhase("ready");
      toast.success(`Dataset uploaded to backend (${data.length} rows)`);
    } catch {
      setLoadedDatasetId(null);
      setPhase("upload");
      toast.error("No se pudo registrar el dataset en backend_miguel");
    }
  };

  if (phase === "upload") {
    return <FileUploadPhase onLoaded={handleLoaded} />;
  }

  if (phase === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground font-medium">Uploading dataset to backend…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] overflow-y-auto flex flex-col -m-6">
      <QueryBuilder data={loadedData} fields={availableFields} fileName={loadedFileName} datasetId={loadedDatasetId} />
    </div>
  );
}
