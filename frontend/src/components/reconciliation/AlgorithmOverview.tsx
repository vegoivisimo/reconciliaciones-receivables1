import React from "react";
import {
  CheckCircle2,
  Clock,
  Layers,
  Brain,
  BookOpen,
  Search,
  Link2,
  Zap,
  GitBranch,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Step {
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
}

interface AlgorithmOverviewProps {
  module: "duco" | "loaniq";
}

// ─── Per-module step definitions ──────────────────────────────────────────────

const DUCO_STEPS: Step[] = [
  {
    title: "Coincidencia Exacta",
    description:
      "Cruce directo por importe, divisa y fecha exacta entre SAP y extracto DUCO.",
    badge: "Fase 1",
    badgeColor: "text-emerald-600 bg-emerald-500/10 border-emerald-200/40",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  },
  {
    title: "Tolerancia Temporal",
    description:
      "Matching con ventana de días configurable para diferencias de fecha de valor.",
    badge: "Fase 2",
    badgeColor: "text-blue-600 bg-blue-500/10 border-blue-200/40",
    icon: <Clock className="h-4 w-4 text-blue-500" />,
  },
  {
    title: "Agrupación N:1",
    description:
      "Suma de múltiples apuntes SAP contra un único movimiento bancario (instalments).",
    badge: "Fase 3",
    badgeColor: "text-amber-600 bg-amber-500/10 border-amber-200/40",
    icon: <Layers className="h-4 w-4 text-amber-500" />,
  },
  {
    title: "Revisión IA",
    description:
      "Análisis semántico de referencias y textos para detectar coincidencias ambiguas.",
    badge: "Fase 4",
    badgeColor: "text-violet-600 bg-violet-500/10 border-violet-200/40",
    icon: <Brain className="h-4 w-4 text-violet-500" />,
  },
];

const LOANIQ_STEPS: Step[] = [
  {
    title: "Aprendizaje Previo",
    description:
      "Alias aprendido de un override manual anterior (SQLite). Se re-valida deudor fuzzy ≥ 70% y sum_paid ≤ OA antes de aplicar.",
    badge: "Tier 0",
    badgeColor: "text-indigo-600 bg-indigo-500/10 border-indigo-200/40",
    icon: <BookOpen className="h-4 w-4 text-indigo-500" />,
  },
  {
    title: "Alias Exacto",
    description:
      "LIQ_ID_DISPO coincide con Alias LOANIQ + deudor fuzzy ≥ 70% + sum_paid ≤ Original Amount (tolerancia 0,02 €).",
    badge: "Tier 1",
    badgeColor: "text-emerald-600 bg-emerald-500/10 border-emerald-200/40",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  },
  {
    title: "Overflow",
    description:
      "Alias exacto y deudor OK, pero sum_paid supera el Original Amount del tramo. Requiere revisión manual.",
    badge: "Tier 2",
    badgeColor: "text-amber-600 bg-amber-500/10 border-amber-200/40",
    icon: <Zap className="h-4 w-4 text-amber-500" />,
  },
  {
    title: "Cross-Prefix",
    description:
      "Búsqueda global en toda la cartera LOANIQ: deudor fuzzy ≥ 75% (o ≥ 70% si hay alias como ancla) y sum_paid ≤ OA.",
    badge: "Tier 3",
    badgeColor: "text-violet-600 bg-violet-500/10 border-violet-200/40",
    icon: <GitBranch className="h-4 w-4 text-violet-500" />,
  },
  {
    title: "Deudor Mismatch",
    description:
      "Alias exacto encontrado pero ningún tramo supera el gate de deudor y cross-prefix no halló candidatos. Revisar asignación.",
    badge: "Tier 4",
    badgeColor: "text-orange-600 bg-orange-500/10 border-orange-200/40",
    icon: <Search className="h-4 w-4 text-orange-500" />,
  },
  {
    title: "Sin Match",
    description:
      "Sin alias exacto ni candidatos cross-prefix válidos. Investigación manual requerida.",
    badge: "Tier 5",
    badgeColor: "text-red-600 bg-red-500/10 border-red-200/40",
    icon: <Layers className="h-4 w-4 text-red-500" />,
  },
];

// ─── Component ─────────────────────────────────────────────────────────────────
export function AlgorithmOverview({ module }: AlgorithmOverviewProps) {
  const steps = module === "duco" ? DUCO_STEPS : LOANIQ_STEPS;
  const cols = steps.length;

  return (
    <div className="w-full space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          {module === "duco"
            ? "Motor DUCO-SAP: Fases de Conciliación"
            : "Motor Santix-LoanIQ: Tiers de Matching"}
        </h3>
        <div className="h-px flex-1 bg-border/50" />
      </div>

      {/* Steps — horizontal strip */}
      <div
        className="grid gap-0 w-full"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {steps.map((step, i) => (
          <div
            key={i}
            className={[
              "relative flex flex-col bg-card border-y border-r border-border/50",
              "px-4 py-3 hover:bg-muted/30 transition-colors group",
              i === 0 ? "border-l rounded-l-xl" : "",
              i === cols - 1 ? "rounded-r-xl" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {/* Badge + icon row */}
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-md bg-secondary/60 group-hover:bg-secondary transition-colors flex-shrink-0">
                {step.icon}
              </div>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-tighter ${step.badgeColor}`}
              >
                {step.badge}
              </span>
            </div>

            <p className="text-xs font-semibold text-foreground mb-1 leading-tight">
              {step.title}
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug flex-1">
              {step.description}
            </p>

            {/* Separator arrow (all but last) */}
            {i < cols - 1 && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[7px] z-10">
                <div className="h-3 w-3 bg-card border-r border-t border-border/50 rotate-45" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p className="text-[10px] text-muted-foreground/60 text-right pr-1">
        {module === "loaniq"
          ? "Los tiers se evalúan en cascada. El primero que resuelve corta la búsqueda."
          : "Las fases se ejecutan secuencialmente. Los registros sin match pasan a la siguiente fase."}
      </p>
    </div>
  );
}
