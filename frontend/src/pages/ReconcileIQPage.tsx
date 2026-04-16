import React, { useEffect, useState, useMemo, useCallback } from "react";
import { StandardDropZone } from "@/components/StandardDropZone";
import { StandardLoadingOverlay } from "@/components/StandardLoadingOverlay";
import { AiInsightsCard, StandardDonutChart, StandardKpiGrid } from "@/components/reconciliation/StandardDashboardWidgets";

import { AlgorithmOverview } from "@/components/reconciliation/AlgorithmOverview";
import * as XLSX from "xlsx";
import { reconcileIqApi } from "@/api/reconcileiq";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  BarChart3,
  Search,
  Filter,
  Brain,
  Eye,
  Database,
  Link2,
  Target,
  Layers,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────
interface SapData {
  attribuzione: string;
  riferimento: string;
  numeroDoc: string;
  importo: number;
  divisa: string;
  dataDoc: string;
  scadenza: string;
  testo: string;
}

interface ComData {
  seller: string;
  buyerName: string;
  invoiceNr: string;
  amount: number;
  currency: string;
  invoiceDt: string;
  dueDate: string;
  description: string;
  intCode: string;
  custCode: string;
  vatCode: string;
  invItem?: string;
}

interface AiData {
  confidence: "HIGH" | "MEDIUM" | "LOW";
  confidenceLabel: string;
  confidenceBadge: string;
  reason: string;
  extractedInvoice: string;
  extractedCompany: string;
  extractedPayment: string;
  currencyMatch: boolean;
  amountMatch: boolean;
  dateMatch: boolean;
}

interface GroupData {
  key: string;
  totalInstalments: number;
  numeroDocList: string[];
  testoList: string[];
}

