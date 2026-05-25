import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Clock,
  Send,
  ShieldAlert,
  CircleDashed,
  FileEdit,
  Hourglass,
  PackageCheck,
  MessageCircleQuestion,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import type { Order, OrderStatus } from "./orders";
import type { NegotiationRow } from "./negotiations";

/**
 * The display-level status shown to users. Combines the order's internal
 * approval state with live supplier negotiation state so the "My orders" and
 * procurement views read like an order tracker rather than a raw DB enum.
 */
export type DerivedStatus =
  | "draft"
  | "pending_pm"
  | "pending_central"
  | "rejected"
  | "sending"
  | "awaiting_first_reply"
  | "clarifying"
  | "following_up"
  | "answering_questions"
  | "issues_raised"
  | "declined"
  | "action_required"
  | "partially_confirmed"
  | "confirmed"
  | "delivered";

export type StatusTone =
  | "neutral"
  | "slate"
  | "amber"
  | "orange"
  | "yellow"
  | "green"
  | "emerald"
  | "lime"
  | "blue"
  | "sky"
  | "indigo"
  | "cyan"
  | "teal"
  | "violet"
  | "fuchsia"
  | "rose"
  | "red";

export const DERIVED_STATUS_META: Record<
  DerivedStatus,
  { label: string; short: string; hint: string; tone: StatusTone; Icon: LucideIcon }
> = {
  draft:               { label: "Draft",                       short: "Draft",        hint: "Not submitted yet",                              tone: "slate",   Icon: FileEdit },
  pending_pm:          { label: "Pending PM approval",         short: "PM review",    hint: "Waiting for project manager",                    tone: "amber",   Icon: Hourglass },
  pending_central:     { label: "Pending central approval",    short: "Central",      hint: "Waiting for central procurement",                tone: "orange",  Icon: Hourglass },
  rejected:            { label: "Rejected",                    short: "Rejected",     hint: "Order was rejected",                             tone: "rose",    Icon: XCircle },
  sending:             { label: "Sending to supplier",         short: "Sending",      hint: "Agent is dispatching the PO",                    tone: "indigo",  Icon: Send },
  awaiting_first_reply:{ label: "Waiting on supplier",         short: "Waiting",      hint: "Agent is awaiting first reply",                  tone: "sky",     Icon: Clock },
  clarifying:          { label: "Clarifying with supplier",    short: "Clarifying",   hint: "Agent is resolving open points",                 tone: "violet",  Icon: MessageCircleQuestion },
  following_up:        { label: "Following up",                short: "Following up", hint: "Agent sent a reminder to the supplier",          tone: "yellow",  Icon: RefreshCcw },
  answering_questions: { label: "Answering supplier questions",short: "Q&A",          hint: "Agent is answering supplier's questions",        tone: "cyan",    Icon: HelpCircle },
  issues_raised:       { label: "Issues raised",               short: "Issues",       hint: "Supplier flagged problems with the order",       tone: "red",     Icon: AlertTriangle },
  declined:            { label: "Supplier declined",           short: "Declined",     hint: "Supplier cannot fulfil this order",              tone: "rose",    Icon: XCircle },
  action_required:     { label: "Needs input",                  short: "Needs input",  hint: "Action required to move this order forward",     tone: "fuchsia", Icon: ShieldAlert },
  partially_confirmed: { label: "Partially confirmed",         short: "Part. conf.",  hint: "Some suppliers confirmed, others pending",       tone: "lime",    Icon: CircleDashed },
  confirmed:           { label: "Confirmed by supplier",       short: "Confirmed",    hint: "Supplier confirmed the full order",              tone: "emerald", Icon: CheckCircle2 },
  delivered:           { label: "Delivered",                   short: "Delivered",    hint: "Materials received on site",                     tone: "green",   Icon: PackageCheck },
};

