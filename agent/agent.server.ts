/**
 * Server-only helpers for the supplier agent: Supabase admin client,
 * AgentMail singleton, Lovable AI reply classifier.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AgentMailClient } from "agentmail";

export function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service env missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function agentMail(): AgentMailClient {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) throw new Error("AGENTMAIL_API_KEY is not configured");
  return new AgentMailClient({ apiKey });
}

export const AGENT_INBOX_CLIENT_ID = "comstruct-procurement-agent-v1";
export const AGENT_WEBHOOK_CLIENT_ID = "comstruct-agent-webhook-v1";
export const HARDCODED_SUPPLIER_EMAIL = "nicholas.r.kessler@gmail.com";
export const HARDCODED_SUPPLIER_NAME = "Kessler Bauhandel (test)";

function publicBaseUrl(): string {
  // PUBLIC_APP_URL allows non-Lovable deploys to register the correct webhook.
  return process.env.PUBLIC_APP_URL ?? "https://comstruct-hack.lovable.app";
}

export function webhookUrl(): string {
  return `${publicBaseUrl()}/api/public/agentmail/webhook`;
}

/**
 * Idempotently ensure an inbox + a `message.received` webhook exist, and
 * persist the inbox id, webhook id and signing secret in `agent_settings`.
 */
export async function ensureAgentInfra(): Promise<{
  inboxId: string;
  inboxAddress: string;
  webhookId: string;
  webhookSecret: string;
}> {
  const sb = adminClient();
  const am = agentMail();

  // 1. Inbox (clientId makes it idempotent)
  const inbox = await am.inboxes.create({
    username: "comstruct-procurement",
    clientId: AGENT_INBOX_CLIENT_ID,
  });
  const inboxId = inbox.inboxId;
  const inboxAddress = (inbox as { address?: string }).address ?? inboxId;

  // 2. Webhook (clientId makes it idempotent)
  const url = webhookUrl();
  let webhookId = "";
  let webhookSecret = "";
  try {
    const created = await am.webhooks.create({
      url,
      eventTypes: ["message.received"],
      inboxIds: [inboxId],
      clientId: AGENT_WEBHOOK_CLIENT_ID,
    });
    webhookId = created.webhookId;
    webhookSecret = created.secret;
  } catch (err) {
    // If already exists, find it and read the secret.
    const list = await am.webhooks.list();
    const items =
      (list as { webhooks?: Array<{ webhookId: string; clientId?: string; secret: string; url: string }> }).webhooks ??
      [];
    const found = items.find((w) => w.clientId === AGENT_WEBHOOK_CLIENT_ID || w.url === url);
    if (!found) throw err;
    webhookId = found.webhookId;
    webhookSecret = found.secret;
  }

  await sb.from("agent_settings").upsert({
    id: "singleton",
    inbox_id: inboxId,
    inbox_address: inboxAddress,
    webhook_id: webhookId,
    webhook_secret: webhookSecret,
    webhook_url: url,
  });

  return { inboxId, inboxAddress, webhookId, webhookSecret };
}

export async function getAgentSettings(): Promise<{
  inbox_id: string | null;
  webhook_secret: string | null;
} | null> {
  const sb = adminClient();
  const { data } = await sb
    .from("agent_settings")
    .select("inbox_id, webhook_secret")
    .eq("id", "singleton")
    .maybeSingle();
  return data ?? null;
}

/* ----- Reply classification via Lovable AI ----- */

export type ChecklistField = "delivery_date" | "shipping_cost";

export type ReplyChecklist = {
  /** True if the supplier accepts the order (even if details are missing). */
  order_confirmed: boolean;
  /** Normalized delivery date / lead time string if present. */
  delivery_date: string | null;
  /** Shipping cost as the supplier expressed it (e.g. "€0", "included", "CHF 45"). */
  shipping_cost: string | null;
};

export type SuggestedOutbound =
  | "confirm"
  | "checklist_followup"
  | "answer_questions"
  | "request_clarification"
  | "acknowledge_decline"
  | "acknowledge_issues"
  | "escalate_silent";

