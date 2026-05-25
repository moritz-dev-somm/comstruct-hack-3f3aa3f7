import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileText, Download, Package, Truck, CreditCard, MapPin, CheckCircle2 } from "lucide-react";
import { formatEUR } from "@/lib/catalog";
import { useOrders, STATUS_META, tierLabel, type Order } from "@/lib/orders";
import { useNegotiationsByOrder } from "@/lib/negotiations";
import { deriveOrderStatus, filterNegotiationsForOrder } from "@/lib/order-status";
import { downloadPurchaseOrdersBySupplier, openFirstPurchaseOrderPdf } from "@/lib/po-pdf";
import { useSuppliers, supplierContactMap } from "@/lib/suppliers";
import { useMemo } from "react";
import { StatusPill } from "./orders";

export const Route = createFileRoute("/procurement/orders/$orderId")({
  component: OrderDetail,
  head: ({ params }) => ({
    meta: [{ title: `${params.orderId} — Order detail` }],
  }),
});

const VAT_RATE = 0.19;

function OrderDetail() {
  const { orderId } = Route.useParams();
  const { orders, advanceToDelivered } = useOrders();
  const navigate = useNavigate();
  const order = orders.find((o) => o.id === orderId);
  const { data: suppliers } = useSuppliers();
  const contacts = useMemo(() => supplierContactMap(suppliers), [suppliers]);
  const orderIds = useMemo(() => (order ? [order.id] : []), [order]);
  const negotiationsByOrder = useNegotiationsByOrder(orderIds);


  if (!order) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl">
        <Link to="/procurement/orders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="size-4" /> Back to orders
        </Link>
        <div className="rounded-xl border bg-card p-10 text-center">
          <h1 className="text-lg font-semibold">Order not found</h1>
          <p className="text-sm text-muted-foreground mt-1">No order matches the ID <span className="font-mono">{orderId}</span>.</p>
        </div>
      </div>
    );
  }

  const tax = +(order.subtotal * VAT_RATE).toFixed(2);
  const shipping = 0;
  const total = +(order.subtotal + tax + shipping).toFixed(2);
  const itemCount = order.items.reduce((s, i) => s + i.qty, 0);
  const negotiations = filterNegotiationsForOrder(order, negotiationsByOrder[order.id]);

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <Link to="/procurement/orders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to orders
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono">{order.id}</h1>
            <StatusPill status={deriveOrderStatus(order, negotiations)} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Placed {new Date(order.createdAt).toLocaleString()} · {tierLabel(order.tier)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openFirstPurchaseOrderPdf(order, contacts)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm font-medium hover:bg-accent"
          >
            <FileText className="size-4" /> View PO
          </button>
          <button
            onClick={() => downloadPurchaseOrdersBySupplier(order, contacts)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm font-medium hover:bg-accent"
            title="Downloads one PDF per supplier"
          >
            <Download className="size-4" /> Download PO{order.items.some((i) => i.supplier) ? "s" : ""}
          </button>
          {order.status === "ordered" && (
            <button
              onClick={() => {
                advanceToDelivered(order.id);
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-brand text-brand-foreground text-sm font-medium hover:opacity-90"
            >
              <CheckCircle2 className="size-4" /> Mark delivered
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Items + totals */}
        <div className="lg:col-span-2 space-y-4">
          <Section title="Items" icon={<Package className="size-4" />} subtitle={`${itemCount} unit${itemCount === 1 ? "" : "s"} across ${order.items.length} line${order.items.length === 1 ? "" : "s"}`}>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Product</th>
                    <th className="text-right font-medium px-3 py-2">Qty</th>
                    <th className="text-right font-medium px-3 py-2">Unit</th>
                    <th className="text-right font-medium px-3 py-2">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i.productId} className="border-t">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-md bg-muted grid place-items-center text-muted-foreground shrink-0">
                            <Package className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{i.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{i.productId}{i.category ? ` · ${i.category}` : ""}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{i.qty}{i.unit ? ` ${i.unit}` : ""}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatEUR(i.price)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{formatEUR(i.qty * i.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 ml-auto max-w-sm space-y-1.5 text-sm">
              <Row label="Subtotal" value={formatEUR(order.subtotal)} />
              <Row label="Shipping" value={shipping === 0 ? "Free" : formatEUR(shipping)} />
              <Row label={`VAT (${Math.round(VAT_RATE * 100)}%)`} value={formatEUR(tax)} />
              <div className="border-t pt-1.5 mt-1.5">
                <Row label="Order total" value={formatEUR(total)} bold />
              </div>
            </div>
          </Section>

          <Section title="Timeline" icon={<CheckCircle2 className="size-4" />}>
            <ol className="space-y-3">
              {order.history.map((ev, idx) => (
                <li key={idx} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`size-2.5 rounded-full ${idx === order.history.length - 1 ? "bg-brand" : "bg-muted-foreground/40"}`} />
                    {idx < order.history.length - 1 && <span className="w-px flex-1 bg-border mt-1" />}
                  </div>
                  <div className="flex-1 pb-1">
                    <div className="text-sm font-medium">
                      {ev.label}
                      {ev.actor && <span className="text-muted-foreground font-normal"> · {ev.actor}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{new Date(ev.at).toLocaleString()}</div>
                  </div>
                </li>
              ))}
            </ol>
            {order.rejectionReason && (
              <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs">
                <span className="font-semibold text-rose-700 dark:text-rose-400">Rejected:</span>{" "}
                {order.rejectionReason}
              </div>
            )}
          </Section>
        </div>

        {/* Sidebar: meta */}
        <div className="space-y-4">
          <Section title="Order" icon={<FileText className="size-4" />}>
            <Meta label="Order ID" value={<span className="font-mono">{order.id}</span>} />
            <Meta label="Status" value={STATUS_META[order.status].label} />
            <Meta label="Foreman" value={order.foreman} />
            <Meta label="Project" value={order.project} />
            {order.approver && <Meta label="Approver" value={order.approver} />}
          </Section>

          <Section title="Shipping" icon={<Truck className="size-4" />}>
            <Meta label="Deliver to" value={
              <>
                <div>{order.project} — Site office</div>
                <div className="text-muted-foreground">Erlenmattstrasse 12, 4058 Basel, CH</div>
              </>
            } />
            <Meta label="Method" value="Supplier truck delivery" />
            <Meta label="ETA" value={estimatedDelivery(order)} />
          </Section>

          <Section title="Billing" icon={<CreditCard className="size-4" />}>
            <Meta label="Bill to" value={
              <>
                <div>comstruct AG</div>
                <div className="text-muted-foreground">Procurement Dept · Zurich HQ</div>
              </>
            } />
            <Meta label="Payment" value="Account · Net 30" />
            <Meta label="Status" value={order.status === "delivered" ? "Invoice due" : "Awaiting delivery"} />
          </Section>

          <Section title="Site" icon={<MapPin className="size-4" />}>
            <Meta label="Cost centre" value="CC-4421 · Erlenmatt B3" />
            <Meta label="GL account" value="62100 — C-Materials" />
          </Section>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={() => navigate({ to: "/procurement/orders" })} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="size-4" /> Back to all orders
        </button>
      </div>
    </div>
  );
}

function Section({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <span className="text-xs text-muted-foreground">· {subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold text-base" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-sm py-1.5 first:pt-0 last:pb-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function estimatedDelivery(order: Order) {
  if (order.status === "delivered") {
    const last = order.history[order.history.length - 1];
    return `Delivered ${new Date(last.at).toLocaleDateString()}`;
  }
  const created = new Date(order.createdAt).getTime();
  const eta = new Date(created + 2 * 24 * 60 * 60 * 1000);
  return eta.toLocaleDateString();
}
