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
  buildOrderTimeline,
  deriveOrderStatus,
  pickDeliveryForOrder,
  pickShippingForOrder,
  type DerivedStatus,
  type OrderDelivery,
  type OrderShipping,
  type StatusTone,
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
  stage: AttentionStage;
  /** Short one-line label of the issue (e.g. "Long shipping (21 days)"). */
  problem: string;
  /** Negotiation row to act on when stage = "decide". */
  negotiationId?: string;
};

/**
 * Compress a long supplier-feedback string into a tight one-liner the foreman
 * can read at a glance. Pattern-matches the common cases (delivery delay,
 * price increase, out-of-stock, MOQ) and otherwise returns the first sentence
 * capped at ~60 chars.
 */
function shortReason(raw: string): string {
  const text = (raw || "").trim();
  if (!text) return "Needs your input";
  const lower = text.toLowerCase();

  // Delivery / shipping delay — try to surface the day count.
  const dayMatch = text.match(/(\d+)\s*(?:business\s+)?(?:day|days|werktage|tage)/i);
  if (/(ship|deliver|lead\s*time|liefer|versand)/i.test(lower) && dayMatch) {
    return `Long shipping (${dayMatch[1]} days)`;
  }
  if (/(ship|deliver|lead\s*time|liefer|versand)/i.test(lower) && /(delay|late|longer|wait)/i.test(lower)) {
    return "Long shipping";
  }

  // Price change.
  const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (/(price|cost|preis|kosten)/i.test(lower) && /(increase|higher|up|raise|raised)/i.test(lower)) {
    return pctMatch ? `Price up ${pctMatch[1]}%` : "Price increased";
  }

  // Stock.
  if (/(out\s*of\s*stock|no\s*stock|unavailable|sold\s*out|nicht\s*verf)/i.test(lower)) {
    return "Out of stock";
  }

  // Minimum order quantity.
  if (/(minimum\s*order|moq|mindestbestell)/i.test(lower)) {
    return "Minimum order not met";
  }

  // Fallback: first sentence, trimmed.
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return firstSentence.length > 70 ? `${firstSentence.slice(0, 67)}…` : firstSentence;
}

function computeAttention(
  order: Order,
  negotiations: NegotiationRow[] | undefined,
  _rfq: RfqRow | null,
): AttentionInfo | null {
  // Cancelled / rejected orders are no longer actionable.
  if (order.status === "rejected") return null;

  const list = negotiations ?? [];

  // 1. Supplier reply that needs the user to decide (potentially acceptable).
  const needsUserNeg = list.find((n) => (n.status || "").toLowerCase() === "needs_user");
  if (needsUserNeg) {
    const verdict = (needsUserNeg.classification?.verdict || "").toLowerCase();
    const reason =
      needsUserNeg.needs_user_reason ||
      needsUserNeg.classification?.summary_en ||
      needsUserNeg.classification?.summary ||
      "";

    // Hard "declined" verdicts skip the confirm/decline step.
    if (verdict === "declined") {
      return { stage: "rejected", problem: shortReason(reason) || "Supplier declined" };
    }
    return {
      stage: "decide",
      problem: shortReason(reason),
      negotiationId: needsUserNeg.id,
    };
  }

  // 2. Any negotiation with a "declined" verdict, even if status isn't needs_user.
  const declinedNeg = list.find(
    (n) => (n.classification?.verdict || "").toLowerCase() === "declined",
  );
  if (declinedNeg) {
    const reason =
      declinedNeg.needs_user_reason ||
      declinedNeg.classification?.summary_en ||
      declinedNeg.classification?.summary ||
      "";
    return { stage: "rejected", problem: shortReason(reason) || "Supplier declined" };
  }

  // 3. RFQ exhausted — no supplier could fulfil.
  if (order.status === "rfq_failed") {
    return {
      stage: "rejected",
      problem: shortReason(
        _rfq?.escalation_reason ||
          order.rejectionReason ||
          "",
      ) || "No supplier available",
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
    // Restore the chat context that produced this order so the assistant has
    // the full conversation when crafting alternatives.
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
    // Natural, foreman-style prompt that's also auto-sent on arrival.
    const lead = original
      ? `I originally asked for ${original}, and you suggested ${blockedItems}.`
      : `I tried to order ${blockedItems}.`;
    const prompt =
      `${lead} The supplier can't fulfil it. Can you try to find the exact same product from a different supplier — even if the price is a bit higher? If nothing matches, suggest the closest alternative that does the same job.`;

    navigate({ to: "/", search: { prefill: prompt, autoSend: true } });
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
        <div className="text-sm font-bold text-brand uppercase tracking-wide">
          Action required — {items.length} order{items.length === 1 ? "" : "s"}
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

  // When the foreman has declined, the problem text should reflect that
  // it's now a "supplier won't fulfil" situation rather than a pending
  // confirmation.
  const displayedProblem =
    info.stage === "decide" && declined ? "Declined — pick how to continue" : info.problem;

  return (
    <li className="rounded-lg border border-brand/30 bg-background p-3 space-y-2">
      <button
        type="button"
        onClick={() => onOpen(order.id)}
        className="block w-full text-left"
      >
        <div className="text-xs font-mono text-muted-foreground">{order.id}</div>
        <p className="text-sm font-semibold text-foreground mt-0.5">{displayedProblem}</p>
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
          {hasDelivery && (
            <div className="grid sm:grid-cols-2 gap-3">
              <DeliveryBlock delivery={delivery} />
            </div>
          )}



          {list.length > 0 && <SuppliersStatusBlock negotiations={list} order={order} />}
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
 * Per-supplier list — supplier name only. The single status tag at the top
 * of the order represents the order's overall state; we don't repeat status
 * or verdict tags per supplier here.
 */
function SuppliersStatusBlock({ negotiations, order }: { negotiations: NegotiationRow[]; order: Order }) {
  const originalSuppliers = new Set(
    order.items
      .map((i) => (i.supplier || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const filtered = negotiations.filter(
    (n) =>
      (n.failover_attempt ?? 0) === 0 &&
      (originalSuppliers.size === 0 ||
        originalSuppliers.has((n.supplier_name || "").trim().toLowerCase())),
  );
  if (filtered.length === 0) return null;
  const sorted = [...filtered].sort((a, b) =>
    (b.last_reply_at || b.sent_at).localeCompare(a.last_reply_at || a.sent_at),
  );
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Suppliers
      </h4>
      <ul className="space-y-1.5">
        {sorted.map((n) => (
          <li key={n.id} className="text-sm font-medium truncate">
            {n.supplier_name}
          </li>
        ))}
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


