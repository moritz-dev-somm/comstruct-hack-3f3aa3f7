import type { Negotiation, ReplyIntent } from "./types";

/**
 * Condition / policy layer.
 *
 * Given a supplier reply (or the lack of one), decide what the agent should
 * do next. This is intentionally a tiny rules engine rather than a giant
 * prompt — easier to reason about, easier to override per-supplier later.
 *
 * Everything here is placeholder logic — concrete thresholds (24h SLA,
 * "too long" lead time, acceptable price delta, etc.) will be refined.
 */

export type AgentAction =
  | { kind: "wait" }
  | { kind: "send_nudge" }
  | { kind: "mark_accepted" }
  | { kind: "abort"; reason: string }
  | { kind: "ask_user"; question: string }
  | { kind: "try_alternative_supplier"; reason: string };

/** Coarse keyword classifier — placeholder until we wire an LLM call. */
export function classifyReplyHeuristic(body: string): ReplyIntent {
  const b = body.toLowerCase();
  if (/\b(confirm|confirmed|in stock|will ship|order accepted|bestätigt)\b/.test(b)) {
    return "confirmed";
  }
  if (/\b(out of stock|nicht verfügbar|sold out|unavailable)\b/.test(b)) {
    return "out_of_stock";
  }
  if (/\b(partial|teilweise|only \d+|nur \d+)\b/.test(b)) {
    return "partial_availability";
  }
  if (/\b(price (has )?(increased|changed)|new price|preis(änderung|erhöhung))\b/.test(b)) {
    return "price_change";
  }
  if (/\b(\d+\s*(weeks?|wochen|days?|tage)\s*(delivery|lieferung)?|lead\s*time)\b/.test(b)) {
    return "lead_time_too_long";
  }
  if (/\b(counter ?offer|alternativ(e|angebot)|propose)\b/.test(b)) {
    return "counter_offer";
  }
  if (/\?\s*$/.test(b) || /\b(could you clarify|please confirm|frage|klärung)\b/.test(b)) {
    return "clarification_request";
  }
  if (/\b(decline|reject|cannot fulfill|ablehnen)\b/.test(b)) {
    return "decline";
  }
  return "unknown";
}

/**
 * Given a negotiation in `awaiting_reply` and the current time, decide what
 * to do. Returns "wait" if we're still within SLA.
 */
export function decideOnTimeout(neg: Negotiation, now: Date = new Date()): AgentAction {
  if (neg.status !== "sent" && neg.status !== "awaiting_reply") {
    return { kind: "wait" };
  }
  const deadline = new Date(neg.deadlineAt).getTime();
  const t = now.getTime();
  if (t < deadline) return { kind: "wait" };

  // Soft timeout: 24h passed → send one nudge. Hard timeout: 48h → escalate.
  const hoursOver = (t - deadline) / 36e5;
  if (hoursOver < 24) return { kind: "send_nudge" };
  return {
    kind: "try_alternative_supplier",
    reason: `No reply from ${neg.supplierName} after 48h`,
  };
}

/**
 * Given the classified intent of the latest reply, decide what to do.
 * Placeholder thresholds — wire to real numbers once procurement decides.
 */
export function decideOnReply(intent: ReplyIntent, neg: Negotiation): AgentAction {
  switch (intent) {
    case "confirmed":
      return { kind: "mark_accepted" };

    case "out_of_stock":
      return {
        kind: "ask_user",
        question: `Supplier ${neg.supplierName} is out of stock for order ${neg.orderId}. Try a different supplier, or pick a substitute item?`,
      };

    case "partial_availability":
      return {
        kind: "ask_user",
        question: `Supplier ${neg.supplierName} can only fulfil part of order ${neg.orderId}. Accept partial delivery and source the rest elsewhere?`,
      };

    case "lead_time_too_long":
      return {
        kind: "ask_user",
        question: `Supplier ${neg.supplierName} reports a long lead time for order ${neg.orderId}. Wait, or try a faster supplier?`,
      };

    case "price_change":
    case "counter_offer":
      return {
        kind: "ask_user",
        question: `Supplier ${neg.supplierName} proposed different terms for order ${neg.orderId}. Approve the new terms?`,
      };

    case "clarification_request":
      // For now bounce to a human; later we can auto-answer with order details.
      return {
        kind: "ask_user",
        question: `Supplier ${neg.supplierName} asked a clarifying question on order ${neg.orderId}.`,
      };

    case "decline":
      return {
        kind: "try_alternative_supplier",
        reason: `${neg.supplierName} declined`,
      };

    case "unknown":
    default:
      return {
        kind: "ask_user",
        question: `Got a reply from ${neg.supplierName} on order ${neg.orderId} we couldn't classify automatically. Please review.`,
      };
  }
}
