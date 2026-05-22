import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ShoppingCart,
  Truck,
  ShieldAlert,
  Search,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatEUR } from "@/lib/catalog";
import { useOrders, type Order } from "@/lib/orders";
import { useNegotiationsByOrder, type NegotiationRow } from "@/lib/negotiations";
import { useRfqsByOrder, type RfqRow } from "@/lib/rfqs";
import {
  DERIVED_STATUS_META,
  STATUS_TONE_CLASS,
  VERDICT_META,
  buildOrderTimeline,
  deriveOrderStatus,
  negotiationToDerived,
  pickDeliveryForOrder,
  pickShippingForOrder,
  type DerivedStatus,
  type OrderDelivery,
  type OrderShipping,
  type StatusTone,
  type Verdict,
} from "@/lib/order-status";
import { SwitchUserButton } from "@/components/SwitchUserButton";


export const Route = createFileRoute("/orders")({
  component: OrdersPage,
  head: () => ({
    meta: [{ title: "My orders — comstruct" }],
  }),
});

function OrdersPage() {
  const { orders, reject } = useOrders();
  const [openId, setOpenId] = useState<string | null>(orders[0]?.id ?? null);
  const orderIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const negotiationsByOrder = useNegotiationsByOrder(orderIds);
  const rfqsByOrder = useRfqsByOrder(orderIds);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center gap-3">
          <Link to="/" className="grid size-9 place-items-center rounded-md hover:bg-accent" aria-label="Back">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex-1">
            <h1 className="font-semibold text-sm">My orders</h1>
            <p className="text-xs text-muted-foreground">Project: Erlenmatt B3 · Marco Bianchi</p>
          </div>
          <SwitchUserButton compact />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-3">
        {orders.length === 0 && (
          <div className="text-center py-20 text-sm text-muted-foreground">
            <ShoppingCart className="size-8 mx-auto mb-3 opacity-40" />
            No orders yet. Start a request on the home screen.
          </div>
        )}
        {orders.map((o) => (
          <OrderRow
            key={o.id}
            order={o}
            negotiations={negotiationsByOrder[o.id]}
            rfq={rfqsByOrder[o.id]?.rfq ?? null}
            open={openId === o.id}
            onToggle={() => setOpenId(openId === o.id ? null : o.id)}
            onCancel={(reason) => reject(o.id, "Marco Bianchi", reason)}
          />
        ))}
      </main>
    </div>
  );
}

