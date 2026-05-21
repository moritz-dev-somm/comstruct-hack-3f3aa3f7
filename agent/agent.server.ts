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
  verdict:
    | "fully_confirmed"
    | "confirmed_with_issue"
    | "declined"
    | "needs_clarification"
    | "unclear";
  summary: string;
  summary_en?: string;
  reply_language?: string | null;
  lead_time: string | null;
  /** Lead time normalised to days (best effort). */
  lead_time_days?: number | null;
  /** Shipping cost normalised to EUR (best effort). 0 means included/free. */
  shipping_cost_eur?: number | null;
  /** True if the supplier explicitly asks to talk to a human / sales rep. */
  wants_human?: boolean;
  issues: string[];
  checklist: ReplyChecklist;
  missing_checklist: ChecklistField[];
  answerable_questions?: string[];
  unanswerable_questions?: string[];
  unclear_points?: string[];
  /** Same as unclear_points but in ENGLISH — language-stable for cross-turn matching. */
  unclear_points_en?: string[];
  /** Subset of priorOpenQuestions the latest reply addresses (verbatim). */
  answered_open_questions?: string[];
  /** Subset of priorOpenQuestions still not addressed by the latest reply. */
  still_open_questions?: string[];
  suggested_outbound?: SuggestedOutbound;
  followup_count?: number;
  clarification_count?: number;
};

export type ThreadMessage = {
  role: "agent" | "supplier";
  /** ISO 639-1 best effort. */
  lang?: string;
  /** Plain text body (no HTML). */
  text: string;
  at?: string;
};

export type ThreadContext = {
  /** Open questions the agent has asked and is waiting on (ENGLISH, canonical). */
  priorOpenQuestions: string[];
  /** Checklist fields the supplier already answered in earlier turns. */
  priorAnsweredChecklist: ChecklistField[];
  /** Short bullets of facts the supplier already gave us. */
  priorAnswersSummary?: string[];
  /** Full raw transcript (oldest → newest), excluding the LATEST supplier reply. */
  transcript?: ThreadMessage[];
};

