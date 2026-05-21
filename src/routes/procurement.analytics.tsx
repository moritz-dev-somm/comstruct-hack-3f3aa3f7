import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, X } from "lucide-react";
import {
  APPROVAL_TIERS,
  APPROVAL_TIMES,
  PERIODS,
  type Period,
  REJECTIONS,
  formatCHF,
  formatCHFShort,
} from "@/lib/analytics-mock";
import {
  computeCategories,
  computeDailySeries,
  computeForemen,
  computeKPIs,
  computeProjects,
  computeSuppliers,
  computeTimeOfDay,
  computeWeekday,
  filterByPeriod,
  filterByProject,
  useNegotiations,
} from "@/lib/analytics-data";

export const Route = createFileRoute("/procurement/analytics")({
  component: Analytics,
});

const PAGE_BG = "#F9FAFB";
const CARD = "rounded-xl border border-[#E5E7EB] shadow-sm bg-white";
const GREEN = "#16A34A";
const BLUE = "#2563EB";
const GRAY = "#6B7280";
const RED = "#DC2626";

function Analytics() {
  const [period, setPeriod] = useState<Period>("monat");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [foremanDrawer, setForemanDrawer] = useState<string | null>(null);

  const spendRef = useRef<HTMLDivElement | null>(null);
  const supplierRef = useRef<HTMLDivElement | null>(null);
  const approvalRef = useRef<HTMLDivElement | null>(null);

  const { data: allRows = [] } = useNegotiations();
  const periodRows = useMemo(() => filterByPeriod(allRows, period), [allRows, period]);
  const scopedRows = useMemo(() => filterByProject(periodRows, projectFilter), [periodRows, projectFilter]);

  const kpis = useMemo(() => computeKPIs(scopedRows), [scopedRows]);
  const series = useMemo(() => computeDailySeries(scopedRows, period), [scopedRows, period]);
  const projects = useMemo(() => computeProjects(periodRows), [periodRows]);
  const categories = useMemo(() => computeCategories(scopedRows), [scopedRows]);
  const suppliers = useMemo(() => computeSuppliers(scopedRows), [scopedRows]);
  const foremen = useMemo(() => computeForemen(scopedRows), [scopedRows]);
  const WEEKDAY = useMemo(() => computeWeekday(scopedRows), [scopedRows]);
  const TIMEOFDAY = useMemo(() => computeTimeOfDay(scopedRows), [scopedRows]);

  const categoryTotal = categories.reduce((s, c) => s + c.value, 0);
  const topDay = useMemo(
    () => (series.length ? series.reduce((m, d) => (d.spend > m.spend ? d : m), series[0]) : { label: "—", spend: 0 }),
    [series],
  );
  const quietDay = useMemo(
    () => series.find((d) => d.spend === 0) ?? series[0] ?? { label: "—", spend: 0 },
    [series],
  );

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) =>
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });


  const exportCSV = () => {
    const csvContent = `Project,Foreman,Orders,Spend CHF,Supplier,Category,Date
Schulhaus Zürich-Nord,Marco Bianchi,18,1640,ACME Construction,PPE,May 2026
Renovation Hardturm,Anna Kessler,14,1280,Würth AG,Fasteners,May 2026
Warehouse New Build,Peter Hofer,9,760,Bosch Professional,Tools,May 2026
Post Building Refurb,Thomas Meier,6,604,Fischer,Plastics,May 2026`;
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "comstruct_analytics_May_2026.csv";
    a.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div style={{ background: PAGE_BG }} className="min-h-screen">
      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-bold text-[#111827] leading-tight">Spend Analytics</h1>
            <p className="text-[13px] text-[#6B7280]">C-material procurement</p>
            {projectFilter && (
              <div className="mt-2 inline-flex items-center gap-2 bg-[#ECFDF5] text-[#065F46] text-xs px-2.5 py-1 rounded-full border border-[#A7F3D0]">
                Active filter: {projectFilter}
                <button onClick={() => setProjectFilter(null)} aria-label="Remove filter">
                  <X className="size-3.5" />
                </button>
              </div>
            )}

          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex bg-white border border-[#E5E7EB] rounded-full p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`px-3.5 py-1.5 text-xs rounded-full transition-colors ${
                    period === p.id ? "text-white" : "text-[#374151] hover:bg-[#F3F4F6]"
                  }`}
                  style={period === p.id ? { background: GREEN } : undefined}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-md border border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] text-[#111827]"
            >
              <Download className="size-4" /> Export
            </button>
          </div>
        </header>

        {/* §1 KPI row */}
        <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard
            label="Total C-material spend"
            value={formatCHF(kpis.spend)}
            trend={12}
            trendLabel="vs last month"
            onClick={() => scrollTo(spendRef)}
          />
          <KpiCard
            label="Number of orders"
            value={String(kpis.count)}
            trend={8}
            onClick={() => scrollTo(spendRef)}
          />
          <KpiCard
            label="Avg. order value"
            value={formatCHF(kpis.avg)}
            trend={-3}
            onClick={() => scrollTo(spendRef)}
          />
          <KpiCard
            label="Active suppliers"
            value={String(kpis.suppliers)}
            trend={0}
            onClick={() => scrollTo(supplierRef)}
          />
          <KpiCard
            label="Approval rate"
            value={`${kpis.approvalRate}%`}
            trend={2}
            onClick={() => scrollTo(approvalRef)}
          />
          <KpiCard
            label="Avg. approval time"
            value={`${kpis.approvalMinutes} min`}
            trend={-22}
            invertTrend
            onClick={() => scrollTo(approvalRef)}
          />

        </section>

        {/* §2 Spend over time */}
        <section ref={spendRef} className={`${CARD} p-5`}>
          <SectionHeader title="Spend over time" subtitle="Daily C-material spend over the selected period" />
          <div className="h-[320px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: GRAY }} axisLine={{ stroke: "#E5E7EB" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: GRAY }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCHFShort(v)} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }}
                  formatter={(v: number, name: string) => [formatCHF(v), name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="spend" name="Daily spend" fill={GREEN} fillOpacity={0.75} radius={[3, 3, 0, 0]} />
                <Line dataKey="rolling7" name="7-day average" stroke={BLUE} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Chip>📈 Peak day: {topDay.label} — {formatCHF(topDay.spend)} (Electrical starter kit ×3)</Chip>
            <Chip>📉 Quietest day: {quietDay.label} (Sunday) — CHF 0</Chip>
            <Chip>⚡ Avg. Monday 34% higher than other weekdays</Chip>
          </div>
        </section>


        {/* §3 Spend Breakdown */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={`${CARD} p-5`}>
            <SectionHeader title="Spend by project" subtitle="Click a bar to filter the whole dashboard" />
            <div className="h-[280px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projects} layout="vertical" margin={{ top: 10, right: 50, left: 10, bottom: 0 }}>
                  <CartesianGrid stroke="#F3F4F6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: GRAY }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCHFShort(v)} />
                  <YAxis dataKey="project" type="category" width={150} tick={{ fontSize: 11, fill: "#111827" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }}
                    formatter={(v: number) => [formatCHF(v), "Spend"]}
                  />
                  <Bar
                    dataKey="total"
                    fill={GREEN}
                    radius={[0, 4, 4, 0]}
                    onClick={(d: { project: string }) => setProjectFilter(d.project)}
                    style={{ cursor: "pointer" }}
                    label={{ position: "right", formatter: (v: number) => formatCHF(v), fontSize: 11, fill: "#111827" }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`${CARD} p-5`}>
            <SectionHeader title="Spend by category" subtitle="Share of total budget" />
            <div className="h-[280px] mt-4 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categories}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={1}
                    label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
                    labelLine={{ stroke: "#9CA3AF" }}
                  >
                    {categories.map((c) => (
                      <Cell key={c.name} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }}
                    formatter={(v: number, _n, p) => {
                      const payload = p?.payload as { name: string; pct: number; top: string } | undefined;
                      return [`${formatCHF(v)} (${payload?.pct ?? 0}%) — Top: ${payload?.top ?? ""}`, payload?.name ?? ""];
                    }}
                  />

                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-[11px] text-[#6B7280]">Total</div>
                <div className="text-[18px] font-bold text-[#111827]">{formatCHF(categoryTotal)}</div>
              </div>
            </div>
          </div>
        </section>

        {/* §4 Supplier Analysis */}
        <section ref={supplierRef} className={`${CARD} p-5`}>
          <SectionHeader title="Supplier analysis" subtitle="Spend, contract compliance and delivery performance" />
          <SupplierTable rows={suppliers} />
          <div className="mt-4 bg-[#FEF3C7] border border-[#FDE68A] rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[13px] text-[#92400E]">
              ⚠ CHF 224 spent with suppliers without a framework agreement. Recommendation: consolidate orders with ACME and Würth AG.
            </div>
            <Link
              to="/settings"
              className="text-xs px-3 py-1.5 rounded-md bg-white border border-[#FDE68A] text-[#92400E] hover:bg-[#FFFBEB]"
            >
              Adjust ordering rules →
            </Link>
          </div>

        </section>

        {/* §5 Ordering Behaviour */}
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className={`${CARD} p-5 lg:col-span-3`}>
            <SectionHeader title="Top orderers" subtitle="Ordering behaviour by foreman" />
            <ForemanTable rows={foremen} onSelect={setForemanDrawer} />
          </div>
          <div className={`${CARD} p-5 lg:col-span-2`}>
            <SectionHeader title="Ordering patterns" subtitle="When do foremen order?" />
            <div className="text-[12px] text-[#6B7280] mt-3 mb-1">Orders by weekday</div>
            <div className="h-[170px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={WEEKDAY} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: GRAY }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: GRAY }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }} />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {WEEKDAY.map((d) => (
                      <Cell key={d.day} fill={d.weekend ? "#D1D5DB" : GREEN} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[12px] text-[#6B7280] mt-4 mb-2">Orders by time of day</div>

            <div className="space-y-2">
              {TIMEOFDAY.map((t) => (
                <div key={t.slot} className="flex items-center gap-2 text-[12px]">
                  <span className="w-16 text-[#374151]">{t.slot}</span>
                  <div className="flex-1 h-2.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${t.pct}%`, background: GREEN }} />
                  </div>
                  <span className="w-10 text-right text-[#6B7280]">{t.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* §6 Approval Performance */}
        <section ref={approvalRef} className={`${CARD} p-5`}>
          <SectionHeader title="Genehmigungsperformance" subtitle="Durchlaufzeiten und Entscheidungsverhalten" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
            {/* Chart A */}
            <div>
              <div className="text-[13px] font-semibold text-[#111827] mb-1">Genehmigungszeiten</div>
              <div className="text-[12px] text-[#6B7280] mb-2">Wie schnell werden Bestellungen genehmigt?</div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={APPROVAL_TIMES} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#F3F4F6" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: GRAY }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: GRAY }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }} />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                      {APPROVAL_TIMES.map((b) => (
                        <Cell key={b.bucket} fill={b.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-[12px] text-[#16A34A] font-medium mt-1">Ø 18 Minuten — Ziel: unter 30 Minuten ✓</div>
            </div>

            {/* Chart B */}
            <div>
              <div className="text-[13px] font-semibold text-[#111827] mb-1">Genehmigungen nach Schwellwert</div>
              <div className="text-[12px] text-[#6B7280] mb-2">Aufschlüsselung nach Genehmigungsstufe</div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={APPROVAL_TIERS} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="80%" paddingAngle={1}>
                      {APPROVAL_TIERS.map((t) => (
                        <Cell key={t.name} fill={t.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }}
                      formatter={(v: number, _n, p) => {
                        const payload = p?.payload as { pct: number; name: string } | undefined;
                        return [`${v} Bestellungen (${payload?.pct ?? 0}%)`, payload?.name ?? ""];
                      }}
                    />

                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1 mt-1">
                {APPROVAL_TIERS.map((t) => (
                  <div key={t.name} className="flex items-center gap-2 text-[11px] text-[#374151]">
                    <span className="size-2 rounded-sm" style={{ background: t.color }} />
                    <span className="flex-1 truncate">{t.name}</span>
                    <span className="text-[#6B7280]">{t.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart C */}
            <div>
              <div className="text-[13px] font-semibold text-[#111827] mb-1">Ablehnungsrate</div>
              <div className="text-[12px] text-[#6B7280] mb-2">Übersicht abgelehnter Bestellungen</div>
              <div className="text-[44px] font-bold text-[#DC2626] leading-none mt-2">6%</div>
              <div className="text-[12px] text-[#6B7280] mt-1 mb-3">3 von 47 Bestellungen abgelehnt</div>
              <div className="space-y-1.5">
                {REJECTIONS.map((r) => (
                  <div key={r.reason} className="flex items-center justify-between text-[12px] border-t border-[#F3F4F6] pt-1.5">
                    <span className="text-[#374151]">{r.reason}</span>
                    <span className="text-[#6B7280]">{r.count}×</span>
                  </div>
                ))}
              </div>
              <Link
                to="/procurement/orders"
                className="inline-block mt-3 text-xs px-3 py-1.5 rounded-md border border-[#E5E7EB] text-[#111827] hover:bg-[#F9FAFB]"
              >
                Ablehnungen ansehen →
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* Foreman drawer */}
      {foremanDrawer && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setForemanDrawer(null)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white border-l border-[#E5E7EB] p-5 overflow-y-auto">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-[#6B7280]">Polier</div>
                <div className="text-[18px] font-bold text-[#111827]">{foremanDrawer}</div>
              </div>
              <button onClick={() => setForemanDrawer(null)} className="p-1 rounded-md hover:bg-[#F3F4F6]">
                <X className="size-4" />
              </button>
            </div>
            <div className="text-[13px] text-[#6B7280] mt-4">
              Bestellhistorie wird hier angezeigt (Demo). Verknüpfung mit echten Bestelldaten folgt.
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-[16px] font-semibold text-[#111827]">{title}</h2>
      <p className="text-[13px] text-[#6B7280]">{subtitle}</p>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[13px] bg-[#F3F4F6] text-[#374151] rounded-full px-3 py-1">{children}</span>
  );
}

function KpiCard({
  label,
  value,
  trend,
  trendLabel,
  invertTrend,
  onClick,
}: {
  label: string;
  value: string;
  trend: number;
  trendLabel?: string;
  invertTrend?: boolean;
  onClick?: () => void;
}) {
  const positiveIsGood = !invertTrend;
  const up = trend > 0;
  const flat = trend === 0;
  const good = flat ? null : positiveIsGood ? up : !up;
  const color = flat ? "#6B7280" : good ? "#16A34A" : "#DC2626";
  const Arrow = flat ? null : up ? ArrowUp : ArrowDown;
  return (
    <button
      onClick={onClick}
      className={`${CARD} p-4 text-left hover:border-[#D1D5DB] transition-colors`}
    >
      <div className="text-[12px] text-[#6B7280]">{label}</div>
      <div className="text-[28px] font-bold text-[#111827] leading-tight mt-1">{value}</div>
      <div className="flex items-center gap-1 mt-1 text-[12px]" style={{ color }}>
        {Arrow && <Arrow className="size-3.5" />}
        <span>{flat ? "→ 0%" : `${Math.abs(trend)}%`}</span>
        <span className="text-[#6B7280]">{trendLabel ?? "vs Vorperiode"}</span>
      </div>
    </button>
  );
}

function SupplierTable({ rows }: { rows: ReturnType<typeof computeSuppliers> }) {
  const [sort, setSort] = useState<{ key: keyof typeof rows[number]; dir: "asc" | "desc" }>({
    key: "spend",
    dir: "desc",
  });
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === "number" && typeof bv === "number") return sort.dir === "asc" ? av - bv : bv - av;
      return sort.dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [rows, sort]);

  const toggle = (key: typeof sort.key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[#6B7280] border-b border-[#E5E7EB]">
            <Th label="Lieferant" onClick={() => toggle("name")} />
            <Th label="Bestellungen" onClick={() => toggle("orders")} align="right" />
            <Th label="Ausgaben CHF" onClick={() => toggle("spend")} align="right" />
            <Th label="Vertragskonform" onClick={() => toggle("compliance")} align="center" />
            <Th label="Ø Lieferzeit" align="right" />
            <Th label="Status" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.name}
              className={`border-b border-[#F3F4F6] ${r.status === "none" ? "border-l-4 border-l-[#DC2626] bg-[#FEF2F2]/40" : ""}`}
            >
              <td className="py-2.5 px-2 text-[#111827] font-medium">{r.name}</td>
              <td className="py-2.5 px-2 text-right text-[#374151]">{r.orders}</td>
              <td className="py-2.5 px-2 text-right text-[#374151]">{formatCHF(r.spend)}</td>
              <td className="py-2.5 px-2 text-center">
                <CompliancePill value={r.compliance} />
              </td>
              <td className="py-2.5 px-2 text-right text-[#374151]">{r.leadTime}</td>
              <td className="py-2.5 px-2 text-[#374151]">{r.statusLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompliancePill({ value }: { value: number }) {
  let bg = "#ECFDF5", fg = "#065F46";
  if (value === 0 || value < 80) { bg = "#FEE2E2"; fg = "#991B1B"; }
  else if (value < 100) { bg = "#FEF3C7"; fg = "#92400E"; }
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: bg, color: fg }}>
      {value}%
    </span>
  );
}

function ForemanTable({
  rows,
  onSelect,
}: {
  rows: ReturnType<typeof computeForemen>;
  onSelect: (name: string) => void;
}) {
  const [sort, setSort] = useState<{ key: keyof typeof rows[number]; dir: "asc" | "desc" }>({
    key: "spend",
    dir: "desc",
  });
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === "number" && typeof bv === "number") return sort.dir === "asc" ? av - bv : bv - av;
      return sort.dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [rows, sort]);
  const toggle = (key: typeof sort.key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[#6B7280] border-b border-[#E5E7EB]">
            <Th label="Polier" onClick={() => toggle("foreman")} />
            <Th label="Projekt" onClick={() => toggle("project")} />
            <Th label="Bestellungen" onClick={() => toggle("orders")} align="right" />
            <Th label="Ausgaben CHF" onClick={() => toggle("spend")} align="right" />
            <Th label="Ø Wert" onClick={() => toggle("avg")} align="right" />
            <Th label="Trend" onClick={() => toggle("trend")} align="right" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.foreman}
              onClick={() => onSelect(r.foreman)}
              className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB] cursor-pointer"
            >
              <td className="py-2.5 px-2 text-[#111827] font-medium">{r.foreman}</td>
              <td className="py-2.5 px-2 text-[#374151]">{r.project}</td>
              <td className="py-2.5 px-2 text-right text-[#374151]">{r.orders}</td>
              <td className="py-2.5 px-2 text-right text-[#374151]">{formatCHF(r.spend)}</td>
              <td className="py-2.5 px-2 text-right text-[#374151]">{formatCHF(r.avg)}</td>
              <td
                className="py-2.5 px-2 text-right font-medium"
                style={{ color: r.trend > 0 ? GREEN : r.trend < 0 ? RED : GRAY }}
              >
                {r.trend > 0 ? "↑" : r.trend < 0 ? "↓" : "→"} {Math.abs(r.trend)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  label,
  onClick,
  align,
}: {
  label: string;
  onClick?: () => void;
  align?: "left" | "right" | "center";
}) {
  const alignment = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`py-2 px-2 font-medium text-[11px] uppercase tracking-wide ${alignment}`}>
      {onClick ? (
        <button onClick={onClick} className="inline-flex items-center gap-1 group hover:text-[#111827]">
          {label}
          <ArrowUpDown className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      ) : (
        label
      )}
    </th>
  );
}
