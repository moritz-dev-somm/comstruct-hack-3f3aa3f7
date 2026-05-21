Add a non-functional project selector dropdown to the top-left of the procurement sidebar.

Change: `src/routes/procurement.tsx`
- Import `Select` components from `@/components/ui/select` and add `useState`.
- In the sidebar header (`h-14 border-b` area), replace the static "Procurement" subtitle with a styled `<Select>` dropdown.
- Populate it with 5 dummy projects named after recognizable Zurich streets:
  1. Rämistrasse 101 (default)
  2. Bahnhofstrasse 42
  3. Langstrasse 77
  4. Sechseläutenplatz 1
  5. Limmatquai 150
- Store the selected value in React state. The dropdown is non-functional beyond selection.