const CLASSIFY_SYSTEM = `You analyse a supplier's email reply to a purchase order sent by a procurement agent.
The reply may be in any language (commonly en, de, fr, it). Do NOT require English.

You receive THREE inputs:
  1. ORIGINAL PURCHASE ORDER (items, prices, project).
  2. THREAD CONTEXT — what the agent already asked AND what the supplier already answered in earlier replies. Treat this as authoritative ground truth.
  3. LATEST SUPPLIER REPLY — only the new message.

CRITICAL RULES FOR RECOGNISING ANSWERS:
- Read THREAD CONTEXT first. For every "OPEN QUESTION FROM AGENT" listed, judge ONLY whether the LATEST reply addresses it. Be generous: a short, partial, or implicit answer ("included", "next Tuesday", "yes", "no extra cost", "in stock", a single number, a single date) counts as an answer. Do NOT require the supplier to re-quote the question.
- For every "ALREADY ANSWERED IN PRIOR TURNS" item, treat it as resolved unless the LATEST reply explicitly contradicts or retracts it. Never re-flag it as missing or unclear.
- Combine prior turns with the latest reply when deciding the verdict — do not evaluate the latest reply in isolation.

Verdict (strict):
- "fully_confirmed": supplier has accepted ALL items at the proposed prices across the thread AND raises NO issues, delays, price changes, partial availability or open questions in the latest reply. delivery_date / shipping_cost MAY still be missing — that's the checklist's job.
- "confirmed_with_issue": supplier accepts but mentions ANY of: delay, longer lead time, partial availability, price change, substitution, shipping surcharge, stock issue.
- "declined": supplier refuses or cannot fulfil.
- "needs_clarification": supplier asks US a question.
- "unclear": use SPARINGLY — only when the latest reply is genuinely vague AND no prior turn resolved it. If the latest reply answers every OPEN QUESTION FROM AGENT, do NOT pick "unclear".
Be conservative between fully_confirmed and confirmed_with_issue.

Checklist (combine LATEST reply with THREAD CONTEXT — once answered, stays answered):
- delivery_date: normalised date or lead time. Null only if never stated across the whole thread.
- shipping_cost: "included" / "€0" / literal amount. Null only if never mentioned across the whole thread.
- order_confirmed: true if the supplier has accepted the order at any point in the thread.
missing_checklist: any of ["delivery_date","shipping_cost"] still null after combining.

Answered-questions tracking (REQUIRED):
- answered_open_questions: subset of "OPEN QUESTION FROM AGENT" strings the LATEST reply addresses (even partially, even implicitly). Copy each string VERBATIM from the OPEN QUESTION list (English). [] if none.
- still_open_questions: subset of "OPEN QUESTION FROM AGENT" strings the LATEST reply did NOT address. Copy verbatim. [] if all answered.
When in doubt, lean towards "answered". A vague answer is still an answer — it should NOT show up in still_open_questions, only in unclear_points.

Always provide:
- reply_language: ISO 639-1.
- summary: 1–2 sentences in the SUPPLIER'S language.
- summary_en: ALWAYS English, 1–2 sentences.

Questions FROM supplier TO us (split):
- answerable_questions: from PO data (delivery address, VAT ID, payment terms, line items, contact, project reference). Translated to English.
- unanswerable_questions: need a human.

Also:
- lead_time_days: integer best estimate. Null if not stated anywhere in the thread.
- shipping_cost_eur: numeric EUR (0 = included). Null if never mentioned.
- wants_human: true ONLY if supplier explicitly asks to talk to a person.

unclear_points: ONLY items the supplier left vague IN THE LATEST REPLY that are NOT already resolved by THREAD CONTEXT. Never list anything already in "ALREADY ANSWERED IN PRIOR TURNS" or just answered in "answered_open_questions". Max 4, prefer 1. Phrase each in the SUPPLIER'S language as a specific question referencing the exact item/SKU/phrase. [] if nothing is unclear.
unclear_points_en: the SAME list as unclear_points, but in ENGLISH. Same order, same length. Used for cross-turn matching. [] when unclear_points is [].

Finally pick suggested_outbound (policy may override):
- "confirm" when fully_confirmed AND missing_checklist empty AND no issues AND still_open_questions empty
- "checklist_followup" when fully_confirmed but missing_checklist has fields
- "answer_questions" when needs_clarification AND answerable_questions non-empty
- "request_clarification" when still_open_questions non-empty OR verdict is "unclear"
- "acknowledge_decline" when declined
- "acknowledge_issues" when confirmed_with_issue
- "escalate_silent" otherwise

Always reply by calling the classify_reply tool. No prose.`;

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