export type ReplyClassification = {
  /** Overall verdict on the reply. */
  verdict:
    | "fully_confirmed"
    | "confirmed_with_issue"
    | "declined"
    | "needs_clarification"
    | "unclear";
  /** Short summary in the supplier's language (mirrors summary_en for legacy). */
  summary: string;
  /** Always-English 1–2 sentence summary, used in procurement UI. */
  summary_en?: string;
  /** ISO 639-1 of the supplier reply (de, fr, it, en, …). null if unknown. */
  reply_language?: string | null;
  /** Extracted delivery time / lead time string if mentioned. */
  lead_time: string | null;
  /** Concrete list of issues that require user attention. */
  issues: string[];
  /** Structured extraction of the fields we asked for in the initial PO. */
  checklist: ReplyChecklist;
  /** Fields from the initial PO request that the supplier has not answered yet. */
  missing_checklist: ChecklistField[];
  /** Questions we can confidently answer from order / company context. */
  answerable_questions?: string[];
  /** Questions that require a human to answer. */
  unanswerable_questions?: string[];
  /** Specific vague points / unanswered items we should re-ask the supplier about. */
  unclear_points?: string[];
  /** Hint from the classifier as to which outbound action fits. Policy may override. */
  suggested_outbound?: SuggestedOutbound;
  /** Number of automated targeted follow-ups already sent for the missing fields. */
  followup_count?: number;
  /** Number of clarification requests already sent for unclear replies. */
  clarification_count?: number;
};

const CLASSIFY_SYSTEM = `You analyse a supplier's email reply to a purchase order sent by a procurement agent.
The reply may be in any language (commonly en, de, fr, it). Do NOT require English.

Decide the verdict strictly:
- "fully_confirmed": supplier accepts ALL items at the proposed prices AND raises NO issues, NO delays, NO price changes, NO partial availability, NO questions. The delivery date or shipping cost MAY be missing — that is handled separately via the checklist.
- "confirmed_with_issue": supplier accepts but mentions ANY of: delay, longer lead time, partial availability, price change, substitution, shipping surcharge that exceeds expectations, stock issue, anything that procurement should review.
- "declined": supplier refuses or cannot fulfil.
- "needs_clarification": supplier asks us a question or requests info from us (e.g. asks for our VAT ID, delivery address, payment terms, line-item details).
- "unclear": you cannot tell.
Be conservative: if in doubt between fully_confirmed and confirmed_with_issue, choose confirmed_with_issue.

Extract the checklist:
- delivery_date: earliest committed delivery date or lead time, normalised to "YYYY-MM-DD" or e.g. "2 weeks". Null if not stated.
- shipping_cost: "included", "€0", or the literal amount (e.g. "CHF 45"). Null if not mentioned.
- order_confirmed: true if the supplier accepts the order in some form, false otherwise.
List any of ["delivery_date","shipping_cost"] still null in missing_checklist.

Always provide:
- reply_language: ISO 639-1 of the supplier reply (e.g. "de", "fr", "it", "en"). Best guess.
- summary: 1–2 sentences in the SUPPLIER'S language (or English if unknown).
- summary_en: ALWAYS English, 1–2 sentences, for the procurement UI.

If the supplier asks us questions, split them:
- answerable_questions: questions we can answer from purchase-order data (delivery address, VAT ID, payment terms, line items, contact, project reference). Use the supplier's own wording, translated to English.
- unanswerable_questions: questions that need a human (custom discounts, off-PO terms, anything we don't know).

If the verdict is "unclear" OR the supplier replied but left specific points vague or unanswered, populate unclear_points with a SHORT bullet list (max 6) of the EXACT concrete items we still need from the supplier. Phrase each bullet in the SUPPLIER'S language as a direct, specific question — e.g. "Confirm whether item X is in stock now or backordered", "Confirm unit price for SKU Y after the discount you mentioned", "Confirm earliest delivery date for the steel beams (you mentioned 'soon')". Never write generic prose. If nothing is unclear, return [].

Finally pick suggested_outbound (the policy layer may still override):
- "confirm" when fully_confirmed AND missing_checklist is empty AND no issues
- "checklist_followup" when fully_confirmed but missing_checklist has fields
- "answer_questions" when needs_clarification AND answerable_questions is non-empty
- "request_clarification" when verdict is "unclear"
- "acknowledge_decline" when declined
- "acknowledge_issues" when confirmed_with_issue
- "escalate_silent" otherwise

Always reply with strict JSON matching the schema. No prose.`;

const EMPTY_CHECKLIST: ReplyChecklist = {
  order_confirmed: false,
  delivery_date: null,
  shipping_cost: null,
};

