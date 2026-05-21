export type Period = "woche" | "monat" | "quartal" | "jahr";

export const PERIODS: { id: Period; label: string }[] = [
  { id: "woche", label: "Diese Woche" },
  { id: "monat", label: "Dieser Monat" },
  { id: "quartal", label: "Letztes Quartal" },
  { id: "jahr", label: "Dieses Jahr" },
];

export const scaleFor = (p: Period) =>
  p === "woche" ? 0.25 : p === "monat" ? 1 : p === "quartal" ? 3 : 12;

export const daysFor = (p: Period) =>
  p === "woche" ? 7 : p === "monat" ? 21 : p === "quartal" ? 63 : 180;

export function formatCHF(n: number): string {
  const rounded = Math.round(n);
  const s = Math.abs(rounded).toString();
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += "'";
    out += s[i];
  }
  return `CHF ${rounded < 0 ? "-" : ""}${out}`;
}

export function formatCHFShort(n: number): string {
  const rounded = Math.round(n);
  const s = Math.abs(rounded).toString();
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += "'";
    out += s[i];
  }
  return `${rounded < 0 ? "-" : ""}${out}`;
}

// Deterministic pseudo-random so SSR and client render the same numbers.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function buildDailySeries(period: Period) {
  const days = daysFor(period);
  const scale = scaleFor(period);
  const rand = rng(42 + days);
  const today = new Date(2026, 4, 21); // 21.05.2026 fixed for deterministic SSR
  const series: { date: string; label: string; spend: number; rolling7: number }[] = [];
  const raw: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dow = d.getDay(); // 0 Sun, 1 Mon
    let base = 80 + rand() * 120;
    if (dow === 1) base *= 1.5; // Monday spike
    if (dow === 0) base = 0; // Sunday quiet
    if (dow === 6) base *= 0.25;
    if (rand() < 0.08) base = 300 + rand() * 150; // occasional big day
    const spend = Math.round(base * (scale / (days / 21))); // keep per-day similar magnitude
    raw.push(spend);
    const window = raw.slice(Math.max(0, raw.length - 7));
    const rolling7 = Math.round(window.reduce((a, b) => a + b, 0) / window.length);
    series.push({
      date: d.toISOString().slice(0, 10),
      label: `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`,
      spend,
      rolling7,
    });
  }
  return series;
}

// Base monthly values from the spec.
export const KPI_BASE = {
  spend: 4284,
  count: 47,
  avg: 91.1,
  suppliers: 8,
  approvalRate: 94,
  approvalMinutes: 18,
};

export const KPI_TRENDS = {
  spend: 12,
  count: 8,
  avg: -3,
  suppliers: 0,
  approvalRate: 2,
  approvalMinutes: -22,
};

export const BY_PROJECT_BASE = [
  { project: "Schulhaus Zürich-Nord", total: 1640 },
  { project: "Renovation Hardturm", total: 1280 },
  { project: "Neubau Lagerhaus", total: 760 },
  { project: "Umbau Postgebäude", total: 604 },
];

export const BY_CATEGORY_BASE = [
  { name: "Befestigung", value: 1200, pct: 28, color: "#16A34A", top: "Spax 5×60" },
  { name: "PSA", value: 1028, pct: 24, color: "#2563EB", top: "Schutzhandschuhe L" },
  { name: "Elektro", value: 814, pct: 19, color: "#0D9488", top: "Kabelbinder schwarz" },
  { name: "Werkzeug", value: 685, pct: 16, color: "#D97706", top: "Akku-Schrauber" },
  { name: "Sonstige", value: 557, pct: 13, color: "#6B7280", top: "Reinigungsmittel" },
];

export type SupplierRow = {
  name: string;
  orders: number;
  spend: number;
  compliance: number;
  leadTime: string;
  status: "active" | "partial" | "none";
  statusLabel: string;
};

export const SUPPLIERS_BASE: SupplierRow[] = [
  { name: "ACME Construction", orders: 28, spend: 2140, compliance: 100, leadTime: "3.2 Tage", status: "active", statusLabel: "✓ Vertrag aktiv" },
  { name: "Würth AG", orders: 11, spend: 980, compliance: 100, leadTime: "2.8 Tage", status: "active", statusLabel: "✓ Vertrag aktiv" },
  { name: "Bosch Professional", orders: 5, spend: 620, compliance: 82, leadTime: "4.1 Tage", status: "partial", statusLabel: "⚠ Teilkonform" },
  { name: "Fischer", orders: 3, spend: 320, compliance: 100, leadTime: "3.0 Tage", status: "active", statusLabel: "✓ Vertrag aktiv" },
  { name: "Sonstige (4)", orders: 0, spend: 224, compliance: 0, leadTime: "—", status: "none", statusLabel: "✗ Kein Vertrag" },
];