/** Verdict the agent extracted from the most recent supplier reply. */
export type Verdict =
  | "fully_confirmed"
  | "confirmed_with_issue"
  | "declined"
  | "needs_clarification"
  | "unclear";

export const VERDICT_META: Record<
  Verdict,
  { label: string; tone: StatusTone; Icon: LucideIcon }
> = {
  fully_confirmed:     { label: "Supplier confirmed",   tone: "green",   Icon: CheckCircle2 },
  confirmed_with_issue:{ label: "Confirmed w/ issue",   tone: "amber",   Icon: AlertTriangle },
  declined:            { label: "Supplier declined",    tone: "red",     Icon: XCircle },
  needs_clarification: { label: "Supplier asked back",  tone: "blue",    Icon: HelpCircle },
  unclear:             { label: "Reply unclear",        tone: "neutral", Icon: Sparkles },
};

/**
 * Priority for collapsing multiple per-supplier negotiations into one pill:
 * lower number wins (more urgent / more specific).
 */
const PRIORITY: Record<DerivedStatus, number> = {
  declined: 0,
  issues_raised: 1,
  action_required: 2,
  clarifying: 3,
  following_up: 4,
  answering_questions: 5,
  awaiting_first_reply: 6,
  partially_confirmed: 7,
  confirmed: 8,
  sending: 9,
  delivered: 10,
  draft: 11,
  pending_pm: 11,
  pending_central: 11,
  rejected: 11,
};

export function negotiationToDerived(n: {
  status: string | null;
  last_reply_at: string | null;
  classification?: { verdict?: string } | null;
}): DerivedStatus {
  const s = (n.status || "").toLowerCase();
  // Verdict from the last classified reply wins over raw status — the agent
  // sometimes leaves status as "awaiting_reply" while the classifier already
  // tagged the latest message as a decline / confirmation.
  const v = (n.classification?.verdict || "").toLowerCase();
  if (v === "declined") return "declined";
  if (v === "fully_confirmed" && s !== "needs_user") return "confirmed";

  switch (s) {
    case "confirmed": return "confirmed";
    case "declined": return "declined";
    case "declined_replaced": return "declined";
    case "issues_raised": return "issues_raised";
    case "needs_user": return "action_required";
    case "clarifying": return "clarifying";
    case "following_up": return "following_up";
    case "answering_questions": return "answering_questions";
    case "sent":
    case "awaiting_reply":
    default:
      if (v === "needs_clarification") return "clarifying";
      if (v === "confirmed_with_issue") return "issues_raised";
      return n.last_reply_at ? "clarifying" : "awaiting_first_reply";
  }
}

export function deriveOrderStatus(
  order: Pick<Order, "status">,
  negotiations: NegotiationRow[] | undefined,
): DerivedStatus {
  const s: OrderStatus = order.status;
  if (s === "draft") return "draft";
  if (s === "pending_pm") return "pending_pm";
  if (s === "pending_central") return "pending_central";
  if (s === "rejected") return "rejected";
  if (s === "delivered") return "delivered";

  const list = negotiations ?? [];
  if (list.length === 0) return "sending";

  const derivedList = list.map(negotiationToDerived);
  const confirmedCount = derivedList.filter((d) => d === "confirmed").length;
  if (confirmedCount > 0 && confirmedCount < derivedList.length) {
    // Mix of confirmed + still-open — surface the worst open one, but if
    // everything else is just confirmed return partially_confirmed.
    const nonConfirmed = derivedList.filter((d) => d !== "confirmed");
    const worst = nonConfirmed.sort((a, b) => PRIORITY[a] - PRIORITY[b])[0];
    if (worst === "awaiting_first_reply" || worst === "answering_questions") {
      return "partially_confirmed";
    }
    return worst;
  }
  return derivedList.sort((a, b) => PRIORITY[a] - PRIORITY[b])[0];
}

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  slate:   "bg-slate-500/10 text-slate-700 border-slate-500/30",
  amber:   "bg-amber-500/15 text-amber-800 border-amber-500/40",
  orange:  "bg-orange-500/15 text-orange-800 border-orange-500/40",
  yellow:  "bg-yellow-400/20 text-yellow-800 border-yellow-500/40",
  green:   "bg-green-600/15 text-green-800 border-green-600/40",
  emerald: "bg-emerald-500/15 text-emerald-800 border-emerald-500/40",
  lime:    "bg-lime-400/20 text-lime-800 border-lime-500/40",
  blue:    "bg-blue-500/15 text-blue-800 border-blue-500/40",
  sky:     "bg-sky-500/15 text-sky-800 border-sky-500/40",
  indigo:  "bg-indigo-500/15 text-indigo-800 border-indigo-500/40",
  cyan:    "bg-cyan-500/15 text-cyan-800 border-cyan-500/40",
  teal:    "bg-teal-500/15 text-teal-800 border-teal-500/40",
  violet:  "bg-violet-500/15 text-violet-800 border-violet-500/40",
  fuchsia: "bg-fuchsia-500/15 text-fuchsia-800 border-fuchsia-500/40",
  rose:    "bg-rose-500/15 text-rose-800 border-rose-500/40",
  red:     "bg-red-500/15 text-red-800 border-red-500/40",
};

