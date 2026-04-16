// ─── Dashboard KPIs ──────────────────────────────────────────────────────────
export const kpiData = {
  totalCollections: 42_815_600,
  ducoMatchRate: 94.7,
  pendingExceptions: 23,
  santixCoverage: 87.3,
  loaniqExecRate: 96.1,
};

// ─── Pipeline Status ─────────────────────────────────────────────────────────
export const pipelineData = [
  { stage: "DUCO Selection", records: 1248, value: 42815600, status: "completed" as const },
  { stage: "DUCO-SAP Validation", records: 1181, value: 40523900, status: "completed" as const },
  { stage: "Santix Summary", records: 1031, value: 35412700, status: "in-progress" as const },
  { stage: "LoanIQ Booking", records: 989, value: 33945200, status: "pending" as const },
];

// ─── Collection Trends ───────────────────────────────────────────────────────
export const collectionTrends = [
  { day: "Mon", amount: 6200000, matched: 5890000, exceptionRate: 3.2 },
  { day: "Tue", amount: 4800000, matched: 4555000, exceptionRate: 5.1 },
  { day: "Wed", amount: 7100000, matched: 6900000, exceptionRate: 2.8 },
  { day: "Thu", amount: 3900000, matched: 3650000, exceptionRate: 6.4 },
  { day: "Fri", amount: 5700000, matched: 5472000, exceptionRate: 4.0 },
  { day: "Sat", amount: 2500000, matched: 2320000, exceptionRate: 7.2 },
  { day: "Sun", amount: 12615600, matched: 12375000, exceptionRate: 1.9 },
];

export const collectionTrendsMonthly = [
  { day: "Oct", amount: 32000000, matched: 30200000, exceptionRate: 4.1 },
  { day: "Nov", amount: 28000000, matched: 26500000, exceptionRate: 5.3 },
  { day: "Dec", amount: 35000000, matched: 33700000, exceptionRate: 3.7 },
  { day: "Jan", amount: 41000000, matched: 39800000, exceptionRate: 2.9 },
  { day: "Feb", amount: 38000000, matched: 36290000, exceptionRate: 4.5 },
  { day: "Mar", amount: 42815600, matched: 41500000, exceptionRate: 3.2 },
];

export const collectionTrendsYTD = [
  { day: "Q1", amount: 95000000, matched: 91200000, exceptionRate: 4.4 },
  { day: "Q2", amount: 121158000, matched: 116900000, exceptionRate: 3.5 },
  { day: "Q3", amount: 108000000, matched: 103800000, exceptionRate: 3.9 },
  { day: "Q4", amount: 82000000, matched: 78100000, exceptionRate: 4.8 },
];

// ─── Exception Breakdown ─────────────────────────────────────────────────────
export const exceptionBreakdown = [
  { name: "Amount Mismatch", value: 8, color: "#ef4444" },
  { name: "Missing Invoice", value: 6, color: "#f59e0b" },
  { name: "Name Mismatch", value: 4, color: "#3b82f6" },
  { name: "Date Discrepancy", value: 3, color: "#8b5cf6" },
  { name: "Duplicate Entry", value: 2, color: "#6366f1" },
];

// ─── Top Counterparties ──────────────────────────────────────────────────────
export const topCounterparties = [
  { name: "BIEBER + MARBURG GMBH CO. KG", volume: 4_215_800, matched: 97.2, exceptions: 1, lastActivity: "10 Apr 2026, 09:14" },
  { name: "THYSSENKRUPP STEEL EUROPE AG", volume: 3_892_400, matched: 94.8, exceptions: 2, lastActivity: "10 Apr 2026, 08:55" },
  { name: "ARCIMPEX S.R.O.", volume: 3_120_000, matched: 99.1, exceptions: 0, lastActivity: "09 Apr 2026, 17:30" },
  { name: "KLÖCKNER & CO SE", volume: 2_845_600, matched: 88.5, exceptions: 3, lastActivity: "10 Apr 2026, 10:22" },
  { name: "SALZGITTER FLACHSTAHL GMBH", volume: 2_342_000, matched: 95.6, exceptions: 1, lastActivity: "09 Apr 2026, 16:45" },
  { name: "SPAETER AG", volume: 2_150_300, matched: 99.8, exceptions: 0, lastActivity: "10 Apr 2026, 08:12" },
  { name: "VOESTALPINE STAHL GMBH", volume: 1_978_500, matched: 93.2, exceptions: 2, lastActivity: "09 Apr 2026, 15:20" },
  { name: "BENTELER DISTRIBUTION GMBH", volume: 1_856_200, matched: 96.4, exceptions: 1, lastActivity: "10 Apr 2026, 07:58" },
  { name: "DAIMLER TRUCK AG", volume: 1_622_000, matched: 98.5, exceptions: 0, lastActivity: "09 Apr 2026, 14:10" },
  { name: "OUTOKUMPU OYJ", volume: 1_450_900, matched: 82.3, exceptions: 4, lastActivity: "10 Apr 2026, 11:05" },
];