function parseNumberLike(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/[^0-9.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function questionMentionsField(text: string, field: ChecklistField): boolean {
  const q = text.toLowerCase();
  if (field === "delivery_date") {
    return /(delivery|deliver|arrival|arrive|date|lead time|liefer|zustell|ankunft|livraison|consegna)/i.test(q);
  }
  return /(shipping|freight|delivery cost|cost|included|versand|porto|frais|expédition|spedizione)/i.test(q);
}

function inferLocalReplySignals(reply: string, openQuestions: string[] = []): {
  checklist: ReplyChecklist;
  lead_time_days: number | null;
  shipping_cost_eur: number | null;
  answered_open_questions: string[];
  answered_fields: ChecklistField[];
} {
  const text = reply.trim();
  const lower = text.toLowerCase();
  const orderConfirmed = /\b(sounds good|looks good|confirmed?|confirm(?:ed)?|ok(?:ay)?|yes|accepted?|go ahead|passt|einverstanden|bestätigt|ja\b|d'accord|oui\b|va bene|confermiamo)\b/i.test(text);

  let deliveryDate: string | null = null;
  let leadTimeDays: number | null = null;
  const leadMatch = text.match(/\b(?:arriv\w*|deliver\w*|delivery|lead time|ships?|ship\w*)?\s*(?:within|inside|in|by)\s+(\d{1,3})\s*(business|working|calendar)?\s*(day|days|week|weeks)\b/i)
    ?? text.match(/\b(\d{1,3})\s*(business|working|calendar)?\s*(day|days|week|weeks)\b/i);
  if (leadMatch) {
    const n = Number(leadMatch[1]);
    const unit = leadMatch[3]?.toLowerCase() ?? "days";
    leadTimeDays = unit.startsWith("week") ? n * 7 : n;
    deliveryDate = leadMatch[0].trim();
  } else {
    const dateMatch = text.match(/\b(?:\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i);
    if (dateMatch && /(arriv|deliver|delivery|ship|liefer|livraison|consegna|date)/i.test(lower)) {
      deliveryDate = dateMatch[0].trim();
    }
  }

  let shippingCost: string | null = null;
  let shippingCostEur: number | null = null;
  if (/(no\s+(?:extra\s+)?(?:shipping|delivery|freight)\s+costs?|no\s+cost\s+for\s+shipping|shipping\s+(?:is\s+)?(?:free|included)|free\s+shipping|delivery\s+(?:is\s+)?included|included\s+shipping|versandkostenfrei|versand\s+(?:ist\s+)?(?:inklusive|inbegriffen)|port\s+inclus|frais\s+de\s+port\s+offerts|sans\s+frais\s+de\s+port|spedizione\s+(?:gratuita|inclusa))/i.test(text)) {
    shippingCost = "included / no shipping cost";
    shippingCostEur = 0;
  } else {
    const shipAmount = text.match(/(?:shipping|delivery|freight|versand|porto|frais\s+de\s+port|spedizione)[^\n.]{0,40}?(€|eur|chf)?\s*(\d+(?:[.,]\d{1,2})?)/i);
    if (shipAmount) {
      shippingCost = shipAmount[0].trim();
      shippingCostEur = parseNumberLike(shipAmount[2]);
    }
  }

  const answeredFields: ChecklistField[] = [];
  if (deliveryDate) answeredFields.push("delivery_date");
  if (shippingCost) answeredFields.push("shipping_cost");
  const answeredOpen = openQuestions.filter((q) =>
    answeredFields.some((field) => questionMentionsField(q, field)),
  );

  return {
    checklist: { order_confirmed: orderConfirmed, delivery_date: deliveryDate, shipping_cost: shippingCost },
    lead_time_days: leadTimeDays,
    shipping_cost_eur: shippingCostEur,
    answered_open_questions: answeredOpen,
    answered_fields: answeredFields,
  };
}

function heuristicClassification(reply: string, openQuestions: string[], priorAnswered: ChecklistField[]): ReplyClassification {
  const local = inferLocalReplySignals(reply, openQuestions);
  const missing = deriveMissing(local.checklist).filter((f) => !priorAnswered.includes(f));
  const answeredOpenSet = new Set(local.answered_open_questions);
  const answeredAnything = local.checklist.order_confirmed || local.answered_fields.length > 0 || local.answered_open_questions.length > 0;
  return {
    verdict: answeredAnything ? "fully_confirmed" : "unclear",
    summary: answeredAnything
      ? "Supplier reply was parsed locally because the AI classifier was unavailable."
      : "AI classifier unavailable and no checklist answer could be extracted locally.",
    summary_en: answeredAnything
      ? "Supplier reply was parsed locally because the AI classifier was unavailable."
      : "AI classifier unavailable and no checklist answer could be extracted locally.",
    reply_language: "en",
    lead_time: local.checklist.delivery_date,
    lead_time_days: local.lead_time_days,
    shipping_cost_eur: local.shipping_cost_eur,
    wants_human: false,
    issues: [],
    checklist: local.checklist,
    missing_checklist: missing,
    answerable_questions: [],
    unanswerable_questions: [],
    unclear_points: [],
    unclear_points_en: [],
    answered_open_questions: local.answered_open_questions,
    still_open_questions: openQuestions.filter((q) => !answeredOpenSet.has(q)),
    suggested_outbound: missing.length ? "checklist_followup" : "confirm",
  };
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
  thread?: ThreadContext;
}): Promise<ReplyClassification> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return fallbackClassification(
      "unclear",
      "LOVABLE_API_KEY missing — cannot classify reply.",
      ["AI classifier unavailable"],
    );
  }

  const openQs = args.thread?.priorOpenQuestions ?? [];
  const answeredChk = args.thread?.priorAnsweredChecklist ?? [];
  const priorAnswers = args.thread?.priorAnswersSummary ?? [];
  const transcript = args.thread?.transcript ?? [];

  const transcriptBlock = transcript.length
    ? `FULL CONVERSATION TRANSCRIPT (oldest → newest, excluding the LATEST reply below):\n` +
      transcript
        .map((m, i) => {
          const who = m.role === "agent" ? "AGENT" : "SUPPLIER";
          const lang = m.lang ? ` (${m.lang})` : "";
          return `--- [${i + 1}] ${who}${lang} ---\n${(m.text || "").slice(0, 3500)}`;
        })
        .join("\n") +
      `\n\n`
    : "";

  const threadBlock =
    `THREAD CONTEXT:\n` +
    `OPEN QUESTION FROM AGENT (the supplier is expected to address these — copy verbatim into answered_open_questions / still_open_questions):\n` +
    (openQs.length ? openQs.map((q, i) => `  ${i + 1}. ${q}`).join("\n") : "  (none)") +
    `\nALREADY ANSWERED IN PRIOR TURNS (do NOT re-flag these as missing or unclear):\n` +
    (answeredChk.length
      ? answeredChk.map((f) => `  - ${f}`).join("\n")
      : "  (none)") +
    (priorAnswers.length
      ? `\nFACTS ALREADY GIVEN BY SUPPLIER:\n` + priorAnswers.map((a) => `  - ${a}`).join("\n")
      : "") +
    `\n`;

  const tool = {
    type: "function" as const,
    function: {
      name: "classify_reply",
      description: "Return the classification of the supplier reply.",
      parameters: {
        type: "object",
        properties: {
          verdict: { type: "string", enum: ["fully_confirmed", "confirmed_with_issue", "declined", "needs_clarification", "unclear"] },
          summary: { type: "string" },
          summary_en: { type: "string" },
          reply_language: { type: "string" },
          lead_time: { type: ["string", "null"] },
          lead_time_days: { type: ["number", "null"] },
          shipping_cost_eur: { type: ["number", "null"] },
          wants_human: { type: "boolean" },
          issues: { type: "array", items: { type: "string" } },
          checklist: {
            type: "object",
            properties: {
              order_confirmed: { type: "boolean" },
              delivery_date: { type: ["string", "null"] },
              shipping_cost: { type: ["string", "null"] },
            },
            required: ["order_confirmed", "delivery_date", "shipping_cost"],
          },
          missing_checklist: { type: "array", items: { type: "string", enum: ["delivery_date", "shipping_cost"] } },
          answerable_questions: { type: "array", items: { type: "string" } },
          unanswerable_questions: { type: "array", items: { type: "string" } },
          unclear_points: { type: "array", items: { type: "string" } },
          unclear_points_en: { type: "array", items: { type: "string" } },
          answered_open_questions: { type: "array", items: { type: "string" } },
          still_open_questions: { type: "array", items: { type: "string" } },
          suggested_outbound: { type: "string" },
        },
        required: ["verdict", "summary", "summary_en", "checklist", "missing_checklist", "answered_open_questions", "still_open_questions"],
      },
    },
  };

  const body = {
    model: "openai/gpt-5-mini",
    messages: [
      { role: "system", content: CLASSIFY_SYSTEM },
      {
        role: "user",
        content:
          `ORIGINAL PURCHASE ORDER:\n${args.orderSummary}\n\n` +
          `${threadBlock}\n` +
          transcriptBlock +
          `LATEST SUPPLIER REPLY:\n${args.supplierReply}\n`,
      },
    ],
    tools: [tool],
    tool_choice: { type: "function" as const, function: { name: "classify_reply" } },
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
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
        };
      }>;
    };
    const msg = data.choices?.[0]?.message;
    const argsStr =
      msg?.tool_calls?.[0]?.function?.arguments ??
      msg?.content ??
      "{}";
    const parsed = JSON.parse(argsStr) as Partial<ReplyClassification> & { unclear_points_en?: string[] };
    const checklist = normalizeChecklist(parsed.checklist);
    // Anything the supplier already answered in prior turns stays answered, even
    // if the model's missing_checklist regresses it.
    const stillMissingByPriorAnswers = (f: ChecklistField) => !answeredChk.includes(f);
    const missing =
      Array.isArray(parsed.missing_checklist) && parsed.missing_checklist.length >= 0
        ? (parsed.missing_checklist.filter((f) =>
            f === "delivery_date" || f === "shipping_cost",
          ) as ChecklistField[])
        : deriveMissing(checklist);
    const reconciled = missing
      .filter((f) => checklist[f] == null)
      .filter(stillMissingByPriorAnswers);
    const summary = parsed.summary ?? "";
    const parseNum = (v: unknown): number | null => {
      if (v == null) return null;
      if (typeof v === "number" && Number.isFinite(v)) return v;
      const n = parseFloat(String(v).replace(/[^0-9.,-]/g, "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };

    // Sanitise answered/still open: must be a subset of priorOpenQuestions.
    const openSet = new Set(openQs);
    const answeredOpen = Array.isArray(parsed.answered_open_questions)
      ? parsed.answered_open_questions.map(String).filter((q) => openSet.has(q))
      : [];
    const answeredOpenSet = new Set(answeredOpen);
    const stillOpenModel = Array.isArray(parsed.still_open_questions)
      ? parsed.still_open_questions.map(String).filter((q) => openSet.has(q))
      : [];
    // Derive deterministically: anything not in answered_open is still open.
    const stillOpen = openQs.filter((q) => !answeredOpenSet.has(q));
    const finalStillOpen = stillOpen.length ? stillOpen : stillOpenModel;

    // Drop unclear_points that just repeat a question the supplier just answered.
    const unclearPointsRaw = Array.isArray(parsed.unclear_points)
      ? parsed.unclear_points.map(String).filter(Boolean)
      : [];
    const unclearPoints = unclearPointsRaw
      .filter((p) => !answeredOpenSet.has(p))
      .slice(0, 6);
    const unclearPointsEnRaw = Array.isArray(parsed.unclear_points_en)
      ? parsed.unclear_points_en.map(String).filter(Boolean)
      : [];
    // Align EN array to native array length when model returns mismatched arrays.
    const unclearPointsEn = unclearPointsEnRaw.length === unclearPoints.length
      ? unclearPointsEnRaw
      : unclearPoints.map((p, i) => unclearPointsEnRaw[i] ?? p);

    return {
      verdict: (parsed.verdict ?? "unclear") as ReplyClassification["verdict"],
      summary,
      summary_en: parsed.summary_en?.toString().trim() || summary,
      reply_language: parsed.reply_language?.toString().toLowerCase().slice(0, 5) || null,
      lead_time: parsed.lead_time ?? checklist.delivery_date ?? null,
      lead_time_days: parseNum((parsed as { lead_time_days?: unknown }).lead_time_days),
      shipping_cost_eur: parseNum((parsed as { shipping_cost_eur?: unknown }).shipping_cost_eur),
      wants_human: Boolean((parsed as { wants_human?: unknown }).wants_human),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      checklist,
      missing_checklist: reconciled,
      answerable_questions: Array.isArray(parsed.answerable_questions)
        ? parsed.answerable_questions.map(String).filter(Boolean)
        : [],
      unanswerable_questions: Array.isArray(parsed.unanswerable_questions)
        ? parsed.unanswerable_questions.map(String).filter(Boolean)
        : [],
      unclear_points: unclearPoints,
      unclear_points_en: unclearPointsEn,
      answered_open_questions: answeredOpen,
      still_open_questions: finalStillOpen,
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

/**
 * Translate a free-text message into BOTH English and the supplier's
 * native language so every outbound email is bilingual, matching the
 * style of the other templates the agent sends.
 *
 * Returns `{ en, native }`. If the supplier language is English, both
 * fields are the same. On any failure we fall back to the input on both
 * sides so the email still goes out (single-language) rather than silently
 * dropping.
 */
export async function translateForSupplier(
  text: string,
  supplierLang: "en" | "de" | "fr" | "it",
): Promise<{ en: string; native: string }> {
  const trimmed = text.trim();
  if (!trimmed) return { en: "", native: "" };
  if (supplierLang === "en") return { en: trimmed, native: trimmed };

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.warn("translateForSupplier: LOVABLE_API_KEY missing — sending untranslated.");
    return { en: trimmed, native: trimmed };
  }

  const LANG_NAME = { en: "English", de: "German", fr: "French", it: "Italian" } as const;
  const system =
    "You translate short business emails between a construction procurement team and their suppliers. " +
    "Detect the source language of the input. Return STRICT JSON: " +
    `{"en": "<English version>", "native": "<${LANG_NAME[supplierLang]} version>"}. ` +
    "Preserve meaning, tone, numbers, dates and product names exactly. Do NOT add greetings, signatures or commentary — translate only what is given. " +
    "If the input is already in the target language, return it unchanged in that field.";

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: trimmed },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error("translateForSupplier gateway error", res.status, await res.text());
      return { en: trimmed, native: trimmed };
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { en?: string; native?: string };
    return {
      en: (parsed.en || trimmed).trim(),
      native: (parsed.native || trimmed).trim(),
    };
  } catch (err) {
    console.error("translateForSupplier failed:", err);
    return { en: trimmed, native: trimmed };
  }
}

/**
 * Second-pass recall check. After the main classifier reports `stillOpen`
 * questions, we re-check each one against the FULL transcript with a stronger
 * model. The first pass over-flags; this pass catches answers that were
 * actually given (possibly in an earlier turn).
 */
export async function verifyAnsweredQuestions(args: {
  stillOpen: string[]; // ENGLISH canonical strings
  transcript: ThreadMessage[];
  latestReply: string;
}): Promise<{
  confirmedStillOpen: string[];
  newlyAnswered: Array<{ question: string; evidence: string }>;
}> {
  const apiKey = process.env.LOVABLE_API_KEY;
  const stillOpen = (args.stillOpen ?? []).map((s) => s.trim()).filter(Boolean);
  if (!apiKey || stillOpen.length === 0) {
    return { confirmedStillOpen: stillOpen, newlyAnswered: [] };
  }

  const transcriptText = (args.transcript ?? [])
    .map((m, i) => {
      const who = m.role === "agent" ? "AGENT" : "SUPPLIER";
      return `--- [${i + 1}] ${who} ---\n${(m.text || "").slice(0, 3500)}`;
    })
    .join("\n");

  const system =
    "You are a strict recall checker for a procurement agent. " +
    "Given a list of open questions the agent has asked, decide which ones the supplier HAS actually answered " +
    "somewhere in the conversation (including the latest reply). Be generous about implicit, partial, or short answers " +
    "('included', 'next Tuesday', 'yes', 'in stock', a single number or date). " +
    "An answer in ANY language counts. You MUST quote the exact supplier phrase as evidence — if you cannot quote " +
    "a phrase, the question is NOT answered. Return via the report_answers tool.";

  const tool = {
    type: "function" as const,
    function: {
      name: "report_answers",
      description: "Report which open questions are answered, with evidence quoted from the supplier.",
      parameters: {
        type: "object",
        properties: {
          answered: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string", description: "Exact verbatim copy of the open question (English)." },
                evidence: { type: "string", description: "Short phrase quoted from the supplier that answers it." },
                confidence: { type: "number", description: "0..1" },
              },
              required: ["question", "evidence", "confidence"],
            },
          },
        },
        required: ["answered"],
      },
    },
  };

  const userMsg =
    `OPEN QUESTIONS (English, copy verbatim into "question"):\n` +
    stillOpen.map((q, i) => `  ${i + 1}. ${q}`).join("\n") +
    `\n\nCONVERSATION TRANSCRIPT:\n${transcriptText}\n\n` +
    `LATEST SUPPLIER REPLY:\n${args.latestReply}\n`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        tools: [tool],
        tool_choice: { type: "function" as const, function: { name: "report_answers" } },
        reasoning: { effort: "low" },
      }),
    });
    if (!res.ok) {
      console.error("verifyAnsweredQuestions gateway error", res.status, await res.text());
      return { confirmedStillOpen: stillOpen, newlyAnswered: [] };
    }
    const data = (await res.json()) as {
      choices?: Array<{
        message?: { tool_calls?: Array<{ function?: { arguments?: string } }> };
      }>;
    };
    const argsStr = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}";
    const parsed = JSON.parse(argsStr) as {
      answered?: Array<{ question?: string; evidence?: string; confidence?: number }>;
    };
    const openSet = new Set(stillOpen);
    const newlyAnswered: Array<{ question: string; evidence: string }> = [];
    for (const a of parsed.answered ?? []) {
      const q = String(a.question ?? "").trim();
      const ev = String(a.evidence ?? "").trim();
      const conf = typeof a.confidence === "number" ? a.confidence : 0;
      if (q && ev && conf >= 0.6 && openSet.has(q)) {
        newlyAnswered.push({ question: q, evidence: ev.slice(0, 240) });
      }
    }
    const answeredSet = new Set(newlyAnswered.map((a) => a.question));
    return {
      confirmedStillOpen: stillOpen.filter((q) => !answeredSet.has(q)),
      newlyAnswered,
    };
  } catch (err) {
    console.error("verifyAnsweredQuestions failed:", err);
    return { confirmedStillOpen: stillOpen, newlyAnswered: [] };
  }
}
