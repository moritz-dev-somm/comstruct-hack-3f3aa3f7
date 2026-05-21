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
