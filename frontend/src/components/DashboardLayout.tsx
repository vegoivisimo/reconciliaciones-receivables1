import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { Outlet } from "react-router-dom";

export function DashboardLayout() {
  return (
    <div className="flex min-h-screen w-full" style={{ background: "hsl(222 47% 11%)" }}>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader />
        <main className="flex-1 overflow-auto p-6" style={{ background: "hsl(222 47% 10%)" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