interface ReconciliationRecord {
  id: string;
  status: string;
  statusLabel: string;
  statusBadge: string;
  priority: number;
  companyName: string;
  invoiceNr: string;
  displayAmount: number;
  currency: string;
  invoiceDate: string;
  dueDate: string;
  amountDiscrepancy: number | null;
  instalmentSummary: string | null;
  sap: SapData | null;
  com: ComData | null;
  ai: AiData | null;
  group: GroupData | null;
  [key: string]: any; // export_ fields
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtEur = (n: number | null | undefined) =>
  `€${(n ?? 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const firstValue = (...values: unknown[]) => {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value);
    }
  }
  return "-";
};

const getDucoOriginalId = (row: Record<string, any>) =>
  firstValue(
    row["DUCO ID Original"],
    row["DUCO Original ID"],
    row["Original DUCO ID"],
    row["ItemId"],
    row["Item ID"],
    row["ID"],
    row["StmtN"],
    row["GIn"],
    row["DUCO ID"],
    row.DUCO_ID
  );

const getDucoMatchId = (row: Record<string, any>) =>
  firstValue(row.DUCO_ID, row["DUCO ID"]);

const formatAmount = (amount: unknown, currency?: unknown) => {
  const normalized = String(amount ?? "").trim().replace(/\./g, "").replace(",", ".");
  const numeric = typeof amount === "number" ? amount : Number(normalized);
  const value = Number.isFinite(numeric)
    ? numeric.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : firstValue(amount);
  const ccy = firstValue(currency);
  return ccy === "-" ? value : `${value} ${ccy}`;
};

function DataItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xs font-medium text-foreground break-words ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

const badgeColor = (color: string): string => {
  const map: Record<string, string> = {
    green: "bg-emerald-100 text-emerald-800 border-emerald-200",
    teal: "bg-teal-100 text-teal-800 border-teal-200",
    blue: "bg-blue-100 text-blue-800 border-blue-200",
    yellow: "bg-amber-100 text-amber-800 border-amber-200",
    orange: "bg-orange-100 text-orange-800 border-orange-200",
    red: "bg-red-100 text-red-800 border-red-200",
  };
  return map[color] || "bg-muted text-muted-foreground";
};

const MATCHED_STATUSES = ["MATCHED", "GROUPED_MATCH", "AI_MATCHED"];
const REVIEW_STATUSES = ["PARTIAL_MATCH", "AI_PARTIAL_MATCH", "AI_LOW_CONFIDENCE"];
const UNMATCHED_STATUSES = ["UNMATCHED_SAP", "UNMATCHED_COMMERCIAL"];
const ALL_STATUSES = [...MATCHED_STATUSES, ...REVIEW_STATUSES, ...UNMATCHED_STATUSES];

const ROWS_PER_PAGE = 20;

// ─── API Result Types ─────────────────────────────────────────────────────────
interface ApiSummary {
  total_sap: number;
  total_bnk: number;
  matched_count?: number;
  matched_sap_count?: number;
  success_rate?: string;
  success_rate_sap?: string;
}

interface ApiResult {
  summary: ApiSummary;
  excel_base64: string;
  data: {
    matched: Record<string, unknown>[];
    ambiguous_matches?: Record<string, unknown>[];
    unmatched_sap: Record<string, unknown>[];
    unmatched_bnk: Record<string, unknown>[];
  };
}

// Helper: trigger Excel download from base64 string
function downloadExcelFromBase64(base64: string, filename = "resultado_conciliacion.xlsx") {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

// ─── Mock API Result (uses curated column names matching backend) ────────────────────
const MOCK_API_RESULT: ApiResult = {
  summary: {
    total_sap: 48,
    total_bnk: 52,
    matched_count: 35,
    success_rate: "72.92%",
  },
  excel_base64: "",
  data: {
    matched: [
      { Fase: "0_Reference_Amount_Date", "SAP Nº Doc": "1800001234", "SAP Riferimento": "SCHMIDT GMBH", "SAP Importe": 12540.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-01-15", "SAP Testo": "Bonifico SCHMIDT ref 7841", "DUCO ID": "0_bnk", "DUCO Importe": 12540.00, "DUCO Divisa": "EUR", "DUCO Fecha": "2026-01-15", "DUCO Descripción": "RECEIPT SCHMIDT GMBH", "Δ Importe": 0, "Δ Días": 0, "Score Semántico": 20 },
      { Fase: "0_Reference_Amount_Date", "SAP Nº Doc": "1800001235", "SAP Riferimento": "MÜLLER AG", "SAP Importe": 8920.50, "SAP Divisa": "EUR", "SAP Fecha": "2026-01-18", "SAP Testo": "Incasso MÜLLER", "DUCO ID": "1_bnk", "DUCO Importe": 8920.50, "DUCO Divisa": "EUR", "DUCO Fecha": "2026-01-18", "DUCO Descripción": "WIRE TRANSFER MÜLLER", "Δ Importe": 0, "Δ Días": 0, "Score Semántico": 20 },
      { Fase: "1_Exact_Date_With_Semantics", "SAP Nº Doc": "1800001236", "SAP Riferimento": "FISCHER KG", "SAP Importe": 4305.75, "SAP Divisa": "EUR", "SAP Fecha": "2026-01-20", "SAP Testo": "Fattura FISCHER 2026-001", "DUCO ID": "2_bnk", "DUCO Importe": 4305.75, "DUCO Divisa": "EUR", "DUCO Fecha": "2026-01-20", "DUCO Descripción": "INV FISCHER KG 2026-001", "Δ Importe": 0, "Δ Días": 0, "Score Semántico": 11 },
      { Fase: "1_Exact_Date_With_Semantics", "SAP Nº Doc": "1800001237", "SAP Riferimento": "BAUER INDUSTRIES", "SAP Importe": 22100.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-01-22", "SAP Testo": "Pago Bauer enero", "DUCO ID": "3_bnk", "DUCO Importe": 22100.00, "DUCO Divisa": "EUR", "DUCO Fecha": "2026-01-22", "DUCO Descripción": "PAYMENT BAUER JAN", "Δ Importe": 0, "Δ Días": 0, "Score Semántico": 11 },
      { Fase: "2_Date_Tolerance_Semantic", "SAP Nº Doc": "1800001238", "SAP Riferimento": "HOFFMANN & CO", "SAP Importe": 15800.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-02-01", "SAP Testo": "Hoffmann facturation", "DUCO ID": "7_bnk", "DUCO Importe": 15800.00, "DUCO Divisa": "EUR", "DUCO Fecha": "2026-02-03", "DUCO Descripción": "HOFFMANN RCPT", "Δ Importe": 0, "Δ Días": 2, "Score Semántico": 10 },
      { Fase: "3_Unique_Amount_Date_Window", "SAP Nº Doc": "1800001239", "SAP Riferimento": "WEBER HOLDING", "SAP Importe": 18600.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-02-14", "SAP Testo": "Weber feb pago", "DUCO ID": "10_bnk", "DUCO Importe": 18600.00, "DUCO Divisa": "EUR", "DUCO Fecha": "2026-02-15", "DUCO Descripción": "WEBER HOLDING FEB", "Δ Importe": 0, "Δ Días": 1, "Score Semántico": 0 },
      { Fase: "4_Many_to_One_Grouped_Semantic", "SAP Nº Doc": "1800001240", "SAP Riferimento": "KELLER GROUP", "SAP Importe": 7200.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-02-20", "SAP Testo": "Keller parcial 1/3", "DUCO ID": "11_bnk", "DUCO Importe": 21600.00, "DUCO Divisa": "EUR", "DUCO Fecha": "2026-02-20", "DUCO Descripción": "KELLER GROUP GROUPED", "Δ Importe": 14400, "Δ Días": 0, "Score Semántico": 10 },
    ],
    ambiguous_matches: [
      {
        ESTR_ID: "sap_amb1", DUCO_ID: "bnk_amb1",
        "SAP Nº Doc": "1800002001", "SAP Riferimento": "AMBIG CORP", "SAP Importe": 4500.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-03-10", "SAP Testo": "Ambig Corp Payout",
        "DUCO Importe": 4500.00, "DUCO Fecha": "2026-03-11", "DUCO Descripción": "AMBIG CORP INC",
        "Motivo Ambigüedad": "multiple_duco_candidates_for_sap",
        "Candidatos SAP": 1, "Candidatos DUCO": 2,
        "Δ Días": 1, "Δ Importe": 0,
        "Score Semántico": 18, Confianza: 85,
        Fase: "Review_Ambiguous",
      },
      {
        ESTR_ID: "sap_amb2", DUCO_ID: "bnk_amb2",
        "SAP Nº Doc": "1800002002", "SAP Riferimento": "TEST SA", "SAP Importe": 2300.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-03-15", "SAP Testo": "Test Payment",
        "DUCO Importe": 2300.00, "DUCO Fecha": "2026-03-19", "DUCO Descripción": "TEST SA WIRE",
        "Motivo Ambigüedad": "low_semantic_evidence",
        "Candidatos SAP": 1, "Candidatos DUCO": 1,
        "Δ Días": 4, "Δ Importe": 0,
        "Score Semántico": 5, Confianza: 45,
        Fase: "Review_Ambiguous",
      }
    ],
    unmatched_sap: [
      { "SAP Nº Doc": "1800003001", "SAP Riferimento": "NEUMANN INDUSTRIES", "SAP Importe": 31400.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-01-30", "SAP Testo": "Neumann inv 2200 — sin contrapartida bancaria" },
      { "SAP Nº Doc": "1800003002", "SAP Riferimento": "ZIMMERMANN KG", "SAP Importe": 8750.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-02-08", "SAP Testo": "Zimmermann cuota — no localizado en banco" },
      { "SAP Nº Doc": "1800003003", "SAP Riferimento": "SEIDEL EXPORT", "SAP Importe": 14320.00, "SAP Divisa": "USD", "SAP Fecha": "2026-02-18", "SAP Testo": "Seidel export USD — divisa no coincide" },
      { "SAP Nº Doc": "1800003004", "SAP Riferimento": "BRANDT METALL", "SAP Importe": 5900.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-03-02", "SAP Testo": "Brandt metall — retraso en banco" },
      { "SAP Nº Doc": "1800003005", "SAP Riferimento": "OTTO GmbH", "SAP Importe": 19500.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-03-08", "SAP Testo": "Otto GmbH — abono pendiente confirmación" },
      { "SAP Nº Doc": "1800003006", "SAP Riferimento": "FRANK & SONS", "SAP Importe": 2200.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-03-10", "SAP Testo": "Frank Sons — importe con diferencia" },
      { "SAP Nº Doc": "1800003007", "SAP Riferimento": "KLEIN HOLDING", "SAP Importe": 8100.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-03-12", "SAP Testo": "Klein holding — sin reflejo DUCO" },
      { "SAP Nº Doc": "1800003008", "SAP Riferimento": "PETER LOGISTIK", "SAP Importe": 6450.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-03-14", "SAP Testo": "Peter logistik — fuera de periodo" },
      { "SAP Nº Doc": "1800003009", "SAP Riferimento": "KAISER GROUP", "SAP Importe": 10800.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-03-15", "SAP Testo": "Kaiser group — partida abierta" },
      { "SAP Nº Doc": "1800003010", "SAP Riferimento": "SCHWARZ AG", "SAP Importe": 3700.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-03-16", "SAP Testo": "Schwarz ag — pendiente revisión" },
      { "SAP Nº Doc": "1800003011", "SAP Riferimento": "LEHMANN STAHL", "SAP Importe": 16200.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-03-17", "SAP Testo": "Lehmann stahl — no cruzado" },
      { "SAP Nº Doc": "1800003012", "SAP Riferimento": "KRAUSE HANDEL", "SAP Importe": 4100.00, "SAP Divisa": "EUR", "SAP Fecha": "2026-03-18", "SAP Testo": "Krause handel — sin match" },
    ],
    unmatched_bnk: [
      { "DUCO ID": "20_bnk", "DUCO Importe": 9200.00, "DUCO Divisa": "EUR", "DUCO Fecha": "2026-01-19", "DUCO Descripción": "TRANSFER REF XK-8821 — no identificado en SAP" },
      { "DUCO ID": "21_bnk", "DUCO Importe": 3450.00, "DUCO Divisa": "EUR", "DUCO Fecha": "2026-02-06", "DUCO Descripción": "WIRE ANONYM CORP — sin referencia SAP" },
      { "DUCO ID": "22_bnk", "DUCO Importe": 22800.00, "DUCO Divisa": "EUR", "DUCO Fecha": "2026-02-16", "DUCO Descripción": "PAYMENT UNKNOWN — referencia no mapeada" },
      { "DUCO ID": "23_bnk", "DUCO Importe": 7100.00, "DUCO Divisa": "GBP", "DUCO Fecha": "2026-03-03", "DUCO Descripción": "INT TRANSFER GBP — divisa sin partida SAP" },
      { "DUCO ID": "24_bnk", "DUCO Importe": 5600.00, "DUCO Divisa": "EUR", "DUCO Fecha": "2026-03-09", "DUCO Descripción": "DIRECT CREDIT 44020 — sin partida abierta" },
    ],
  },
};

// ─── Number Stepper Component ──────────────────────────────────────────────
function NumberStepper({ 
  value, 
  onChange, 
  step = 1, 
  min = 0, 
  prefix = "", 
  suffix = "" 
}: { 
  value: number; 
  onChange: (v: number) => void; 
  step?: number; 
  min?: number; 
  prefix?: string; 
  suffix?: string; 
}) {
  return (
    <div className="flex items-center gap-1 bg-secondary/40 p-1 rounded-lg border border-border/60 group focus-within:border-primary/50 transition-colors">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="flex-1 flex items-center justify-center px-1">
        <span className="text-xs font-medium text-muted-foreground mr-0.5">{prefix}</span>
        <input
          type="number"
          value={value === 0 && prefix === "" && suffix === "" ? "" : value}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const val = e.target.value;
            onChange(val === "" ? 0 : Number(val));
          }}
          className="w-full bg-transparent border-none text-center font-mono text-sm focus:ring-0 p-0 h-auto [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-xs font-medium text-muted-foreground ml-0.5">{suffix}</span>
      </div>
      <button
        type="button"
        onClick={() => onChange(value + step)}
        className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── File Upload Phase ───────────────────────────────────────────────────────
function FileUploadPhase({
  onApiResult,
}: {
  onApiResult: (result: ApiResult) => void;
}) {
  const [sapFile, setSapFile] = useState<File | null>(null);
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOverSap, setDragOverSap] = useState(false);
  const [dragOverBank, setDragOverBank] = useState(false);

  const [toleranceDays, setToleranceDays] = useState<number>(45);
  const [amountTolerance, setAmountTolerance] = useState<number>(0.0);
  const [amountTolerancePct, setAmountTolerancePct] = useState<number>(0.0);
  const [sapDateField, setSapDateField] = useState<string>("Data pagamento");
  const [autoDownload, setAutoDownload] = useState(false);

  const handleDragOver = (setter: (v: boolean) => void) => (e: React.DragEvent) => {
    e.preventDefault();
    setter(true);
  };
  const handleDragLeave = (setter: (v: boolean) => void) => () => setter(false);

  const handleDrop = (setter: (f: File) => void, hoverSetter: (v: boolean) => void) => (e: React.DragEvent) => {
    e.preventDefault();
    hoverSetter(false);
    const f = e.dataTransfer.files[0];
    if (f) setter(f);
  };

  const handleFileInput = (setter: (f: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setter(f);
  };

  const handleReconcile = async () => {
    if (!sapFile || !bankFile) {
      toast.error("Por favor, sube ambos archivos antes de ejecutar la conciliación.");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("sap_file", sapFile);
      formData.append("bank_file", bankFile);
      formData.append("tolerance_days", toleranceDays.toString());
      formData.append("amount_tolerance", amountTolerance.toString());
      formData.append("amount_tolerance_pct", amountTolerancePct.toString());
      formData.append("sap_date_field", sapDateField);

      const json = await reconcileIqApi.reconcile(formData) as unknown as ApiResult;

      if (json.excel_base64) {
        if (autoDownload) {
          downloadExcelFromBase64(json.excel_base64);
          toast.success("¡Conciliación completada! El archivo Excel se ha descargado correctamente.");
        } else {
          toast.success("¡Conciliación completada! Los resultados están listos.");
        }
        // Transition to results dashboard
        onApiResult(json);
      } else {
        toast.error("El servidor no devolvió un archivo Excel válido.");
      }
    } catch (err: any) {
      toast.error(`Error en la conciliación: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const bothSelected = !!sapFile && !!bankFile;

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center py-12 px-4">
      {/* ─── Header ────────────────────────────────────────────── */}
      <div className="text-center mb-10 max-w-2xl">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">
          DUCO-SAP Validation
        </h1>
        <p className="mt-3 text-muted-foreground text-sm leading-relaxed max-w-xl mx-auto">
          Cruza las partidas abiertas de <span className="font-medium text-foreground">SAP</span> contra los
          movimientos bancarios de{" "}
          <span className="font-medium text-foreground">DUCO</span> y obtén el resultado en{" "}
          <span className="font-medium text-foreground">Excel</span> en segundos.
        </p>
      </div>