// ─── Recent Activity Feed ────────────────────────────────────────────────────
export const recentActivity = [
  { id: "1", timestamp: "10 Apr 2026, 11:32", event: "DUCO batch #204 imported — 156 records", type: "system" as const },
  { id: "2", timestamp: "10 Apr 2026, 11:28", event: "ERP validation completed — 94.7% match rate", type: "ai" as const },
  { id: "3", timestamp: "10 Apr 2026, 10:45", event: "Exception resolved: KLÖCKNER & CO SE — Amount Mismatch", type: "user" as const },
  { id: "4", timestamp: "10 Apr 2026, 10:22", event: "AI flagged amount discrepancy (€456K vs €451.2K)", type: "ai" as const },
  { id: "5", timestamp: "10 Apr 2026, 09:15", event: "Santix summary exported — 1,031 positions", type: "system" as const },
  { id: "6", timestamp: "10 Apr 2026, 08:55", event: "LoanIQ batch #89 booked — 42 records, €3.2M", type: "system" as const },
  { id: "7", timestamp: "09 Apr 2026, 17:30", event: "Compliance review completed for ARCIMPEX S.R.O.", type: "user" as const },
  { id: "8", timestamp: "09 Apr 2026, 16:45", event: "DUCO-SAP validation override approved by A. García", type: "user" as const },
];

// ─── Legacy types / data (used by other pages) ──────────────────────────────

export type PaymentStatus = "Matched" | "Pending" | "Execution";

export interface BankPayment {
  id: string;
  transactionId: string;
  sourceAccount: string;
  buyerName: string;
  invoiceNr: string | null;
  amount: number;
  date: string;
  status: PaymentStatus;
}

export const bankPayments: BankPayment[] = [
  { id: "1", transactionId: "TXN-2024-00142", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "SPAETER AG", invoiceNr: "INV-88421", amount: 245000, date: "2024-12-09", status: "Matched" },
  { id: "2", transactionId: "TXN-2024-00143", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "DAIMLER TRUCK AG", invoiceNr: "INV-88422", amount: 182500, date: "2024-12-09", status: "Matched" },
  { id: "3", transactionId: "TXN-2024-00144", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "BIEBER + MARBURG GMBH", invoiceNr: null, amount: 97300, date: "2024-12-09", status: "Pending" },
  { id: "4", transactionId: "TXN-2024-00145", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "ARCIMPEX S.R.O.", invoiceNr: "INV-88424", amount: 312000, date: "2024-12-08", status: "Matched" },
  { id: "5", transactionId: "TXN-2024-00146", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "THYSSENKRUPP STEEL EUROPE AG", invoiceNr: "INV-88425", amount: 78900, date: "2024-12-08", status: "Execution" },
  { id: "6", transactionId: "TXN-2024-00147", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "KLÖCKNER & CO SE", invoiceNr: null, amount: 456000, date: "2024-12-08", status: "Pending" },
  { id: "7", transactionId: "TXN-2024-00148", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "SALZGITTER FLACHSTAHL GMBH", invoiceNr: "INV-88427", amount: 134200, date: "2024-12-07", status: "Matched" },
  { id: "8", transactionId: "TXN-2024-00149", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "VOESTALPINE STAHL GMBH", invoiceNr: "INV-88428", amount: 267800, date: "2024-12-07", status: "Execution" },
  { id: "9", transactionId: "TXN-2024-00150", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "OUTOKUMPU OYJ", invoiceNr: null, amount: 189500, date: "2024-12-07", status: "Pending" },
  { id: "10", transactionId: "TXN-2024-00151", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "BENTELER DISTRIBUTION GMBH", invoiceNr: "INV-88430", amount: 523000, date: "2024-12-06", status: "Matched" },
  { id: "11", transactionId: "TXN-2024-00152", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "STAHLWERK THÜRINGEN GMBH", invoiceNr: "INV-88431", amount: 88700, date: "2024-12-06", status: "Matched" },
  { id: "12", transactionId: "TXN-2024-00153", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "KNAUF GIPS KG", invoiceNr: null, amount: 145600, date: "2024-12-06", status: "Pending" },
  { id: "13", transactionId: "TXN-2024-00154", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "WUPPERMANN AG", invoiceNr: "INV-88433", amount: 231400, date: "2024-12-05", status: "Execution" },
  { id: "14", transactionId: "TXN-2024-00155", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "GEORGSMARIENHÜTTE GMBH", invoiceNr: "INV-88434", amount: 67800, date: "2024-12-05", status: "Matched" },
  { id: "15", transactionId: "TXN-2024-00156", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "HOESCH HOHENLIMBURG GMBH", invoiceNr: null, amount: 412000, date: "2024-12-05", status: "Pending" },
  { id: "16", transactionId: "TXN-2024-00157", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "MANNESMANN PRECISION TUBES", invoiceNr: "INV-88436", amount: 178900, date: "2024-12-04", status: "Matched" },
  { id: "17", transactionId: "TXN-2024-00158", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "SCHMOLZ + BICKENBACH AG", invoiceNr: "INV-88437", amount: 95200, date: "2024-12-04", status: "Execution" },
  { id: "18", transactionId: "TXN-2024-00159", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "JACQUET METALS SA", invoiceNr: null, amount: 334500, date: "2024-12-04", status: "Pending" },
  { id: "19", transactionId: "TXN-2024-00160", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "RUUKKI CONSTRUCTION OY", invoiceNr: "INV-88439", amount: 156700, date: "2024-12-03", status: "Matched" },
  { id: "20", transactionId: "TXN-2024-00161", sourceAccount: "DE89 3704 0044 0532 0130 00", buyerName: "TATA STEEL EUROPE LTD", invoiceNr: "INV-88440", amount: 289000, date: "2024-12-03", status: "Matched" },
];