/* ------------------------------------------------------------------ */
/*  Delivery date display helpers                                     */
/* ------------------------------------------------------------------ */

export type OrderDelivery = {
  /** Best estimated delivery date in `YYYY-MM-DD`, or null if unknown. */
  iso: string | null;
  /** Range end if the supplier gave a window; equals `iso` for point dates. */
  isoEnd: string | null;
  confidence: "high" | "medium" | "low" | "unresolved";
  /** True when the supplier mentioned delivery but we couldn't pin a date. */
  needsClarification: boolean;
  /** Original supplier wording. */
  raw: string | null;
  /** Supplier the delivery date came from (when known). */
  supplier: string | null;
  /** Tone class key matching STATUS_TONE_CLASS. */
  tone: StatusTone;
  /** Short label e.g. "Tue 2 Jun", "27–29 May", "Asking supplier", "TBD". */
  label: string;
  /** Long label for the expanded view, e.g. "Tuesday, 2 June 2026". */
  longLabel: string;
};

/**
 * Pick the most relevant delivery info across an order's negotiations.
 * Prefers confirmed > earliest dated > needs-clarification > unresolved.
 */
export function pickDeliveryForOrder(
  negotiations: NegotiationRow[] | undefined,
): OrderDelivery {
  const list = (negotiations ?? []).slice();
  if (list.length === 0) return EMPTY_DELIVERY;

  // 1) Prefer a confirmed negotiation that also has a date.
  const confirmedDated = list.find(
    (n) => (n.status || "").toLowerCase() === "confirmed" && n.delivery_date_iso,
  );
  const pick =
    confirmedDated ??
    // 2) Otherwise the earliest ISO across all negotiations.
    list
      .filter((n) => !!n.delivery_date_iso)
      .sort((a, b) => (a.delivery_date_iso! < b.delivery_date_iso! ? -1 : 1))[0] ??
    // 3) Otherwise the first one that's awaiting clarification.
    list.find((n) => n.delivery_date_needs_clarification) ??
    list[0];

  return toOrderDelivery(pick);
}

const EMPTY_DELIVERY: OrderDelivery = {
  iso: null,
  isoEnd: null,
  confidence: "unresolved",
  needsClarification: false,
  raw: null,
  supplier: null,
  tone: "neutral",
  label: "TBD",
  longLabel: "Not provided yet",
};

