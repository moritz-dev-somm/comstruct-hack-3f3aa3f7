import { createFileRoute, Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { Inbox, ListChecks, BarChart3, Package, ArrowLeft, HardHat, LogOut, Bot } from "lucide-react";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrders } from "@/lib/orders";
import { useRole } from "@/lib/role";

export const Route = createFileRoute("/procurement")({
  component: ProcurementLayout,
  head: () => ({
    meta: [{ title: "Procurement — comstruct" }],
  }),
});

function ProcurementLayout() {
  const { orders } = useOrders();
  const pendingCount = orders.filter(
    (o) => o.status === "pending_pm" || o.status === "pending_central",
  ).length;
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const nav = [
    { to: "/procurement", label: "Approvals", icon: Inbox, badge: pendingCount },
    { to: "/procurement/orders", label: "Orders", icon: ListChecks },
    { to: "/procurement/agent", label: "Supplier agent", icon: Bot },
    { to: "/procurement/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/procurement/catalog", label: "Catalog", icon: Package },
  ] as const;

  return (
    <div className="min-h-screen flex bg-muted/30 text-foreground">
      <aside className="w-60 shrink-0 border-r bg-card hidden md:flex flex-col">
        <div className="h-14 border-b px-4 flex items-center gap-2">
          <div className="size-8 rounded-md bg-brand text-brand-foreground grid place-items-center">
            <HardHat className="size-5" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-sm">comstruct</div>
            <div className="text-[11px] text-muted-foreground">Procurement</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {nav.map((n) => {
            const active = n.to === "/procurement"
              ? pathname === "/procurement" || pathname === "/procurement/"
              : pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2.5 px-3 h-9 rounded-md text-sm font-medium transition-colors ${
                  active ? "bg-brand text-brand-foreground" : "hover:bg-accent"
                }`}
              >
                <n.icon className="size-4" />
                <span className="flex-1">{n.label}</span>
                {"badge" in n && n.badge ? (
                  <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${
                    active ? "bg-brand-foreground text-brand" : "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                  }`}>
                    {n.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t space-y-1">
          <Link
            to="/"
            className="flex items-center gap-2 px-3 h-9 rounded-md text-xs text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="size-4" /> Back to foreman view
          </Link>
          <SwitchRoleButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}

function SwitchRoleButton() {
  const { logout } = useRole();
  const navigate = useNavigate();
  return (
    <button
      onClick={() => {
        logout();
        navigate({ to: "/login" });
      }}
      className="w-full flex items-center gap-2 px-3 h-9 rounded-md text-xs text-muted-foreground hover:bg-accent"
    >
      <LogOut className="size-4" /> Switch role
    </button>
  );
}