export type DiscrepancyReason = "Missing Invoice" | "Amount Mismatch" | "Duplicate Entry" | "Name Mismatch" | "Date Discrepancy";

export interface ActionItem {
  id: string;
  transactionId: string;
  counterparty: string;
  reason: DiscrepancyReason;
  date: string;
  confidence: number;
  amount: number;
  invoiceNr: string | null;
  vat: number;
  sourceAccount: string;
}

export const actionItems: ActionItem[] = [
  { id: "1", transactionId: "TXN-2024-00144", counterparty: "BIEBER + MARBURG GMBH", reason: "Missing Invoice", date: "2024-12-09", confidence: 72, amount: 97300, invoiceNr: null, vat: 18487, sourceAccount: "DE89 3704 0044 0532 0130 00" },
  { id: "2", transactionId: "TXN-2024-00147", counterparty: "KLÖCKNER & CO SE", reason: "Amount Mismatch", date: "2024-12-08", confidence: 65, amount: 456000, invoiceNr: "INV-88460", vat: 86640, sourceAccount: "DE89 3704 0044 0532 0130 00" },
  { id: "3", transactionId: "TXN-2024-00150", counterparty: "OUTOKUMPU OYJ", reason: "Missing Invoice", date: "2024-12-07", confidence: 58, amount: 189500, invoiceNr: null, vat: 36005, sourceAccount: "DE89 3704 0044 0532 0130 00" },
  { id: "4", transactionId: "TXN-2024-00153", counterparty: "KNAUF GIPS KG", reason: "Name Mismatch", date: "2024-12-06", confidence: 81, amount: 145600, invoiceNr: "INV-88461", vat: 27664, sourceAccount: "DE89 3704 0044 0532 0130 00" },
  { id: "5", transactionId: "TXN-2024-00156", counterparty: "HOESCH HOHENLIMBURG GMBH", reason: "Duplicate Entry", date: "2024-12-05", confidence: 44, amount: 412000, invoiceNr: null, vat: 78280, sourceAccount: "DE89 3704 0044 0532 0130 00" },
  { id: "6", transactionId: "TXN-2024-00159", counterparty: "JACQUET METALS SA", reason: "Date Discrepancy", date: "2024-12-04", confidence: 77, amount: 334500, invoiceNr: "INV-88462", vat: 63555, sourceAccount: "DE89 3704 0044 0532 0130 00" },
  { id: "7", transactionId: "TXN-2024-00162", counterparty: "STAHLWERK THÜRINGEN GMBH", reason: "Amount Mismatch", date: "2024-12-03", confidence: 69, amount: 88700, invoiceNr: "INV-88463", vat: 16853, sourceAccount: "DE89 3704 0044 0532 0130 00" },
  { id: "8", transactionId: "TXN-2024-00165", counterparty: "WUPPERMANN AG", reason: "Missing Invoice", date: "2024-12-02", confidence: 53, amount: 231400, invoiceNr: null, vat: 43966, sourceAccount: "DE89 3704 0044 0532 0130 00" },
];

