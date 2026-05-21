import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Period } from "@/lib/analytics-mock";

export type NegotiationItem = {
  name: string;
  qty: number;
  price: number;
  unit?: string;
  category?: string;
  productId?: string;
};

export type NegotiationSnapshot = {
  id: string;
  items: NegotiationItem[];
  project?: string;
  subtotal: number;
};

export type NegotiationRow = {
  id: string;
  order_id: string;
  project: string | null;
  supplier_name: string;
  status: string;
  sent_at: string;
  confirmed_at: string | null;
  order_snapshot: NegotiationSnapshot;
};

const CATEGORY_COLORS: Record<string, string> = {
  Fasteners: "#16A34A",
  PPE: "#2563EB",
  Electrical: "#0D9488",
  Tools: "#D97706",
  Other: "#6B7280",
};


const CATEGORY_PALETTE = ["#16A34A", "#2563EB", "#0D9488", "#D97706", "#7C3AED", "#DC2626", "#6B7280"];

function periodWindow(period: Period): { start: Date; end: Date; days: number } {
  const end = new Date();
  const start = new Date(end);
  const days = period === "woche" ? 7 : period === "monat" ? 30 : period === "quartal" ? 90 : 365;
  start.setDate(end.getDate() - days);
  return { start, end, days };
}

