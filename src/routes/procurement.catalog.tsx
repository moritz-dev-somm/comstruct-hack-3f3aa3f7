import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Upload, Check, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatEUR, useProducts } from "@/lib/catalog";
import { ProductImage } from "@/components/ProductImage";
import { supabase } from "@/integrations/supabase/client";
import {
  parseFile,
  applyMapping,
  type ColumnTarget,
  type Mapping,
  type NormalizedRow,
} from "@/lib/catalog-import";

export const Route = createFileRoute("/procurement/catalog")({
  component: CatalogAdmin,
});

function CatalogAdmin() {
  const { data: products = [] } = useProducts();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname !== "/procurement/catalog" && pathname !== "/procurement/catalog/") {
    return <Outlet />;
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold">Catalog</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {products.length} items across suppliers.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/admin/products"
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border text-sm font-medium hover:bg-accent"
          >
            <ExternalLink className="size-4" /> Full editor
          </Link>
          <Link
            to="/procurement/catalog/manage"
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
          >
            <Upload className="size-4" /> Import catalog
          </Link>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">SKU</th>
              <th className="text-left font-medium px-4 py-2.5">Name</th>
              <th className="text-left font-medium px-4 py-2.5">Category</th>
              <th className="text-left font-medium px-4 py-2.5">Supplier</th>
              <th className="text-left font-medium px-4 py-2.5">Unit</th>
              <th className="text-right font-medium px-4 py-2.5">Price</th>
            </tr>
          </thead>
          <tbody>
            {products.slice(0, 50).map((p) => (
              <tr key={p.sku} className="border-t hover:bg-accent/30">
                <td className="px-4 py-2 font-mono text-xs">{p.sku}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2.5">
                    <ProductImage
                      src={p.imageUrl}
                      alt={p.name}
                      className="size-9 rounded overflow-hidden border"
                      fallbackClassName="size-9 rounded bg-muted/50 text-sm border"
                    />
                    <span>{p.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{p.category}</td>
                <td className="px-4 py-2 text-muted-foreground">{p.supplier ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{p.unit}</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold">
                  {formatEUR(p.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length > 50 && (
          <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-muted/30">
            Showing 50 of {products.length}. Use the full editor for the complete list.
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const TARGET_OPTIONS: ColumnTarget[] = [
  "sku",
  "name",
  "price_eur",
  "unit",
  "category",
  "supplier",
  "description",
  "ignore",
];

const TARGET_LABEL: Record<ColumnTarget, string> = {
  sku: "SKU",
  name: "Name",
  price_eur: "Price (EUR)",
  unit: "Unit",
  category: "Category",
  supplier: "Supplier",
  description: "Description",
  ignore: "— Ignore —",
};

type Stage =
  | { name: "pick" }
  | { name: "parsing" }
  | { name: "mapping"; headers: string[]; rows: string[][]; mapping: Mapping }
  | { name: "preview"; rows: NormalizedRow[] }
  | { name: "importing"; total: number; done: number }
  | { name: "error"; message: string };

function ImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [stage, setStage] = useState<Stage>({ name: "pick" });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file?: File) {
    if (!file) return;
    setStage({ name: "parsing" });
    try {
      const parsed = await parseFile(file);

      if (parsed.kind === "tabular") {
        // Ask AI to map columns
        const sample = parsed.rows.slice(0, 5);
        const res = await fetch("/api/catalog-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "map", headers: parsed.headers, sample }),
        });
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(error || "Column mapping failed");
        }
        const { mapping } = (await res.json()) as { mapping: Mapping };
        setStage({
          name: "mapping",
          headers: parsed.headers,
          rows: parsed.rows,
          mapping: { ...mapping },
        });
      } else {
        // PDF → ask AI to extract structured rows directly
        const res = await fetch("/api/catalog-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "pdf", text: parsed.text, fileName: file.name }),
        });
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(error || "PDF extraction failed");
        }
        const { rows } = (await res.json()) as { rows: NormalizedRow[] };
        const cleaned: NormalizedRow[] = rows
          .filter((r) => r.sku && r.name)
          .map((r) => ({
            sku: String(r.sku),
            name: String(r.name),
            price_eur: Number(r.price_eur) || 0,
            unit: r.unit || "Stk",
            category: r.category || "Other",
            supplier: r.supplier ?? null,
            description: r.description ?? null,
          }));
        if (cleaned.length === 0) throw new Error("No products could be extracted from the PDF");
        setStage({ name: "preview", rows: cleaned });
      }
    } catch (e) {
      setStage({ name: "error", message: e instanceof Error ? e.message : "Import failed" });
    }
  }

  function updateMapping(header: string, target: ColumnTarget) {
    if (stage.name !== "mapping") return;
    setStage({ ...stage, mapping: { ...stage.mapping, [header]: target } });
  }

  function continueFromMapping() {
    if (stage.name !== "mapping") return;
    const normalized = applyMapping(stage.headers, stage.rows, stage.mapping);
    if (normalized.length === 0) {
      toast.error("No usable rows found — check that SKU and Name are mapped");
      return;
    }
    setStage({ name: "preview", rows: normalized });
  }

  async function confirmImport() {
    if (stage.name !== "preview") return;
    const rows = stage.rows;
    setStage({ name: "importing", total: rows.length, done: 0 });
    try {
      // Enrich + insert in batches of 25 (matches server enrich cap)
      const CHUNK = 25;
      let done = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);

        // Ask AI to fill DB fields not present in the source file
        let enrichedBySku = new Map<string, any>();
        try {
          const res = await fetch("/api/catalog-import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "enrich",
              rows: slice.map((r) => ({
                sku: r.sku,
                name: r.name,
                category: r.category,
                unit: r.unit,
                supplier: r.supplier ?? null,
                description: r.description ?? null,
              })),
            }),
          });
          if (res.ok) {
            const { rows: enriched } = (await res.json()) as { rows: any[] };
            enrichedBySku = new Map(enriched.map((e) => [String(e.sku), e]));
          } else {
            console.warn("Enrichment failed, inserting raw rows");
          }
        } catch (err) {
          console.warn("Enrichment error:", err);
        }

        const merged = slice.map((r) => {
          const e = enrichedBySku.get(r.sku);
          if (!e) return r;
          return {
            ...r,
            description: r.description ?? e.description ?? null,
            name_en: e.name_en ?? null,
            description_en: e.description_en ?? null,
            unit_en: e.unit_en ?? null,
            keywords: Array.isArray(e.keywords) ? e.keywords : [],
            keywords_en: Array.isArray(e.keywords_en) ? e.keywords_en : [],
            use_cases: Array.isArray(e.use_cases) ? e.use_cases : [],
            use_cases_en: Array.isArray(e.use_cases_en) ? e.use_cases_en : [],
            enriched_at: new Date().toISOString(),
          };
        });

        const { error } = await supabase
          .from("products")
          .upsert(merged, { onConflict: "sku", ignoreDuplicates: false });
        if (error) throw new Error(error.message);
        done += slice.length;
        setStage({ name: "importing", total: rows.length, done });
      }
      toast.success(`Imported ${rows.length} products`);
      await qc.invalidateQueries({ queryKey: ["products"] });
      onClose();
    } catch (e) {
      setStage({ name: "error", message: e instanceof Error ? e.message : "Insert failed" });
    }
  }

  const stepNum =
    stage.name === "pick" || stage.name === "parsing"
      ? 1
      : stage.name === "mapping"
        ? 2
        : 3;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
      <div className="bg-card rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden">
        <div className="px-5 h-12 border-b flex items-center justify-between">
          <h3 className="font-semibold">Import catalog — Step {stepNum} of 3</h3>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {stage.name === "pick" && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFile(e.dataTransfer.files?.[0]);
              }}
              className={`w-full border-2 border-dashed rounded-xl p-8 text-center bg-muted/30 transition-colors hover:bg-accent/40 ${
                dragOver ? "border-primary bg-primary/10" : "border-border"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.csv,.xls,.xlsx,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <Upload className="size-8 mx-auto mb-2 text-muted-foreground" />
              <div className="text-sm font-semibold">Drop a supplier catalog here</div>
              <div className="text-xs text-muted-foreground mt-1">PDF, Excel or CSV</div>
            </button>
          )}

          {stage.name === "parsing" && (
            <div className="py-10 text-center">
              <Loader2 className="size-6 mx-auto animate-spin text-muted-foreground" />
              <div className="text-sm text-muted-foreground mt-3">
                Parsing file and detecting columns…
              </div>
            </div>
          )}

          {stage.name === "mapping" && (
            <div>
              <p className="text-xs text-muted-foreground mb-3">
                AI auto-mapped the columns — adjust any if needed.
              </p>
              <div className="rounded-lg border divide-y">
                {stage.headers.map((h) => {
                  const target = stage.mapping[h] ?? "ignore";
                  return (
                    <div key={h} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded max-w-[180px] truncate">
                        {h || "(unnamed)"}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <select
                        value={target}
                        onChange={(e) => updateMapping(h, e.target.value as ColumnTarget)}
                        className="text-sm bg-background border rounded px-2 h-8"
                      >
                        {TARGET_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {TARGET_LABEL[opt]}
                          </option>
                        ))}
                      </select>
                      {target !== "ignore" && (
                        <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-500/15 border border-emerald-500/40 rounded-full px-2 py-0.5">
                          <Check className="size-3" /> Mapped
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {stage.name === "preview" && (
            <div>
              <p className="text-xs text-muted-foreground mb-3">
                Preview of {Math.min(stage.rows.length, 10)} of {stage.rows.length} extracted items.
              </p>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium pb-1">SKU</th>
                    <th className="text-left font-medium pb-1">Name</th>
                    <th className="text-right font-medium pb-1">Price</th>
                    <th className="text-left font-medium pb-1 pl-2">Cat</th>
                  </tr>
                </thead>
                <tbody>
                  {stage.rows.slice(0, 10).map((p, i) => (
                    <tr key={`${p.sku}-${i}`} className="border-t">
                      <td className="py-1.5 font-mono text-xs">{p.sku}</td>
                      <td className="py-1.5">{p.name}</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold">
                        {formatEUR(p.price_eur)}
                      </td>
                      <td className="py-1.5 pl-2 text-muted-foreground">{p.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {stage.name === "importing" && (
            <div className="py-10 text-center">
              <Loader2 className="size-6 mx-auto animate-spin text-muted-foreground" />
              <div className="text-sm text-muted-foreground mt-3">
                Importing {stage.done} / {stage.total}…
              </div>
            </div>
          )}

          {stage.name === "error" && (
            <div className="py-8 text-center">
              <AlertCircle className="size-6 mx-auto text-destructive" />
              <div className="text-sm font-semibold mt-2">Import failed</div>
              <div className="text-xs text-muted-foreground mt-1 px-4">{stage.message}</div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex justify-between bg-muted/30">
          <button
            onClick={() => {
              if (stage.name === "preview" || stage.name === "mapping" || stage.name === "error") {
                setStage({ name: "pick" });
              } else {
                onClose();
              }
            }}
            disabled={stage.name === "parsing" || stage.name === "importing"}
            className="px-3 h-9 rounded-md border text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {stage.name === "pick" ? "Cancel" : "Back"}
          </button>
          <button
            onClick={() => {
              if (stage.name === "mapping") continueFromMapping();
              else if (stage.name === "preview") confirmImport();
            }}
            disabled={
              stage.name === "pick" ||
              stage.name === "parsing" ||
              stage.name === "importing" ||
              stage.name === "error"
            }
            className="px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:pointer-events-none disabled:opacity-50"
          >
            {stage.name === "preview"
              ? `Import ${stage.rows.length} items`
              : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
