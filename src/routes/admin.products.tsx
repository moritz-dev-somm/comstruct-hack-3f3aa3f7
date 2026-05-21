import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowUpDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProducts, SITE_CATEGORIES, type Product } from "@/lib/catalog";

export const Route = createFileRoute("/admin/products")({
  component: AdminProducts,
  head: () => ({ meta: [{ title: "Admin · Products — comstruct" }] }),
});

type Draft = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  price: string;
  supplier: string;
  source_category: string;
};

const EMPTY: Draft = {
  sku: "",
  name: "",
  category: "Fasteners",
  unit: "Stk",
  price: "0",
  supplier: "",
  source_category: "",
};

type SortKey = "sku" | "name" | "category" | "price";
type SortDir = "asc" | "desc";

function AdminProducts() {
  const { data: products = [], isLoading } = useProducts();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Product | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("sku");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [dialogOpen, setDialogOpen] = useState(false);

  const suppliers = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => p.supplier && s.add(p.supplier));
    return Array.from(s).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const min = parseFloat(priceMin);
    const max = parseFloat(priceMax);
    const q = filter.toLowerCase();
    const rows = products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q) && !p.category.toLowerCase().includes(q)) {
        return false;
      }
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (supplierFilter !== "all" && (p.supplier ?? "") !== supplierFilter) return false;
      if (!isNaN(min) && p.price < min) return false;
      if (!isNaN(max) && p.price > max) return false;
      return true;
    });
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "price": cmp = a.price - b.price; break;
        case "category": cmp = a.category.localeCompare(b.category); break;
        case "name": cmp = a.name.localeCompare(b.name); break;
        default: cmp = a.sku.localeCompare(b.sku);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [products, filter, categoryFilter, supplierFilter, priceMin, priceMax, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function clearFilters() {
    setFilter(""); setCategoryFilter("all"); setSupplierFilter("all");
    setPriceMin(""); setPriceMax("");
  }

  const hasActiveFilters = filter || categoryFilter !== "all" || supplierFilter !== "all" || priceMin || priceMax;

  function openNew() {
    setEditing(null);
    setDraft(EMPTY);
    setDialogOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setDraft({
      sku: p.sku,
      name: p.name,
      category: p.category,
      unit: p.unit,
      price: String(p.price),
      supplier: p.supplier ?? "",
      source_category: p.sourceCategory ?? "",
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    setDraft(EMPTY);
  }

  async function save() {
    if (!draft.sku || !draft.name) {
      toast.error("SKU and name required");
      return;
    }
    const payload = {
      sku: draft.sku,
      name: draft.name,
      category: draft.category,
      unit: draft.unit,
      price_eur: parseFloat(draft.price) || 0,
      supplier: draft.supplier || null,
      source_category: draft.source_category || null,
    };
    const { error } = editing
      ? await supabase.from("products").update(payload).eq("sku", editing.sku)
      : await supabase.from("products").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Updated" : "Added");
    qc.invalidateQueries({ queryKey: ["products"] });
    closeDialog();
  }

  async function remove(p: Product) {
    if (!confirm(`Delete ${p.sku} – ${p.name}?`)) return;
    const { error } = await supabase.from("products").delete().eq("sku", p.sku);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center gap-3">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="size-4" /> Back
          </Link>
          <h1 className="font-semibold">Products</h1>
          <span className="text-xs text-muted-foreground">{products.length} items</span>
          <div className="ml-auto">
            <button
              onClick={openNew}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-brand text-brand-foreground font-semibold text-sm hover:opacity-90"
            >
              <Plus className="size-4" /> Add new product
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-lg border bg-card p-3 mb-3 space-y-2">
          <input
            placeholder="Search SKU, name, category…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="all">All categories</option>
              {SITE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="all">All suppliers</option>
              {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              type="number"
              placeholder="Min €"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            />
            <input
              type="number"
              placeholder="Max €"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            />
            <button
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="h-9 rounded-md border text-sm font-medium hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear filters
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            Showing {filtered.length} of {products.length}
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr>
                  <SortableTh label="SKU" active={sortKey === "sku"} dir={sortDir} onClick={() => toggleSort("sku")} />
                  <SortableTh label="Name" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
                  <SortableTh label="Category" active={sortKey === "category"} dir={sortDir} onClick={() => toggleSort("category")} />
                  <SortableTh label="€" align="right" active={sortKey === "price"} dir={sortDir} onClick={() => toggleSort("price")} />
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-10">No products match these filters.</td></tr>
                )}
                {filtered.map((p) => (
                  <tr key={p.sku} className="border-t hover:bg-accent/50">
                    <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => openEdit(p)} className="text-left hover:underline">
                        {p.name}
                      </button>
                      <div className="text-xs text-muted-foreground">
                        {p.supplier} · per {p.unit}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs rounded-full bg-brand/10 text-brand px-2 py-0.5">
                        {p.category}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{p.price.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openEdit(p)}
                          className="inline-flex items-center gap-1 h-7 px-2 rounded text-xs font-medium border hover:bg-accent"
                          aria-label="Update"
                        >
                          <Pencil className="size-3.5" /> Update
                        </button>
                        <button
                          onClick={() => remove(p)}
                          className="size-7 grid place-items-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          aria-label="Delete"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {dialogOpen && (
        <ProductDialog
          editing={editing}
          draft={draft}
          setDraft={setDraft}
          onClose={closeDialog}
          onSave={save}
        />
      )}
    </div>
  );
}

function ProductDialog({
  editing,
  draft,
  setDraft,
  onClose,
  onSave,
}: {
  editing: Product | null;
  draft: Draft;
  setDraft: (d: Draft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-semibold">{editing ? `Edit ${editing.sku}` : "Add product"}</h2>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-md hover:bg-accent"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <Field label="SKU">
            <input
              value={draft.sku}
              disabled={!!editing}
              onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
              className="w-full h-9 rounded border bg-background px-2 text-sm font-mono disabled:opacity-60"
            />
          </Field>
          <Field label="Name">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
            />
          </Field>
          <Field label="Category">
            <select
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
            >
              {SITE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Unit">
              <input
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                className="w-full h-9 rounded border bg-background px-2 text-sm"
              />
            </Field>
            <Field label="Price (EUR)">
              <input
                type="number"
                step="0.01"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                className="w-full h-9 rounded border bg-background px-2 text-sm"
              />
            </Field>
          </div>
          <Field label="Supplier">
            <input
              value={draft.supplier}
              onChange={(e) => setDraft({ ...draft, supplier: e.target.value })}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
            />
          </Field>
          <Field label="Original category">
            <input
              value={draft.source_category}
              onChange={(e) => setDraft({ ...draft, source_category: e.target.value })}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
              placeholder="e.g. Befestigung"
            />
          </Field>
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-end gap-2 bg-muted/30">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-lg border text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="h-9 px-4 rounded-lg bg-brand text-brand-foreground font-semibold text-sm flex items-center gap-1.5 hover:opacity-90"
          >
            <Plus className="size-4" /> {editing ? "Save changes" : "Add product"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableTh({
  label, active, dir, onClick, align = "left",
}: { label: string; active: boolean; dir: SortDir; onClick: () => void; align?: "left" | "right" }) {
  return (
    <th className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {label}
        <ArrowUpDown className={`size-3 ${active ? "opacity-100" : "opacity-40"} ${active && dir === "desc" ? "rotate-180" : ""}`} />
      </button>
    </th>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}
