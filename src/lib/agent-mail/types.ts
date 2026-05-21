/**
 * Types for the supplier-negotiation agent.
 *
 * The agent's job is to take an approved order and try to actually get it
 * fulfilled by emailing suppliers. Each order spawns one or more
 * "negotiations" — one per supplier we contact. A negotiation has a small
 * state machine: sent → awaiting_reply → (replied | timed_out) → resolved.
 *
 * NOTE: This is the foundational structure. Persistence, real LLM
 * classification, scheduled timeout sweeps and multi-supplier fan-out are
 * all stubbed and meant to be filled in iteratively.
 */

export type NegotiationStatus =
  | "draft"          // composed but not yet sent
  | "sent"           // email sent, waiting on supplier
  | "awaiting_reply" // alias for sent after first poll
  | "replied"        // supplier responded, awaiting classification
  | "timed_out"      // no reply within SLA
  | "accepted"       // supplier confirmed order
  | "rejected"       // supplier declined / out of stock / too slow
  | "needs_user"     // we asked the user for an alternative
  | "aborted";       // we gave up on this supplier

/** Buckets we sort supplier replies into so we can decide what to do next. */
export type ReplyIntent =
  | "confirmed"          // "yes, shipping X for Y EUR"
  | "out_of_stock"
  | "partial_availability"
  | "price_change"
  | "lead_time_too_long"
  | "counter_offer"
  | "clarification_request"
  | "decline"
  | "unknown";

export type NegotiationEvent = {
  at: string; // ISO
  label: string;
  data?: Record<string, unknown>;
};

export type Negotiation = {
  id: string;                // NEG-####
  orderId: string;           // links back to Order.id
  supplierName: string;
  supplierEmail: string;
  inboxId: string;           // AgentMail inbox we sent from
  threadId?: string;         // AgentMail thread/message id once known
  subject: string;
  status: NegotiationStatus;
  /** Hard SLA. If now() > deadlineAt and still awaiting_reply → time out. */
  deadlineAt: string;        // ISO, default sentAt + 24h
  sentAt?: string;
  lastReplyAt?: string;
  lastReplyIntent?: ReplyIntent;
  lastReplyExcerpt?: string;
  history: NegotiationEvent[];
};

/** Default SLA before we escalate / fall back. */
export const REPLY_SLA_HOURS = 24;
