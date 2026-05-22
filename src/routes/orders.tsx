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
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatEUR } from "@/lib/catalog";
import { supabase } from "@/integrations/supabase/client";

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

type AttentionStage = "decide" | "rejected";

type AttentionInfo = {
  /**
   * `decide` – the supplier reply is potentially acceptable (price change,
   * delivery slip, clarification). The foreman must confirm or decline.
   * `rejected` – the supplier flat-out cannot fulfil the order, or the
   * foreman has just declined a `decide` item. Only path forward is to
   * cancel or look for alternatives.
   */
  stage: AttentionStage;
  title: string;
  problem: string;
  /** Negotiation row to act on when stage = "decide". */
  negotiationId?: string;
};

function computeAttention(
  order: Order,
  negotiations: NegotiationRow[] | undefined,
  _rfq: RfqRow | null,
): AttentionInfo | null {
  // Cancelled / rejected orders are no longer actionable.
  if (order.status === "rejected") return null;

  const list = negotiations ?? [];
  const needsUserNeg = list.find((n) => (n.status || "").toLowerCase() === "needs_user");
  if (needsUserNeg) {
    const verdict = (needsUserNeg.classification?.verdict || "").toLowerCase();
    const reason =
      needsUserNeg.needs_user_reason ||
      needsUserNeg.classification?.summary_en ||
      needsUserNeg.classification?.summary ||
      "Supplier raised a point the agent can't resolve on its own.";

    // Hard "declined" verdicts skip the confirm/decline step.
    if (verdict === "declined") {
      return {
        stage: "rejected",
        title: `${needsUserNeg.supplier_name} declined the order`,
        problem: reason,
      };
    }
    return {
      stage: "decide",
      title: `${needsUserNeg.supplier_name} needs your decision`,
      problem: reason,
      negotiationId: needsUserNeg.id,
    };
  }
  if (order.status === "rfq_failed") {
    return {
      stage: "rejected",
      title: "No supplier could fulfil this order",
      problem:
        _rfq?.escalation_reason ||
        order.rejectionReason ||
        "The agent contacted alternative suppliers but none could match the requested items.",
    };
  }
  return null;
}


function OrdersPage() {
  const { orders, reject } = useOrders();
  const [openId, setOpenId] = useState<string | null>(orders[0]?.id ?? null);
  const orderIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const negotiationsByOrder = useNegotiationsByOrder(orderIds);
  const rfqsByOrder = useRfqsByOrder(orderIds);
  const navigate = useNavigate();

  // Aggregate every open order that needs the foreman's input so we can
  // surface them in a single banner at the very top of the page.
  const attentions = useMemo(() => {
    return orders
      .map((o) => {
        const negs = negotiationsByOrder[o.id];
        const rfq = rfqsByOrder[o.id]?.rfq ?? null;
        const info = computeAttention(o, negs, rfq);
        return info ? { order: o, info } : null;
      })
      .filter((x): x is { order: Order; info: AttentionInfo } => x !== null);
  }, [orders, negotiationsByOrder, rfqsByOrder]);

  function handleFindAlternatives(order: Order) {
    // Restore the chat context that produced this order, then send the user
    // to the home chat with a focused follow-up prompt. We also cancel the
    // original order so the attention alert clears automatically.
    if (order.searchSnapshot) {
      try {
        localStorage.setItem(
          "comstruct-chat",
          JSON.stringify({
            messages: order.searchSnapshot.messages,
            recommendedIds: order.searchSnapshot.recommendedIds,
            recommendedQty: order.searchSnapshot.recommendedQty,
          }),
        );
      } catch {}
    }
    reject(order.id, "Marco Bianchi", "Replaced — searching for alternatives");
    const blockedItems = order.items.map((i) => i.name).join(", ");
    const original = order.searchSnapshot?.lastQuery;
    const prompt = original
      ? `Original request: "${original}". These products didn't work: ${blockedItems}. Suggest alternatives that fit the same job.`
      : `Suggest alternatives to: ${blockedItems}.`;
    navigate({ to: "/", search: { prefill: prompt } });
  }

  function handleCancel(order: Order, _info: AttentionInfo) {
    reject(order.id, "Marco Bianchi", "Cancelled by foreman");
  }

  async function handleConfirmSupplier(order: Order, info: AttentionInfo) {
    if (!info.negotiationId) return;
    const { error } = await supabase
      .from("negotiations")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", info.negotiationId);
    if (error) {
      toast.error("Could not confirm supplier reply");
      return;
    }
    toast.success("Supplier confirmed");
  }


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
        {attentions.length > 0 && (
          <AttentionBanner
            items={attentions}
            onFindAlternatives={handleFindAlternatives}
            onCancel={handleCancel}
            onConfirmSupplier={handleConfirmSupplier}
            onOpen={(id) => setOpenId(id)}
          />
        )}

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
          />
        ))}
      </main>
    </div>
  );
}

