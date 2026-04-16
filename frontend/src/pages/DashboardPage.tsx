import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  kpiData,
  collectionTrends,
  collectionTrendsMonthly,
  collectionTrendsYTD,
  pipelineData,
  exceptionBreakdown,
  topCounterparties,
  recentActivity,
} from "@/data/mockData";
import {
  TrendingUp,
  TrendingDown,
  Banknote,
  Target,
  AlertTriangle,
  BarChart3,
  Zap,
  Server,
  Bot,
  User,
  CheckCircle2,
  ArrowRight,
  Clock,
  Building2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const formatEur = (v: number) =>
  `€${v.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatCompact = (v: number) => {
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `€${(v / 1_000).toFixed(0)}K`;
  return `€${v}`;
};

const auditIcons: Record<string, typeof Server> = {
  system: Server,
  ai: Bot,
  user: User,
};

const auditDotColors: Record<string, string> = {
  system: "bg-blue-400",
  ai: "bg-red-400",
  user: "bg-emerald-400",
};

export default function DashboardPage() {
  const [period, setPeriod] = useState<"weekly" | "monthly" | "ytd">("monthly");

  const chartData =
    period === "weekly"
      ? collectionTrends
      : period === "monthly"
      ? collectionTrendsMonthly
      : collectionTrendsYTD;

  const kpis = [
    {
      label: "Total Receivables Volume",
      value: `€${(kpiData.totalCollections / 1_000_000).toFixed(1)}M`,
      icon: Banknote,
      trend: "+8.4%",
      trendUp: true,
      sub: "vs previous period",
      accentClass: "from-red-500/20 to-red-900/10",
      iconColor: "text-red-400",
    },
    {
      label: "DUCO Match Rate",
      value: `${kpiData.ducoMatchRate}%`,
      icon: Target,
      trend: "+2.1%",
      trendUp: true,
      sub: "ERP validation accuracy",
      accentClass: "from-emerald-500/20 to-emerald-900/10",
      iconColor: "text-emerald-400",
    },
    {
      label: "Pending Exceptions",
      value: kpiData.pendingExceptions.toString(),
      icon: AlertTriangle,
      trend: "-3",
      trendUp: false,
      sub: "requiring manual review",
      accentClass: "from-amber-500/20 to-amber-900/10",
      iconColor: "text-amber-400",
    },

    {
      label: "LoanIQ Execution",
      value: `${kpiData.loaniqExecRate}%`,
      icon: Zap,
      trend: "+1.8%",
      trendUp: true,
      sub: "records booked",
      accentClass: "from-violet-500/20 to-violet-900/10",
      iconColor: "text-violet-400",
    },
  ];

  const pipelineStatusColors: Record<string, string> = {
    completed: "bg-emerald-500",
    "in-progress": "bg-amber-500",
    pending: "bg-slate-600",
  };

  const pipelineStatusLabels: Record<string, string> = {
    completed: "Completed",
    "in-progress": "In Progress",
    pending: "Pending",
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Control Panel
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Receivables reconciliation overview — {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
            System Online
          </Badge>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="glass-card-hover overflow-hidden relative">
            <div className={`absolute inset-0 bg-gradient-to-br ${k.accentClass} pointer-events-none`} />
            <CardContent className="relative pt-5 pb-4 px-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-tight">
                  {k.label}
                </p>
                <k.icon className={`h-4 w-4 ${k.iconColor} opacity-80`} />
              </div>
              <div className="text-2xl font-bold text-foreground tracking-tight font-mono">
                {k.value}
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                {k.trendUp ? (
                  <TrendingUp className="h-3 w-3 text-emerald-400" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-emerald-400" />
                )}
                <span className="text-xs text-emerald-400 font-medium">
                  {k.trend}
                </span>
                <span className="text-[10px] text-muted-foreground ml-0.5">
                  {k.sub}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Reconciliation Performance */}
        <Card className="glass-card lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                Reconciliation Performance
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Matched vs. total volume over time
              </p>
            </div>
            <Select
              value={period}
              onValueChange={(v) => setPeriod(v as typeof period)}
            >
              <SelectTrigger className="w-28 h-8 text-xs bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="ytd">YTD</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(215 76% 56%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(215 76% 56%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradMatched" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(160 72% 42%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(160 72% 42%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(217 33% 22%)"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  stroke="hsl(215 20% 45%)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(215 20% 45%)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) =>
                    v >= 1_000_000 ? `€${v / 1_000_000}M` : `€${v / 1000}k`
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(222 47% 14%)",
                    border: "1px solid hsl(217 33% 22%)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "hsl(210 40% 96%)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  }}
                  formatter={(value: number, name: string) =>
                    name === "amount"
                      ? [formatEur(value), "Total Volume"]
                      : [formatEur(value), "Matched"]
                  }
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="hsl(215 76% 56%)"
                  fill="url(#gradTotal)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="matched"
                  stroke="hsl(160 72% 42%)"
                  fill="url(#gradMatched)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Exception Breakdown */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">
              Exception Breakdown
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              {kpiData.pendingExceptions} total pending
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={exceptionBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  cornerRadius={3}
                  stroke="none"
                >
                  {exceptionBreakdown.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(222 47% 14%)",
                    border: "1px solid hsl(217 33% 22%)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "hsl(210 40% 96%)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {exceptionBreakdown.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-muted-foreground">{item.name}</span>
                  </div>
                  <span className="font-mono font-medium text-foreground">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Pipeline + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline Status */}
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              Reconciliation Pipeline
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              End-to-end processing workflow status
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {pipelineData.map((step, i) => (
              <div key={step.stage}>
                <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors">
                  <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-secondary text-muted-foreground text-xs font-bold shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground truncate">
                        {step.stage}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 h-4 border-0 ${
                          step.status === "completed"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : step.status === "in-progress"
                            ? "bg-amber-500/15 text-amber-400"
                            : "bg-slate-500/15 text-slate-400"
                        }`}
                      >
                        {pipelineStatusLabels[step.status]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span>{step.records.toLocaleString("de-DE")} records</span>
                      <span>•</span>
                      <span>{formatCompact(step.value)}</span>
                    </div>
                    <div className="h-1 rounded-full bg-secondary mt-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${pipelineStatusColors[step.status]}`}
                        style={{
                          width:
                            step.status === "completed"
                              ? "100%"
                              : step.status === "in-progress"
                              ? "65%"
                              : "0%",
                        }}
                      />
                    </div>
                  </div>
                </div>
                {i < pipelineData.length - 1 && (
                  <div className="flex justify-center py-0.5">
                    <ArrowRight className="h-3 w-3 text-muted-foreground/30 rotate-90" />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-foreground">
                  Recent Activity
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  Latest system events
                </p>
              </div>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-0">
              {recentActivity.map((event, i) => {
                const Icon = auditIcons[event.type];
                return (
                  <div
                    key={event.id}
                    className="relative flex gap-3 py-2.5 group hover:bg-secondary/30 rounded-md px-2 -mx-2 transition-colors"
                  >
                    {/* Timeline connector */}
                    {i < recentActivity.length - 1 && (
                      <div className="absolute left-[14px] top-[34px] w-px h-[calc(100%-18px)] bg-border" />
                    )}
                    {/* Dot */}
                    <div className={`h-2.5 w-2.5 rounded-full mt-1.5 shrink-0 ${auditDotColors[event.type]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground leading-relaxed">
                        {event.event}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {event.timestamp}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Top Counterparties */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                Top Counterparties
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Top 10 by receivables volume
              </p>
            </div>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30 hover:bg-secondary/30 border-border">
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Counterparty
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">
                  Volume (EUR)
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-center">
                  Match Rate
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-center">
                  Exceptions
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Last Activity
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topCounterparties.map((cp) => (
                <TableRow
                  key={cp.name}
                  className="hover:bg-secondary/20 transition-colors border-border"
                >
                  <TableCell className="text-xs font-medium text-foreground">
                    {cp.name}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-foreground text-right">
                    {formatEur(cp.volume)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-mono px-2 py-0 border-0 ${
                        cp.matched >= 95
                          ? "bg-emerald-500/15 text-emerald-400"
                          : cp.matched >= 85
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {cp.matched.toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {cp.exceptions === 0 ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mx-auto" />
                    ) : (
                      <span className="text-xs font-mono text-amber-400">
                        {cp.exceptions}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
                    {cp.lastActivity}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
