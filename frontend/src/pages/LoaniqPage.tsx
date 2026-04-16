import React, { useState, useMemo, Fragment } from "react";
import { loaniqApi } from "@/api/loaniq";
import { StandardDropZone } from "@/components/StandardDropZone";
import { StandardLoadingOverlay } from "@/components/StandardLoadingOverlay";
import { AlgorithmOverview } from "@/components/reconciliation/AlgorithmOverview";
import { StandardDonutChart, StandardKpiGrid } from "@/components/reconciliation/StandardDashboardWidgets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  Zap,
  Layers,
  Banknote,
  Clock,
  MousePointerClick,
  BarChart3,
  Eye,
  Database,
  X,
  Brain,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// ─── Types ──────────────────────────────────────────────────────────────────
interface InvoiceDetail {
  invoice_number: string;
  debtor: string;
  due_date: string | null;
  paid_eur: number;
  purchase_price: number;
  outstanding_eur: number;
  days_overdue: number;
}

interface SantixGroup {
  seller: string;
  glcs_code: string;
  debtor: string;
  currency: string;
  invoice_count: number;
  sum_paid_eur: number;
  sum_purchase_price: number;
  sum_outstanding_eur: number;
  min_purchase_date: string | null;
  reconciliation_date: string | null;
  invoices: InvoiceDetail[];
}

interface LoaniqMatch {
  alias: string;
  facility: string;
  pricing_option: string | null;
  status: string | null;
  ccy: string | null;
  current_amount: number | null;
  original_amount: number | null;
  host_bank_gross: number | null;
  effective_date: string | null;
  maturity_date: string | null;
}

interface ReconGroup {
  group_key: string;
  facility_prefix: string;
  tier: string;
  original_tier?: string;
  reason: string;
  new_current_amount?: number | null;
  santix: SantixGroup;
  loaniq: LoaniqMatch | null;
  candidates: LoaniqMatch[];
  loaniq_matches?: LoaniqMatch[];
  delta_eur: number;
  delta_pct: number;
  manual_santix_selection?: ManualSantixSelection;
}

interface ManualSantixSelection {
  invoice_indexes: number[];
  invoice_numbers: string[];
  invoice_count: number;
  sum_paid_eur: number;
  sum_purchase_price: number;
  sum_outstanding_eur: number;
}

interface ReconSummary {
  santix_invoices: number;
  santix_groups: number;
  loaniq_rows: number;
  match_exact: number;
  match_cross_prefix: number;
  review_overflow: number;
  review_debtor_mismatch: number;
  suggested: number;
  no_match: number;
  learned_match: number;
  manual_override: number;
  total_santix_eur: number;
  total_loaniq_eur: number;
  stp_rate_pct: number;
}

interface ReconResponse {
  summary: ReconSummary;
  groups: ReconGroup[];
  loaniq_updated?: Record<string, unknown>[];
}

