import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileText, Download, ChevronRight, X, Eye } from "lucide-react";
import { formatEUR } from "@/lib/catalog";
import { useOrders, type OrderStatus, type Order } from "@/lib/orders";
import {
  downloadPurchaseOrderPdf,
  generatePurchaseOrderPdf,
  purchaseOrderFilename,
} from "@/lib/po-pdf";
import { StatusPill } from "./orders";

export const Route = createFileRoute("/procurement/orders")({
  component: OrdersOverview,
});

const STATUS_FILTERS: { value: "all" | OrderStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending_pm", label: "Pending PM" },
  { value: "pending_central", label: "Pending Central" },
  { value: "ordered", label: "Ordered" },
  { value: "delivered", label: "Delivered" },
  { value: "rejected", label: "Rejected" },
];

function OrdersOverview() {
  const { orders, advanceToDelivered } = useOrders();
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
  const navigate = useNavigate();

  const filtered = useMemo(
    () => (filter === "all" ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter],
  );

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <h1 className="text-2xl font-bold">Orders</h1>
      <p className="text-sm text-muted-foreground mt-0.5">All C-material orders across projects.</p>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilter(s.value)}
            className={`px-3 h-8 rounded-full border text-xs font-medium ${
              filter === s.value ? "bg-brand text-brand-foreground border-brand" : "hover:bg-accent"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Order #</th>
              <th className="text-left font-medium px-4 py-2.5">Foreman</th>
              <th className="text-left font-medium px-4 py-2.5">Project</th>
              <th className="text-right font-medium px-4 py-2.5">Items</th>
              <th className="text-right font-medium px-4 py-2.5">Total</th>
              <th className="text-left font-medium px-4 py-2.5">Status</th>
              <th className="text-left font-medium px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-10">No orders match this filter.</td></tr>
            )}
            {filtered.map((o) => (
              <tr
                key={o.id}
                className="border-t hover:bg-accent/40 cursor-pointer group"
                onClick={() => navigate({ to: "/procurement/orders/$orderId", params: { orderId: o.id } })}
              >
                <td className="px-4 py-2.5 font-mono font-semibold text-brand group-hover:underline">{o.id}</td>
                <td className="px-4 py-2.5">{o.foreman}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{o.project}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{o.items.reduce((s, i) => s + i.qty, 0)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatEUR(o.subtotal)}</td>
                <td className="px-4 py-2.5"><StatusPill status={o.status} /></td>
                <td className="px-4 py-2.5 text-muted-foreground text-xs">{new Date(o.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex items-center gap-3 justify-end">
                    <button
                      onClick={() => setPreviewOrder(o)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                      title="Preview PO PDF"
                    >
                      <Eye className="size-3.5" /> Preview
                    </button>
                    <button
                      onClick={() => downloadPurchaseOrderPdf(o)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                      title="Download PO PDF"
                    >
                      <Download className="size-3.5" />
                    </button>
                    {o.status === "ordered" && (
                      <button
                        onClick={() => advanceToDelivered(o.id)}
                        className="text-xs font-medium text-brand hover:underline"
                      >
                        Mark delivered
                      </button>
                    )}
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {previewOrder && (
        <PdfPreviewModal order={previewOrder} onClose={() => setPreviewOrder(null)} />
      )}
    </div>
  );
}

function PdfPreviewModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    try {
      const doc = generatePurchaseOrderPdf(order);
      const blob = doc.output("blob");
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    } catch (e) {
      console.error("PDF generation failed", e);
      setError(e instanceof Error ? e.message : "Failed to generate PDF");
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [order]);

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
        className="bg-card rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-brand" />
            <div>
              <div className="text-sm font-semibold">{purchaseOrderFilename(order)}</div>
              <div className="text-xs text-muted-foreground">
                {order.id} · {order.project} · {formatEUR(order.subtotal)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadPurchaseOrderPdf(order)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 h-8 rounded-md border hover:bg-accent"
            >
              <Download className="size-3.5" /> Download
            </button>
            <button
              onClick={onClose}
              className="size-8 grid place-items-center rounded-md hover:bg-accent"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-muted/40">
          {error ? (
            <div className="h-full grid place-items-center text-sm text-destructive p-6 text-center">
              PDF generation failed: {error}
            </div>
          ) : url ? (
            <iframe
              src={url}
              title={purchaseOrderFilename(order)}
              className="w-full h-full border-0"
            />
          ) : (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">
              Generating PDF…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
