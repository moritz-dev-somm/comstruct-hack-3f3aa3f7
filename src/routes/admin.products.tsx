import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, X } from "lucide-react";
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

function AdminProducts() {
  const { data: products = [], isLoading } = useProducts();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Product | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [filter, setFilter] = useState("");

  const filtered = products.filter(
    (p) =>
      !filter ||
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.sku.toLowerCase().includes(filter.toLowerCase()) ||
      p.category.toLowerCase().includes(filter.toLowerCase()),
  );

  function startNew() {
    setEditing(null);
    setDraft(EMPTY);
  }

  function startEdit(p: Product) {
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
    setEditing(null);
    setDraft(EMPTY);
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
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 grid lg:grid-cols-[1fr,360px] gap-6">
        <section>
          <input
            placeholder="Search SKU, name, category…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full h-10 rounded-md border bg-card px-3 text-sm mb-3"
          />
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="rounded-lg border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">SKU</th>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Category</th>
                    <th className="text-right px-3 py-2">€</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.sku} className="border-t hover:bg-accent/50">
                      <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => startEdit(p)} className="text-left hover:underline">
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
                        <button
                          onClick={() => remove(p)}
                          className="size-7 grid place-items-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          aria-label="Delete"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <div className="rounded-lg border bg-card p-4 sticky top-20 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{editing ? `Edit ${editing.sku}` : "Add product"}</h2>
              {editing && (
                <button onClick={startNew} className="text-xs text-muted-foreground hover:text-foreground">
                  New
                </button>
              )}
            </div>
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
            <button
              onClick={save}
              className="w-full h-10 rounded-lg bg-brand text-brand-foreground font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Plus className="size-4" /> {editing ? "Save changes" : "Add product"}
            </button>
          </div>
        </aside>
      </main>
    </div>
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