interface OverrideLogEntry {
  id: number;
  group_key: string;
  santix_debtor: string;
  facility_prefix: string;
  original_tier: string;
  loaniq_alias: string;
  operator: string;
  ts: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;

const fmtEUR = (v: number | null | undefined) =>
  typeof v === "number"
    ? `${v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
    : "—";

const fmtShortDate = (v: string | null | undefined) =>
  v ? String(v).slice(0, 10) : "-";

const formatAiSummaryParagraphs = (text: string) =>
  text
    .split(/\r?\n\s*\r?\n|\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:[\u2022\-*]|\d+[.)])\s*/, "")
        .trim()
    )
    .filter(Boolean)
    .reduce<string[]>((paragraphs, line) => {
      if (paragraphs.length >= 2) {
        paragraphs[paragraphs.length - 1] = `${paragraphs[paragraphs.length - 1]} ${line}`;
      } else {
        paragraphs.push(line);
      }
      return paragraphs;
    }, []);

const TIER_BADGE: Record<string, string> = {
  MATCH_EXACT: "bg-success/10 text-success border-success/20",
  MATCH_CROSS_PREFIX: "bg-violet-500/10 text-violet-600 border-violet-200",
  REVIEW_OVERFLOW: "bg-warning/10 text-warning border-warning/20",
  REVIEW_DEBTOR_MISMATCH: "bg-amber-500/10 text-amber-600 border-amber-200",
  SUGGESTED: "bg-blue-500/10 text-blue-600 border-blue-200",
  NO_MATCH: "bg-destructive/10 text-destructive border-destructive/20",
  MANUAL_OVERRIDE: "bg-purple-500/10 text-purple-600 border-purple-200",
  LEARNED_MATCH: "bg-indigo-500/10 text-indigo-600 border-indigo-200",
};

const TIER_LABEL: Record<string, string> = {
  MATCH_EXACT: "Match Exacto",
  MATCH_CROSS_PREFIX: "Cross-Prefix",
  REVIEW_OVERFLOW: "Overflow",
  REVIEW_DEBTOR_MISMATCH: "Deudor Mismatch",
  SUGGESTED: "Sugerido",
  NO_MATCH: "Sin Match",
  MANUAL_OVERRIDE: "Override Manual",
  LEARNED_MATCH: "Match Aprendido",
};

const TIER_COLORS: Record<string, string> = {
  MATCH_EXACT: "#22c55e",
  MATCH_CROSS_PREFIX: "#7c3aed",
  REVIEW_OVERFLOW: "#f59e0b",
  REVIEW_DEBTOR_MISMATCH: "#d97706",
  SUGGESTED: "#2563eb",
  NO_MATCH: "#ef4444",
  MANUAL_OVERRIDE: "#a855f7",
  LEARNED_MATCH: "#6366f1",
};

const REVIEW_TIERS = new Set(["REVIEW_OVERFLOW", "REVIEW_DEBTOR_MISMATCH", "SUGGESTED"]);

const isReviewTier = (tier: string) => REVIEW_TIERS.has(tier);

const getLoaniqAmount = (match: LoaniqMatch | null | undefined) =>
  match?.original_amount ?? match?.host_bank_gross ?? match?.current_amount ?? null;

const getSantixReconciledAmount = (group: ReconGroup) =>
  group.manual_santix_selection?.sum_paid_eur ?? group.santix.sum_paid_eur;

const getReviewCandidate = (group: ReconGroup) =>
  group.candidates[0] ?? group.loaniq_matches?.[0] ?? group.loaniq ?? null;

const MOCK_LOANIQ_RESULT: ReconResponse = {
  summary: {
    santix_invoices: 3,
    santix_groups: 3,
    loaniq_rows: 3,
    match_exact: 1,
    match_cross_prefix: 1,
    review_overflow: 0,
    review_debtor_mismatch: 0,
    suggested: 0,
    no_match: 1,
    learned_match: 0,
    manual_override: 0,
    total_santix_eur: 534500,
    total_loaniq_eur: 535000,
    stp_rate_pct: 66.7,
  },
  groups: [
    {
      group_key: "SAN00DEMO-27001",
      facility_prefix: "SAN00DEMO",
      tier: "MATCH_EXACT",
      reason: "Alias exacto y deudor validado. OA=185.000,00 €",
      new_current_amount: 185000,
      santix: {
        seller: "Santander Factoring",
        glcs_code: "GLCS-100",
        debtor: "ACME IBERIA SA",
        currency: "EUR",
        invoice_count: 1,
        sum_paid_eur: 185000,
        sum_purchase_price: 183400,
        sum_outstanding_eur: 185000,
        min_purchase_date: "2026-01-18",
        reconciliation_date: "2026-04-15",
        invoices: [
          { invoice_number: "INV-1001", debtor: "ACME IBERIA SA", due_date: "2026-04-30", paid_eur: 185000, purchase_price: 183400, outstanding_eur: 185000, days_overdue: 0 },
        ],
      },
      loaniq: {
        alias: "SAN00DEMO-27001",
        facility: "SANTANDER / SAN00DEMO-ACME IBERIA",
        pricing_option: "EURIBOR",
        status: "ACTIVE",
        ccy: "EUR",
        current_amount: 185000,
        original_amount: 185000,
        host_bank_gross: 185000,
        effective_date: "2026-01-01",
        maturity_date: "2026-12-31",
      },
      candidates: [],
      delta_eur: 0,
      delta_pct: 0,
    },
    {
      group_key: "SAN00DEMO-27002",
      facility_prefix: "SAN00DEMO",
      tier: "MATCH_CROSS_PREFIX",
      reason: "Sin alias exacto. Cross-prefix resuelto por deudor + paid<=OA: SAN00XPFX-27010.",
      new_current_amount: 224500,
      santix: {
        seller: "Santander Factoring",
        glcs_code: "GLCS-210",
        debtor: "NOVA FOODS SL",
        currency: "EUR",
        invoice_count: 1,
        sum_paid_eur: 224500,
        sum_purchase_price: 223100,
        sum_outstanding_eur: 224500,
        min_purchase_date: "2026-02-02",
        reconciliation_date: "2026-04-15",
        invoices: [
          { invoice_number: "INV-2101", debtor: "NOVA FOODS SL", due_date: "2026-04-20", paid_eur: 224500, purchase_price: 223100, outstanding_eur: 224500, days_overdue: 0 },
        ],
      },
      loaniq: {
        alias: "SAN00XPFX-27010",
        facility: "SANTANDER / SAN00XPFX-NOVA FOODS",
        pricing_option: "EURIBOR",
        status: "ACTIVE",
        ccy: "EUR",
        current_amount: 225000,
        original_amount: 225000,
        host_bank_gross: 225000,
        effective_date: "2026-02-01",
        maturity_date: "2026-12-31",
      },
      candidates: [],
      delta_eur: -500,
      delta_pct: 0.22,
    },
    {
      group_key: "SAN00DEMO-27003",
      facility_prefix: "SAN00DEMO",
      tier: "NO_MATCH",
      reason: "Sin alias exacto ni candidatos cross-prefix con deudor y OA coincidentes.",
      santix: {
        seller: "Santander Factoring",
        glcs_code: "GLCS-330",
        debtor: "ORION RETAIL GROUP",
        currency: "EUR",
        invoice_count: 1,
        sum_paid_eur: 125000,
        sum_purchase_price: 124200,
        sum_outstanding_eur: 125000,
        min_purchase_date: "2026-03-05",
        reconciliation_date: "2026-04-15",
        invoices: [
          { invoice_number: "INV-3301", debtor: "ORION RETAIL GROUP", due_date: "2026-05-21", paid_eur: 125000, purchase_price: 124200, outstanding_eur: 125000, days_overdue: 0 },
        ],
      },
      loaniq: null,
      candidates: [],
      delta_eur: 125000,
      delta_pct: 100,
    },
  ],
  loaniq_updated: [
    { Alias: "SAN00DEMO-27001", Facility: "SANTANDER / SAN00DEMO-ACME IBERIA", "Current Amount": 185000, _tier: "MATCH_EXACT" },
    { Alias: "SAN00XPFX-27010", Facility: "SANTANDER / SAN00XPFX-NOVA FOODS", "Current Amount": 225000, _tier: "MATCH_CROSS_PREFIX" },
    { Alias: "SAN00DEMO-27003", Facility: "SANTANDER / SAN00DEMO-ORION RETAIL", "Current Amount": 125000, _tier: "UNMATCHED" },
  ],
};

// ─── Main Component ──────────────────────────────────────────────────────────
export default function LoaniqPage() {
  // Upload
  const [santixFile, setSantixFile] = useState<File | null>(null);
  const [loaniqFile, setLoaniqFile] = useState<File | null>(null);
  const [santixFileName, setSantixFileName] = useState("");
  const [loaniqFileName, setLoaniqFileName] = useState("");
  const [dragOverSantix, setDragOverSantix] = useState(false);
  const [dragOverLoaniq, setDragOverLoaniq] = useState(false);

  // Processing
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ReconResponse | null>(null);
  const [runTimestamp, setRunTimestamp] = useState("");
  const [aiSummaryText, setAiSummaryText] = useState<string | null>(null);



  // View
  const [filterTab, setFilterTab] = useState<
    "matched" | "review" | "no_match" | "all"
  >("matched");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedReviewGroup, setSelectedReviewGroup] = useState<{ group: ReconGroup; candidate: LoaniqMatch } | null>(null);

  const [overrideLog, setOverrideLog] = useState<OverrideLogEntry[]>([]);

  // ─── Computed groups (with local overrides applied) ──────────────────────
  const groups = useMemo(() => results?.groups ?? [], [results]);
  const aiSummaryParagraphs = useMemo(
    () => (aiSummaryText ? formatAiSummaryParagraphs(aiSummaryText) : []),
    [aiSummaryText]
  );

  // ─── Handlers ──────────────────────────────────────────────────────────
  const handleFileDrop = (
    e: React.DragEvent,
    setter: (f: File) => void,
    setDrag: (v: boolean) => void
  ) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) setter(f);
  };

  const handleSubmit = async () => {
    if (!santixFile || !loaniqFile) {
      toast.error("Please upload both files before processing.");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("santix", santixFile);
      formData.append("loaniq", loaniqFile);

      const json = await loaniqApi.reconcile(formData) as unknown as ReconResponse;
      setResults(json);
      setAiSummaryText(null);
      fetchOverrideLog();
      setSantixFileName(santixFile.name);
      setLoaniqFileName(loaniqFile.name);
      setRunTimestamp(new Date().toLocaleString("es-ES"));
      setPage(0);
      setFilterTab("matched");
      setSearch("");
      setExpandedGroups(new Set());

      toast.success("Reconciliation complete", {
        description: `${json.summary.santix_groups} groups · ${json.summary.stp_rate_pct}% STP rate`,
      });

      // Fetch AI summary in background (non-blocking)
      loaniqApi.aiSummary({ summary: json.summary, groups: json.groups })
        .then((r) => { if (r.summary) setAiSummaryText(r.summary); })
        .catch(() => { /* AI summary is optional — silently ignore */ });
    } catch (err: unknown) {
      toast.error("Reconciliation failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setResults(null);
    setSantixFile(null);
    setLoaniqFile(null);
    setSantixFileName("");
    setLoaniqFileName("");
    setSearch("");
    setPage(0);
    setFilterTab("matched");
    setExpandedGroups(new Set());
    setAiSummaryText(null);
    setRunTimestamp("");
  };

  const handleLoadDemo = () => {
    setResults(MOCK_LOANIQ_RESULT);
    setSantixFileName("Santix demo extract");
    setLoaniqFileName("LoanIQ demo document");
    setRunTimestamp(new Date().toLocaleString("es-ES"));
    setPage(0);
    setFilterTab("matched");
    setSearch("");
    setExpandedGroups(new Set());
    toast.success("Demo data loaded", {
      description: "Viewing sample SANTIX to LOANIQ reconciliation results",
    });
  };

  const fetchOverrideLog = async () => {
    try {
      const overrides = await loaniqApi.getOverrides();
      setOverrideLog(overrides);
    } catch {
      // silently ignore — backend may not have entries yet
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleOverride = async (
    g: ReconGroup,
    candidate: LoaniqMatch,
    santixSelection?: ManualSantixSelection
  ) => {
    try {
      const selectedSantixAmt = santixSelection?.sum_paid_eur ?? g.santix.sum_paid_eur;
      await loaniqApi.applyOverride({
        group_key: g.group_key,
        loaniq_alias: candidate.alias,
        santix_debtor: g.santix.debtor,
        sum_paid: selectedSantixAmt,
        original_tier: g.tier,
      });

      // Update group locally
      const loaniqAmt =
        candidate.original_amount ?? candidate.host_bank_gross ?? candidate.current_amount ?? 0;
      const deltaEur = selectedSantixAmt - loaniqAmt;

      setResults((prev) => {
        if (!prev) return prev;
          return {
          ...prev,
          groups: prev.groups.map((gr) =>
            gr.group_key === g.group_key
              ? {
                  ...gr,
                  original_tier: gr.tier,
                  tier: "MANUAL_OVERRIDE",
                  loaniq: candidate,
                  candidates: [],
                  manual_santix_selection: santixSelection,
                  delta_eur: Math.round(deltaEur * 100) / 100,
                  delta_pct:
                    selectedSantixAmt > 0
                      ? Math.round((Math.abs(deltaEur) / selectedSantixAmt) * 10000) / 100
                      : 0,
                  reason: `Manual override - operador selecciono ${candidate.alias} con ${
                    santixSelection?.invoice_count ?? g.santix.invoice_count
                  } factura(s) SANTIX`,
                }
              : gr
          ),
          loaniq_updated: (prev.loaniq_updated ?? []).map((row) => {
            const r = row as Record<string, unknown>;
            if (String(r["Alias"] ?? "") === candidate.alias) {
              return { ...r, "Current Amount": selectedSantixAmt, "_tier": "MANUAL_OVERRIDE" };
            }
            return r;
          }),
        };
      });

      toast.success("Override applied", {
        description: `Group ${g.group_key} -> ${candidate.alias}`,
      });
      fetchOverrideLog();
    } catch {
      toast.error("Override failed - check backend connection");
    }
  };



  // ─── Dynamic tier counts (from live groups, respects overrides) ──────────
  const tierCounts = useMemo(() => {
    const all = groups.length;
    const matched = groups.filter(
      (g) =>
        g.tier === "MATCH_EXACT" ||
        g.tier === "MATCH_CROSS_PREFIX" ||
        g.tier === "LEARNED_MATCH" ||
        g.tier === "MANUAL_OVERRIDE"
    ).length;
    const review = groups.filter((g) => isReviewTier(g.tier)).length;
    const no_match = groups.filter((g) => g.tier === "NO_MATCH").length;
    return { all, matched, review, no_match };
  }, [groups]);

  // ─── Derived financial metrics ───────────────────────────────────────────
  const metrics = useMemo(() => {
    const autoTiers = new Set(["MATCH_EXACT", "MATCH_CROSS_PREFIX", "LEARNED_MATCH", "MANUAL_OVERRIDE"]);
    const confirmedTiers = new Set([
      "MATCH_EXACT",
      "MATCH_CROSS_PREFIX",
      "LEARNED_MATCH",
      "MANUAL_OVERRIDE",
    ]);
    const autoGroups = groups.filter((g) => autoTiers.has(g.tier));
    const confirmedGroups = groups.filter((g) => confirmedTiers.has(g.tier));
    const pendingGroups = groups.filter(
      (g) => isReviewTier(g.tier) || g.tier === "NO_MATCH"
    );
    const matchedLoaniqTiers = new Set([...autoTiers]);
    const matchedLoaniqRows = new Set<string>();
    groups.forEach((g) => {
      if (!matchedLoaniqTiers.has(g.tier)) return;
      const matches = g.loaniq ? [g.loaniq] : [];
      matches.forEach((m) => {
        matchedLoaniqRows.add(`${m.alias}|${m.facility}`);
      });
    });
    const loaniqUnmatched = Math.max(
      (results?.summary.loaniq_rows ?? 0) - matchedLoaniqRows.size,
      0
    );

    const autoEur = autoGroups.reduce((s, g) => s + getSantixReconciledAmount(g), 0);
    const pendingEur = pendingGroups.reduce((s, g) => s + getSantixReconciledAmount(g), 0);

    const deltaConfirmed = confirmedGroups.reduce((s, g) => {
      const lAmt =
        g.loaniq?.original_amount ?? g.loaniq?.host_bank_gross ?? g.loaniq?.current_amount ?? 0;
      return s + (getSantixReconciledAmount(g) - lAmt);
    }, 0);

    const stpRate =
      groups.length > 0 ? Math.round((autoGroups.length / groups.length) * 1000) / 10 : 0;

    const overrideCount = groups.filter((g) => g.tier === "MANUAL_OVERRIDE").length;

    const aliasMatchRate = groups.length > 0
      ? Math.round(
          groups.filter(g => autoTiers.has(g.tier)).length / groups.length * 1000
        ) / 10
      : 0;

    return {
      autoEur,
      pendingEur,
      deltaConfirmed,
      stpRate,
      overrideCount,
      autoCount: autoGroups.length,
      aliasMatchRate,
      loaniqUnmatched,
    };
  }, [groups, results?.summary.loaniq_rows]);

  // ─── Chart data ──────────────────────────────────────────────────────────
  const pieData = useMemo(() => {
    const counts: Record<string, number> = {};
    groups.forEach((g) => {
      counts[g.tier] = (counts[g.tier] ?? 0) + 1;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([tier, count]) => ({
        name: TIER_LABEL[tier] ?? tier,
        value: count,
        color: TIER_COLORS[tier] ?? "#94a3b8",
      }));
  }, [groups]);

  // ─── Filtering ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = groups;
    if (filterTab === "matched")
      rows = rows.filter(
        (r) =>
          r.tier === "MATCH_EXACT" ||
          r.tier === "MATCH_CROSS_PREFIX" ||
          r.tier === "LEARNED_MATCH" ||
          r.tier === "MANUAL_OVERRIDE"
      );
    else if (filterTab === "review")
      rows = rows.filter((r) => isReviewTier(r.tier));
    else if (filterTab === "no_match") rows = rows.filter((r) => r.tier === "NO_MATCH");

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.group_key.toLowerCase().includes(q) ||
          r.santix.seller.toLowerCase().includes(q) ||
          r.santix.debtor.toLowerCase().includes(q) ||
          (r.loaniq?.alias ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [groups, filterTab, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ─── Export Excel Premium ────────────────────────────────────────────────
  const handleExport = () => {
    if (!results) return;
    try {
    const s = results.summary;
    const ts = runTimestamp || new Date().toLocaleString("es-ES");

    // Cover sheet
    const coverRows = [
      { "": "Santander Factoring | SANTIX → LOANIQ Reconciliation Report" },
      { "": `Generated: ${ts}` },
      { "": `SANTIX file: ${santixFileName}` },
      { "": `LOANIQ file: ${loaniqFileName}` },
      { "": "" },
      { "": "AI Executive Summary" },
      { "": aiSummaryText ?? "Not available" },
    ];

    // Summary sheet
    const summaryRows = [
      { Metric: "SANTIX Invoices", Value: s.santix_invoices },
      { Metric: "SANTIX Groups (N:1)", Value: s.santix_groups },
      { Metric: "LOANIQ Rows", Value: s.loaniq_rows },
      { Metric: "Match Exact", Value: s.match_exact },
      { Metric: "Match Cross-Prefix", Value: s.match_cross_prefix },
      { Metric: "Review Overflow", Value: s.review_overflow },
      { Metric: "Review Debtor Mismatch", Value: s.review_debtor_mismatch },
      { Metric: "Learned Match", Value: s.learned_match },
      { Metric: "Manual Overrides", Value: metrics.overrideCount },
      { Metric: "No Match", Value: tierCounts.no_match },
      { Metric: "STP Rate %", Value: s.stp_rate_pct },
      { Metric: "€ Auto-Reconciled", Value: Math.round(metrics.autoEur * 100) / 100 },
      { Metric: "€ Pending Review", Value: Math.round(metrics.pendingEur * 100) / 100 },
      { Metric: "Total SANTIX EUR", Value: s.total_santix_eur },
    ];

    // Groups sheet
    const groupsRows = groups.map((g) => ({
      "Group Key": g.group_key,
      Tier: TIER_LABEL[g.tier] ?? g.tier,
      Reason: g.reason,
      Seller: g.santix.seller,
      "GLCS Code": g.santix.glcs_code,
      Debtor: g.santix.debtor,
      Currency: g.santix.currency,
      "Invoice Count": g.manual_santix_selection?.invoice_count ?? g.santix.invoice_count,
      "Σ Paid EUR": getSantixReconciledAmount(g),
      "Σ Purchase Price": g.manual_santix_selection?.sum_purchase_price ?? g.santix.sum_purchase_price,
      "Σ Outstanding EUR": g.manual_santix_selection?.sum_outstanding_eur ?? g.santix.sum_outstanding_eur,
      "Purchase Date": g.santix.min_purchase_date ?? "",
      "Reconciliation Date": g.santix.reconciliation_date ?? "",
      "LOANIQ Alias": g.loaniq?.alias ?? "",
      "LOANIQ Facility": g.loaniq?.facility ?? "",
      "LOANIQ Original Amt": g.loaniq?.original_amount ?? "",
      "LOANIQ Status": g.loaniq?.status ?? "",
      "Δ EUR": g.delta_eur,
      "Δ %": g.delta_pct,
      "Override Applied": g.tier === "MANUAL_OVERRIDE" ? "YES" : "no",
    }));

    // Invoices Detail sheet
    const invoiceRows: Record<string, unknown>[] = [];
    groups.forEach((g) => {
      g.santix.invoices.forEach((inv) => {
        invoiceRows.push({
          "Group Key": g.group_key,
          Tier: TIER_LABEL[g.tier] ?? g.tier,
          Seller: g.santix.seller,
          Debtor: inv.debtor,
          "Invoice #": inv.invoice_number,
          "Due Date": inv.due_date ?? "",
          "Paid EUR": inv.paid_eur,
          "Purchase Price": inv.purchase_price,
          "Outstanding EUR": inv.outstanding_eur,
          "Days Overdue": inv.days_overdue,
          "LOANIQ Alias": g.loaniq?.alias ?? "",
        });
      });
    });

    // Exceptions sheet
    const exceptionTiers = new Set([
      "REVIEW_OVERFLOW",
      "REVIEW_DEBTOR_MISMATCH",
      "SUGGESTED",
      "NO_MATCH",
    ]);
    const exceptionsRows = groups
      .filter((g) => exceptionTiers.has(g.tier))
      .map((g) => ({
        "Group Key": g.group_key,
        Tier: TIER_LABEL[g.tier] ?? g.tier,
        Reason: g.reason,
        "Σ Santix EUR": g.santix.sum_paid_eur,
        "Best Candidate Alias":
          g.candidates[0]?.alias ?? g.loaniq?.alias ?? "",
        "Δ EUR": g.delta_eur,
        "Δ %": `${g.delta_pct}%`,
        "Reviewer Action": "",
        "Reviewer Notes": "",
      }));

    // Audit Trail sheet
    const auditRows = groups
      .filter((g) => g.tier === "MANUAL_OVERRIDE")
      .map((g) => ({
        "Group Key": g.group_key,
        "Original Tier": g.original_tier ?? "UNKNOWN",
        "Override Alias": g.loaniq?.alias ?? "",
        "LOANIQ Facility": g.loaniq?.facility ?? "",
        "Override Amount EUR": g.loaniq?.original_amount ?? "",
        Timestamp: ts,
      }));

    // LOANIQ Actualizado sheet — sanitize values for xlsx compatibility
    const loaniqUpdatedRows = (results.loaniq_updated ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const tier = r["_tier"] as string | undefined;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (k === "_tier") continue;
        // Coerce non-primitive values to string to avoid xlsx errors
        out[k] = v === null || v === undefined ? "" : (typeof v === "object" ? String(v) : v);
      }
      out["Tier Reconciliación"] = TIER_LABEL[tier ?? ""] ?? tier ?? "Sin match";
      return out;
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(coverRows), "Cover");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(groupsRows), "Groups");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invoiceRows), "Invoices Detail");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(exceptionsRows.length ? exceptionsRows : [{ Info: "No exceptions" }]),
      "Exceptions"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(auditRows.length ? auditRows : [{ Info: "No manual overrides applied" }]),
      "Audit Trail"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(loaniqUpdatedRows.length ? loaniqUpdatedRows : [{ Info: "No data" }]),
      "LOANIQ Actualizado"
    );
    XLSX.writeFile(wb, `santander_recon_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Excel report downloaded", {
      description: "7 sheets: Cover, Summary, Groups, Invoices Detail, Exceptions, Audit Trail, LOANIQ Actualizado",
    });
    } catch (err) {
      toast.error("Export failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };


  // ─── Upload view ───────────────────────────────────────────────────────
  if (!results) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-8">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
            <Layers className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">SANTIX → LOANIQ</h2>
          <p className="text-muted-foreground max-w-md">
            Upload both Santix and LoanIQ files to start the automated reconciliation process.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
          <StandardDropZone
            file={santixFile}
            onFileSelect={setSantixFile}
            title="SANTIX Extract"
            subtitle="Drag & drop the Santix group report"
            accentColor="blue"
          />
          <StandardDropZone
            file={loaniqFile}
            onFileSelect={setLoaniqFile}
            title="LOANIQ Document"
            subtitle="Drag & drop the LoanIQ facility records"
            accentColor="red"
          />
        </div>

        <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={loading || !santixFile || !loaniqFile}
            className="bg-red-600 hover:bg-red-700 text-white min-w-[220px] h-12 rounded-md shadow-lg shadow-red-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <FileSpreadsheet className="mr-2 h-5 w-5" />}
            {loading ? "Procesando…" : "Ejecutar Reconciliación"}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={handleLoadDemo}
            disabled={loading}
            className="min-w-[220px] h-12 rounded-md"
          >
            Cargar Demo
          </Button>
        </div>

        <StandardLoadingOverlay
          isVisible={loading}
          title="Ejecutando Conciliación"
          subtitle="Procesando miles de registros para vincular facturas de Santix con tramos de LoanIQ."
        />
      </div>
    );
  }

  const summary = results.summary;
  const reviewCount = tierCounts.review;
  const tabs: {
    key: typeof filterTab;
    label: string;
    count: number;
    color: "emerald" | "blue" | "amber" | "red";
  }[] = [
    { key: "matched", label: "Conciliados", count: tierCounts.matched, color: "emerald" },
    { key: "review", label: "Revision Manual", count: reviewCount, color: "blue" },
    { key: "no_match", label: "Sin Match", count: tierCounts.no_match, color: "amber" },
    { key: "all", label: "Todos", count: tierCounts.all, color: "red" },
  ];
  const tabAccent: Record<string, string> = {
    emerald: "border-emerald-500 text-emerald-700 bg-emerald-50",
    blue: "border-blue-500 text-blue-700 bg-blue-50",
    amber: "border-amber-500 text-amber-700 bg-amber-50",
    red: "border-red-500 text-red-700 bg-red-50",
  };

  // ─── Results view ──────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <CheckCircle2 className="h-3 w-3" /> Conciliacion completada
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Resultados de la Conciliacion</h1>
          {runTimestamp && (
            <div className="flex flex-wrap gap-3 mt-1">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> {runTimestamp}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <FileSpreadsheet className="h-3 w-3" /> {santixFileName}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <FileSpreadsheet className="h-3 w-3" /> {loaniqFileName}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" onClick={resetAll}>
            Nueva Conciliacion
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleExport}
          >
            <Download className="h-3.5 w-3.5" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────── */}
      <StandardKpiGrid
        className="grid-cols-2 md:grid-cols-4 xl:grid-cols-4"
        items={[
          {
            id: "total-santix",
            label: "TOTAL SANTIX",
            value: summary.santix_groups,
            sub: `${summary.santix_invoices} invoices`,
            icon: <FileSpreadsheet className="h-5 w-5" />,
            tone: "neutral",
          },
          {
            id: "total-loaniq",
            label: "TOTAL LOANIQ",
            value: summary.loaniq_rows,
            icon: <Banknote className="h-5 w-5" />,
            tone: "neutral",
          },
          {
            id: "conciliados",
            label: "CONCILIADOS",
            value: tierCounts.matched,
            icon: <CheckCircle2 className="h-5 w-5" />,
            tone: "success",
          },
          {
            id: "revision-manual",
            label: "REVISION MANUAL",
            value: reviewCount,
            icon: <Eye className="h-5 w-5" />,
            tone: "info",
          },
          {
            id: "pendiente-santix",
            label: "SANTIX SIN MATCH",
            value: tierCounts.no_match,
            icon: <AlertTriangle className="h-5 w-5" />,
            tone: "warning",
          },
          {
            id: "pendiente-loaniq",
            label: "FUERA DE ESTE LOTE",
            value: metrics.loaniqUnmatched,
            sub: "otros períodos / lotes anteriores",
            icon: <XCircle className="h-5 w-5" />,
            tone: "neutral",
          },
          {
            id: "tasa-exito",
            label: "TASA EXITO",
            value: `${metrics.aliasMatchRate}%`,
            icon: <BarChart3 className="h-5 w-5" />,
            tone: "success",
          },
        ]}
      />
      {/*
        <KpiCard
          icon={<Euro className="h-5 w-5 text-muted-foreground" />}
          bg="bg-muted"
          label="Δ Importe vs Tramo"
          value={fmtEUR(Math.abs(metrics.deltaConfirmed))}
          sub={metrics.deltaConfirmed < 0 ? "tramos > SANTIX (capacidad no utilizada)" : "SANTIX > tramos"}
        />
        <KpiCard
          icon={<AlertCircle className="h-5 w-5 text-muted-foreground" />}
          bg="bg-muted"
          label="€ Requires Review"
          value={fmtEUR(metrics.pendingEur)}
          sub="suggested + alias mismatches"
        />
      </div>
      */}

      {/* ── Charts ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <StandardDonutChart
          title="Distribucion de Resultados"
          subtitle="Estado operativo de la conciliacion"
          data={pieData}
          height={200}
          valueLabel="registros"
          tooltipFormatter={(value) => `${value} registros`}
        />
        <Card className="glass-card relative overflow-hidden border-primary/20">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 h-24 w-24 bg-primary/10 rounded-full blur-2xl animate-pulse" />
          <CardContent className="p-4 relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Resumen Ejecutivo IA</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-tighter">GPT-4o mini</span>
                </div>
              </div>
            </div>
            {aiSummaryText ? (
              <div className="min-h-[112px] flex flex-col justify-center gap-4">
                {aiSummaryParagraphs.map((paragraph, i) => (
                  <p
                    key={i}
                    className="text-sm text-foreground/80 leading-7 text-justify hyphens-auto"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <div className="h-3 bg-muted/60 rounded animate-pulse w-full" />
                <div className="h-3 bg-muted/60 rounded animate-pulse w-5/6" />
                <div className="h-3 bg-muted/60 rounded animate-pulse w-4/6" />
                <p className="text-[10px] text-muted-foreground/50 mt-2">Generando análisis...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Filter Tabs ───────────────────────────────────────────────── */}
      <AlgorithmOverview module="loaniq" />

      {/* ── Search ────────────────────────────────────────────────────── */}
      {/* ── Table ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold">Detalle de Registros</CardTitle>
            <div className="relative w-64 max-w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar en tabla..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1 mt-3">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => { setFilterTab(t.key); setSearch(""); setPage(0); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                  filterTab === t.key
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
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-10" />
                <TableHead className="text-xs font-medium whitespace-nowrap px-3 py-2">Group Key</TableHead>
                <TableHead className="text-xs font-medium whitespace-nowrap px-3 py-2">Debtor</TableHead>
                <TableHead className="text-xs font-medium whitespace-nowrap px-3 py-2">Inv.</TableHead>
                <TableHead className="text-xs font-medium whitespace-nowrap px-3 py-2 text-right">Santix EUR</TableHead>
                <TableHead className="text-xs font-medium whitespace-nowrap px-3 py-2">LOANIQ Alias</TableHead>
                <TableHead className="text-xs font-medium whitespace-nowrap px-3 py-2 text-right">LOANIQ Amt</TableHead>
                <TableHead className="text-xs font-medium whitespace-nowrap px-3 py-2 text-right">Delta EUR</TableHead>
                <TableHead className="text-xs font-medium whitespace-nowrap px-3 py-2 text-center">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((g) => {
                const requiresManualReview = isReviewTier(g.tier);
                const expanded = expandedGroups.has(g.group_key);
                const reviewCandidate = getReviewCandidate(g);
                const loaniqAmt = getLoaniqAmount(g.loaniq);
                const santixDisplayAmt = getSantixReconciledAmount(g);
                return (
                  <Fragment key={g.group_key}>
                    <TableRow className="hover:bg-muted/20 transition-colors">
                      <TableCell className="w-10 px-3 py-1.5">
                        {requiresManualReview ? (
                          <span className="block h-7 w-7" />
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => toggleExpand(g.group_key)}
                          >
                            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono px-3 py-1.5 whitespace-nowrap">{g.group_key}</TableCell>
                      <TableCell className="text-xs font-mono px-3 py-1.5 max-w-[180px] truncate">{g.santix.debtor}</TableCell>
                      <TableCell className="px-3 py-1.5">
                        <Badge variant="outline" className="text-xs">{g.santix.invoice_count}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono px-3 py-1.5 text-right whitespace-nowrap">
                        {fmtEUR(santixDisplayAmt)}
                      </TableCell>
                      <TableCell className="text-xs font-mono px-3 py-1.5 whitespace-nowrap">
                        {g.loaniq?.alias ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono px-3 py-1.5 text-right whitespace-nowrap">
                        {loaniqAmt !== null ? fmtEUR(loaniqAmt) : "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono px-3 py-1.5 text-right whitespace-nowrap font-medium">
                        {Math.abs(g.delta_eur) < 0.01 ? (
                          <span className="text-success">0,00 €</span>
                        ) : g.delta_eur > 0 ? (
                          <span className="text-destructive" title="SANTIX > LOANIQ — posible infra-cobertura">
                            ▲ {fmtEUR(g.delta_eur)}
                          </span>
                        ) : (
                          <span className="text-blue-500" title="LOANIQ > SANTIX — sobre-cobertura">
                            ▼ {fmtEUR(Math.abs(g.delta_eur))}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-center">
                        {requiresManualReview && reviewCandidate ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedReviewGroup({ group: g, candidate: reviewCandidate });
                            }}
                          >
                            <Eye className="h-3 w-3" />
                            Revisar
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Expanded row */}
                    {expanded && !requiresManualReview && (
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={9} className="p-4">
                          <div className="space-y-4">
                            {/* Tier info */}
                            <div className="flex items-center gap-3 flex-wrap">
                              <Badge variant="outline" className={`text-xs ${TIER_BADGE[g.tier] ?? ""}`}>
                                {TIER_LABEL[g.tier] ?? g.tier}
                              </Badge>
                              {g.santix.seller && (
                                <span className="text-xs text-muted-foreground">Seller: <span className="font-mono font-medium text-foreground">{g.santix.seller}</span></span>
                              )}
                            </div>
                            <p className="text-xs italic text-muted-foreground">{g.reason}</p>

                            {/* SANTIX and LOANIQ detail cards */}
                            <div className={`grid gap-4 ${g.loaniq ? "lg:grid-cols-2" : ""}`}>
                              <Card className="glass-card h-full">
                                <CardContent className="p-4 space-y-4">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="text-xs font-semibold text-foreground">SANTIX Invoices</p>
                                    <Badge variant="outline" className="text-xs">
                                      {g.santix.invoices.length}
                                    </Badge>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                                    <DataItem label="Seller" value={g.santix.seller || "-"} />
                                    <DataItem label="GLCS Code" value={g.santix.glcs_code || "-"} mono />
                                    <DataItem label="Currency" value={g.santix.currency || "-"} mono />
                                    <DataItem label="Paid EUR" value={fmtEUR(santixDisplayAmt)} />
                                    <DataItem label="Purchase Price" value={fmtEUR(g.santix.sum_purchase_price)} />
                                    <DataItem label="Outstanding" value={fmtEUR(g.santix.sum_outstanding_eur)} />
                                  </div>
                                  <div className="space-y-3">
                                    {g.santix.invoices.map((inv, i) => (
                                      <div key={`${inv.invoice_number}-${i}`} className="rounded-md border border-border bg-muted/20 p-3">
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                                          <DataItem label="Invoice #" value={inv.invoice_number || "-"} mono />
                                          <DataItem label="Debtor" value={inv.debtor || g.santix.debtor || "-"} mono />
                                          <DataItem label="Due Date" value={fmtShortDate(inv.due_date)} mono />
                                          <DataItem label="Paid EUR" value={fmtEUR(inv.paid_eur)} />
                                          <DataItem label="Purchase Price" value={fmtEUR(inv.purchase_price)} />
                                          <DataItem label="Outstanding" value={fmtEUR(inv.outstanding_eur)} />
                                          <DataItem label="Days Overdue" value={String(inv.days_overdue ?? "-")} mono />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </CardContent>
                              </Card>

                              {/* LOANIQ match card */}
                              {g.loaniq && (
                                <Card className="glass-card h-full">
                                  <CardContent className="p-4 space-y-4">
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-xs font-semibold text-foreground">LOANIQ Tranche</p>
                                      <Badge variant="outline" className="text-xs">
                                        {g.loaniq.ccy ?? "EUR"}
                                      </Badge>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                                      <DataItem label="Alias" value={g.loaniq.alias || "-"} mono />
                                      <DataItem label="Facility" value={g.loaniq.facility || "-"} mono />
                                      <DataItem label="Pricing Option" value={g.loaniq.pricing_option ?? "-"} mono />
                                      <DataItem label="Original Amt" value={fmtEUR(g.loaniq.original_amount)} />
                                      <DataItem label="Current Amt" value={fmtEUR(g.loaniq.current_amount)} />
                                      <DataItem label="Host Bank Gross" value={fmtEUR(g.loaniq.host_bank_gross)} />
                                      <DataItem label="Status" value={g.loaniq.status ?? "-"} mono />
                                      <DataItem label="Effective" value={fmtShortDate(g.loaniq.effective_date)} mono />
                                      <DataItem label="Maturity" value={fmtShortDate(g.loaniq.maturity_date)} mono />
                                    </div>
                                  </CardContent>
                                </Card>
                              )}
                            </div>

                            {/* Candidates (REVIEW) */}
                            {(g.tier === "REVIEW_OVERFLOW" || g.tier === "REVIEW_DEBTOR_MISMATCH") && g.candidates.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold mb-2 text-foreground">
                                  Candidates ({g.candidates.length}) — Haz clic en "Revisar" para abrir el detalle
                                </p>
                                <div className="space-y-2">
                                  {g.candidates.map((c, i) => {
                                    const amt =
                                      c.original_amount ?? c.host_bank_gross ?? c.current_amount ?? 0;
                                    const candidateDelta = g.santix.sum_paid_eur - amt;
                                    return (
                                      <div
                                        key={i}
                                        className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card"
                                      >
                                        <div className="flex-1 space-y-1.5">
                                          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                                            <span className="font-mono font-medium">{c.alias}</span>
                                            <span className="text-muted-foreground truncate">{c.facility}</span>
                                            <span>{fmtEUR(amt)}</span>
                                            <span className="text-muted-foreground">{c.status ?? "—"}</span>
                                            <span className="text-muted-foreground">{c.ccy ?? "EUR"}</span>
                                            <span className={`font-medium tabular-nums ${
                                              Math.abs(candidateDelta) < 0.01 ? "text-success" :
                                              candidateDelta > 0 ? "text-destructive" : "text-blue-500"
                                            }`}>
                                              {Math.abs(candidateDelta) < 0.01 ? "±0" :
                                               candidateDelta > 0 ? `▲ ${fmtEUR(candidateDelta)}` :
                                               `▼ ${fmtEUR(Math.abs(candidateDelta))}`}
                                            </span>
                                          </div>
                                        </div>
                                        <Button
                                          size="sm"
                                          className="h-7 text-xs bg-blue-600 text-white hover:bg-blue-700 flex-shrink-0"
                                          onClick={() => setSelectedReviewGroup({ group: g, candidate: c })}
                                        >
                                          <Eye className="h-3 w-3 mr-1" />
                                          Revisar
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground text-sm">
                    No groups match the current filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length} groups
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {(() => {
              const windowSize = 5;
              let start = Math.max(0, page - Math.floor(windowSize / 2));
              let end = start + windowSize;
              if (end > totalPages) {
                end = totalPages;
                start = Math.max(0, end - windowSize);
              }
              return Array.from({ length: end - start }, (_, i) => {
                const p = start + i;
                return (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="icon"
                    className={`h-8 w-8 text-xs ${p === page ? "bg-primary text-primary-foreground" : ""}`}
                    onClick={() => setPage(p)}
                  >
                    {p + 1}
                  </Button>
                );
              });
            })()}
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Audit Trail (persisted) ──────────────────────────────────── */}
      {overrideLog.length > 0 && (
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Audit Trail — Override History ({overrideLog.length})
            </p>
            <div className="space-y-2">
              {overrideLog.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card text-xs">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="font-mono font-medium text-foreground truncate">{entry.group_key}</span>
                    <Badge variant="outline" className={`text-xs flex-shrink-0 ${TIER_BADGE[entry.original_tier] ?? ""}`}>
                      {TIER_LABEL[entry.original_tier] ?? entry.original_tier}
                    </Badge>
                    <span className="text-muted-foreground">&rarr;</span>
                    <span className="font-mono text-indigo-600 font-medium">{entry.loaniq_alias}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground flex-shrink-0">
                    <span>{entry.santix_debtor}</span>
                    <span>{new Date(entry.ts).toLocaleString("es-ES")}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Manual Review Modal (DUCO-SAP style) ────────────────── */}
      {selectedReviewGroup && (
        <ManualReviewModal
          group={selectedReviewGroup.group}
          candidate={selectedReviewGroup.candidate}
          onClose={() => setSelectedReviewGroup(null)}
          onAccept={(g, c, selection) => {
            handleOverride(g, c, selection);
            setSelectedReviewGroup(null);
          }}
          onReject={() => setSelectedReviewGroup(null)}
        />
      )}

    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({
  icon,
  bg,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`rounded-lg ${bg} p-2.5 flex-shrink-0`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-foreground truncate">{value}</p>
          {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Data Item ───────────────────────────────────────────────────────────────
function DataItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xs font-medium text-foreground break-words ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

// ─── Manual Review Modal (DUCO-SAP style 3-panel) ────────────────────────────
function ManualReviewModal({
  group,
  candidate,
  onClose,
  onAccept,
  onReject,
}: {
  group: ReconGroup;
  candidate: LoaniqMatch;
  onClose: () => void;
  onAccept: (group: ReconGroup, candidate: LoaniqMatch, selection: ManualSantixSelection) => void;
  onReject: () => void;
}) {
  const invoices = group.santix.invoices ?? [];
  const [selectedInvoiceIndexes, setSelectedInvoiceIndexes] = useState<Set<number>>(
    () => new Set(invoices.map((_, index) => index))
  );
  const santixSelection = useMemo<ManualSantixSelection>(() => {
    const selectedInvoices = invoices.filter((_, index) => selectedInvoiceIndexes.has(index));
    return {
      invoice_indexes: selectedInvoices.map((_, index) => {
        const invoice = selectedInvoices[index];
        return invoices.indexOf(invoice);
      }),
      invoice_numbers: selectedInvoices.map((invoice) => invoice.invoice_number || "N/A"),
      invoice_count: selectedInvoices.length,
      sum_paid_eur: selectedInvoices.reduce((sum, invoice) => sum + (invoice.paid_eur ?? 0), 0),
      sum_purchase_price: selectedInvoices.reduce((sum, invoice) => sum + (invoice.purchase_price ?? 0), 0),
      sum_outstanding_eur: selectedInvoices.reduce((sum, invoice) => sum + (invoice.outstanding_eur ?? 0), 0),
    };
  }, [invoices, selectedInvoiceIndexes]);
  const allInvoicesSelected = invoices.length > 0 && selectedInvoiceIndexes.size === invoices.length;
  const santixAmt = santixSelection.sum_paid_eur;
  const loaniqAmt = candidate.original_amount ?? candidate.host_bank_gross ?? candidate.current_amount ?? 0;
  const loaniqPendingAmt = loaniqAmt - santixSelection.sum_paid_eur;
  const deltaEur = santixAmt - loaniqAmt;
  const deltaPct =
    loaniqAmt > 0
      ? Math.round((Math.abs(deltaEur) / loaniqAmt) * 10000) / 100
      : santixAmt > 0
      ? 100
      : 0;
  const confidencePct = Math.min(100, Math.max(0, 100 - group.delta_pct));

  const toggleInvoice = (index: number) => {
    setSelectedInvoiceIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleAllInvoices = () => {
    setSelectedInvoiceIndexes((prev) =>
      prev.size === invoices.length ? new Set() : new Set(invoices.map((_, index) => index))
    );
  };

  const SideField = ({ label, value, large }: { label: string; value: string; large?: boolean }) => (
    <div className="space-y-1">
      <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">{label}</span>
      <p className={`font-mono text-black bg-white px-2.5 py-1.5 rounded-md shadow-inner ${large ? "text-lg font-bold" : "text-sm"}`}>
        {value || "N/A"}
      </p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative flex items-stretch gap-3 max-w-[96vw] w-full justify-center animate-in fade-in zoom-in-95 duration-200">

        {/* Left Window: LoanIQ Candidate Data */}
        <div className="hidden md:flex flex-col w-64 bg-blue-900 rounded-xl shadow-xl overflow-hidden border border-blue-800 mt-4 mb-4 max-h-[76vh]">
          <div className="px-4 py-3 border-b border-blue-800 bg-blue-950/80">
            <h4 className="font-semibold text-white text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-white" /> Tramo LOANIQ
            </h4>
          </div>
          <div className="p-5 space-y-4 overflow-y-auto flex-1 bg-blue-900/30">
            <SideField label="Alias" value={candidate.alias} />
            <SideField label="Facility" value={candidate.facility} />
            <SideField label="Pricing Option" value={candidate.pricing_option ?? "-"} />
            <SideField label="Status" value={candidate.status ?? "-"} />
            <SideField label="Divisa" value={candidate.ccy ?? "-"} />
            <SideField label="Original Amount" value={fmtEUR(candidate.original_amount)} large />
            <SideField label="Current Amount" value={fmtEUR(candidate.current_amount)} />
            <SideField label="Host Bank Gross" value={fmtEUR(candidate.host_bank_gross)} />
            <SideField label="Effective Date" value={candidate.effective_date ?? "-"} />
            <SideField label="Maturity Date" value={candidate.maturity_date ?? "-"} />
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
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Detalle del Match</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Group Key</span>
                <p className="text-sm font-mono text-foreground font-medium">{group.group_key}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Facility Prefix</span>
                <p className="text-sm font-mono text-foreground font-medium">{group.facility_prefix}</p>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">SANTIX Debtor</span>
                <p className="text-sm font-mono text-foreground font-medium">{group.santix.debtor}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">LOANIQ Alias</span>
                <p className="text-sm font-mono text-foreground font-medium">{candidate.alias}</p>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Importe SANTIX</span>
                <p className="text-sm font-mono text-foreground font-medium">{fmtEUR(santixAmt)}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Importe LOANIQ</span>
                <p className="text-sm font-mono text-foreground font-medium">{fmtEUR(loaniqAmt)}</p>
              </div>

              {/* Delta highlight */}
              <div className="space-y-1 col-span-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <span className="text-xs text-amber-700/70 uppercase">Diferencia de Importe (Δ)</span>
                <p className={`text-sm font-mono font-bold mt-0.5 ${
                  Math.abs(deltaEur) < 0.01 ? "text-emerald-700" : "text-amber-900"
                }`}>
                  {Math.abs(deltaEur) < 0.01 ? "±0,00 €" : fmtEUR(deltaEur)} ({deltaPct}%)
                </p>
              </div>

              {/* Tier info */}
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Tier Actual</span>
                <Badge variant="outline" className={`text-xs ${TIER_BADGE[group.tier] ?? ""}`}>
                  {TIER_LABEL[group.tier] ?? group.tier}
                </Badge>
              </div>

              <div className="space-y-1 col-span-2">
                <span className="text-xs text-muted-foreground">Motivo de Match</span>
                <p className="text-sm text-foreground italic">{group.reason}</p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="p-4 bg-muted/20 border-t border-border flex gap-3">
            <Button
              variant="outline"
              className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                onReject();
                toast.info("Match descartado — registro sin cambios.");
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Descartar
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={santixSelection.invoice_count === 0}
              onClick={() => onAccept(group, candidate, santixSelection)}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirmar Override
            </Button>
          </div>
        </div>

        {/* Right Window: Santix invoice grid */}
        <div className="hidden md:flex flex-col w-96 min-w-80 max-w-[42rem] resize-x bg-blue-900 rounded-xl shadow-xl overflow-hidden border border-blue-800 mt-4 mb-4 max-h-[76vh]">
          <div className="px-4 py-3 border-b border-blue-800 bg-blue-950/80">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-semibold text-white text-sm flex items-center gap-2">
                  <Database className="h-4 w-4 text-white" /> Ficheros SANTIX
                </h4>
                <p className="text-[10px] text-blue-100/80 mt-1">
                  {santixSelection.invoice_count} de {invoices.length} seleccionados
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px] bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white"
                onClick={toggleAllInvoices}
              >
                {allInvoicesSelected ? "Desmarcar" : "Todos"}
              </Button>
            </div>
          </div>
          <div className="px-4 py-3 border-b border-blue-800 bg-blue-900/70">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md bg-white px-2.5 py-2 shadow-inner min-w-0">
                <p className="text-[9px] uppercase text-blue-900/70 font-semibold leading-tight">LoanIQ a conciliar</p>
                <p className="font-mono font-bold text-black whitespace-nowrap text-[11px]">{fmtEUR(loaniqPendingAmt)}</p>
              </div>
              <div className="rounded-md bg-white px-2.5 py-2 shadow-inner min-w-0">
                <p className="text-[9px] uppercase text-blue-900/70 font-semibold leading-tight">Seleccionado</p>
                <p className="font-mono font-bold text-black whitespace-nowrap text-[11px]">{fmtEUR(santixSelection.sum_paid_eur)}</p>
              </div>
              <div className="rounded-md bg-white px-2.5 py-2 shadow-inner min-w-0">
                <p className="text-[9px] uppercase text-blue-900/70 font-semibold leading-tight">Outstanding</p>
                <p className="font-mono font-bold text-black whitespace-nowrap text-[11px]">{fmtEUR(santixSelection.sum_outstanding_eur)}</p>
              </div>
            </div>
          </div>

          <div className="p-4 overflow-auto flex-1 bg-blue-900/30">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {invoices.map((invoice, index) => {
                const checked = selectedInvoiceIndexes.has(index);
                return (
                  <div
                    key={`${invoice.invoice_number}-${index}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleInvoice(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleInvoice(index);
                      }
                    }}
                    className={`text-left rounded-md border p-2.5 transition-colors min-h-[158px] ${
                      checked
                        ? "border-white bg-white text-black shadow-md"
                        : "border-blue-700 bg-blue-950/40 text-blue-50 hover:bg-blue-800/70"
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleInvoice(index)}
                        onClick={(event) => event.stopPropagation()}
                        className="mt-0.5 h-4 w-4 accent-blue-700"
                      />
                      <div className="min-w-0 flex-1 space-y-2.5">
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase font-semibold opacity-70 leading-none">Factura</p>
                          <p className="font-mono text-xs font-bold truncate mt-1" title={invoice.invoice_number || "N/A"}>
                            {invoice.invoice_number || "N/A"}
                          </p>
                        </div>
                        <div className="space-y-1 text-[11px] leading-tight">
                          <div className="flex items-center justify-between gap-2">
                            <span className="uppercase font-semibold opacity-70">Santix</span>
                            <span className="font-mono whitespace-nowrap">{fmtEUR(invoice.paid_eur)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="uppercase font-semibold opacity-70">Outstanding</span>
                            <span className="font-mono whitespace-nowrap">{fmtEUR(invoice.outstanding_eur)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="uppercase font-semibold opacity-70">Due</span>
                            <span className="font-mono whitespace-nowrap">{fmtShortDate(invoice.due_date)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="uppercase font-semibold opacity-70">Delay</span>
                            <span className="font-mono whitespace-nowrap">{invoice.days_overdue}</span>
                          </div>
                        </div>
                        <p className="text-[11px] truncate pt-0.5" title={invoice.debtor}>
                          {invoice.debtor || group.santix.debtor}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Upload Zone ─────────────────────────────────────────────────────────────
function UploadZone({
  label, file, dragOver, inputId, onFile, onDragOver, onDragLeave, onDrop, onClear,
}: {
  label: string;
  file: File | null;
  dragOver: boolean;
  inputId: string;
  onFile: (f: File) => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClear: () => void;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="p-6">
        <p className="text-sm font-medium text-foreground mb-3">{label}</p>
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
            file
              ? "border-success/40 bg-success/5"
              : dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/40 hover:bg-primary/5"
          }`}
          onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => document.getElementById(inputId)?.click()}
        >
          <input
            id={inputId}
            type="file"
            className="hidden"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <p className="font-medium text-sm text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={(e) => { e.stopPropagation(); onClear(); }}
              >
                Remove
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-full bg-muted p-4">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Drag & drop or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">Supports .xlsx, .xls, .csv</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
