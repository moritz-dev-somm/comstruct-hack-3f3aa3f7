import type { ChecklistField, ReplyClassification } from "./agent.server";

/**
 * Inbound-policy layer. Given the LLM classification and the negotiation's
 * accumulated state, decide which outbound action the agent should take.
 *
 * Safety rules:
 *  - Hard cap of 12 supplier replies per negotiation → handover email + human review.
 *  - Never auto-confirm with unmet checklist or unresolved issues.
 *  - Declines, item-unavailable, supplier-asks-for-human, or any
 *    question we cannot auto-answer → human review (no automatic email).
 *  - Auto-approve only if lead time is reasonable AND shipping cost is low.
 */

export const REPLY_CAP = 12;
export const AUTO_LEAD_TIME_DAYS_MAX = 14;
export const AUTO_SHIPPING_EUR_FLOOR = 20;
export const AUTO_SHIPPING_PERCENT_MAX = 0.05;

// Hardcoded reject/needs-user thresholds (user-tuned).
// Shipping auto-rejects (→ failover) only when BOTH conditions hit.
export const SHIPPING_HARDCAP_EUR = 40;
export const SHIPPING_HARDCAP_PCT_OF_SUBTOTAL = 0.5;
// Lead time
export const LEAD_TIME_NEEDS_USER_DAYS = 14;
export const LEAD_TIME_AUTO_REJECT_DAYS = 30;

export type AgentAction =
  | { kind: "send_confirmation"; reason?: string }
  | { kind: "send_checklist_followup"; fields: ChecklistField[] }
  | { kind: "send_answer_questions"; questions: string[] }
  | { kind: "send_clarification_request"; pendingChecklist: ChecklistField[] }
  | { kind: "auto_reject_failover"; reason: string }
  | { kind: "escalate_silent"; reason: string }
  | { kind: "no_op"; reason: string };

/**
 * Classify a quote/reply against the hardcoded thresholds.
 * Used by the policy to decide whether to auto-reject (→ failover),
 * defer to the user, or proceed normally.
 */
export function evaluateThresholds(
  cls: ReplyClassification,
  subtotalEur: number,
): { verdict: "ok" | "needs_user" | "auto_reject"; reason: string } {
  const ship = cls.shipping_cost_eur;
  const days = cls.lead_time_days;

  if (typeof days === "number" && Number.isFinite(days) && days > LEAD_TIME_AUTO_REJECT_DAYS) {
    return { verdict: "auto_reject", reason: `Lead time ${days} days exceeds ${LEAD_TIME_AUTO_REJECT_DAYS}-day hard cap.` };
  }
  if (
    typeof ship === "number" &&
    Number.isFinite(ship) &&
    ship > SHIPPING_HARDCAP_EUR &&
    subtotalEur > 0 &&
    ship > SHIPPING_HARDCAP_PCT_OF_SUBTOTAL * subtotalEur
  ) {
    return {
      verdict: "auto_reject",
      reason: `Shipping €${ship.toFixed(2)} exceeds both €${SHIPPING_HARDCAP_EUR} and ${Math.round(SHIPPING_HARDCAP_PCT_OF_SUBTOTAL * 100)}% of subtotal (€${subtotalEur.toFixed(2)}).`,
    };
  }
  if (typeof days === "number" && Number.isFinite(days) && days > LEAD_TIME_NEEDS_USER_DAYS) {
    return { verdict: "needs_user", reason: `Supplier quotes ${days}-day lead time — please confirm or cancel.` };
  }
  return { verdict: "ok", reason: "" };
}

export type CounterState = {
  followup_count: number;
  clarification_count: number;
  reply_count: number;
  /** Checklist fields the supplier has answered at any point in the thread. */
  answered_checklist: ChecklistField[];
  order_subtotal_eur: number;
};

const HUMAN_REQUEST_RE =
  /(talk to|speak (?:to|with)|a real person|human|sales rep|account manager|mit jemandem (?:sprechen|reden)|persönlich(?:e[rsn])? kontakt|sprechen|parler (?:à|avec)|un commercial|une personne|parlare con|persona reale|operatore)/i;

const UNAVAILABLE_RE =
  /(out of stock|unavailable|nicht (?:verfügbar|lieferbar|am lager)|ausverkauft|nicht (?:mehr )?vorrätig|indisponible|en rupture|esaurito|non disponibile)/i;

function pendingFromAnswered(answered: ChecklistField[]): ChecklistField[] {
  const all: ChecklistField[] = ["delivery_date", "shipping_cost"];
  return all.filter((f) => !answered.includes(f));
}

function isAcceptableLeadTime(cls: ReplyClassification): boolean {
  const days = cls.lead_time_days;
  if (typeof days === "number" && Number.isFinite(days)) return days <= AUTO_LEAD_TIME_DAYS_MAX;
  // If we don't have a number, defer to human.
  return false;
}

function isAcceptableShipping(cls: ReplyClassification, subtotalEur: number): boolean {
  const eur = cls.shipping_cost_eur;
  if (typeof eur !== "number" || !Number.isFinite(eur)) return false;
  const cap = Math.max(AUTO_SHIPPING_EUR_FLOOR, subtotalEur * AUTO_SHIPPING_PERCENT_MAX);
  return eur <= cap;
}

