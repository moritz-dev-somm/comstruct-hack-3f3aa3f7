import type { ChecklistField, ReplyClassification } from "./agent.server";

/**
 * Inbound-policy layer. Given the LLM classification and the negotiation's
 * counter state, decide which outbound action the agent should take.
 *
 * The classifier provides a `suggested_outbound` hint, but this layer has the
 * final word — it enforces the safety rules:
 *  - never auto-confirm with unmet checklist or issues
 *  - never loop more than once on either follow-up or clarification
 */

export type AgentAction =
  | { kind: "send_confirmation" }
  | { kind: "send_checklist_followup"; fields: ChecklistField[] }
  | { kind: "send_answer_questions"; questions: string[] }
  | { kind: "send_clarification_request" }
  | { kind: "send_decline_ack" }
  | { kind: "send_issues_ack" }
  | { kind: "escalate_silent"; reason: string }
  | { kind: "no_op"; reason: string };

export type CounterState = {
  followup_count: number;
  clarification_count: number;
};

export function decideAction(
  cls: ReplyClassification,
  state: CounterState,
): AgentAction {
  const missing = cls.missing_checklist ?? [];
  const issues = cls.issues ?? [];
  const answerable = cls.answerable_questions ?? [];
  const unanswerable = cls.unanswerable_questions ?? [];

  switch (cls.verdict) {
    case "fully_confirmed": {
      if (missing.length === 0 && issues.length === 0) {
        return { kind: "send_confirmation" };
      }
      if (missing.length > 0 && state.followup_count < 1) {
        return { kind: "send_checklist_followup", fields: missing };
      }
      return {
        kind: "escalate_silent",
        reason:
          missing.length > 0
            ? `Supplier confirmed but still missing after follow-up: ${missing.join(", ")}`
            : `Supplier confirmed with issues: ${issues.join("; ")}`,
      };
    }

    case "confirmed_with_issue":
      return { kind: "send_issues_ack" };

    case "declined":
      return { kind: "send_decline_ack" };

    case "needs_clarification": {
      if (answerable.length > 0) {
        return { kind: "send_answer_questions", questions: answerable };
      }
      return {
        kind: "escalate_silent",
        reason: unanswerable.length
          ? `Supplier asked: ${unanswerable.join(" | ")}`
          : `Supplier asked a question we cannot auto-answer.`,
      };
    }

    case "unclear":
    default: {
      if (state.clarification_count < 1) {
        return { kind: "send_clarification_request" };
      }
      return { kind: "escalate_silent", reason: `Reply still unclear after one clarification request.` };
    }
  }
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