function normalizeChecklist(input: Partial<ReplyChecklist> | undefined): ReplyChecklist {
  return {
    order_confirmed: Boolean(input?.order_confirmed),
    delivery_date: input?.delivery_date?.toString().trim() || null,
    shipping_cost: input?.shipping_cost?.toString().trim() || null,
  };
}

function deriveMissing(checklist: ReplyChecklist): ChecklistField[] {
  const missing: ChecklistField[] = [];
  if (!checklist.delivery_date) missing.push("delivery_date");
  if (!checklist.shipping_cost) missing.push("shipping_cost");
  return missing;
}

function fallbackClassification(
  verdict: ReplyClassification["verdict"],
  summary: string,
  issues: string[] = [],
): ReplyClassification {
  return {
    verdict,
    summary,
    lead_time: null,
    issues,
    checklist: { ...EMPTY_CHECKLIST },
    missing_checklist: ["delivery_date", "shipping_cost"],
  };
}

export async function classifyReply(args: {
  orderSummary: string;
  supplierReply: string;
}): Promise<ReplyClassification> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return fallbackClassification(
      "unclear",
      "LOVABLE_API_KEY missing — cannot classify reply.",
      ["AI classifier unavailable"],
    );
  }
  const body = {
    model: "openai/gpt-5-mini",
    messages: [
      { role: "system", content: CLASSIFY_SYSTEM },
      {
        role: "user",
        content:
          `ORIGINAL PURCHASE ORDER:\n${args.orderSummary}\n\n` +
          `SUPPLIER REPLY:\n${args.supplierReply}\n\n` +
          `Return JSON with keys: verdict, summary, summary_en, reply_language, lead_time, issues, checklist, missing_checklist, answerable_questions, unanswerable_questions, unclear_points, suggested_outbound.`,
      },
    ],
    response_format: { type: "json_object" },
  };
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("classifyReply gateway error", res.status, t);
      return fallbackClassification("unclear", "AI gateway error", [t.slice(0, 200)]);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as Partial<ReplyClassification>;
    const checklist = normalizeChecklist(parsed.checklist);
    const missing =
      Array.isArray(parsed.missing_checklist) && parsed.missing_checklist.length >= 0
        ? (parsed.missing_checklist.filter((f) =>
            f === "delivery_date" || f === "shipping_cost",
          ) as ChecklistField[])
        : deriveMissing(checklist);
    const reconciled = missing.filter((f) => checklist[f] == null);
    const summary = parsed.summary ?? "";
    return {
      verdict: (parsed.verdict ?? "unclear") as ReplyClassification["verdict"],
      summary,
      summary_en: parsed.summary_en?.toString().trim() || summary,
      reply_language: parsed.reply_language?.toString().toLowerCase().slice(0, 5) || null,
      lead_time: parsed.lead_time ?? checklist.delivery_date ?? null,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      checklist,
      missing_checklist: reconciled,
      answerable_questions: Array.isArray(parsed.answerable_questions)
        ? parsed.answerable_questions.map(String).filter(Boolean)
        : [],
      unanswerable_questions: Array.isArray(parsed.unanswerable_questions)
        ? parsed.unanswerable_questions.map(String).filter(Boolean)
        : [],
      suggested_outbound: parsed.suggested_outbound as SuggestedOutbound | undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("classifyReply failed", message);
    return fallbackClassification("unclear", "Classifier exception", [message]);
  }
}

/**
 * Verify a Svix-style webhook signature manually (no svix dep — keeps Worker bundle small).
 * Headers needed: svix-id, svix-timestamp, svix-signature ("v1,<base64> v1,<base64>...").
 * Tolerance: ±5 minutes.
 */
export async function verifySvixSignature(args: {
  secret: string; // "whsec_<base64>"
  id: string;
  timestamp: string;
  signature: string;
  body: string;
}): Promise<boolean> {
  const { secret, id, timestamp, signature, body } = args;
  if (!id || !timestamp || !signature) return false;
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 5 * 60) return false;

  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let keyBytes: ArrayBuffer;
  try {
    const bin = atob(raw);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    keyBytes = arr.buffer;
  } catch {
    keyBytes = new TextEncoder().encode(raw).buffer as ArrayBuffer;
  }
  const toSign = `${id}.${timestamp}.${body}`;
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  // signature header: space-separated "v1,<base64>"
  const provided = signature
    .split(" ")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("v1,"))
    .map((s) => s.slice(3));
  return provided.some((p) => timingSafeEqualStr(p, expected));
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