export type ForemanRow = {
  foreman: string;
  project: string;
  orders: number;
  spend: number;
  avg: number;
  trend: number;
};

export const FOREMEN_BASE: ForemanRow[] = [
  { foreman: "Marco Bianchi", project: "Schulhaus Zürich-Nord", orders: 18, spend: 1640, avg: 91.1, trend: 15 },
  { foreman: "Anna Kessler", project: "Renovation Hardturm", orders: 14, spend: 1280, avg: 91.4, trend: 3 },
  { foreman: "Peter Hofer", project: "Neubau Lagerhaus", orders: 9, spend: 760, avg: 84.4, trend: -8 },
  { foreman: "Thomas Meier", project: "Umbau Postgebäude", orders: 6, spend: 604, avg: 100.7, trend: 22 },
];

export const WEEKDAY = [
  { day: "Mo", value: 12, weekend: false },
  { day: "Di", value: 8, weekend: false },
  { day: "Mi", value: 9, weekend: false },
  { day: "Do", value: 7, weekend: false },
  { day: "Fr", value: 8, weekend: false },
  { day: "Sa", value: 2, weekend: true },
  { day: "So", value: 1, weekend: true },
];

export const TIMEOFDAY = [
  { slot: "07–09h", pct: 28 },
  { slot: "09–12h", pct: 41 },
  { slot: "12–14h", pct: 18 },
  { slot: "14–17h", pct: 13 },
];

export const APPROVAL_TIMES = [
  { bucket: "< 5 Min", value: 22, color: "#16A34A" },
  { bucket: "5–15 Min", value: 12, color: "#65A30D" },
  { bucket: "15–60 Min", value: 8, color: "#D97706" },
  { bucket: "1–4 Std", value: 3, color: "#EA580C" },
  { bucket: "> 4 Std", value: 2, color: "#DC2626" },
];

export const APPROVAL_TIERS = [
  { name: "Auto-genehmigt < 200 CHF", value: 31, pct: 66, color: "#16A34A" },
  { name: "PM-Genehmigung 200–2000 CHF", value: 14, pct: 30, color: "#D97706" },
  { name: "Zentraleinkauf > 2000 CHF", value: 2, pct: 4, color: "#DC2626" },
];

export const REJECTIONS = [
  { reason: "Falscher Lieferant (off-contract)", count: 2 },
  { reason: "Menge zu hoch", count: 1 },
];

export function scaleKPIs(p: Period) {
  const s = scaleFor(p);
  return {
    spend: Math.round(KPI_BASE.spend * s),
    count: Math.round(KPI_BASE.count * s),
    avg: KPI_BASE.avg,
    suppliers: KPI_BASE.suppliers,
    approvalRate: KPI_BASE.approvalRate,
    approvalMinutes: KPI_BASE.approvalMinutes,
  };
}

export function scaleProjects(p: Period, project: string | null) {
  const s = scaleFor(p);
  const rows = BY_PROJECT_BASE.filter((r) => !project || r.project === project);
  return rows.map((r) => ({ ...r, total: Math.round(r.total * s) }));
}

export function scaleCategories(p: Period, project: string | null) {
  const s = scaleFor(p);
  // For a project filter, fake a proportional slice based on project's share.
  const projShare = project
    ? (BY_PROJECT_BASE.find((r) => r.project === project)?.total ?? 0) /
      BY_PROJECT_BASE.reduce((a, r) => a + r.total, 0)
    : 1;
  return BY_CATEGORY_BASE.map((c) => ({
    ...c,
    value: Math.round(c.value * s * projShare),
  }));
}

export function scaleSuppliers(p: Period, project: string | null): SupplierRow[] {
  const s = scaleFor(p);
  const projShare = project
    ? (BY_PROJECT_BASE.find((r) => r.project === project)?.total ?? 0) /
      BY_PROJECT_BASE.reduce((a, r) => a + r.total, 0)
    : 1;
  return SUPPLIERS_BASE.map((r) => ({
    ...r,
    orders: Math.max(0, Math.round(r.orders * s * projShare)),
    spend: Math.round(r.spend * s * projShare),
  }));
}

export function scaleForemen(p: Period, project: string | null): ForemanRow[] {
  const s = scaleFor(p);
  const rows = FOREMEN_BASE.filter((r) => !project || r.project === project);
  return rows.map((r) => ({
    ...r,
    orders: Math.round(r.orders * s),
    spend: Math.round(r.spend * s),
  }));
}
