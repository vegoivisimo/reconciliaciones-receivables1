import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
} from "recharts";
import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "accent";

export interface StandardKpi {
  id: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
  tone?: KpiTone;
}

export interface StandardDonutDatum {
  name: string;
  value: number;
  color: string;
}

const formatAiInsightParagraphs = (text: string) =>
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

const kpiToneStyles: Record<KpiTone, { icon: string; value: string }> = {
  neutral: { icon: "bg-muted text-muted-foreground", value: "text-foreground" },
  success: { icon: "bg-emerald-500/10 text-emerald-700", value: "text-emerald-700" },
  warning: { icon: "bg-amber-500/10 text-amber-700", value: "text-amber-700" },
  danger: { icon: "bg-red-500/10 text-red-700", value: "text-red-700" },
  info: { icon: "bg-blue-500/10 text-blue-700", value: "text-blue-700" },
  accent: { icon: "bg-primary/10 text-primary", value: "text-primary" },
};

export function StandardKpiGrid({
  items,
  className,
}: {
  items: StandardKpi[];
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4", className)}>
      {items.map((item) => {
        const tone = kpiToneStyles[item.tone ?? "neutral"];
        return (
          <Card key={item.id} className="glass-card">
            <CardContent className="p-4 flex items-start gap-3">
              <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0", tone.icon)}>
                {item.icon}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider leading-tight">
                  {item.label}
                </p>
                <p className={cn("text-xl font-bold mt-1 truncate", tone.value)}>{item.value}</p>
                {item.sub && <p className="text-xs text-muted-foreground/75 mt-0.5 truncate">{item.sub}</p>}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function StandardDonutChart({
  title,
  subtitle,
  data,
  height = 220,
  valueLabel = "registros",
  tooltipFormatter,
}: {
  title: string;
  subtitle?: string;
  data: StandardDonutDatum[];
  height?: number;
  valueLabel?: string;
  tooltipFormatter?: (value: number, name: string) => string;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
              cornerRadius={4}
              stroke="hsl(var(--card))"
              strokeWidth={2}
            >
              {data.map((entry, i) => (
                <Cell key={`${entry.name}-${i}`} fill={entry.color} />
              ))}
            </Pie>
            <RTooltip
              formatter={(value: number, name: string) => [
                tooltipFormatter ? tooltipFormatter(value, name) : `${value} ${valueLabel}`,
                name,
              ]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-2 mt-2 justify-center">
          {data.map((item) => (
            <span key={item.name} className="flex items-center gap-1 text-xs text-muted-foreground">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              {item.name} ({item.value})
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function AiInsightsCard({
  text,
  paragraphs,
  loading = false,
}: {
  text?: string | null;
  paragraphs?: string[];
  loading?: boolean;
}) {
  const content = paragraphs ?? (text ? formatAiInsightParagraphs(text) : []);
  const isLoading = loading || content.length === 0;

  return (
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
              <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-tighter">
                GPT-4o mini
              </span>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 pt-1">
            <div className="h-3 bg-muted/60 rounded animate-pulse w-full" />
            <div className="h-3 bg-muted/60 rounded animate-pulse w-5/6" />
            <div className="h-3 bg-muted/60 rounded animate-pulse w-4/6" />
            <p className="text-[10px] text-muted-foreground/50 mt-2">Generando analisis...</p>
          </div>
        ) : (
          <div className="min-h-[112px] flex flex-col justify-center gap-4">
            {content.map((paragraph, i) => (
              <p key={i} className="text-sm text-foreground/80 leading-7 text-justify hyphens-auto">
                {paragraph}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