function AttentionBanner({
  items,
  onFindAlternatives,
  onCancel,
  onConfirmSupplier,
  onOpen,
}: {
  items: Array<{ order: Order; info: AttentionInfo }>;
  onFindAlternatives: (order: Order) => void;
  onCancel: (order: Order, info: AttentionInfo) => void;
  onConfirmSupplier: (order: Order, info: AttentionInfo) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <section
      aria-label="Action required"
      className="rounded-xl border-2 border-brand bg-brand/10 p-4 space-y-3"
    >
      <div className="flex items-center gap-2.5">
        <div className="grid place-items-center size-8 rounded-md bg-brand text-brand-foreground shrink-0">
          <ShieldAlert className="size-4" />
        </div>
        <div>
          <div className="text-sm font-bold text-brand uppercase tracking-wide">
            Action required — {items.length} order{items.length === 1 ? "" : "s"}
          </div>
          <div className="text-xs text-muted-foreground">
            These orders are paused until you decide how to continue.
          </div>
        </div>
      </div>
      <ul className="space-y-3">
        {items.map(({ order, info }) => (
          <AttentionItem
            key={order.id}
            order={order}
            info={info}
            onOpen={onOpen}
            onFindAlternatives={onFindAlternatives}
            onCancel={onCancel}
            onConfirmSupplier={onConfirmSupplier}
          />
        ))}
      </ul>
    </section>
  );
}

function AttentionItem({
  order,
  info,
  onOpen,
  onFindAlternatives,
  onCancel,
  onConfirmSupplier,
}: {
  order: Order;
  info: AttentionInfo;
  onOpen: (id: string) => void;
  onFindAlternatives: (order: Order) => void;
  onCancel: (order: Order, info: AttentionInfo) => void;
  onConfirmSupplier: (order: Order, info: AttentionInfo) => void;
}) {
  // Local override so a foreman who clicks "Decline" on a `decide` item
  // moves straight into the cancel / find-alternatives stage without
  // waiting for a server round-trip.
  const [declined, setDeclined] = useState(false);
  const effectiveStage: AttentionStage =
    info.stage === "decide" && declined ? "rejected" : info.stage;

  return (
    <li className="rounded-lg border border-brand/30 bg-background p-3 space-y-2">
      <button
        type="button"
        onClick={() => onOpen(order.id)}
        className="block w-full text-left"
      >
        <div className="text-xs font-mono text-muted-foreground">{order.id}</div>
        <div className="text-sm font-semibold text-brand">{info.title}</div>
        <p className="text-sm text-foreground/85 mt-0.5">{info.problem}</p>
      </button>
      <div className="flex flex-wrap gap-2">
        {effectiveStage === "decide" ? (
          <>
            <Button
              size="sm"
              onClick={() => onConfirmSupplier(order, info)}
              className="gap-1.5"
            >
              <CheckCircle2 className="size-3.5" />
              Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDeclined(true)}
              className="gap-1.5"
            >
              <XCircle className="size-3.5" />
              Decline
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              onClick={() => onFindAlternatives(order)}
              className="gap-1.5"
            >
              <Search className="size-3.5" />
              Find alternatives
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCancel(order, info)}
              className="gap-1.5"
            >
              <XCircle className="size-3.5" />
              Cancel order
            </Button>
          </>
        )}
      </div>
    </li>
  );
}





function OrderRow({
  order,
  negotiations,
  rfq,
  open,
  onToggle,
}: {
  order: Order;
  negotiations: NegotiationRow[] | undefined;
  rfq: RfqRow | null;
  open: boolean;
  onToggle: () => void;
}) {
  const itemCount = order.items.reduce((s, i) => s + i.qty, 0);
  const derived = deriveOrderStatus(order, negotiations);
  const delivery = pickDeliveryForOrder(negotiations);
  const shipping = pickShippingForOrder(negotiations);
  const list = negotiations ?? [];
  const timeline = buildOrderTimeline(order, negotiations, rfq);

  const hasDelivery = delivery.iso != null || delivery.needsClarification;
  const hasShipping = shipping.amountEur != null;
  const hasDeliveryGrid = hasDelivery || hasShipping;

  // Roll shipping into the headline total so the foreman sees the real
  // amount they'll pay, not just the goods subtotal. Shipping is still
  // broken out separately in the expanded view.
  const totalWithShipping = order.subtotal + (shipping.amountEur ?? 0);

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
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {new Date(order.createdAt).toLocaleString()} · {itemCount} item{itemCount === 1 ? "" : "s"}
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold tabular-nums">{formatEUR(totalWithShipping)}</div>
          {hasShipping && (
            <div className="text-[10px] text-muted-foreground tabular-nums">
              incl. {formatEUR(shipping.amountEur!)} shipping
            </div>
          )}
        </div>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t bg-muted/20 px-4 py-3 space-y-4">
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


function DeliveryBlock({ delivery }: { delivery: OrderDelivery }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Delivery date
      </h4>
      <div className="mt-1 text-sm font-semibold">{delivery.longLabel}</div>
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
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Delivery costs
      </h4>
      <div className="mt-1 text-sm font-semibold">{shipping.longLabel}</div>
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
          // Hide verdict pill when it duplicates the status pill.
          const showVerdict =
            verdict &&
            verdict !== "fully_confirmed" &&
            verdict !== "declined" &&
            !(verdict === "needs_clarification" && status === "clarifying");
          return (
            <li key={n.id} className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">{n.supplier_name}</span>
              <StatusPill status={status} />
              {showVerdict && <VerdictPill verdict={verdict!} />}
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


