# Advanced Spend Analytics — Plan

Replace the current minimal `src/routes/procurement.analytics.tsx` with a full single-page dashboard that follows the spec exactly. Rendered inside the existing procurement sidebar layout (no new routes).

## Scope

- One file rewritten: `src/routes/procurement.analytics.tsx`
- Small helpers extracted into `src/lib/analytics-mock.ts` (mock data + CHF formatter + period scaling)
- No DB / server / schema changes. Pure presentation using recharts + mock data per the spec.

## Page structure

Single scrollable page, white cards on `#F9FAFB`, German throughout.

```text
Header: "Spend Analytics" + "C-Material Beschaffung"
        [Filter: Diese Woche | Dieser Monat* | Letztes Quartal | Dieses Jahr]   [📥 Export]
        [optional active project filter chip: "Filter aktiv: <Projekt> ×"]

§1 KPI row (6 cards)
§2 Ausgabenverlauf — ComposedChart (Bar + 7d rolling avg Line) + 3 insight chips
§3 Spend Breakdown — [Projekt horizontal bars | Kategorie donut]
§4 Lieferantenanalyse — table + amber off-contract alert
§5 Ordering Behaviour — [Top Besteller table | Wochentag/Tageszeit bars]
§6 Genehmigungsperformance — 3 mini charts (Zeiten bar, Schwellwert pie, Ablehnung)
```

All numeric values, table rows, colours, and insight-chip texts come straight from the spec.

## Interactivity

- `period` state (default `monat`). A `scale` factor (`woche=0.25`, `monat=1`, `quartal=3`, `jahr=12`) is applied to all CHF/count values and the time-series is regenerated for the period's date range. KPI trends recomputed against previous period of same length.
- `projectFilter` state. Clicking a bar in §3A sets it; chip in header clears it. While active, §4 and §5 recompute from that project's slice (mock filter).
- KPI cards have `onClick` that smooth-scrolls (`scrollIntoView`) to the relevant section via section `ref`s: spend → §2, supplier → §4, approval/Ø-time → §6.
- Tables sortable: column header click toggles sort key + direction (small caret icon on hover).
- All recharts have `<Tooltip>` with formatted CHF values.
- Export button triggers the exact CSV blob download from the spec.

## Formatting

- `formatCHF(n)` → `CHF 4'284` (apostrophe thousands, no decimals).
- Dates formatted `dd.MM` for x-axis, `dd.MM.yyyy` for tooltips.

## Styling

The spec mandates concrete hex colours that override the project's red Swiss-Modernist tokens for this dashboard only:

- Primary chart green `#16A34A`, accent blue `#2563EB`, teal `#0D9488`, amber `#D97706`, gray `#6B7280`, danger `#DC2626`, amber bg `#FEF3C7`.
- Cards: `rounded-xl border border-[#E5E7EB] shadow-sm bg-white`, page bg `#F9FAFB`.
- Status pills: green/amber/red per "Vertragskonform" thresholds.
- Off-contract row: `border-l-4 border-[#DC2626]`.

Note: This deliberately deviates from the comstruct brand tokens (which forbid hardcoded hex and shadows) because the spec is explicit. Scope is contained to this one route.

## Mock data module (`src/lib/analytics-mock.ts`)

Exports:
- `formatCHF`
- `PERIODS` + `scaleFor(period)`
- `buildDailySeries(period)` → array of `{ date, spend, rolling7 }` with Monday spikes + occasional 300–450 CHF days
- `KPIS`, `BY_PROJECT`, `BY_CATEGORY`, `SUPPLIERS`, `TOP_FOREMEN`, `WEEKDAY`, `TIMEOFDAY`, `APPROVAL_TIMES`, `APPROVAL_TIERS`, `REJECTIONS` — base monthly values from spec, scaled at render time.
- `applyProjectFilter(data, project)` helpers for §4/§5.

## Build order (matches spec priority)

1. Scaffold page shell + header + filters + section refs
2. §1 KPI row
3. §3 Spend breakdown (bars + donut)
4. §2 Ausgabenverlauf ComposedChart + insight chips
5. §5 Top Besteller + Wochentag/Tageszeit
6. §4 Lieferanten table + off-contract alert
7. §6 Approval performance trio
8. Wire date filter → recompute everything
9. Wire project bar click → filter chip + §4/§5 filtering + KPI scroll
10. CSV export button

## Out of scope

- No changes to sidebar, routing, DB, server functions, or other procurement pages.
- The drawer for "click a Besteller row" is stubbed as a simple `Sheet` showing the foreman's filtered orders list (reuses existing `Sheet` ui component); no new routes.
- "Bestellregeln anpassen →" and "Ablehnungen ansehen →" buttons link via `<Link>` to existing `/settings` and `/procurement/orders` respectively.