function toOrderDelivery(n: NegotiationRow | undefined): OrderDelivery {
  if (!n) return EMPTY_DELIVERY;
  const confidence = (n.delivery_date_confidence ?? "unresolved") as OrderDelivery["confidence"];
  const needsClarification = !!n.delivery_date_needs_clarification;
  const iso = n.delivery_date_iso;
  const isoEnd = n.delivery_date_iso_end ?? iso;

  if (!iso) {
    return {
      iso: null,
      isoEnd: null,
      confidence,
      needsClarification,
      raw: n.delivery_date_raw,
      supplier: n.supplier_name,
      tone: needsClarification ? "amber" : "neutral",
      label: needsClarification ? "Asking supplier" : "TBD",
      longLabel: needsClarification
        ? "Asking supplier for an exact date"
        : "Not provided yet",
    };
  }

  const tone: StatusTone =
    confidence === "high"
      ? (n.status || "").toLowerCase() === "confirmed"
        ? "green"
        : "blue"
      : confidence === "medium"
        ? "teal"
        : "amber";

  return {
    iso,
    isoEnd,
    confidence,
    needsClarification,
    raw: n.delivery_date_raw,
    supplier: n.supplier_name,
    tone,
    label: formatDeliveryShort(iso, isoEnd ?? iso),
    longLabel: formatDeliveryLong(iso, isoEnd ?? iso),
  };
}

function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function shouldShowYear(d: Date): boolean {
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff > 180 || d.getUTCFullYear() !== now.getUTCFullYear();
}

export function formatDeliveryShort(iso: string, isoEnd: string): string {
  const a = parseIsoDate(iso);
  const b = parseIsoDate(isoEnd);
  if (!a) return iso;
  const fmt = (d: Date, withWeekday: boolean) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: "UTC",
      weekday: withWeekday ? "short" : undefined,
      day: "numeric",
      month: "short",
      year: shouldShowYear(d) ? "numeric" : undefined,
    }).format(d);
  if (!b || iso === isoEnd) return fmt(a, true);
  // Range
  return `${fmt(a, false)} – ${fmt(b, false)}`;
}

export function formatDeliveryLong(iso: string, isoEnd: string): string {
  const a = parseIsoDate(iso);
  const b = parseIsoDate(isoEnd);
  if (!a) return iso;
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  if (!b || iso === isoEnd) return fmt(a);
  return `${fmt(a)} – ${fmt(b)}`;
}

/* ------------------------------------------------------------------ */
/*  Shipping cost display helpers                                     */
/* ------------------------------------------------------------------ */

export type OrderShipping = {
  amountEur: number | null;
  supplier: string | null;
  tone: StatusTone;
  label: string;
  longLabel: string;
};

const EMPTY_SHIPPING: OrderShipping = {
  amountEur: null,
  supplier: null,
  tone: "neutral",
  label: "Unknown",
  longLabel: "Not provided yet",
};

/**
 * Pick the most relevant shipping cost across an order's negotiations.
 * Prefers confirmed negotiations, then the latest one with a numeric value.
 */
export function pickShippingForOrder(
  negotiations: NegotiationRow[] | undefined,
): OrderShipping {
  const list = (negotiations ?? []).filter(
    (n) => typeof n.classification?.shipping_cost_eur === "number",
  );
  if (list.length === 0) return EMPTY_SHIPPING;

  const confirmed = list.find((n) => (n.status || "").toLowerCase() === "confirmed");
  const pick =
    confirmed ??
    list.sort((a, b) =>
      (b.last_reply_at || b.sent_at).localeCompare(a.last_reply_at || a.sent_at),
    )[0];

  const amount = pick.classification!.shipping_cost_eur as number;
  const isFree = amount === 0;
  const label = isFree
    ? "Free"
    : new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(amount);

  return {
    amountEur: amount,
    supplier: pick.supplier_name,
    tone: (pick.status || "").toLowerCase() === "confirmed" ? "green" : "blue",
    label,
    longLabel: isFree ? "Free shipping" : label,
  };
}

/* ------------------------------------------------------------------ */
/*  Merged order timeline                                             */
/* ------------------------------------------------------------------ */

