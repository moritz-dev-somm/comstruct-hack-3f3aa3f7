import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEUR } from "@/lib/catalog";
import { useOrders } from "@/lib/orders";

export const Route = createFileRoute("/procurement/analytics")({
  component: Analytics,
});

const COLORS = ["#C8281E", "#1D4F9E", "#3F8A56", "#D9883A", "#7A5A8F"];

function Analytics() {
  const { orders } = useOrders();

  const totals = useMemo(() => {
    const now = Date.now();
    const inMonth = orders.filter(
      (o) => now - new Date(o.createdAt).getTime() < 30 * 24 * 60 * 60_000,
    );
    const spend = inMonth.reduce((s, o) => s + o.subtotal, 0);
    const avg = inMonth.length ? spend / inMonth.length : 0;
    return {
      spend,
      count: inMonth.length,
      avg,
      suppliers: new Set(inMonth.flatMap((o) => o.items.map((i) => i.category))).size,
    };
  }, [orders]);

  const byProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) map.set(o.project, (map.get(o.project) ?? 0) + o.subtotal);
    return Array.from(map, ([project, total]) => ({ project, total }));
  }, [orders]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      for (const i of o.items) {
        map.set(i.category, (map.get(i.category) ?? 0) + i.qty * i.price);
      }
    }
    return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [orders]);

  const topForemen = useMemo(() => {
    const map = new Map<string, { foreman: string; project: string; spend: number; count: number }>();
    for (const o of orders) {
      const key = o.foreman;
      const cur = map.get(key) ?? { foreman: o.foreman, project: o.project, spend: 0, count: 0 };
      cur.spend += o.subtotal;
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.spend - a.spend).slice(0, 5);
  }, [orders]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Spend analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Last 30 days of C-material activity.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="C-spend this month" value={formatEUR(totals.spend)} />
        <Kpi label="Orders" value={totals.count.toString()} />
        <Kpi label="Categories" value={totals.suppliers.toString()} />
        <Kpi label="Avg order value" value={formatEUR(totals.avg)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Spend per project">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byProject}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="project" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `€${v}`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => formatEUR(v)} />
              <Bar dataKey="total" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Spend by category">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => formatEUR(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {byCategory.map((c, i) => (
              <span key={c.name} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                {c.name}
              </span>
            ))}
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Top foremen this month">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left font-medium py-2">Foreman</th>
              <th className="text-left font-medium py-2">Project</th>
              <th className="text-right font-medium py-2">Orders</th>
              <th className="text-right font-medium py-2">Spend</th>
            </tr>
          </thead>
          <tbody>
            {topForemen.length === 0 && (
              <tr><td colSpan={4} className="text-center text-muted-foreground py-6">No orders yet.</td></tr>
            )}
            {topForemen.map((r) => (
              <tr key={r.foreman} className="border-t">
                <td className="py-2 font-medium">{r.foreman}</td>
                <td className="py-2 text-muted-foreground">{r.project}</td>
                <td className="py-2 text-right tabular-nums">{r.count}</td>
                <td className="py-2 text-right tabular-nums font-semibold">{formatEUR(r.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="font-semibold text-sm mb-3">{title}</h3>
      {children}
    </div>
  );
}
