import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { aiMatches, MatchType } from "@/data/mockData";
import { ArrowRight } from "lucide-react";

const matchColors: Record<MatchType, string> = {
  "Perfect Match": "bg-success/10 text-success border-success/20",
  "Grouped Payment": "bg-info/10 text-info border-info/20",
  "Fuzzy Name": "bg-warning/10 text-warning border-warning/20",
  "Missing Invoice": "bg-primary/10 text-primary border-primary/20",
};

const formatEur = (v: number) => `€${v.toLocaleString("de-DE")}`;

export default function AIMatcherPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">AI Matcher</h2>
        <p className="text-muted-foreground text-sm">Reconciliation results — Bank Payments ↔ SAP Documents</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(matchColors).map(([type, cls]) => (
          <Badge key={type} variant="outline" className={cls + " text-xs"}>{type}</Badge>
        ))}
      </div>

      <div className="space-y-3">
        {aiMatches.map((m) => (
          <Card key={m.id} className="glass-card hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Bank Payment</p>
                  <p className="font-mono text-xs text-muted-foreground">{m.bankPayment.transactionId}</p>
                  <p className="font-medium text-sm text-foreground">{m.bankPayment.buyerName}</p>
                  <p className="font-mono text-sm text-foreground">{formatEur(m.bankPayment.amount)}</p>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <ArrowRight className="h-5 w-5 text-muted-foreground hidden md:block" />
                  <Badge variant="outline" className={matchColors[m.matchType] + " text-xs"}>{m.matchType}</Badge>
                  <span className="text-xs text-muted-foreground font-mono">{m.confidence}%</span>
                </div>

                <div className="space-y-1 md:text-right">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">SAP Document</p>
                  <p className="font-mono text-xs text-muted-foreground">{m.sapDocument.docId}</p>
                  <p className="font-medium text-sm text-foreground">{m.sapDocument.clientName}</p>
                  <p className="font-mono text-sm text-foreground">{formatEur(m.sapDocument.amount)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
