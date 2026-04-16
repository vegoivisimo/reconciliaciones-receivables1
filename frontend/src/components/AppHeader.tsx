import { Bell, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "react-router-dom";
import santanderLogo from "@/assets/santander-logo.png";
import nttLogo from "../../images/ntt_logo.png";

const routeNames: Record<string, string> = {
  "/": "Control Panel",
  "/duco": "DUCO Selection",
  "/reconcileiq": "DUCO-SAP Validation",
  "/loaniq": "Santix-LoanIQ Validation",
};

export function AppHeader() {
  const location = useLocation();
  const currentPage = routeNames[location.pathname] || "Dashboard";

  return (
    <header className="h-10 border-b border-border flex items-center justify-between px-6" style={{ background: "hsl(222 47% 13%)" }}>
      {/* Mobile branding */}
      <div className="md:hidden">
        <div className="flex items-center gap-2">
          <img src={santanderLogo} alt="Banco Santander" className="h-7 w-7 rounded-full object-contain" />
          <h1 className="text-sm font-bold text-foreground">Receivables Hub</h1>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="hidden md:flex items-center gap-2 text-sm">
        <span className="text-muted-foreground text-xs">Receivables Hub</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
        <span className="text-foreground text-xs font-medium">{currentPage}</span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <Badge
          variant="outline"
          className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10 font-semibold"
        >
          UAT
        </Badge>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 text-muted-foreground hover:text-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
        </Button>
        <div className="h-6 w-px bg-border" />
        <div className="flex items-center">
          <div className="h-14 w-auto flex items-center justify-center">
            <img src={nttLogo} alt="NTT Data" className="h-full w-auto object-contain" />
          </div>
        </div>
      </div>
    </header>
  );
}
