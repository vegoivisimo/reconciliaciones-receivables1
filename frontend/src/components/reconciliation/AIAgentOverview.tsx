import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Bot, Zap, Target, Brain, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AIAgentOverviewProps {
  decisionsCount: number;
  averageConfidence?: number;
}

export function AIAgentOverview({ decisionsCount, averageConfidence }: AIAgentOverviewProps) {
  return (
    <Card className="glass-card relative overflow-hidden border-primary/20">
      {/* Decorative background pulse */}
      <div className="absolute top-0 right-0 -mr-8 -mt-8 h-24 w-24 bg-primary/10 rounded-full blur-2xl animate-pulse" />
      
      <CardContent className="p-4 relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Agente IA de Conciliación</p>
              <div className="flex items-center gap-1.5 leading-none mt-0.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-tighter">Agente Activo</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-secondary/30 rounded-lg p-2.5 border border-border/40">
              <p className="text-[10px] font-medium text-muted-foreground uppercase opacity-70">Decisiones Tomadas</p>
              <p className="text-lg font-bold text-foreground font-mono">{decisionsCount}</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-2.5 border border-border/40">
              <p className="text-[10px] font-medium text-muted-foreground uppercase opacity-70">Confianza Media</p>
              <p className="text-lg font-bold text-primary font-mono">{averageConfidence ?? 94}%</p>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Capacidades Activas</p>
            <div className="grid grid-cols-1 gap-1.5">
              <CapabilityItem icon={<Target className="h-3 w-3" />} label="Similitud Semántica" />
              <CapabilityItem icon={<Zap className="h-3 w-3" />} label="Lógica Fuzzy por Tolerancia" />
              <CapabilityItem icon={<Brain className="h-3 w-3" />} label="Reconocimiento de Patrones" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CapabilityItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/40 border border-border/20">
      <div className="text-primary opacity-80">{icon}</div>
      <span className="text-xs font-medium text-foreground/80">{label}</span>
      <ShieldCheck className="h-3 w-3 text-emerald-500 ml-auto opacity-70" />
    </div>
  );
}