      {/* ─── Dropzones ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
        <StandardDropZone
          file={sapFile}
          onFileSelect={setSapFile}
          title="Partidas Abiertas (SAP)"
          subtitle="Archivo de extracto SAP con partidas pendientes de conciliar"
          accentColor="blue"
        />
        <StandardDropZone
          file={bankFile}
          onFileSelect={setBankFile}
          title="Extracto Bancario (DUCO)"
          subtitle="Movimientos bancarios exportados desde la plataforma DUCO"
          accentColor="violet"
        />
      </div>

      {/* ─── Dynamic Variables Options (Show if both files selected) ─── */}
      {bothSelected && (
        <div className="mt-8 w-full max-w-3xl bg-card border border-border rounded-xl p-6 shadow-sm animate-in fade-in slide-in-from-bottom-4">
          <h3 className="text-sm font-semibold mb-4 text-foreground flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            Parámetros de Conciliación
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ventana Temporal</label>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase">Días</span>
              </div>
              <NumberStepper value={toleranceDays} onChange={setToleranceDays} suffix="d" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Margen Absoluto</label>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 uppercase">Eur</span>
              </div>
              <NumberStepper value={amountTolerance} onChange={setAmountTolerance} step={0.01} prefix="€" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Margen Relativo</label>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 uppercase">Porcentaje</span>
              </div>
              <NumberStepper value={amountTolerancePct} onChange={setAmountTolerancePct} step={0.1} suffix="%" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Campo de Fecha SAP</label>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 uppercase">Mapeo</span>
              </div>
              <div className="relative">
                <Input 
                  type="text" 
                  value={sapDateField} 
                  onChange={e => setSapDateField(e.target.value)} 
                  className="h-10 bg-secondary/40 border-border/60 text-sm font-mono pr-8 focus-visible:ring-primary/30"
                />
                <Database className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              </div>
            </div>

            {/* Auto Download Toggle */}
            <div className="space-y-2 md:col-span-2 pt-2 border-t border-border/40 mt-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Download className="h-4 w-4 text-primary" />
                    Descarga automática Excel
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Descargar el archivo de resultados inmediatamente al finalizar el proceso.
                  </p>
                </div>
                <Switch checked={autoDownload} onCheckedChange={setAutoDownload} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Action Button ──────────────────────────────────────── */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Button
          id="btn-ejecutar-conciliacion"
          onClick={handleReconcile}
          disabled={!bothSelected || loading}
          size="lg"
          className={`
            min-w-[220px] px-8 h-12 text-sm font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 transition-all duration-200
            ${bothSelected && !loading
              ? "shadow-lg shadow-red-600/20 hover:shadow-xl hover:shadow-red-600/25 hover:-translate-y-0.5"
              : ""
            }
          `}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Procesando cruces...
            </>
          ) : (
            <>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Ejecutar Reconciliación
            </>
          )}
        </Button>

        <Button
          variant="outline"
          size="lg"
          className="min-w-[220px] h-12 rounded-md"
          onClick={() => {
            onApiResult(MOCK_API_RESULT);
            toast.success("Muestra de datos cargada — visualizando el dashboard de resultados");
          }}
          disabled={loading}
        >
          Cargar Demo
        </Button>
      </div>

      {/* ─── Loading overlay ────────────────────────────────────── */}
      <StandardLoadingOverlay
        isVisible={loading}
        title="Ejecutando Conciliación"
        subtitle="Nuestro motor está cruzando las partidas de SAP con los extractos de DUCO."
      />
    </div>
  );
}

