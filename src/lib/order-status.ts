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

export type StatusTone = "neutral" | "amber" | "green" | "blue" | "teal" | "red";

export const DERIVED_STATUS_META: Record<DerivedStatus, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_pm: { label: "Pending PM Approval", tone: "amber" },
  pending_central: { label: "Pending Central Approval", tone: "amber" },
  rejected: { label: "Rejected", tone: "red" },
  sending: { label: "Sending to Supplier", tone: "blue" },
  awaiting_first_reply: { label: "Awaiting Supplier Reply", tone: "blue" },
  clarifying: { label: "Clarifying with Supplier", tone: "amber" },
  following_up: { label: "Following Up on Details", tone: "amber" },
  answering_questions: { label: "Answered Supplier Questions", tone: "blue" },
  issues_raised: { label: "Issues Raised", tone: "red" },
  declined: { label: "Supplier Declined", tone: "red" },
  action_required: { label: "Action Required", tone: "amber" },
  partially_confirmed: { label: "Partially Confirmed", tone: "teal" },
  confirmed: { label: "Confirmed by Supplier", tone: "green" },
  delivered: { label: "Delivered", tone: "teal" },
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

function negToDerived(n: { status: string | null; last_reply_at: string | null }): DerivedStatus {
  const s = (n.status || "").toLowerCase();
  switch (s) {
    case "confirmed": return "confirmed";
    case "declined": return "declined";
    case "issues_raised": return "issues_raised";
    case "needs_user": return "action_required";
    case "clarifying": return "clarifying";
    case "following_up": return "following_up";
    case "answering_questions": return "answering_questions";
    case "sent":
    case "awaiting_reply":
    default:
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

  const derivedList = list.map(negToDerived);
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
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40",
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/40",
  teal: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/40",
  red: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/40",
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
