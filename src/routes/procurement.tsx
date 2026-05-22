import { createFileRoute, Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { Inbox, ListChecks, BarChart3, Package, HardHat, LogOut, Bot, Database, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
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
  // Orders are loaded from localStorage on the client only — avoid rendering
  // the count badge during SSR so hydration matches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const pendingCount = mounted
    ? orders.filter((o) => o.status === "pending_pm" || o.status === "pending_central").length
    : 0;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [project, setProject] = useState("ramistrasse-101");

  const projects = [
    { id: "ramistrasse-101", label: "Rämistrasse 101" },
    { id: "bahnhofstrasse-42", label: "Bahnhofstrasse 42" },
    { id: "langstrasse-77", label: "Langstrasse 77" },
    { id: "sechselautenplatz-1", label: "Sechseläutenplatz 1" },
    { id: "limmatquai-150", label: "Limmatquai 150" },
  ];

  const nav = [
    { to: "/procurement", label: "Approvals", icon: Inbox, badge: pendingCount },
    { to: "/procurement/orders", label: "Orders", icon: ListChecks },
    { to: "/procurement/agent", label: "Supplier agent", icon: Bot },
    { to: "/procurement/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/procurement/catalog", label: "Catalog", icon: Package },
    { to: "/procurement/catalog/manage", label: "Manage database", icon: Database, indent: true },
    { to: "/procurement/settings", label: "Approval rules", icon: SlidersHorizontal },
  ] as const;

  return (
    <div className="min-h-screen flex bg-muted/30 text-foreground">
      <aside className="w-60 shrink-0 border-r bg-card hidden md:flex flex-col">
        <div className="border-b px-3 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-md bg-brand text-brand-foreground grid place-items-center">
              <HardHat className="size-5" />
            </div>
            <div className="leading-tight">
              <div className="font-semibold text-sm">comstruct</div>
              <div className="text-[11px] text-muted-foreground">Procurement</div>
            </div>
          </div>
          <Select value={project} onValueChange={setProject}>
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {nav.map((n) => {
            const active = n.to === "/procurement"
              ? pathname === "/procurement" || pathname === "/procurement/"
              : n.to === "/procurement/catalog"
                ? pathname === "/procurement/catalog" || pathname === "/procurement/catalog/"
                : pathname.startsWith(n.to);
            const indent = "indent" in n && n.indent;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2.5 px-3 h-9 rounded-md text-sm font-medium transition-colors ${
                  indent ? "ml-4" : ""
                } ${active ? "bg-brand text-brand-foreground" : "hover:bg-accent"}`}
              >
                <n.icon className="size-4" />
                <span className="flex-1">{n.label}</span>
                {"badge" in n && n.badge ? (
                  <span className={`text-[10px] font-bold rounded-sm px-1.5 py-0.5 ${
                    active ? "bg-brand-foreground text-brand" : "bg-muted text-foreground border border-border"
                  }`}>
                    {n.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t space-y-1">
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
      <LogOut className="size-4" /> Switch user
    </button>
  );
}
