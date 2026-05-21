import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileText, Download, ChevronRight } from "lucide-react";
import { formatEUR } from "@/lib/catalog";
import { useOrders, type OrderStatus } from "@/lib/orders";
import { downloadPurchaseOrderPdf, openPurchaseOrderPdf } from "@/lib/po-pdf";
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
              <tr key={o.id} className="border-t hover:bg-accent/30">
                <td className="px-4 py-2.5 font-mono font-semibold">{o.id}</td>
                <td className="px-4 py-2.5">{o.foreman}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{o.project}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{o.items.reduce((s, i) => s + i.qty, 0)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatEUR(o.subtotal)}</td>
                <td className="px-4 py-2.5"><StatusPill status={o.status} /></td>
                <td className="px-4 py-2.5 text-muted-foreground text-xs">{new Date(o.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="inline-flex items-center gap-3 justify-end">
                    <button
                      onClick={() => openPurchaseOrderPdf(o)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                      title="View PO PDF"
                    >
                      <FileText className="size-3.5" /> PDF
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