function OrderRow({
  order,
  negotiations,
  rfq,
  open,
  onToggle,
  onCancel,
}: {
  order: Order;
  negotiations: NegotiationRow[] | undefined;
  rfq: RfqRow | null;
  open: boolean;
  onToggle: () => void;
  onCancel: (reason: string) => void;
}) {
  const navigate = useNavigate();
  const itemCount = order.items.reduce((s, i) => s + i.qty, 0);
  const derived = deriveOrderStatus(order, negotiations);
  const delivery = pickDeliveryForOrder(negotiations);
  const shipping = pickShippingForOrder(negotiations);
  const list = negotiations ?? [];
  const timeline = buildOrderTimeline(order, negotiations, rfq);

  const hasDelivery = delivery.iso != null || delivery.needsClarification;
  const hasShipping = shipping.amountEur != null;
  const hasDeliveryGrid = hasDelivery || hasShipping;

  // Attention: either the agent flagged a supplier as needs_user, OR the RFQ
  // failed (no alternative offer found). Both block the order without input.
  const needsUserNeg = list.find((n) => (n.status || "").toLowerCase() === "needs_user");
  const rfqFailed = order.status === "rfq_failed";
  const attention: AttentionInfo | null = needsUserNeg
    ? {
        kind: "needs_user",
        title: `${needsUserNeg.supplier_name} needs your input`,
        reason:
          needsUserNeg.needs_user_reason ||
          needsUserNeg.classification?.summary_en ||
          needsUserNeg.classification?.summary ||
          "Supplier raised a point the agent can't resolve on its own.",
      }
    : rfqFailed
      ? {
          kind: "rfq_failed",
          title: "No alternative supplier found",
          reason:
            rfq?.escalation_reason ||
            order.rejectionReason ||
            "The agent contacted other suppliers but none could offer the exact same products.",
        }
      : null;

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-accent/50"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm font-mono">{order.id}</span>
            <StatusPill status={derived} />
            {hasDelivery && <DeliveryPill delivery={delivery} />}
            {hasShipping && <ShippingPill shipping={shipping} />}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {new Date(order.createdAt).toLocaleString()} · {itemCount} item{itemCount === 1 ? "" : "s"}
            {list.length > 0 && (
              <>
                {" · "}
                {list.length} supplier{list.length === 1 ? "" : "s"}
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold tabular-nums">{formatEUR(order.subtotal)}</div>
        </div>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t bg-muted/20 px-4 py-3 space-y-4">
          {attention && (
            <AttentionBlock
              info={attention}
              onFindAlternatives={() => {
                const q = order.items.map((i) => i.name).join(", ");
                navigate({ to: "/", search: { prefill: q } });
              }}
              onCancel={() =>
                onCancel(
                  attention.kind === "rfq_failed"
                    ? "Cancelled by foreman — no alternative supplier"
                    : "Cancelled by foreman",
                )
              }
            />
          )}
          {hasDeliveryGrid && (
            <div className="grid sm:grid-cols-2 gap-3">
              {hasDelivery && <DeliveryBlock delivery={delivery} />}
              {hasShipping && <ShippingBlock shipping={shipping} />}
            </div>
          )}

          {list.length > 0 && <SuppliersStatusBlock negotiations={list} />}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Items</h4>
            <ul className="text-sm space-y-1">
              {order.items.map((i) => (
                <li key={i.productId} className="flex justify-between gap-3">
                  <span className="truncate">{i.qty}× {i.name}</span>
                  <span className="tabular-nums text-muted-foreground shrink-0">{formatEUR(i.qty * i.price)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Timeline</h4>
            <ol className="text-sm space-y-1.5">
              {timeline.map((ev, idx) => (
                <li key={idx} className="flex gap-3">
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-24">
                    {new Date(ev.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="flex-1">
                    {ev.tone && (
                      <span
                        className={`inline-block size-2 rounded-full mr-2 align-middle ${dotForTone(ev.tone)}`}
                        aria-hidden
                      />
                    )}
                    {ev.label}
                    {ev.actor && <span className="text-muted-foreground"> · {ev.actor}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          {order.rejectionReason && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs">
              <span className="font-semibold text-rose-700 dark:text-rose-400">Rejected:</span>{" "}
              {order.rejectionReason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeliveryPill({ delivery }: { delivery: OrderDelivery }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TONE_CLASS[delivery.tone]}`}
      title={delivery.raw ? `Supplier said: "${delivery.raw}"` : undefined}
    >
      <CalendarDays className="size-3" />
      {delivery.label}
    </span>
  );
}

function ShippingPill({ shipping }: { shipping: OrderShipping }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TONE_CLASS[shipping.tone]}`}
      title={shipping.supplier ? `From ${shipping.supplier}` : undefined}
    >
      <Truck className="size-3" />
      {shipping.label}
    </span>
  );
}

function DeliveryBlock({ delivery }: { delivery: OrderDelivery }) {
  const confidenceLabel: Record<OrderDelivery["confidence"], string> = {
    high: "high confidence",
    medium: "medium confidence",
    low: "low confidence",
    unresolved: "unknown",
  };
  return (
    <div className="rounded-md border bg-background px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Delivery date
        </h4>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {confidenceLabel[delivery.confidence]}
        </span>
      </div>
      <div className="mt-1 text-sm font-semibold">{delivery.longLabel}</div>
      {delivery.raw && (
        <div className="mt-1 text-xs text-muted-foreground">
          Supplier said: <span className="italic">"{delivery.raw}"</span>
          {delivery.supplier ? <span> · {delivery.supplier}</span> : null}
        </div>
      )}
      {delivery.needsClarification && (
        <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Asked supplier to confirm an exact calendar date.
        </div>
      )}
    </div>
  );
}

function ShippingBlock({ shipping }: { shipping: OrderShipping }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Delivery costs
        </h4>
      </div>
      <div className="mt-1 text-sm font-semibold">{shipping.longLabel}</div>
      {shipping.supplier && (
        <div className="mt-1 text-xs text-muted-foreground">From {shipping.supplier}</div>
      )}
    </div>
  );
}

/**
 * Compact per-supplier status — just a status tag per supplier, no timeline.
 */
function SuppliersStatusBlock({ negotiations }: { negotiations: NegotiationRow[] }) {
  const sorted = [...negotiations].sort((a, b) =>
    (b.last_reply_at || b.sent_at).localeCompare(a.last_reply_at || a.sent_at),
  );
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Suppliers
      </h4>
      <ul className="space-y-1.5">
        {sorted.map((n) => {
          const status = negotiationToDerived(n);
          const verdict = n.classification?.verdict as Verdict | undefined;
          return (
            <li key={n.id} className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">{n.supplier_name}</span>
              <StatusPill status={status} />
              {verdict && <VerdictPill verdict={verdict} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Compact, icon-led status pill. The icon does most of the visual work so the
 * label can stay short and still feel informative at a glance.
 */
export function StatusPill({ status }: { status: DerivedStatus }) {
  const m = DERIVED_STATUS_META[status];
  const Icon = m.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border pl-1.5 pr-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TONE_CLASS[m.tone]}`}
      title={m.hint}
    >
      <Icon className="size-3" />
      {m.label}
    </span>
  );
}

function VerdictPill({ verdict }: { verdict: Verdict }) {
  const m = VERDICT_META[verdict];
  const Icon = m.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border pl-1.5 pr-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE_CLASS[m.tone]}`}
    >
      <Icon className="size-3" />
      {m.label}
    </span>
  );
}

const TONE_DOT: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground/40",
  slate: "bg-slate-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-500",
  green: "bg-green-600",
  emerald: "bg-emerald-500",
  lime: "bg-lime-500",
  blue: "bg-blue-500",
  sky: "bg-sky-500",
  indigo: "bg-indigo-500",
  cyan: "bg-cyan-500",
  teal: "bg-teal-500",
  violet: "bg-violet-500",
  fuchsia: "bg-fuchsia-500",
  rose: "bg-rose-500",
  red: "bg-red-500",
};

function dotForTone(tone: StatusTone): string {
  return TONE_DOT[tone] ?? TONE_DOT.neutral;
}