export type TimelineEvent = {
  at: string;
  label: string;
  actor?: string;
  tone?: StatusTone;
};

function isSameSupplier(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
}

export function filterNegotiationsForOrder(
  order: Pick<Order, "items" | "createdAt">,
  negotiations: NegotiationRow[] | undefined,
): NegotiationRow[] {
  const supplierByKey = new Map(
    (order.items ?? [])
      .filter((i) => i.supplier && i.supplier.trim())
      .map((i) => [i.productId, i.supplier!.trim().toLowerCase()]),
  );
  const originalSuppliers = new Set(supplierByKey.values());
  const createdAtMs = new Date(order.createdAt).getTime();
  const lowerBoundMs = Number.isFinite(createdAtMs) ? createdAtMs - 5 * 60_000 : 0;

  return (negotiations ?? []).filter((n) => {
    if ((n.failover_attempt ?? 0) !== 0) return false;

    const supplierKey = (n.supplier_name || "").trim().toLowerCase();
    if (originalSuppliers.size > 0 && !originalSuppliers.has(supplierKey)) return false;

    const sentAtMs = new Date(n.sent_at).getTime();
    if (Number.isFinite(sentAtMs) && sentAtMs < lowerBoundMs) return false;

    const snapshotItems = (n as unknown as { order_snapshot?: { items?: Array<{ productId?: string; supplier?: string | null }> } })
      .order_snapshot?.items;
    if (Array.isArray(snapshotItems) && snapshotItems.length > 0 && supplierByKey.size > 0) {
      return snapshotItems.some((item) => {
        if (!item.productId) return false;
        return isSameSupplier(item.supplier, supplierByKey.get(item.productId));
      });
    }

    return true;
  });
}

type RfqLike = {
  status: string;
  escalation_reason: string | null;
  winner_supplier: string | null;
  winner_total_eur: number | null;
  decided_at: string | null;
  invited_suppliers?: string[] | null;
};

/**
 * Merge the order's local history (Submitted, Approved, …) with synthesised
 * supplier-agent and RFQ events so the foreman sees what actually happened —
 * including supplier declines, failover attempts and "no alternative offer".
 */