export function decideAction(cls: ReplyClassification, state: CounterState): AgentAction {
  const pending = pendingFromAnswered(state.answered_checklist);
  const issues = cls.issues ?? [];
  const answerable = cls.answerable_questions ?? [];
  const unanswerable = cls.unanswerable_questions ?? [];
  const wantsHuman = cls.wants_human === true || HUMAN_REQUEST_RE.test(cls.summary || "") || HUMAN_REQUEST_RE.test(cls.summary_en || "");

  // 1. Hard reply cap.
  if (state.reply_count >= REPLY_CAP && cls.verdict !== "fully_confirmed") {
    return {
      kind: "escalate_silent",
      reason: `Reply limit reached (${REPLY_CAP}) — please take over.`,
    };
  }

  // 2. Supplier explicitly wants a human.
  if (wantsHuman) {
    return { kind: "escalate_silent", reason: "Supplier asked to speak to a person." };
  }

  // 3. Supplier asks something we cannot answer.
  if (unanswerable.length > 0) {
    return {
      kind: "escalate_silent",
      reason: `Supplier asked: ${unanswerable.join(" | ")}`,
    };
  }

  switch (cls.verdict) {
    case "fully_confirmed": {
      // Even fully-confirmed replies are auto-rejected if shipping or lead
      // time blew past the hard caps.
      const t = evaluateThresholds(cls, state.order_subtotal_eur);
      if (t.verdict === "auto_reject") {
        return { kind: "auto_reject_failover", reason: t.reason };
      }
      if (t.verdict === "needs_user") {
        return { kind: "escalate_silent", reason: t.reason };
      }
      if (pending.length === 0 && issues.length === 0) {
        return { kind: "send_confirmation" };
      }
      if (pending.length > 0 && state.reply_count < REPLY_CAP) {
        return { kind: "send_checklist_followup", fields: pending };
      }
      return {
        kind: "escalate_silent",
        reason: pending.length
          ? `Still missing after follow-ups: ${pending.join(", ")}`
          : `Confirmed with issues: ${issues.join("; ")}`,
      };
    }

    case "confirmed_with_issue": {
      // Item unavailability → auto-reject + failover (was: silent escalate).
      const unavailable = issues.some((i) => UNAVAILABLE_RE.test(i)) ||
        UNAVAILABLE_RE.test(cls.summary || "") ||
        UNAVAILABLE_RE.test(cls.summary_en || "");
      if (unavailable) {
        return {
          kind: "auto_reject_failover",
          reason: `Item unavailable: ${cls.summary_en || cls.summary}`,
        };
      }

      // Hard threshold check (shipping / lead time).
      const t = evaluateThresholds(cls, state.order_subtotal_eur);
      if (t.verdict === "auto_reject") {
        return { kind: "auto_reject_failover", reason: t.reason };
      }
      if (t.verdict === "needs_user") {
        return { kind: "escalate_silent", reason: t.reason };
      }

      const leadOk = isAcceptableLeadTime(cls);
      const shipOk = isAcceptableShipping(cls, state.order_subtotal_eur);

      const benignIssues = issues.every((i) =>
        /(lead time|delivery|liefer|consegna|livraison|shipping|versand|expédition|spedizione|frais|surcharge)/i.test(i),
      );

      if (benignIssues && leadOk && shipOk && pending.length === 0) {
        return { kind: "send_confirmation", reason: "Auto-approved: lead time and shipping within thresholds." };
      }

      const reasons: string[] = [];
      if (!leadOk && cls.lead_time)
        reasons.push(`Lead time: ${cls.lead_time}${cls.lead_time_days ? ` (~${cls.lead_time_days} days)` : ""}`);
      if (!shipOk && (cls.checklist?.shipping_cost || cls.shipping_cost_eur != null))
        reasons.push(`Shipping: ${cls.checklist?.shipping_cost ?? `€${cls.shipping_cost_eur}`}`);
      if (issues.length && reasons.length === 0) reasons.push(issues.join("; "));
      return {
        kind: "escalate_silent",
        reason: `Needs human approval — ${reasons.join(" · ") || "supplier raised issues"}.`,
      };
    }

    case "declined": {
      // Supplier explicitly declined → auto-failover to next supplier.
      return {
        kind: "auto_reject_failover",
        reason: `Supplier declined: ${cls.summary_en || cls.summary}`,
      };
    }

    case "needs_clarification": {
      if (answerable.length > 0) {
        return { kind: "send_answer_questions", questions: answerable };
      }
      return {
        kind: "escalate_silent",
        reason: `Supplier asked a question we cannot auto-answer.`,
      };
    }

    case "unclear":
    default: {
      if (state.reply_count < REPLY_CAP) {
        return { kind: "send_clarification_request", pendingChecklist: pending };
      }
      return { kind: "escalate_silent", reason: `Reply still unclear after ${REPLY_CAP} exchanges.` };
    }
  }
}

/** Helper used by the webhook to merge classifier results into accumulated state. */
export function mergeAnsweredChecklist(
  previous: ChecklistField[],
  cls: ReplyClassification,
): ChecklistField[] {
  const set = new Set(previous);
  if (cls.checklist?.delivery_date) set.add("delivery_date");
  if (cls.checklist?.shipping_cost) set.add("shipping_cost");
  return Array.from(set);
}

/* ----- Outbound-timeout policy (unchanged behaviour) ----- */

import type { Negotiation } from "./types";

export type TimeoutAction =
  | { kind: "wait" }
  | { kind: "send_nudge" }
  | { kind: "escalate"; reason: string };

export function decideOnTimeout(neg: Negotiation, now: Date = new Date()): TimeoutAction {
  if (neg.status !== "sent" && neg.status !== "awaiting_reply") return { kind: "wait" };
  const deadline = new Date(neg.deadlineAt).getTime();
  const t = now.getTime();
  if (t < deadline) return { kind: "wait" };
  const hoursOver = (t - deadline) / 36e5;
  if (hoursOver < 24) return { kind: "send_nudge" };
  return { kind: "escalate", reason: `No reply from ${neg.supplierName} after 48h` };
}