export function useNegotiations() {
  return useQuery({
    queryKey: ["negotiations", "analytics"],
    queryFn: async (): Promise<NegotiationRow[]> => {
      const { data, error } = await supabase
        .from("negotiations")
        .select("id, order_id, project, supplier_name, status, sent_at, confirmed_at, order_snapshot")
        .order("sent_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as NegotiationRow[];
    },
    staleTime: 30_000,
  });
}

export function filterByPeriod(rows: NegotiationRow[], period: Period): NegotiationRow[] {
  const { start } = periodWindow(period);
  return rows.filter((r) => new Date(r.sent_at) >= start);
}

export function filterByProject(rows: NegotiationRow[], project: string | null): NegotiationRow[] {
  if (!project) return rows;
  return rows.filter((r) => (r.project ?? r.order_snapshot?.project) === project);
}

export function computeKPIs(rows: NegotiationRow[]) {
  const spend = rows.reduce((s, r) => s + (r.order_snapshot?.subtotal ?? 0), 0);
  const count = rows.length;
  const avg = count ? spend / count : 0;
  const suppliers = new Set(rows.map((r) => r.supplier_name)).size;
  const confirmed = rows.filter((r) => r.status === "confirmed" || r.confirmed_at).length;
  const approvalRate = count ? Math.round((confirmed / count) * 100) : 0;
  // Avg approval time in minutes (where confirmed_at exists)
  const confirmedRows = rows.filter((r) => r.confirmed_at);
  const approvalMinutes = confirmedRows.length
    ? Math.round(
        confirmedRows.reduce(
          (s, r) => s + (new Date(r.confirmed_at!).getTime() - new Date(r.sent_at).getTime()) / 60000,
          0,
        ) / confirmedRows.length,
      )
    : 0;
  return { spend, count, avg, suppliers, approvalRate, approvalMinutes };
}

export function computeDailySeries(rows: NegotiationRow[], period: Period) {
  const { start, end, days } = periodWindow(period);
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i + 1);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of rows) {
    const key = new Date(r.sent_at).toISOString().slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + (r.order_snapshot?.subtotal ?? 0));
    }
  }
  const series: { date: string; label: string; spend: number; rolling7: number }[] = [];
  const raw: number[] = [];
  for (const [date, spend] of buckets) {
    const d = new Date(date);
    raw.push(spend);
    const window = raw.slice(Math.max(0, raw.length - 7));
    const rolling7 = Math.round(window.reduce((a, b) => a + b, 0) / window.length);
    series.push({
      date,
      label: `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      spend: Math.round(spend),
      rolling7,
    });
  }
  // last `end` ignored, already sorted by Map insertion
  void end;
  return series;
}

export function computeProjects(rows: NegotiationRow[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const p = r.project ?? r.order_snapshot?.project ?? "No project";

    map.set(p, (map.get(p) ?? 0) + (r.order_snapshot?.subtotal ?? 0));
  }
  return Array.from(map, ([project, total]) => ({ project, total: Math.round(total) })).sort(
    (a, b) => b.total - a.total,
  );
}

export function computeCategories(rows: NegotiationRow[]) {
  const map = new Map<string, { value: number; top: string; topQty: number }>();
  for (const r of rows) {
    for (const item of r.order_snapshot?.items ?? []) {
      const cat = item.category ?? "Other";
      const lineTotal = (item.price ?? 0) * (item.qty ?? 0);
      const cur = map.get(cat) ?? { value: 0, top: item.name, topQty: 0 };
      cur.value += lineTotal;
      if ((item.qty ?? 0) > cur.topQty) {
        cur.top = item.name;
        cur.topQty = item.qty ?? 0;
      }
      map.set(cat, cur);
    }
  }
  const total = Array.from(map.values()).reduce((s, c) => s + c.value, 0);
  const arr = Array.from(map, ([name, v], i) => ({
    name,
    value: Math.round(v.value),
    pct: total ? Math.round((v.value / total) * 100) : 0,
    color: CATEGORY_COLORS[name] ?? CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
    top: v.top,
  }));
  return arr.sort((a, b) => b.value - a.value);
}

export type SupplierAgg = {
  name: string;
  orders: number;
  spend: number;
  compliance: number;
  leadTime: string;
  status: "active" | "partial" | "none";
  statusLabel: string;
};

export function computeSuppliers(rows: NegotiationRow[]): SupplierAgg[] {
  const map = new Map<string, { orders: number; spend: number; replyMs: number; replied: number }>();
  for (const r of rows) {
    const cur = map.get(r.supplier_name) ?? { orders: 0, spend: 0, replyMs: 0, replied: 0 };
    cur.orders += 1;
    cur.spend += r.order_snapshot?.subtotal ?? 0;
    if (r.confirmed_at) {
      cur.replied += 1;
      cur.replyMs += new Date(r.confirmed_at).getTime() - new Date(r.sent_at).getTime();
    }
    map.set(r.supplier_name, cur);
  }
  return Array.from(map, ([name, v]) => {
    const compliance = v.orders ? Math.round((v.replied / v.orders) * 100) : 0;
    const leadDays = v.replied ? v.replyMs / v.replied / (1000 * 60 * 60 * 24) : 0;
    const status: SupplierAgg["status"] = compliance >= 95 ? "active" : compliance >= 50 ? "partial" : "none";
    return {
      name,
      orders: v.orders,
      spend: Math.round(v.spend),
      compliance,
      leadTime: v.replied ? `${leadDays.toFixed(1)} days` : "—",
      status,
      statusLabel:
        status === "active" ? "✓ Contract active" : status === "partial" ? "⚠ Partially compliant" : "✗ No contract",

    };
  }).sort((a, b) => b.spend - a.spend);
}

export type ForemanAgg = {
  foreman: string;
  project: string;
  orders: number;
  spend: number;
  avg: number;
  trend: number;
};

export function computeForemen(rows: NegotiationRow[]): ForemanAgg[] {
  // No foreman field in DB — group by project as a stand-in.
  const map = new Map<string, { orders: number; spend: number }>();
  for (const r of rows) {
    const p = r.project ?? r.order_snapshot?.project ?? "No project";
    const cur = map.get(p) ?? { orders: 0, spend: 0 };
    cur.orders += 1;
    cur.spend += r.order_snapshot?.subtotal ?? 0;
    map.set(p, cur);
  }
  return Array.from(map, ([project, v]) => ({
    foreman: `Foreman ${project}`,

    project,
    orders: v.orders,
    spend: Math.round(v.spend),
    avg: v.orders ? Math.round((v.spend / v.orders) * 10) / 10 : 0,
    trend: 0,
  })).sort((a, b) => b.spend - a.spend);
}

export function computeWeekday(rows: NegotiationRow[]) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const r of rows) counts[new Date(r.sent_at).getDay()] += 1;
  // Reorder to Mon-Sun
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((i) => ({ day: labels[i], value: counts[i], weekend: i === 0 || i === 6 }));

}

export function computeTimeOfDay(rows: NegotiationRow[]) {
  const slots = [
    { slot: "07–09h", from: 7, to: 9, count: 0 },
    { slot: "09–12h", from: 9, to: 12, count: 0 },
    { slot: "12–14h", from: 12, to: 14, count: 0 },
    { slot: "14–17h", from: 14, to: 17, count: 0 },
  ];
  for (const r of rows) {
    const h = new Date(r.sent_at).getHours();
    const s = slots.find((x) => h >= x.from && h < x.to);
    if (s) s.count += 1;
  }
  const total = slots.reduce((s, x) => s + x.count, 0) || 1;
  return slots.map((s) => ({ slot: s.slot, pct: Math.round((s.count / total) * 100) }));
}