export function buildOrderTimeline(
  order: {
    createdAt: string;
    history: { at: string; label: string; actor?: string }[];
    status: string;
    items?: { supplier?: string | null }[];
  },
  negotiations: NegotiationRow[] | undefined,
  rfq?: RfqLike | null,
): TimelineEvent[] {
  const events: TimelineEvent[] = (order.history ?? []).map((e) => ({ ...e }));

  // Only surface suppliers that were already in the foreman's cart for this
  // order. We hide failover attempts and RFQ-added bidders from the timeline
  // even if the agent created negotiation rows for them server-side, so a
  // low-value order never reads as if we contacted other suppliers.
  const originalSuppliers = new Set(
    (order.items ?? [])
      .map((i) => (i.supplier || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const isOriginal = (name: string | null | undefined) =>
    originalSuppliers.size === 0 ||
    originalSuppliers.has((name || "").trim().toLowerCase());

  const list = filterNegotiationsForOrder(order as Pick<Order, "items" | "createdAt">, negotiations)
    .slice()
    .sort((a, b) => a.sent_at.localeCompare(b.sent_at));

  // Suppliers already mentioned by an existing "PO sent to X" history entry —
  // skip the synthesised PO event for them to avoid duplicates.
  const poSentSuppliers = new Set<string>();
  for (const e of events) {
    const m = /^po sent to (.+?)(?:\s+—.*)?$/i.exec(e.label.trim());
    if (m) poSentSuppliers.add(m[1].trim().toLowerCase());
  }

  for (const n of list) {
    const supplierKey = (n.supplier_name || "").trim().toLowerCase();
    if (!poSentSuppliers.has(supplierKey)) {
      events.push({
        at: n.sent_at,
        label: `PO sent to ${n.supplier_name}`,
        tone: "indigo",
      });
      poSentSuppliers.add(supplierKey);
    }

    if (!n.last_reply_at) continue;
    const verdict = (n.classification?.verdict || "").toLowerCase();
    const s = (n.status || "").toLowerCase();
    const reasonRaw =
      n.classification?.summary_en ||
      n.classification?.summary ||
      n.reject_reason ||
      null;
    const reason = reasonRaw ? `: ${reasonRaw}` : "";

    if (verdict === "declined" || s === "declined" || s === "declined_replaced") {
      events.push({
        at: n.last_reply_at,
        label: `${n.supplier_name} declined the order${reason}`,
        tone: "rose",
      });
    } else if (verdict === "fully_confirmed" || s === "confirmed") {
      events.push({
        at: n.confirmed_at || n.last_reply_at,
        label: `${n.supplier_name} confirmed the order`,
        tone: "emerald",
      });
    } else if (verdict === "confirmed_with_issue" || s === "issues_raised") {
      events.push({
        at: n.last_reply_at,
        label: `${n.supplier_name} confirmed with issues${reason}`,
        tone: "amber",
      });
    } else if (
      verdict === "needs_clarification" ||
      s === "clarifying" ||
      s === "answering_questions"
    ) {
      // Two events: the supplier's reply, then the agent's clarification ask.
      events.push({
        at: n.last_reply_at,
        label: reasonRaw
          ? `${n.supplier_name} replied: ${reasonRaw}`
          : `${n.supplier_name} replied`,
        tone: "blue",
      });
      if ((n.clarification_count ?? 0) > 0 || s === "clarifying") {
        const followupAt = new Date(
          new Date(n.last_reply_at).getTime() + 60_000,
        ).toISOString();
        events.push({
          at: followupAt,
          label: `Agent asked ${n.supplier_name} for clarification`,
          tone: "violet",
        });
      } else if (s === "answering_questions") {
        const followupAt = new Date(
          new Date(n.last_reply_at).getTime() + 60_000,
        ).toISOString();
        events.push({
          at: followupAt,
          label: `Agent answered ${n.supplier_name}'s questions`,
          tone: "cyan",
        });
      }
    } else if (s === "needs_user") {
      events.push({
        at: n.last_reply_at,
        label: `${n.supplier_name} needs your input${n.needs_user_reason ? `: ${n.needs_user_reason}` : ""}`,
        tone: "fuchsia",
      });
    }
  }

  // RFQ outcome — "no alternative offer found" or winner picked. Only show
  // when the winning supplier was an original cart supplier; otherwise this
  // would expose alternate-supplier outreach the foreman didn't ask for.
  if (rfq && isOriginal(rfq.winner_supplier ?? null)) {
    const rs = (rfq.status || "").toLowerCase();
    if (rs === "escalated") {
      const reason = rfq.escalation_reason || "no usable offer received";
      events.push({
        at: rfq.decided_at || new Date().toISOString(),
        label: `No alternative offer found — ${reason}`,
        tone: "rose",
      });
    } else if (rs === "decided" && rfq.winner_supplier) {
      const total =
        rfq.winner_total_eur != null
          ? ` (€${Number(rfq.winner_total_eur).toFixed(2)})`
          : "";
      events.push({
        at: rfq.decided_at || new Date().toISOString(),
        label: `Best offer: ${rfq.winner_supplier}${total} — PO sent`,
        tone: "emerald",
      });
    }
  }

  // De-duplicate by normalized label (ignoring timestamp) so we never show
  // the same line twice — e.g. "PO sent to Uvex" from both local history
  // and the synthesised negotiation event.
  const seen = new Set<string>();
  const deduped = events.filter((e) => {
    const k = e.label.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  deduped.sort((a, b) => a.at.localeCompare(b.at));
  return deduped;
}

