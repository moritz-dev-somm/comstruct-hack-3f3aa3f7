import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Upload, Check, ExternalLink } from "lucide-react";
import { formatEUR, useProducts } from "@/lib/catalog";
import { ProductImage } from "@/components/ProductImage";

export const Route = createFileRoute("/procurement/catalog")({
  component: CatalogAdmin,
});

function CatalogAdmin() {
  const { data: products = [] } = useProducts();
  const [importOpen, setImportOpen] = useState(false);

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
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-brand text-brand-foreground text-sm font-semibold hover:bg-brand/90"
          >
            <Upload className="size-4" /> Import catalog
          </button>
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

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}

const DETECTED = [
  { header: "Artikelnummer", target: "SKU" },
  { header: "Bezeichnung", target: "Description" },
  { header: "Preis", target: "Price" },
  { header: "Einheit", target: "Unit" },
  { header: "Gruppe", target: "Category" },
];

const PREVIEW = [
  {
    sku: "WR-4540",
    name: "Wood screws Torx 4.5×40 (box of 200)",
    price: "€12.50",
    unit: "box",
    cat: "Fasteners",
  },
  {
    sku: "WR-3535",
    name: "Drywall screws 3.5×35 (box of 500)",
    price: "€8.90",
    unit: "box",
    cat: "Fasteners",
  },
  {
    sku: "WR-CT200",
    name: "Cable ties 200mm (bag of 100)",
    price: "€6.20",
    unit: "bag",
    cat: "Other",
  },
  { sku: "WR-GLV-L", name: "Safety gloves L", price: "€4.80", unit: "pair", cat: "Safety" },
  { sku: "WR-FFP2", name: "Dust masks FFP2", price: "€2.10", unit: "piece", cat: "Safety" },
];

function ImportModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const chooseFile = (file?: File) => {
    if (file) setSelectedFile(file);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
      <div className="bg-card rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden">
        <div className="px-5 h-12 border-b flex items-center justify-between">
          <h3 className="font-semibold">Import catalog — Step {step} of 3</h3>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        </div>
        <div className="p-5">
          {step === 1 && (
            <div>
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
                  chooseFile(e.dataTransfer.files?.[0]);
                }}
                className={`w-full border-2 border-dashed rounded-xl p-8 text-center bg-muted/30 transition-colors hover:bg-accent/40 ${
                  dragOver ? "border-brand bg-brand/10" : "border-border"
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.csv,.xls,.xlsx,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => chooseFile(e.target.files?.[0])}
                />
                <Upload className="size-8 mx-auto mb-2 text-muted-foreground" />
                {selectedFile ? (
                  <>
                    <div className="text-sm font-semibold">{selectedFile.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {(selectedFile.size / 1024).toFixed(0)} KB · ready to import
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-semibold">Drop a supplier catalog here</div>
                    <div className="text-xs text-muted-foreground mt-1">PDF, Excel or CSV</div>
                  </>
                )}
              </button>
            </div>
          )}
          {step === 2 && (
            <div>
              <p className="text-xs text-muted-foreground mb-3">
                We auto-mapped the columns — adjust if needed.
              </p>
              <div className="rounded-lg border divide-y">
                {DETECTED.map((r) => (
                  <div key={r.header} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                      {r.header}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-semibold">{r.target}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/40 rounded-full px-2 py-0.5">
                      <Check className="size-3" /> AI auto-mapped
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {step === 3 && (
            <div>
              <p className="text-xs text-muted-foreground mb-3">Preview of 5 imported items.</p>
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
                  {PREVIEW.map((p) => (
                    <tr key={p.sku} className="border-t">
                      <td className="py-1.5 font-mono text-xs">{p.sku}</td>
                      <td className="py-1.5">{p.name}</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold">{p.price}</td>
                      <td className="py-1.5 pl-2 text-muted-foreground">{p.cat}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t flex justify-between bg-muted/30">
          <button
            onClick={() => (step > 1 ? setStep(step - 1) : onClose())}
            className="px-3 h-9 rounded-md border text-sm font-medium hover:bg-accent"
          >
            {step > 1 ? "Back" : "Cancel"}
          </button>
          <button
            onClick={() => (step < 3 ? setStep(step + 1) : onClose())}
            disabled={step === 1 && !selectedFile}
            className="px-4 h-9 rounded-md bg-brand text-brand-foreground text-sm font-semibold disabled:pointer-events-none disabled:opacity-50"
          >
            {step < 3 ? "Continue" : "Confirm import"}
          </button>
        </div>
      </div>
    </div>
  );
}