// ─── Dashboard View ──────────────────────────────────────────────────────────
function DashboardView({ data, onNavigateToInvoices }: { data: ReconciliationRecord[]; onNavigateToInvoices: (statusGroup?: string[]) => void }) {
  const stats = useMemo(() => {
    const matched = data.filter((r) => MATCHED_STATUSES.includes(r.status)).length;
    const review = data.filter((r) => REVIEW_STATUSES.includes(r.status)).length;
    const unmatched = data.filter((r) => UNMATCHED_STATUSES.includes(r.status)).length;
    const totalAmount = data.reduce((s, r) => s + r.displayAmount, 0);
    return { total: data.length, matched, review, unmatched, totalAmount };
  }, [data]);

  const chartData = useMemo(() => [
    { name: "Matched", value: stats.matched, color: "#10b981" },
    { name: "Needs Review", value: stats.review, color: "#f59e0b" },
    { name: "Unmatched", value: stats.unmatched, color: "#ef4444" },
  ].filter((d) => d.value > 0), [stats]);

  const kpis = [
    { label: "Total Invoices", value: stats.total.toString(), color: "text-foreground", statuses: undefined },
    { label: "Matched", value: stats.matched.toString(), color: "text-emerald-600", badge: "bg-emerald-100 text-emerald-700", statuses: MATCHED_STATUSES },
    { label: "Needs Review", value: stats.review.toString(), color: "text-amber-600", badge: "bg-amber-100 text-amber-700", statuses: REVIEW_STATUSES },
    { label: "Unmatched", value: stats.unmatched.toString(), color: "text-red-600", badge: "bg-red-100 text-red-700", statuses: UNMATCHED_STATUSES },
    { label: "Total Amount (EUR)", value: fmtEur(stats.totalAmount), color: "text-foreground", small: true, statuses: undefined },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((k) => {
          const isClickable = !!k.statuses && parseInt(k.value) > 0;
          return (
            <Card
              key={k.label}
              className={isClickable ? "cursor-pointer transition-all hover:shadow-md hover:ring-2 hover:ring-primary/20 hover:-translate-y-0.5 group" : ""}
              onClick={() => isClickable && k.statuses && onNavigateToInvoices(k.statuses)}
            >
              <CardContent className="pt-5 pb-4 px-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{k.label}</p>
                <p className={`${(k as any).small ? 'text-lg' : 'text-2xl'} font-bold mt-1 font-mono ${k.color}`}>{k.value}</p>
                {isClickable && (
                  <p className="text-[10px] text-muted-foreground mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    <Eye className="h-3 w-3" /> Click to view records
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Distribución de Estados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px] w-full flex items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={chartData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={45} 
                    outerRadius={65} 
                    paddingAngle={5} 
                    dataKey="value" 
                    cornerRadius={5} 
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  >
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.color} className="drop-shadow-md hover:opacity-80 transition-opacity outline-none" />
                    ))}
                  </Pie>
                  <RTooltip 
                    contentStyle={{ 
                      borderRadius: "12px", 
                      border: "1px solid hsl(var(--border))", 
                      background: "hsl(var(--card))",
                      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
                      color: "#ffffff"
                    }} 
                    itemStyle={{ color: "#ffffff" }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    align="center"
                    iconType="circle" 
                    iconSize={8} 
                    wrapperStyle={{ paddingTop: '15px', fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Central Label for a "neater" donut look */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-6">
                <span className="text-xl font-bold text-foreground">{data.length}</span>
                <span className="text-[10px] text-muted-foreground uppercase font-medium mt-0.5">Total</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Empty reserved slot */}
        <Card className="glass-card" />
      </div>

      {/* ── Algorithm Overview ───────────────────────────────────────── */}
      <AlgorithmOverview module="duco" />
    </div>
  );
}

// ─── Detail Drawer ───────────────────────────────────────────────────────────
function DetailDrawer({ record, onClose, onUpdateStatus }: { record: ReconciliationRecord; onClose: () => void; onUpdateStatus?: (id: string, newStatus: string, newLabel: string, newBadge: string) => void }) {
  const { sap, com, ai, group } = record;
  const hasBoth = sap && com;
  const isReviewStatus = REVIEW_STATUSES.includes(record.status);

  const FieldTable = ({ title, fields }: { title: string; fields: [string, string | number | null | undefined][] }) => (
    <div className="flex-1 min-w-0">
      <h4 className="font-semibold text-sm mb-3 text-foreground">{title}</h4>
      <div className="space-y-2">
        {fields.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 text-sm border-b border-border/50 pb-1">
            <span className="text-muted-foreground shrink-0">{k}</span>
            <span className="font-mono text-right truncate">{v != null && v !== "" ? String(v) : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-2xl bg-card shadow-xl overflow-y-auto animate-in slide-in-from-right" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-card z-10 flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-lg">{record.companyName}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badgeColor(record.statusBadge)}`}>{record.statusLabel}</span>
            {ai && <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badgeColor(ai.confidenceBadge)}`}>{ai.confidenceLabel}</span>}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-6">
          {/* SAP & COM panels */}
          <div className={`flex gap-6 ${hasBoth ? "flex-row" : "flex-col"}`}>
            {sap && (
              <FieldTable title="SAP / Estrazione" fields={[
                ["Attribuzione", sap.attribuzione],
                ["Riferimento", sap.riferimento],
                ["Numero Documento", sap.numeroDoc],
                ["Importo", fmtEur(sap.importo)],
                ["Divisa", sap.divisa],
                ["Data Documento", sap.dataDoc],
                ["Scadenza", sap.scadenza],
                ["Testo", sap.testo],
              ]} />
            )}
            {com && (
              <FieldTable title="Collection File (COM)" fields={[
                ["Seller", com.seller],
                ["Buyer", com.buyerName],
                ["Invoice Nr", com.invoiceNr],
                ["Amount", fmtEur(com.amount)],
                ["Currency", com.currency],
                ["Invoice Date", com.invoiceDt],
                ["Due Date", com.dueDate],
                ["Description", com.description],
                ["INT Code", com.intCode],
                ["CUST Code", com.custCode],
                ["VAT Code", com.vatCode],
              ]} />
            )}
          </div>

          {/* AI section */}
          {ai && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-sm text-blue-800">AI Analysis</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badgeColor(ai.confidenceBadge)}`}>{ai.confidenceLabel}</span>
              </div>
              <p className="text-sm text-blue-900">{ai.reason}</p>
              <div className="flex gap-4 text-sm">
                {[["Currency", ai.currencyMatch], ["Amount", ai.amountMatch], ["Date", ai.dateMatch]].map(([label, match]) => (
                  <span key={label as string} className="flex items-center gap-1">
                    {match ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5 text-red-500" />}
                    <span className={match ? "text-emerald-700" : "text-red-600"}>{label as string}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Group section */}
          {group && (
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 space-y-2">
              <h4 className="font-semibold text-sm text-teal-800">Instalment Group</h4>
              <p className="text-sm text-teal-700">Group Key: <span className="font-mono">{group.key}</span></p>
              <p className="text-sm text-teal-700">Total Instalments: {group.totalInstalments}</p>
              <div className="space-y-1 mt-2">
                {group.numeroDocList.map((doc, i) => (
                  <div key={i} className="flex gap-2 text-sm font-mono">
                    <span className="text-teal-600">#{i + 1}</span>
                    <span>{doc}</span>
                    <span className="text-muted-foreground truncate">{group.testoList[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons for review statuses */}
          {isReviewStatus && onUpdateStatus && (
            <div className="flex gap-3 pt-2 border-t border-border">
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => {
                  onUpdateStatus(record.id, "MATCHED", "Exact Match", "green");
                  toast.success(`${record.invoiceNr} marked as Matched`);
                  onClose();
                }}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Include — Mark as Matched
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  onUpdateStatus(record.id, "UNMATCHED_SAP", "Unmatched (SAP)", "red");
                  toast.success(`${record.invoiceNr} marked as Unmatched`);
                  onClose();
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Exclude — Mark as Unmatched
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// ─── Invoices Table View ─────────────────────────────────────────────────────
function InvoicesView({ data, initialStatusFilter, onUpdateStatus }: { data: ReconciliationRecord[]; initialStatusFilter?: string[]; onUpdateStatus: (id: string, newStatus: string, newLabel: string, newBadge: string) => void }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>(initialStatusFilter || []);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [aiOnly, setAiOnly] = useState(false);
  const [sortKey, setSortKey] = useState<string>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState<ReconciliationRecord | null>(null);

  // Column-level filters
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [activeColumnDropdown, setActiveColumnDropdown] = useState<string | null>(null);

  // Sync initialStatusFilter when it changes from dashboard clicks
  React.useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
      setPage(0);
    }
  }, [initialStatusFilter]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  // Get unique values per column for the dropdown filters
  const columnUniqueValues = useMemo(() => {
    const cols: Record<string, Set<string>> = {};
    const getVal = (r: ReconciliationRecord, col: string): string => {
      switch (col) {
        case "companyName": return r.companyName || "";
        case "invoiceNr": return r.invoiceNr || "";
        case "sapDocNr": return r.sap?.numeroDoc || "";
        case "currency": return r.currency || "";
        case "status": return r.statusLabel || "";
        default: return "";
      }
    };
    ["companyName", "invoiceNr", "sapDocNr", "currency", "status"].forEach((col) => {
      const vals = new Set<string>();
      data.forEach((r) => {
        const v = getVal(r, col);
        if (v) vals.add(v);
      });
      cols[col] = vals;
    });
    return cols;
  }, [data]);

  const toggleColumnFilter = (col: string, value: string) => {
    setColumnFilters((prev) => {
      const current = new Set(prev[col] || []);
      if (current.has(value)) current.delete(value);
      else current.add(value);
      const next = { ...prev };
      if (current.size === 0) delete next[col];
      else next[col] = current;
      return next;
    });
    setPage(0);
  };

  const clearColumnFilter = (col: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      delete next[col];
      return next;
    });
    setPage(0);
  };

  const filtered = useMemo(() => {
    let rows = [...data];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        r.companyName.toLowerCase().includes(q) ||
        r.invoiceNr.toLowerCase().includes(q) ||
        (r.sap?.numeroDoc || "").toLowerCase().includes(q)
      );
    }
    if (statusFilter.length > 0) rows = rows.filter((r) => statusFilter.includes(r.status));
    if (aiOnly) rows = rows.filter((r) => r.ai !== null);

    // Apply column-level filters
    Object.entries(columnFilters).forEach(([col, values]) => {
      if (values.size === 0) return;
      rows = rows.filter((r) => {
        let v = "";
        switch (col) {
          case "companyName": v = r.companyName || ""; break;
          case "invoiceNr": v = r.invoiceNr || ""; break;
          case "sapDocNr": v = r.sap?.numeroDoc || ""; break;
          case "currency": v = r.currency || ""; break;
          case "status": v = r.statusLabel || ""; break;
        }
        return values.has(v);
      });
    });

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "priority") cmp = a.priority - b.priority || b.displayAmount - a.displayAmount;
      else if (sortKey === "companyName") cmp = a.companyName.localeCompare(b.companyName);
      else if (sortKey === "displayAmount") cmp = a.displayAmount - b.displayAmount;
      else if (sortKey === "invoiceDate") cmp = a.invoiceDate.localeCompare(b.invoiceDate);
      else if (sortKey === "dueDate") cmp = a.dueDate.localeCompare(b.dueDate);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return rows;
  }, [data, search, statusFilter, aiOnly, sortKey, sortDir, columnFilters]);

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const pageRows = filtered.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  const exportExcel = useCallback(() => {
    const headers = ["Status", "Company", "Invoice Nr", "SAP Doc Nr", "SAP Amount", "COM Amount", "Currency", "Invoice Date", "Due Date", "SAP Reference", "COM Buyer", "COM Invoice Nr", "VAT Code", "CUST Code", "INT Code", "Testo", "AI Confidence", "AI Reason", "Group Key", "Total Instalments", "Amount Discrepancy"];
    const keys = ["export_status", "export_companyName", "export_invoiceNr", "export_sapNumeroDoc", "export_sapImporto", "export_comAmount", "export_currency", "export_invoiceDate", "export_dueDate", "export_sapRiferimento", "export_comBuyerName", "export_comInvoiceNr", "export_comVatCode", "export_comCustCode", "export_comIntCode", "export_testo", "export_aiConfidence", "export_aiReason", "export_groupKey", "export_totalInstalments", "export_amountDiscrepancy"];
    const rows = filtered.map((r) => {
      const obj: Record<string, unknown> = {};
      keys.forEach((k, i) => { obj[headers[i]] = r[k] ?? ""; });
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reconciliation");
    XLSX.writeFile(wb, "reconciliation_export.xlsx");
    toast.success(`Exported ${filtered.length} rows to Excel`);
  }, [filtered]);

  const SortHeader = ({ label, field }: { label: string; field: string }) => (
    <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => toggleSort(field)}>
      <span className="flex items-center gap-1">{label} <ArrowUpDown className="h-3 w-3 text-muted-foreground" /></span>
    </TableHead>
  );

  // Filterable column header with dropdown
  const FilterableHeader = ({ label, field, sortable }: { label: string; field: string; sortable?: boolean }) => {
    const isActive = !!columnFilters[field] && columnFilters[field].size > 0;
    const uniqueVals = Array.from(columnUniqueValues[field] || []).sort();
    const selectedVals = columnFilters[field] || new Set();

    return (
      <TableHead className="relative">
        <div className="flex items-center gap-1">
          {sortable ? (
            <span className="cursor-pointer flex items-center gap-1" onClick={() => toggleSort(field)}>
              {label} <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
            </span>
          ) : (
            <span>{label}</span>
          )}
          <button
            className={`p-0.5 rounded hover:bg-muted transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}
            onClick={(e) => { e.stopPropagation(); setActiveColumnDropdown(activeColumnDropdown === field ? null : field); }}
          >
            <Filter className={`h-3 w-3 ${isActive ? "fill-primary/20" : ""}`} />
          </button>
          {isActive && <span className="text-[9px] bg-primary text-primary-foreground rounded-full px-1 font-medium">{selectedVals.size}</span>}
        </div>
        {activeColumnDropdown === field && (
          <div className="absolute top-full left-0 mt-1 z-30 bg-card border border-border rounded-lg shadow-xl p-2 min-w-[200px] max-h-[300px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2 pb-1 border-b border-border">
              <span className="text-xs font-medium text-muted-foreground">Filter by {label}</span>
              {isActive && (
                <button className="text-[10px] text-primary hover:underline" onClick={() => clearColumnFilter(field)}>Clear</button>
              )}
            </div>
            {uniqueVals.map((v) => (
              <label key={v} className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer text-sm">
                <input type="checkbox" checked={selectedVals.has(v)} onChange={() => toggleColumnFilter(field, v)} className="rounded border-border" />
                <span className="truncate">{v}</span>
              </label>
            ))}
            {uniqueVals.length === 0 && <p className="text-xs text-muted-foreground px-2 py-2">No values</p>}
          </div>
        )}
      </TableHead>
    );
  };

  const toggleStatusFilter = (s: string) => {
    setStatusFilter((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
    setPage(0);
  };

  const activeFilterCount = Object.values(columnFilters).reduce((sum, s) => sum + s.size, 0);

  return (
    <div className="space-y-4" onClick={() => setActiveColumnDropdown(null)}>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search company, invoice, SAP doc..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
        </div>

        <div className="relative">
          <Button variant="outline" size="sm" onClick={() => setShowStatusDropdown(!showStatusDropdown)}>
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            Status {statusFilter.length > 0 && `(${statusFilter.length})`}
          </Button>
          {showStatusDropdown && (
            <div className="absolute top-full mt-1 left-0 z-20 bg-card border border-border rounded-lg shadow-lg p-2 min-w-[200px]">
              {ALL_STATUSES.map((s) => (
                <label key={s} className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer text-sm">
                  <input type="checkbox" checked={statusFilter.includes(s)} onChange={() => toggleStatusFilter(s)} className="rounded" />
                  {s.replace(/_/g, " ")}
                </label>
              ))}
              <div className="border-t border-border mt-1 pt-1">
                <button className="text-xs text-muted-foreground hover:text-foreground px-2 py-1" onClick={() => { setStatusFilter([]); setPage(0); }}>Clear all</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={aiOnly} onCheckedChange={(v) => { setAiOnly(v); setPage(0); }} />
          <span className="text-sm text-muted-foreground">AI only</span>
        </div>

        {/* Active column filter badges */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Filters:</span>
            {Object.entries(columnFilters).map(([col, vals]) => (
              <Badge key={col} variant="secondary" className="text-xs gap-1 cursor-pointer hover:bg-destructive/10" onClick={() => clearColumnFilter(col)}>
                {col === "companyName" ? "Company" : col === "invoiceNr" ? "Invoice" : col === "sapDocNr" ? "SAP Doc" : col === "currency" ? "Currency" : "Status"}
                ({vals.size})
                <X className="h-2.5 w-2.5" />
              </Badge>
            ))}
            <button className="text-xs text-primary hover:underline" onClick={() => { setColumnFilters({}); setPage(0); }}>Clear all</button>
          </div>
        )}

        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <Download className="h-3.5 w-3.5 mr-1.5" />Export Excel
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-10">#</TableHead>
                <FilterableHeader label="Company" field="companyName" sortable />
                <FilterableHeader label="Invoice Nr" field="invoiceNr" />
                <FilterableHeader label="SAP Doc Nr" field="sapDocNr" />
                <SortHeader label="Amount (EUR)" field="displayAmount" />
                <FilterableHeader label="Currency" field="currency" />
                <SortHeader label="Invoice Date" field="invoiceDate" />
                <SortHeader label="Due Date" field="dueDate" />
                <FilterableHeader label="Status" field="status" />
                <TableHead>AI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground">No records match your filters</TableCell></TableRow>
              ) : pageRows.map((r, i) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setSelectedRecord(r)}>
                  <TableCell className="text-muted-foreground text-xs font-mono">{page * ROWS_PER_PAGE + i + 1}</TableCell>
                  <TableCell className="font-medium text-sm max-w-[200px] truncate">{r.companyName}</TableCell>
                  <TableCell className="font-mono text-sm">
                    <span>{r.invoiceNr}</span>
                    {r.instalmentSummary && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 border border-teal-200">{r.instalmentSummary}</span>}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{r.sap?.numeroDoc || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmtEur(r.displayAmount)}
                    {r.amountDiscrepancy != null && r.amountDiscrepancy > 0 && (
                      <div className="text-[10px] text-red-500">Δ {fmtEur(r.amountDiscrepancy)}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm font-mono">{r.currency}</TableCell>
                  <TableCell className="text-sm">{r.invoiceDate}</TableCell>
                  <TableCell className="text-sm">{r.dueDate}</TableCell>
                  <TableCell>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${badgeColor(r.statusBadge)}`}>{r.statusLabel}</span>
                  </TableCell>
                  <TableCell>
                    {r.ai ? <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${badgeColor(r.ai.confidenceBadge)}`}>{r.ai.confidenceLabel}</span> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {page * ROWS_PER_PAGE + 1}–{Math.min((page + 1) * ROWS_PER_PAGE, filtered.length)} of {filtered.length}</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {selectedRecord && <DetailDrawer record={selectedRecord} onClose={() => setSelectedRecord(null)} onUpdateStatus={onUpdateStatus} />}
    </div>
  );
}

// ─── Ambiguous Detail Modal ───────────────────────────────────────────────────
function AmbiguousDetailModal({
  row,
  onClose,
  onAccept,
  onReject
}: {
  row: Record<string, any>;
  onClose: () => void;
  onAccept: (row: any) => void;
  onReject: (row: any) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="relative flex items-stretch gap-4 max-w-6xl w-full justify-center animate-in fade-in zoom-in-95 duration-200">
        
        {/* Left Window: SAP Data */}
        <div className="hidden md:flex flex-col w-72 bg-blue-900 rounded-2xl shadow-xl overflow-hidden border border-blue-800 mt-8 mb-8">
          <div className="px-4 py-3 border-b border-blue-800 bg-blue-950/80">
            <h4 className="font-semibold text-white text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-white" /> Documento SAP
            </h4>
          </div>
          <div className="p-5 space-y-4 overflow-y-auto flex-1 bg-blue-900/30">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Nº Documento</span>
              <p className="text-sm font-mono text-black bg-white px-2.5 py-1.5 rounded-md shadow-inner">{row["SAP Nº Doc"] ?? row.ESTR_ID ?? 'N/A'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Riferimento</span>
              <p className="text-sm font-mono text-black bg-white px-2.5 py-1.5 rounded-md shadow-inner">{row["SAP Riferimento"] ?? 'N/A'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Importe</span>
              <p className="text-lg font-mono font-bold text-black bg-white px-2.5 py-1.5 rounded-md shadow-inner">
                {row["SAP Importe"] ?? '-'} {row["SAP Divisa"] ?? ''}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Fecha</span>
              <p className="text-sm font-mono text-black bg-white px-2.5 py-1.5 rounded-md shadow-inner">{row["SAP Fecha"] ?? 'N/A'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Texto</span>
              <p className="text-sm text-black bg-white px-2.5 py-1.5 rounded-md shadow-inner leading-relaxed">{row["SAP Testo"] ?? 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Center Main Window */}
        <div className="flex flex-col w-full max-w-lg bg-card rounded-2xl shadow-2xl overflow-hidden shrink-0 z-10">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-700">
                <Brain className="h-4 w-4" />
              </span>
              <div>
                <h3 className="font-semibold text-foreground">Revisión Manual</h3>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Detalle del Match Ambiguo</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">SAP Nº Documento</span>
                <p className="text-sm font-mono text-foreground font-medium">{row["SAP Nº Doc"] ?? row.ESTR_ID ?? 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">DUCO ID Original</span>
                <p className="text-sm font-mono text-foreground font-medium">{getDucoOriginalId(row)}</p>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">SAP Riferimento</span>
                <p className="text-sm font-mono text-foreground font-medium">{row["SAP Riferimento"] ?? 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">DUCO Descripción</span>
                <p className="text-sm font-mono text-foreground font-medium">{row["DUCO Descripción"] ?? 'N/A'}</p>
              </div>

              <div className="space-y-1 col-span-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <span className="text-xs text-amber-700/70 uppercase">Motivo de Ambigüedad</span>
                <p className="text-sm font-medium text-amber-900 mt-0.5">{row["Motivo Ambigüedad"] ?? row.ambiguity_reason ?? 'Desconocido'}</p>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Candidatos SAP</span>
                <p className="text-sm font-mono text-foreground">{row["Candidatos SAP"] ?? row.sap_candidate_count ?? '-'}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Candidatos DUCO</span>
                <p className="text-sm font-mono text-foreground">{row["Candidatos DUCO"] ?? row.bnk_candidate_count ?? '-'}</p>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Diff. Días</span>
                <p className="text-sm font-mono text-foreground">{row["Δ Días"] ?? row.date_diff_days ?? '-'} días</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Diferencia Importe</span>
                <p className="text-sm font-mono text-foreground">{row["Δ Importe"] ?? row.amount_diff ?? '-'}</p>
              </div>
              
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Puntaje Semántico</span>
                <p className="text-sm font-mono text-foreground">{row["Score Semántico"] ?? row.semantic_score ?? '-'}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">SAP Importe</span>
                <p className="text-sm font-mono text-foreground">{row["SAP Importe"] ?? '-'} {row["SAP Divisa"] ?? ''}</p>
              </div>
              
              <div className="space-y-1 col-span-2 pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">Nivel de Confianza</span>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-blue-500 transition-all" 
                      style={{ width: `${Math.min(100, Math.max(0, row.Confianza ?? row.confidence_score ?? 0))}%` }} 
                    />
                  </div>
                  <span className="text-base font-mono font-bold text-blue-700">{row.Confianza ?? row.confidence_score ?? '-'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-muted/20 border-t border-border flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                onReject(row);
                onClose();
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Descartar
            </Button>
            <Button 
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                onAccept(row);
                onClose();
              }}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Añadir / Confirmar
            </Button>
          </div>
        </div>

        {/* Right Window: DUCO Data */}
        <div className="hidden md:flex flex-col w-72 bg-blue-900 rounded-2xl shadow-xl overflow-hidden border border-blue-800 mt-8 mb-8">
          <div className="px-4 py-3 border-b border-blue-800 bg-blue-950/80">
            <h4 className="font-semibold text-white text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-white" /> Documento Bancario
            </h4>
          </div>
          <div className="p-5 space-y-4 overflow-y-auto flex-1 bg-blue-900/30">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">DUCO ID Original</span>
              <p className="text-sm font-mono text-black bg-white px-2.5 py-1.5 rounded-md shadow-inner">{getDucoOriginalId(row)}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">DUCO ID Motor</span>
              <p className="text-sm font-mono text-black bg-white px-2.5 py-1.5 rounded-md shadow-inner">{getDucoMatchId(row)}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Importe</span>
              <p className="text-lg font-mono font-bold text-black bg-white px-2.5 py-1.5 rounded-md shadow-inner">
                {row["DUCO Importe"] ?? '-'} {row["SAP Divisa"] ?? ''}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Fecha Operación</span>
              <p className="text-sm font-mono text-black bg-white px-2.5 py-1.5 rounded-md shadow-inner">{row["DUCO Fecha"] ?? 'N/A'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Descripción</span>
              <p className="text-sm text-black bg-white px-2.5 py-1.5 rounded-md shadow-inner leading-relaxed">{row["DUCO Descripción"] ?? 'N/A'}</p>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}

// ─── API Results Dashboard ────────────────────────────────────────────────────
function MatchedRowsTable({
  rows,
  expandedRows,
  onToggle,
}: {
  rows: Record<string, any>[];
  expandedRows: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-10" />
            <TableHead className="text-xs font-medium whitespace-nowrap px-3 py-2">Fase</TableHead>
            <TableHead className="text-xs font-medium whitespace-nowrap px-3 py-2">SAP Doc</TableHead>
            <TableHead className="text-xs font-medium whitespace-nowrap px-3 py-2">DUCO ID Original</TableHead>
            <TableHead className="text-xs font-medium whitespace-nowrap px-3 py-2 text-right">SAP Importe</TableHead>
            <TableHead className="text-xs font-medium whitespace-nowrap px-3 py-2 text-right">DUCO Importe</TableHead>
            <TableHead className="text-xs font-medium whitespace-nowrap px-3 py-2 text-right">Delta</TableHead>
            <TableHead className="text-xs font-medium whitespace-nowrap px-3 py-2 text-right">Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => {
            const rowKey = `${firstValue(row["SAP Nº Doc"], row["SAP NÂº Doc"], row.ESTR_ID, i)}-${getDucoMatchId(row)}-${i}`;
            const expanded = expandedRows.has(rowKey);
            const sapDoc = firstValue(row["SAP Nº Doc"], row["SAP NÂº Doc"], row.ESTR_ID);
            const ducoOriginalId = getDucoOriginalId(row);
            const ducoMatchId = getDucoMatchId(row);
            const sapCurrency = firstValue(row["SAP Divisa"], row["DUCO Divisa"]);
            const ducoCurrency = firstValue(row["DUCO Divisa"], row["SAP Divisa"]);

            return (
              <React.Fragment key={rowKey}>
                <TableRow className="hover:bg-muted/20 transition-colors">
                  <TableCell className="w-10 px-3 py-1.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onToggle(rowKey)}>
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </TableCell>
                  <TableCell className="text-xs font-mono px-3 py-1.5 whitespace-nowrap">{firstValue(row.Fase, row.Phase)}</TableCell>
                  <TableCell className="text-xs font-mono px-3 py-1.5 whitespace-nowrap">{sapDoc}</TableCell>
                  <TableCell className="text-xs font-mono px-3 py-1.5 whitespace-nowrap">{ducoOriginalId}</TableCell>
                  <TableCell className="text-xs font-mono px-3 py-1.5 text-right whitespace-nowrap">
                    {formatAmount(row["SAP Importe"], sapCurrency)}
                  </TableCell>
                  <TableCell className="text-xs font-mono px-3 py-1.5 text-right whitespace-nowrap">
                    {formatAmount(row["DUCO Importe"], ducoCurrency)}
                  </TableCell>
                  <TableCell className="text-xs font-mono px-3 py-1.5 text-right whitespace-nowrap">
                    {firstValue(row["Delta Importe"], row["Δ Importe"], row["Î” Importe"], row.amount_diff)}
                  </TableCell>
                  <TableCell className="text-xs font-mono px-3 py-1.5 text-right whitespace-nowrap">
                    {firstValue(row["Score Semántico"], row["Score SemÃ¡ntico"], row.semantic_score)}
                  </TableCell>
                </TableRow>

                {expanded && (
                  <TableRow className="bg-muted/20">
                    <TableCell colSpan={8} className="p-4">
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-200">
                            Conciliado
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Fase: <span className="font-mono font-medium text-foreground">{firstValue(row.Fase, row.Phase)}</span>
                          </span>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                          <Card className="glass-card h-full">
                            <CardContent className="p-4 space-y-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-semibold text-foreground">DUCO</p>
                                <Badge variant="outline" className="text-xs">{ducoCurrency}</Badge>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                                <DataItem label="DUCO ID Original" value={ducoOriginalId} mono />
                                <DataItem label="DUCO ID Motor" value={ducoMatchId} mono />
                                <DataItem label="Importe" value={formatAmount(row["DUCO Importe"], ducoCurrency)} />
                                <DataItem label="Divisa" value={ducoCurrency} mono />
                                <DataItem label="Fecha" value={firstValue(row["DUCO Fecha"])} mono />
                                <DataItem label="Descripcion" value={firstValue(row["DUCO Descripción"], row["DUCO DescripciÃ³n"])} mono />
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="glass-card h-full">
                            <CardContent className="p-4 space-y-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-semibold text-foreground">SAP</p>
                                <Badge variant="outline" className="text-xs">{sapCurrency}</Badge>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                                <DataItem label="SAP Nº Doc" value={sapDoc} mono />
                                <DataItem label="Riferimento" value={firstValue(row["SAP Riferimento"])} mono />
                                <DataItem label="Importe" value={formatAmount(row["SAP Importe"], sapCurrency)} />
                                <DataItem label="Divisa" value={sapCurrency} mono />
                                <DataItem label="Fecha" value={firstValue(row["SAP Fecha"])} mono />
                                <DataItem label="Testo" value={firstValue(row["SAP Testo"])} mono />
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        <Card className="glass-card">
                          <CardContent className="p-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              <DataItem label="Delta Importe" value={firstValue(row["Delta Importe"], row["Δ Importe"], row["Î” Importe"], row.amount_diff)} mono />
                              <DataItem label="Delta Dias" value={firstValue(row["Delta Días"], row["Δ Días"], row["Î” DÃ­as"], row.date_diff_days)} mono />
                              <DataItem label="Score Semantico" value={firstValue(row["Score Semántico"], row["Score SemÃ¡ntico"], row.semantic_score)} mono />
                              <DataItem label="Confianza" value={firstValue(row.Confianza, row.confidence_score)} mono />
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ApiResultsDashboard({ result, onReset }: { result: ApiResult; onReset: () => void }) {
  const [activeTab, setActiveTab] = useState<"matched" | "ambiguous" | "unmatched_sap" | "unmatched_bnk">("matched");
  const [search, setSearch] = useState("");
  const [selectedAmbiguousRow, setSelectedAmbiguousRow] = useState<Record<string, any> | null>(null);
  const [expandedMatchedRows, setExpandedMatchedRows] = useState<Set<string>>(new Set());
  const [aiSummary, setAiSummary] = useState("");
  const [aiSummaryLoading, setAiSummaryLoading] = useState(true);

  const { summary, data } = result;

  const [dataState, setDataState] = useState({
    matched: data.matched || [],
    ambiguous: data.ambiguous_matches || [],
    unmatchedSap: data.unmatched_sap || [],
    unmatchedBnk: data.unmatched_bnk || []
  });

  const handleAcceptAmbiguous = (row: any) => {
    setDataState((prev) => {
      const estrId = row.ESTR_ID;
      const ducoId = row.DUCO_ID;
      return {
        matched: [...prev.matched, { ...row, Phase: "Manual_Match" }],
        ambiguous: prev.ambiguous.filter(r => r.ESTR_ID !== estrId && r.DUCO_ID !== ducoId),
        unmatchedSap: prev.unmatchedSap.filter(r => r.ESTR_ID !== estrId),
        unmatchedBnk: prev.unmatchedBnk.filter(r => r.DUCO_ID !== ducoId)
      };
    });
    toast.success("Match manual añadido correctamente. Las partidas se han movido a conciliados.");
  };

  const handleRejectAmbiguous = (row: any) => {
    setDataState((prev) => ({
      ...prev,
      ambiguous: prev.ambiguous.filter(r => r !== row)
    }));
    toast.info("Match ambiguo descartado y devuelto a pendientes.");
  };

  const unmatchedSapCount = dataState.unmatchedSap.length;
  const unmatchedBnkCount = dataState.unmatchedBnk.length;
  const matchedCount = dataState.matched.length;
  const ambiguousCount = dataState.ambiguous.length;
  
  const totalProcessed = summary.total_sap;
  const successRateNum = totalProcessed > 0 ? (matchedCount / totalProcessed) * 100 : 0;
  const successRateStr = `${successRateNum.toFixed(2)}%`;
  const successPct = successRateNum;


  const pieData = [
    { name: "Conciliados", value: matchedCount, color: "#10b981" },
    { name: "Rev. Manual", value: ambiguousCount, color: "#3b82f6" },
    { name: "Pendiente SAP", value: unmatchedSapCount, color: "#f59e0b" },
    { name: "Pendiente Banco", value: unmatchedBnkCount, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  useEffect(() => {
    let cancelled = false;
    setAiSummaryLoading(true);

    reconcileIqApi.aiSummary({
      summary: {
        ...summary,
        matched_sap_count: matchedCount,
        unmatched_sap_count: unmatchedSapCount,
        unmatched_bnk_count: unmatchedBnkCount,
        ambiguous_candidate_count: ambiguousCount,
      },
      data: {
        matched: dataState.matched,
        ambiguous_matches: dataState.ambiguous,
        unmatched_sap: dataState.unmatchedSap,
        unmatched_bnk: dataState.unmatchedBnk,
      },
    })
      .then((res) => {
        if (!cancelled) setAiSummary(res.summary);
      })
      .catch(() => {
        if (!cancelled) {
          setAiSummary(
            `La conciliacion DUCO-SAP alcanza ${successRateStr} de exito sobre SAP, con ${matchedCount} partidas conciliadas y ${ambiguousCount} candidatos en revision manual.\n\nConviene priorizar ${unmatchedSapCount} pendientes SAP y ${unmatchedBnkCount} movimientos DUCO sin match, empezando por importes altos y casos con evidencia semantica incompleta.`
          );
        }
      })
      .finally(() => {
        if (!cancelled) setAiSummaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [summary, matchedCount, ambiguousCount, unmatchedSapCount, unmatchedBnkCount, successRateStr, dataState]);



  const tableData = {
    matched: dataState.matched,
    ambiguous: dataState.ambiguous,
    unmatched_sap: dataState.unmatchedSap,
    unmatched_bnk: dataState.unmatchedBnk,
  }[activeTab] || [];

  const toggleMatchedRow = (key: string) => {
    setExpandedMatchedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const HIDDEN_COLS = ["ESTR_ID", "DUCO_ID", "seq", "seq_sap", "seq_bnk"];

  const allCols = tableData.length > 0
    ? Object.keys(tableData[0]).filter((k) => !HIDDEN_COLS.includes(k))
    : [];

  const filteredRows = useMemo(() => {
    if (!search) return tableData.slice(0, 100);
    const q = search.toLowerCase();
    return tableData
      .filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)))
      .slice(0, 100);
  }, [tableData, search]);

  const tabs: { key: "matched" | "ambiguous" | "unmatched_sap" | "unmatched_bnk"; label: string; count: number; color: string }[] = [
    { key: "matched", label: "Conciliados", count: dataState.matched.length, color: "emerald" },
    { key: "ambiguous", label: "Revisión Manual", count: dataState.ambiguous.length, color: "blue" },
    { key: "unmatched_sap", label: "Pendiente SAP", count: dataState.unmatchedSap.length, color: "amber" },
    { key: "unmatched_bnk", label: "Pendiente Banco", count: dataState.unmatchedBnk.length, color: "red" },
  ];

  const tabAccent: Record<string, string> = {
    emerald: "border-emerald-500 text-emerald-700 bg-emerald-50",
    blue: "border-blue-500 text-blue-700 bg-blue-50",
    amber: "border-amber-500 text-amber-700 bg-amber-50",
    red: "border-red-500 text-red-700 bg-red-50",
  };

  return (
    <div className="space-y-6">
      {/* ─── Page header ───────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <CheckCircle2 className="h-3 w-3" /> Conciliación completada
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Resultados de la Conciliación</h1>

        </div>
        <div className="flex items-center gap-2">
          {result.excel_base64 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              downloadExcelFromBase64(result.excel_base64);
              toast.success("Archivo Excel descargado correctamente.");
            }}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export Excel
          </Button>
          )}
          <Button variant="outline" size="sm" onClick={onReset}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Nueva Conciliación
          </Button>
        </div>
      </div>

      {/* ─── KPI cards ─────────────────────── */}
      <StandardKpiGrid
        className="grid-cols-2 md:grid-cols-4 xl:grid-cols-4"
        items={[
          {
            id: "total-sap",
            label: "TOTAL SAP",
            value: summary.total_sap,
            icon: <FileSpreadsheet className="h-5 w-5" />,
            tone: "neutral",
          },
          {
            id: "total-banco",
            label: "TOTAL BANCO",
            value: summary.total_bnk,
            icon: <Database className="h-5 w-5" />,
            tone: "neutral",
          },
          {
            id: "conciliados",
            label: "CONCILIADOS",
            value: matchedCount,
            icon: <CheckCircle2 className="h-5 w-5" />,
            tone: "success",
          },
          {
            id: "revision-manual",
            label: "REVISIÓN MANUAL",
            value: ambiguousCount,
            icon: <Eye className="h-5 w-5" />,
            tone: "info",
          },
          {
            id: "pendiente-sap",
            label: "SAP SIN MATCH",
            value: unmatchedSapCount,
            icon: <AlertTriangle className="h-5 w-5" />,
            tone: "warning",
          },
          {
            id: "pendiente-banco",
            label: "BANCO SIN MATCH",
            value: unmatchedBnkCount,
            icon: <X className="h-5 w-5" />,
            tone: "danger",
          },
          {
            id: "tasa-exito",
            label: "TASA ÉXITO",
            value: successRateStr,
            icon: <BarChart3 className="h-5 w-5" />,
            tone: "success",
          },
        ]}
      />

      {/* ─── Charts ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <StandardDonutChart
          title="Distribucion de Resultados"
          subtitle="Estado operativo de la conciliacion"
          data={pieData}
          height={200}
          valueLabel="registros"
          tooltipFormatter={(value) => `${value} registros`}
        />

        <AiInsightsCard text={aiSummary} loading={aiSummaryLoading} />
      </div>

      {/* ── Algorithm Overview ───────────────────────────────────────── */}
      <AlgorithmOverview module="duco" />


      {/* ─── Data tables ───────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Detalle de Registros</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar en tabla..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => { setActiveTab(t.key); setSearch(""); setExpandedMatchedRows(new Set()); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                  activeTab === t.key
                    ? tabAccent[t.color]
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {t.label}
                <span className="ml-1.5 font-mono">({t.count})</span>
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No hay registros en esta categoría.
            </div>
          ) : activeTab === "matched" ? (
            <MatchedRowsTable
              rows={filteredRows}
              expandedRows={expandedMatchedRows}
              onToggle={toggleMatchedRow}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    {allCols.map((col) => (
                      <TableHead key={col} className="text-xs font-medium whitespace-nowrap px-3 py-2">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row, i) => (
                    <TableRow 
                      key={i} 
                      className={`hover:bg-muted/20 transition-colors ${activeTab === 'ambiguous' ? 'cursor-pointer hover:bg-blue-50/50' : ''}`}
                      onClick={() => {
                        if (activeTab === "ambiguous") {
                          setSelectedAmbiguousRow(row);
                        }
                      }}
                    >
                      {allCols.map((col) => (
                        <TableCell key={col} className="text-xs font-mono px-3 py-1.5 max-w-[180px] truncate">
                          {row[col] != null && row[col] !== "" ? String(row[col]) : "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {tableData.length > 100 && (
            <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
              Mostrando 100 de {tableData.length} registros. Descarga el Excel para ver todos.
            </div>
          )}
        </CardContent>
      </Card>

      {selectedAmbiguousRow && (
        <AmbiguousDetailModal
          row={selectedAmbiguousRow}
          onClose={() => setSelectedAmbiguousRow(null)}
          onAccept={handleAcceptAmbiguous}
          onReject={handleRejectAmbiguous}
        />
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function ReconcileIQPage() {
  const [apiResult, setApiResult] = useState<ApiResult | null>(null);

  const handleReset = useCallback(() => {
    setApiResult(null);
  }, []);

  if (apiResult) {
    return <ApiResultsDashboard result={apiResult} onReset={handleReset} />;
  }

  return <FileUploadPhase onApiResult={setApiResult} />;
}