export interface AuditEvent {
  id: string;
  timestamp: string;
  event: string;
  type: "system" | "ai" | "user";
}

export const auditTrail: AuditEvent[] = [
  { id: "1", timestamp: "2024-12-09 14:32:10", event: "System ingested data via n8n webhook", type: "system" },
  { id: "2", timestamp: "2024-12-09 14:32:15", event: "AI flagged amount mismatch (€456,000 vs €451,200)", type: "ai" },
  { id: "3", timestamp: "2024-12-09 14:45:00", event: "User requested review from compliance team", type: "user" },
  { id: "4", timestamp: "2024-12-09 15:10:22", event: "System matched invoice INV-88460 to transaction", type: "system" },
  { id: "5", timestamp: "2024-12-09 15:30:00", event: "AI confidence score updated to 78%", type: "ai" },
];

export type MatchType = "Perfect Match" | "Grouped Payment" | "Fuzzy Name" | "Missing Invoice";

export interface AIMatch {
  id: string;
  bankPayment: { transactionId: string; buyerName: string; amount: number; date: string };
  sapDocument: { docId: string; clientName: string; amount: number; invoiceNr: string };
  matchType: MatchType;
  confidence: number;
}

export const aiMatches: AIMatch[] = [
  { id: "1", bankPayment: { transactionId: "TXN-2024-00142", buyerName: "SPAETER AG", amount: 245000, date: "2024-12-09" }, sapDocument: { docId: "SAP-SPA-4421", clientName: "SPAETER AG", amount: 245000, invoiceNr: "INV-88421" }, matchType: "Perfect Match", confidence: 99.8 },
  { id: "2", bankPayment: { transactionId: "TXN-2024-00143", buyerName: "DAIMLER TRUCK AG", amount: 182500, date: "2024-12-09" }, sapDocument: { docId: "SAP-DAI-3302", clientName: "DAIMLER TRUCK AG", amount: 182500, invoiceNr: "INV-88422" }, matchType: "Perfect Match", confidence: 99.5 },
  { id: "3", bankPayment: { transactionId: "TXN-2024-00144", buyerName: "BIEBER + MARBURG GMBH", amount: 97300, date: "2024-12-09" }, sapDocument: { docId: "SAP-BIE-7891", clientName: "BIEBER & MARBURG GMBH", amount: 97300, invoiceNr: "INV-88450" }, matchType: "Fuzzy Name", confidence: 87.2 },
  { id: "4", bankPayment: { transactionId: "TXN-2024-00145", buyerName: "ARCIMPEX S.R.O.", amount: 312000, date: "2024-12-08" }, sapDocument: { docId: "SAP-ARC-1120", clientName: "ARCIMPEX S.R.O.", amount: 312000, invoiceNr: "INV-88424" }, matchType: "Perfect Match", confidence: 99.9 },
  { id: "5", bankPayment: { transactionId: "TXN-2024-00146", buyerName: "THYSSENKRUPP STEEL EUROPE AG", amount: 78900, date: "2024-12-08" }, sapDocument: { docId: "SAP-TKS-5567", clientName: "THYSSENKRUPP STEEL EUROPE", amount: 78900, invoiceNr: "INV-88425" }, matchType: "Fuzzy Name", confidence: 85.1 },
  { id: "6", bankPayment: { transactionId: "TXN-2024-00147", buyerName: "KLÖCKNER & CO SE", amount: 456000, date: "2024-12-08" }, sapDocument: { docId: "SAP-KCO-2240", clientName: "KLÖCKNER & CO SE", amount: 456000, invoiceNr: "—" }, matchType: "Missing Invoice", confidence: 72.4 },
  { id: "7", bankPayment: { transactionId: "TXN-2024-00148", buyerName: "SALZGITTER FLACHSTAHL GMBH", amount: 134200, date: "2024-12-07" }, sapDocument: { docId: "SAP-SFG-9910", clientName: "SALZGITTER FLACHSTAHL", amount: 134200, invoiceNr: "INV-88427" }, matchType: "Fuzzy Name", confidence: 88.9 },
  { id: "8", bankPayment: { transactionId: "TXN-2024-00151", buyerName: "BENTELER DISTRIBUTION GMBH", amount: 523000, date: "2024-12-06" }, sapDocument: { docId: "SAP-BDG-6650", clientName: "BENTELER DISTRIBUTION GMBH", amount: 523000, invoiceNr: "INV-88430" }, matchType: "Perfect Match", confidence: 99.7 },
  { id: "9", bankPayment: { transactionId: "TXN-2024-00149", buyerName: "VOESTALPINE STAHL GMBH", amount: 267800, date: "2024-12-07" }, sapDocument: { docId: "SAP-VOE-3340+SAP-VOE-3341", clientName: "VOESTALPINE STAHL GMBH", amount: 267800, invoiceNr: "INV-88428a/b" }, matchType: "Grouped Payment", confidence: 93.1 },
  { id: "10", bankPayment: { transactionId: "TXN-2024-00150", buyerName: "OUTOKUMPU OYJ", amount: 189500, date: "2024-12-07" }, sapDocument: { docId: "SAP-OUT-4455", clientName: "OUTOKUMPU OYJ", amount: 189500, invoiceNr: "—" }, matchType: "Missing Invoice", confidence: 68.5 },
];

