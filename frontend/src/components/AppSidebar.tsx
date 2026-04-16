import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import santanderLogo from "@/assets/santander-logo.png";
import {
  LayoutDashboard,
  Database,
  SendToBack,
  GitCompareArrows,
} from "lucide-react";
import { cn } from "@/lib/utils";

const workflowItems = [
  { to: "/duco", icon: Database, label: "DUCO Selection", step: 1 },
  { to: "/reconcileiq", icon: GitCompareArrows, label: "DUCO-SAP Validation", step: 2 },
  { to: "/loaniq", icon: SendToBack, label: "Santix-LoanIQ Validation", step: 3 },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="hidden md:flex flex-col w-64 min-h-screen border-r border-sidebar-border" style={{ background: "hsl(222 47% 9%)" }}>
      {/* Brand */}
      <div className="px-5 py-4 border-b border-sidebar-border">
        <div className="flex flex-col items-center gap-0.5">
          <img src={santanderLogo} alt="Santander" className="w-[55%] object-contain" />
          <h1 className="text-base font-bold text-foreground tracking-tight -mt-0.5">
            Receivables Hub
          </h1>
          <span className="text-[9px] text-muted-foreground tracking-widest uppercase">
            Reconciliation Platform
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {/* Control Panel */}
        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.15em] px-3 mb-2">
          Overview
        </p>
        <RouterNavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
              isActive
                ? "sidebar-glow text-foreground bg-white/[0.04]"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
            )
          }
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          <span>Control Panel</span>
        </RouterNavLink>

        {/* Workflow divider */}
        <div className="pt-4 pb-2">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.15em] px-3">
            Workflow
          </p>
        </div>

        {/* Workflow steps */}
        {workflowItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <RouterNavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                isActive
                  ? "sidebar-glow text-foreground bg-white/[0.04]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center h-5 w-5 rounded text-[10px] font-bold shrink-0 transition-all",
                  isActive
                    ? "bg-red-600 text-white"
                    : "bg-white/[0.06] text-muted-foreground group-hover:bg-white/[0.1]"
                )}
              >
                {item.step}
              </span>
              <span className="truncate">{item.label}</span>
            </RouterNavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <p className="text-[10px] text-muted-foreground">
          v2.0 — Receivables Hub
        </p>
        <p className="text-[9px] text-muted-foreground/50 mt-0.5">
          Powered by NTT DATA
        </p>
      </div>
    </aside>
  );
}
