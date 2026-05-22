## Goal

Add a tabbed interface to `/procurement/agent` with two tabs:
1. **Inbox & negotiations** — current agent UI, unchanged.
2. **Import database** — drag-and-drop area for Excel/CSV/PDF supplier catalogs; parsed rows are inserted into `products` with LLM enrichment for missing fields. Below, a list of previously imported files with per-file delete (removes only that file's rows).

## Schema changes (migration)

Add two columns to `public.products`:
- `import_batch_id uuid NULL` — groups rows from one upload.
- `import_source_filename text NULL` — display label.

Index `import_batch_id` for fast lookup/delete.

New table `public.product_imports` (one row per uploaded file):
- `id uuid pk default gen_random_uuid()`
- `filename text not null`
- `mime_type text`
- `row_count int not null default 0`
- `status text not null default 'completed'` (`processing | completed | failed`)
- `error text`
- `created_at timestamptz default now()`

Public RLS (matches existing `products` pattern: anyone can SELECT/INSERT/UPDATE/DELETE).

**Conflict handling for SKUs**: incoming rows may collide with existing SKUs. We will namespace imported SKUs with the batch prefix (e.g. `IMP-<batch8>-<originalSku>`) so deletion is fully scoped and no existing catalog row is overwritten. The original SKU is preserved in `attributes.source_sku`.

## Server functions (`src/lib/product-import.functions.ts`)

1. `parseImportFile({ filename, mimeType, base64 })` → returns `{ rows: ParsedRow[] }`
   - Excel (`.xlsx/.xls`): `xlsx` package, first sheet → JSON.
   - CSV: `papaparse`.
   - PDF: `pdf-parse` text extraction + LLM call (Lovable AI Gateway, `google/gemini-2.5-flash`) with a JSON-schema tool to extract `{ name, sku?, category?, unit?, price_eur?, supplier?, description? }[]`.
   - Heuristic column mapping (name/sku/price/unit/category/supplier/description) with German + English aliases.

2. `commitImport({ filename, mimeType, rows })` →
   - Insert `product_imports` row → get `batch_id`.
   - For each row: derive namespaced sku, fill defaults (`unit='Stk'`, `category='Other'`, `price_eur=0`), generate German + English `name/description/keywords/use_cases/attributes` via single LLM tool-call per row (reuse the schema from `scripts/enrich.mjs`), generate `embedding` via Lovable AI embeddings (`google/text-embedding-004` if available; otherwise leave null — the existing search trigger handles `search_document` automatically).
   - Bulk `insert` into `products` with `import_batch_id` and `import_source_filename`.
   - Update `product_imports.row_count` and `status`.
   - Concurrency-limited (6 parallel like `enrich.mjs`).

3. `listImports()` → recent `product_imports` ordered by `created_at desc`.

4. `deleteImport({ id })` → `delete from products where import_batch_id = id`, then delete the `product_imports` row.

All use `supabaseAdmin` (server-only). Embedding/LLM calls use `LOVABLE_API_KEY` (already set).

## UI changes

`src/routes/procurement.agent.tsx`:
- Wrap existing page body in `<Tabs>` (`@/components/ui/tabs`, already in project) with two `TabsTrigger`s: "Inbox" and "Import database".
- Extract current agent JSX into an `<AgentInboxTab />` component (no behavior change).

New component `src/components/ImportDatabaseTab.tsx`:
- Dropzone (native HTML5 drag-and-drop, no new dep) accepting `.xlsx, .xls, .csv, .pdf`. Multi-file supported, processed sequentially.
- On drop: read as base64 → call `parseImportFile` → show a quick confirm summary (N rows detected, sample 3 rows) → call `commitImport`. Progress + toast.
- Below dropzone: "Imported files" list from `listImports()` query, each row showing filename · row count · date · trash button → confirm dialog → `deleteImport`. On success, invalidate `products` and `imports` queries.

Styling per brand tokens (brand red CTA, no shadows, `rounded-lg`).

## Dependencies to add

- `xlsx`
- `papaparse` + `@types/papaparse`
- `pdf-parse` + `@types/pdf-parse` (Worker-compat caveat — see Technical notes)

## Technical notes

- `pdf-parse` works in Node-compat workers; if it fails to bundle, fall back to sending the PDF directly to Gemini (`google/gemini-2.5-flash` supports inline PDF input via `inlineData`) — single LLM call per PDF.
- LLM enrichment per row uses the same tool-call shape as `scripts/enrich.mjs` (`save_product_info`) to produce `description`, `attributes`, `use_cases`; we then translate to English in the same call (extend the tool with `description_en`, `name_en`, `keywords_en`, `use_cases_en`).
- Embeddings via Lovable AI Gateway (`/v1/embeddings`, `google/text-embedding-004`, 768 dims). If the existing `products.embedding` column has a different dimension, embeddings will be skipped and only `search_document` (auto-populated by existing trigger) is used.
- Server function payloads are bounded; large files (>5 MB base64) are rejected client-side with a clear message.
- `Files changed`: `src/routes/procurement.agent.tsx`, new `src/components/ImportDatabaseTab.tsx`, new `src/lib/product-import.functions.ts`, new `src/lib/product-import.server.ts` (parser + LLM helpers), one migration.

## Out of scope

- Editing imported rows from this tab (use existing Catalog full editor).
- Re-running enrichment on existing rows.
- Image generation for imported products.
