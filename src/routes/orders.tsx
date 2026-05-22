import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ShoppingCart,
  Bot,
  Quote,
} from "lucide-react";
import { formatEUR } from "@/lib/catalog";
import { useOrders, type Order } from "@/lib/orders";
import { useNegotiationsByOrder, type NegotiationRow } from "@/lib/negotiations";
import {
  DERIVED_STATUS_META,
  STATUS_TONE_CLASS,
  VERDICT_META,
  deriveOrderStatus,
  negotiationToDerived,
  pickDeliveryForOrder,
  type DerivedStatus,
  type OrderDelivery,
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
  const { orders } = useOrders();
  const [openId, setOpenId] = useState<string | null>(orders[0]?.id ?? null);
  const orderIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const negotiationsByOrder = useNegotiationsByOrder(orderIds);

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
            open={openId === o.id}
            onToggle={() => setOpenId(openId === o.id ? null : o.id)}
          />
        ))}
      </main>
    </div>
  );
}

function OrderRow({
  order,
  negotiations,
  open,
  onToggle,
}: {
  order: Order;
  negotiations: NegotiationRow[] | undefined;
  open: boolean;
  onToggle: () => void;
}) {
  const itemCount = order.items.reduce((s, i) => s + i.qty, 0);
  const derived = deriveOrderStatus(order, negotiations);
  const delivery = pickDeliveryForOrder(negotiations);
  const list = negotiations ?? [];
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
            <DeliveryPill delivery={delivery} />
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
          <DeliveryBlock delivery={delivery} />
          {list.length > 0 && <SupplierAgentBlock negotiations={list} />}
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
              {order.history.map((ev, idx) => (
                <li key={idx} className="flex gap-3">
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-24">
                    {new Date(ev.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span>
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
          Delivery
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

/**
 * Per-supplier rollup of what the AI supplier-agent is currently doing for this
 * order. Mirrors the procurement "Supplier agent" tab but condensed for the
 * foreman: one line per supplier with status, last verdict, latest message
 * summary and the supplier's own delivery promise.
 */
function SupplierAgentBlock({ negotiations }: { negotiations: NegotiationRow[] }) {
  const sorted = [...negotiations].sort((a, b) =>
    (b.last_reply_at || b.sent_at).localeCompare(a.last_reply_at || a.sent_at),
  );
  return (
    <div className="rounded-md border bg-background">
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <Bot className="size-3.5 text-brand" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Supplier agent
        </h4>
        <span className="text-[10px] text-muted-foreground">
          · {negotiations.length} supplier{negotiations.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="divide-y">
        {sorted.map((n) => (
          <SupplierAgentRow key={n.id} n={n} />
        ))}
      </ul>
    </div>
  );
}

function SupplierAgentRow({ n }: { n: NegotiationRow }) {
  const status = negotiationToDerived(n);
  const verdict = n.classification?.verdict as Verdict | undefined;
  const summary =
    n.classification?.summary_en ||
    n.classification?.summary ||
    n.needs_user_reason ||
    null;
  const lastAt = n.last_reply_at || n.sent_at;

  return (
    <li className="px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-medium text-sm truncate">{n.supplier_name}</div>
        <div className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {new Date(lastAt).toLocaleString([], {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <StatusPill status={status} />
        {verdict && <VerdictPill verdict={verdict} />}
      </div>
      {summary && (
        <p className="text-xs text-muted-foreground line-clamp-2">{summary}</p>
      )}
      {n.reply_excerpt && (
        <div className="text-xs text-muted-foreground/90 flex gap-1.5 items-start pt-0.5">
          <Quote className="size-3 mt-0.5 shrink-0 opacity-60" />
          <span className="italic line-clamp-2">"{n.reply_excerpt}"</span>
        </div>
      )}
    </li>
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
