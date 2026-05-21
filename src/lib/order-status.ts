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
  | "awaiting_supplier"
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
  awaiting_supplier: { label: "Awaiting Supplier Response", tone: "blue" },
  action_required: { label: "Action Required", tone: "amber" },
  partially_confirmed: { label: "Partially Confirmed", tone: "teal" },
  confirmed: { label: "Confirmed by Supplier", tone: "green" },
  delivered: { label: "Delivered", tone: "teal" },
};

/**
 * Derives the user-facing status from the order's approval state and any
 * supplier negotiations attached to it. Once an order is `ordered`, the
 * supplier conversation drives the label.
 */
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

  // s === "ordered" or "approved" — look at supplier negotiations.
  const list = negotiations ?? [];
  if (list.length === 0) return "sending";

  const counts = list.reduce(
    (acc, n) => {
      const k = (n.status || "").toLowerCase();
      if (k === "confirmed") acc.confirmed++;
      else if (k === "needs_user" || k === "declined") acc.action++;
      else acc.awaiting++;
      return acc;
    },
    { confirmed: 0, action: 0, awaiting: 0 },
  );

  if (counts.action > 0) return "action_required";
  if (counts.confirmed === list.length) return "confirmed";
  if (counts.confirmed > 0) return "partially_confirmed";
  return "awaiting_supplier";
}

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40",
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/40",
  teal: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/40",
  red: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/40",
};