export interface SantixRow {
  id: string;
  deudor: string;
  vencimiento: string;
  posicion: string;
  importePrincipal: number;
}

export const santixData: SantixRow[] = [
  { id: "1", deudor: "SPAETER AG", vencimiento: "2024-12-15", posicion: "POS-SPA-001", importePrincipal: 245000 },
  { id: "2", deudor: "DAIMLER TRUCK AG", vencimiento: "2024-12-20", posicion: "POS-DAI-002", importePrincipal: 182500 },
  { id: "3", deudor: "ARCIMPEX S.R.O.", vencimiento: "2024-12-18", posicion: "POS-ARC-003", importePrincipal: 312000 },
  { id: "4", deudor: "BENTELER DISTRIBUTION GMBH", vencimiento: "2024-12-22", posicion: "POS-BDG-004", importePrincipal: 523000 },
  { id: "5", deudor: "SALZGITTER FLACHSTAHL GMBH", vencimiento: "2024-12-25", posicion: "POS-SFG-005", importePrincipal: 134200 },
  { id: "6", deudor: "VOESTALPINE STAHL GMBH", vencimiento: "2024-12-28", posicion: "POS-VOE-006", importePrincipal: 267800 },
  { id: "7", deudor: "THYSSENKRUPP STEEL EUROPE AG", vencimiento: "2024-12-15", posicion: "POS-TKS-007", importePrincipal: 78900 },
  { id: "8", deudor: "KLÖCKNER & CO SE", vencimiento: "2024-12-20", posicion: "POS-KCO-008", importePrincipal: 456000 },
];

export interface LoaniqRow {
  id: string;
  transactionId: string;
  debtor: string;
  amount: number;
  currency: string;
  matchType: MatchType;
  sapRef: string;
  status: "Ready" | "Exported";
}

export const loaniqData: LoaniqRow[] = [
  { id: "1", transactionId: "TXN-2024-00142", debtor: "SPAETER AG", amount: 245000, currency: "EUR", matchType: "Perfect Match", sapRef: "SAP-SPA-4421", status: "Ready" },
  { id: "2", transactionId: "TXN-2024-00143", debtor: "DAIMLER TRUCK AG", amount: 182500, currency: "EUR", matchType: "Perfect Match", sapRef: "SAP-DAI-3302", status: "Ready" },
  { id: "3", transactionId: "TXN-2024-00145", debtor: "ARCIMPEX S.R.O.", amount: 312000, currency: "EUR", matchType: "Perfect Match", sapRef: "SAP-ARC-1120", status: "Ready" },
  { id: "4", transactionId: "TXN-2024-00148", debtor: "SALZGITTER FLACHSTAHL GMBH", amount: 134200, currency: "EUR", matchType: "Fuzzy Name", sapRef: "SAP-SFG-9910", status: "Ready" },
  { id: "5", transactionId: "TXN-2024-00151", debtor: "BENTELER DISTRIBUTION GMBH", amount: 523000, currency: "EUR", matchType: "Perfect Match", sapRef: "SAP-BDG-6650", status: "Exported" },
  { id: "6", transactionId: "TXN-2024-00149", debtor: "VOESTALPINE STAHL GMBH", amount: 267800, currency: "EUR", matchType: "Grouped Payment", sapRef: "SAP-VOE-3340", status: "Ready" },
  { id: "7", transactionId: "TXN-2024-00146", debtor: "THYSSENKRUPP STEEL EUROPE AG", amount: 78900, currency: "EUR", matchType: "Fuzzy Name", sapRef: "SAP-TKS-5567", status: "Exported" },
  { id: "8", transactionId: "TXN-2024-00147", debtor: "KLÖCKNER & CO SE", amount: 456000, currency: "EUR", matchType: "Missing Invoice", sapRef: "SAP-KCO-2240", status: "Ready" },
];