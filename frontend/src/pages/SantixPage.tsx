import { useState, useMemo, useCallback } from "react";
import { StandardDropZone } from "@/components/StandardDropZone";
import { StandardLoadingOverlay } from "@/components/StandardLoadingOverlay";
import { StandardDonutChart, StandardKpiGrid } from "@/components/reconciliation/StandardDashboardWidgets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Users, DollarSign, TrendingUp, CheckCircle2, Download, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import * as XLSX from "xlsx";

import { santixApi } from "@/api/santix";

interface SantixRecord {
  sum_PAID_AMOUNT_CCY: number;
  SELLER: string;
  RECONCILIATION_DATE: string;
  PURCHASE_DATE: string;
  DEBTOR: string;
}

const parseDate = (s: string): Date => {
  const [d, m, y] = s.split("/");
  return new Date(+y, +m - 1, +d);
};

const formatEur = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

const formatNum = (v: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const COLORS = [
  "hsl(215 76% 52%)", "hsl(152 69% 36%)", "hsl(38 92% 50%)",
  "hsl(0 100% 46%)", "hsl(280 60% 50%)", "hsl(190 70% 42%)",
  "hsl(340 65% 50%)", "hsl(160 55% 40%)",
];

// ─── Pivot export logic ──────────────────────────────────────────────────────
function buildPivotRows(data: SantixRecord[]): string[][] {
  // Group: SELLER → DEBTOR → PURCHASE_DATE → { reconDates, amount }
  const sellerMap = new Map<string, Map<string, { total: number; purchases: Map<string, { total: number; recons: Map<string, number> }> }>>();

  for (const r of data) {
    if (!sellerMap.has(r.SELLER)) sellerMap.set(r.SELLER, new Map());
    const debtorMap = sellerMap.get(r.SELLER)!;
    if (!debtorMap.has(r.DEBTOR)) debtorMap.set(r.DEBTOR, { total: 0, purchases: new Map() });
    const debtor = debtorMap.get(r.DEBTOR)!;
    debtor.total += r.sum_PAID_AMOUNT_CCY;

    if (!debtor.purchases.has(r.PURCHASE_DATE)) debtor.purchases.set(r.PURCHASE_DATE, { total: 0, recons: new Map() });
    const purchase = debtor.purchases.get(r.PURCHASE_DATE)!;
    purchase.total += r.sum_PAID_AMOUNT_CCY;
    purchase.recons.set(r.RECONCILIATION_DATE, (purchase.recons.get(r.RECONCILIATION_DATE) || 0) + r.sum_PAID_AMOUNT_CCY);
  }

  const rows: string[][] = [["Etiquetas de fila", "Suma de LAST RECON AMOUNT"]];
  const grandTotal = data.reduce((s, r) => s + r.sum_PAID_AMOUNT_CCY, 0);

  // Sort sellers
  const sortedSellers = [...sellerMap.keys()].sort();
  for (const seller of sortedSellers) {
    const debtorMap = sellerMap.get(seller)!;
    const sellerTotal = [...debtorMap.values()].reduce((s, d) => s + d.total, 0);
    rows.push([seller, formatNum(sellerTotal)]);

    const sortedDebtors = [...debtorMap.keys()].sort();
    for (const debtor of sortedDebtors) {
      const d = debtorMap.get(debtor)!;
      rows.push([`  ${debtor}`, formatNum(d.total)]);

      const sortedPurchases = [...d.purchases.entries()].sort((a, b) => {
        const da = parseDate(a[0]), db = parseDate(b[0]);
        return da.getTime() - db.getTime();
      });
      for (const [purchDate, pData] of sortedPurchases) {
        rows.push([`    ${purchDate}`, formatNum(pData.total)]);
        const sortedRecons = [...pData.recons.entries()].sort((a, b) => {
          const da = parseDate(a[0]), db = parseDate(b[0]);
          return da.getTime() - db.getTime();
        });
        for (const [reconDate, amount] of sortedRecons) {
          rows.push([`      ${reconDate}`, formatNum(amount)]);
        }
      }
    }
  }
  rows.push(["Total general", formatNum(grandTotal)]);
  return rows;
}

export default function SantixPage() {
  const [data, setData] = useState<SantixRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [sellerFilter, setSellerFilter] = useState("all");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sortCol, setSortCol] = useState<"DEBTOR" | "PURCHASE_DATE" | "RECONCILIATION_DATE" | "sum_PAID_AMOUNT_CCY">("DEBTOR");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  const handleFileSelect = (f: File) => setFile(f);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) { toast.error("Please select a file first."); return; }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("Santix", file);
      const res = await santixApi.sendToWebhook(formData);
      // fetchClient handles res.ok check now, so we don't need 'if (!res.ok) throw ...' necessarily,
      // but `santixApi.sendToWebhook` might return raw response if `parseJson: false`.
      // Actually fetchClient throws, but wait, `fetchClient` returns a Response object if `parseJson: false`.
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { throw new Error("Invalid JSON response"); }
      let records: SantixRecord[];
      if (Array.isArray(json)) {
        records = json;
      } else if (json && typeof json === "object") {
        if (json.records) records = json.records;
        else if (json.results) records = json.results;
        else if (json.data) records = json.data;
        else if (json.sum_PAID_AMOUNT_CCY !== undefined) records = [json];
        else records = [];
      } else {
        records = [];
      }
      if (!records.length) throw new Error("No data returned");
      setData(records);
      toast.success(`${records.length} registros procesados correctamente.`);
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [file]);

  const handleExportExcel = useCallback(() => {
    if (!filtered.length) return;
    const pivotRows = buildPivotRows(filtered);
    const ws = XLSX.utils.aoa_to_sheet(pivotRows);
    // Set column widths
    ws["!cols"] = [{ wch: 60 }, { wch: 25 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pivot Table");
    XLSX.writeFile(wb, "Santix_Pivot_Report.xlsx");
    toast.success("Excel exported successfully.");
  }, [data, sellerFilter]);

  const sellers = useMemo(() => [...new Set(data.map((r) => r.SELLER))].sort(), [data]);

  const filtered = useMemo(
    () => (sellerFilter === "all" ? data : data.filter((r) => r.SELLER === sellerFilter)),
    [data, sellerFilter]
  );

  const totalRevenue = useMemo(() => filtered.reduce((s, r) => s + r.sum_PAID_AMOUNT_CCY, 0), [filtered]);
  const uniqueDebtors = useMemo(() => new Set(filtered.map((r) => r.DEBTOR)).size, [filtered]);
  const avgTransaction = useMemo(() => (filtered.length ? totalRevenue / filtered.length : 0), [totalRevenue, filtered]);

  const pieData = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => map.set(r.SELLER, (map.get(r.SELLER) || 0) + r.sum_PAID_AMOUNT_CCY));
    return Array.from(map.entries())
      .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const barData = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      const d = parseDate(r.RECONCILIATION_DATE);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, (map.get(key) || 0) + r.sum_PAID_AMOUNT_CCY);
    });
    return Array.from(map.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [filtered]);

  // ─── Upload view ───────────────────────────────────────────────────────────
  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 max-w-2xl mx-auto">
        <div className="text-center">
          <FileSpreadsheet className="h-12 w-12 text-primary mx-auto mb-3" />
          <h2 className="text-2xl font-bold text-foreground">Santix Processing</h2>
          <p className="text-muted-foreground mt-1">Upload your Santix export to generate the financial dashboard</p>
        </div>

        <StandardDropZone
          file={file}
          onFileSelect={handleFileSelect}
          title="Santix Export File"
          subtitle="Drag & drop the Santix report file"
          accentColor="blue"
        />

        <div className="flex gap-3">
          <Button onClick={handleUpload} disabled={!file || loading} size="lg" className="min-w-[220px]">
             {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
             Ejecutar Reconciliación
          </Button>
        </div>

        <StandardLoadingOverlay
          isVisible={loading}
          title="Ejecutando Conciliación"
          subtitle="Calculando métricas, tramos y fechas de vencimiento a partir del extracto de Santix."
        />
      </div>
    );
  }

  // ─── Dashboard view ────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header + filter + export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Santix Dashboard</h2>
          <p className="text-muted-foreground text-sm">Payment reconciliation analytics</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={sellerFilter} onValueChange={setSellerFilter}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Filter by Seller" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sellers</SelectItem>
              {sellers.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleExportExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <StandardKpiGrid
        className="sm:grid-cols-3 xl:grid-cols-3"
        items={[
          {
            id: "total-revenue",
            label: "Total Revenue",
            value: formatEur(totalRevenue),
            icon: <DollarSign className="h-5 w-5" />,
            tone: "success",
          },
          {
            id: "unique-debtors",
            label: "Unique Debtors",
            value: uniqueDebtors,
            icon: <Users className="h-5 w-5" />,
            tone: "info",
          },
          {
            id: "avg-transaction",
            label: "Avg Transaction",
            value: formatEur(avgTransaction),
            icon: <TrendingUp className="h-5 w-5" />,
            tone: "warning",
          },
        ]}
      />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StandardDonutChart
          title="Revenue by Seller"
          subtitle="Distribution over the current filtered data"
          data={pieData}
          height={300}
          valueLabel="EUR"
          tooltipFormatter={(value) => formatEur(value)}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-foreground">Monthly Revenue (Reconciliation Date)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 20% 93%)" />
                <XAxis dataKey="month" stroke="hsl(215 14% 46%)" fontSize={11} />
                <YAxis stroke="hsl(215 14% 46%)" fontSize={11} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => [formatEur(value), "Revenue"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="amount" fill="hsl(215 76% 52%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Debtor detail table */}
      {(() => {
        const compareDates = (a: string, b: string) => parseDate(a).getTime() - parseDate(b).getTime();
        const sortedData = [...filtered].sort((a, b) => {
          let cmp = 0;
          if (sortCol === "DEBTOR") cmp = a.DEBTOR.localeCompare(b.DEBTOR);
          else if (sortCol === "PURCHASE_DATE") cmp = compareDates(a.PURCHASE_DATE, b.PURCHASE_DATE);
          else if (sortCol === "RECONCILIATION_DATE") cmp = compareDates(a.RECONCILIATION_DATE, b.RECONCILIATION_DATE);
          else cmp = a.sum_PAID_AMOUNT_CCY - b.sum_PAID_AMOUNT_CCY;
          return sortDir === "asc" ? cmp : -cmp;
        });

        const toggleSort = (col: typeof sortCol) => {
          if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          else { setSortCol(col); setSortDir("asc"); }
        };

        const SortIcon = ({ col }: { col: typeof sortCol }) => {
          if (sortCol !== col) return <ArrowUpDown className="inline h-3 w-3 ml-1 text-muted-foreground" />;
          return sortDir === "asc"
            ? <ArrowUp className="inline h-3 w-3 ml-1 text-primary" />
            : <ArrowDown className="inline h-3 w-3 ml-1 text-primary" />;
        };

        const allSelected = sortedData.length > 0 && selectedRows.size === sortedData.length;
        const toggleAll = () => {
          if (allSelected) setSelectedRows(new Set());
          else setSelectedRows(new Set(sortedData.map((_, i) => i)));
        };
        const toggleRow = (i: number) => {
          setSelectedRows((prev) => {
            const next = new Set(prev);
            next.has(i) ? next.delete(i) : next.add(i);
            return next;
          });
        };

        let lastDebtor = "";
        return (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-foreground">Debtor Details</CardTitle>
              {selectedRows.size > 0 && (
                <span className="text-xs text-muted-foreground">{selectedRows.size} selected</span>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">
                        <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                      </TableHead>
                      <TableHead className="text-xs font-semibold cursor-pointer select-none" onClick={() => toggleSort("DEBTOR")}>
                        Debtor <SortIcon col="DEBTOR" />
                      </TableHead>
                      <TableHead className="text-xs font-semibold cursor-pointer select-none" onClick={() => toggleSort("PURCHASE_DATE")}>
                        Purchase Date <SortIcon col="PURCHASE_DATE" />
                      </TableHead>
                      <TableHead className="text-xs font-semibold cursor-pointer select-none" onClick={() => toggleSort("RECONCILIATION_DATE")}>
                        Reconciliation Date <SortIcon col="RECONCILIATION_DATE" />
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-right cursor-pointer select-none" onClick={() => toggleSort("sum_PAID_AMOUNT_CCY")}>
                        Paid Amount <SortIcon col="sum_PAID_AMOUNT_CCY" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedData.map((r, i) => {
                      const showDebtor = sortCol === "DEBTOR" && r.DEBTOR !== lastDebtor;
                      if (sortCol === "DEBTOR") lastDebtor = r.DEBTOR;
                      return (
                        <TableRow
                          key={`${r.DEBTOR}-${r.RECONCILIATION_DATE}-${r.PURCHASE_DATE}-${i}`}
                          className={`hover:bg-muted/30 ${selectedRows.has(i) ? "bg-primary/5" : ""} ${sortCol === "DEBTOR" && showDebtor && i > 0 ? "border-t-2 border-border" : ""}`}
                        >
                          <TableCell className="w-10">
                            <Checkbox checked={selectedRows.has(i)} onCheckedChange={() => toggleRow(i)} />
                          </TableCell>
                          <TableCell className="font-medium text-sm">{sortCol === "DEBTOR" ? (showDebtor ? r.DEBTOR : "") : r.DEBTOR}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{r.PURCHASE_DATE}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{r.RECONCILIATION_DATE}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatEur(r.sum_PAID_AMOUNT_CCY)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
