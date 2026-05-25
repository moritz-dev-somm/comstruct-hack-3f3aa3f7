import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  agentMail,
  ensureAgentInfra,
  adminClient,
  translateForSupplier,
  HARDCODED_SUPPLIER_EMAIL,
} from "@agent/agent.server";
import {
  composeOrderEmail,
  composeNudgeEmail,
  composeConfirmationEmail,
  composeDeclineAckEmail,
  composeHumanReplyEmail,
  type SupplierLanguage,
} from "@agent/templates";
import type { Order } from "@/lib/orders";

const itemShape = z.object({
  productId: z.string().optional(),
  name: z.string(),
  qty: z.number(),
  price: z.number(),
  unit: z.string().optional(),
  category: z.string().optional(),
  supplier: z.string().nullable().optional(),
});

const orderShape = z.object({
  id: z.string(),
  project: z.string(),
  subtotal: z.number(),
  items: z.array(itemShape),
});

const attachmentShape = z.object({
  supplierName: z.string().min(1),
  filename: z.string().min(1),
  pdfBase64: z.string().min(1),
});

/** Idempotently ensure inbox + webhook exist. UI uses this for a status read. */
export const ensureAgentInbox = createServerFn({ method: "POST" })
  .inputValidator(z.object({ username: z.string().optional() }).optional().default({}))
  .handler(async () => {
    try {
      const r = await ensureAgentInfra();
      return { ok: true as const, inboxId: r.inboxId, address: r.inboxAddress };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("ensureAgentInbox failed:", message);
      return { ok: false as const, error: message };
    }
  });

const FALLBACK_SUPPLIER_NAME = "Generisch";

function normalizeSupplierName(name: string | null | undefined): string {
  return (name || FALLBACK_SUPPLIER_NAME).trim().toLowerCase();
}

type SupplierLang = "en" | "de" | "fr" | "it";

async function resolveSupplierContact(
  sb: ReturnType<typeof adminClient>,
  supplierName: string,
): Promise<{ name: string; email: string; phone: string; language: SupplierLang }> {
  const { data } = await sb
    .from("suppliers")
    .select("name,email,phone,language")
    .eq("name", supplierName)
    .maybeSingle();
  if (data) {
    const lang = (data as { language?: string }).language;
    const language: SupplierLang =
      lang === "de" || lang === "fr" || lang === "it" || lang === "en" ? lang : "en";
    return {
      name: (data as { name: string }).name,
      email: (data as { email: string }).email,
      phone: (data as { phone: string }).phone,
      language,
    };
  }
  return { name: supplierName, email: HARDCODED_SUPPLIER_EMAIL, phone: "", language: "en" };
}

/**
 * Auto-triggered when the foreman submits a cart. Splits the order by supplier
 * and sends one email per supplier with the matching purchase-order PDF
 * attached. Each per-supplier email creates its own negotiation row so the
 * webhook can match replies back.
 */
export const startNegotiationForOrder = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      order: orderShape,
      attachments: z.array(attachmentShape).default([]),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const infra = await ensureAgentInfra();
      const sb = adminClient();
      const am = agentMail();

      // Group items by their original supplier only. Case/spacing variants of
      // the same supplier collapse to one outbound PO/contact.
      const groups = new Map<string, { display: string; items: typeof data.order.items }>();
      for (const it of data.order.items) {
        const display = (it.supplier && it.supplier.trim()) || FALLBACK_SUPPLIER_NAME;
        const key = normalizeSupplierName(display);
        const group = groups.get(key) ?? { display, items: [] };
        group.items.push(it);
        groups.set(key, group);
      }

      const attachmentByName = new Map(
        data.attachments.map((a) => [a.supplierName, a]),
      );

      const results: Array<{ supplier: string; email: string; negotiationId?: string; error?: string }> = [];

      for (const { display: supplierName, items } of groups.values()) {
        const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
        const contact = await resolveSupplierContact(sb, supplierName);

        const { data: existing } = await sb
          .from("negotiations")
          .select("id, supplier_name, supplier_email")
          .eq("order_id", data.order.id)
          .ilike("supplier_name", contact.name)
          .limit(1)
          .maybeSingle();
        if (existing) {
          results.push({
            supplier: (existing as { supplier_name: string }).supplier_name,
            email: (existing as { supplier_email: string }).supplier_email,
            negotiationId: (existing as { id: string }).id,
          });
          continue;
        }

        const email = composeOrderEmail(data.order as unknown as Order, {
          supplierName: contact.name,
          items: items as Order["items"],
          subtotal,
          language: contact.language,
        });
        const attachment = attachmentByName.get(supplierName);
        try {
          const sendRes = await am.inboxes.messages.send(infra.inboxId, {
            to: contact.email,
            subject: email.subject,
            text: email.text,
            html: email.html,
            attachments: attachment
              ? [
                  {
                    filename: attachment.filename,
                    contentType: "application/pdf",
                    content: attachment.pdfBase64,
                  },
                ]
              : undefined,
          });
          const threadId = (sendRes as { threadId?: string }).threadId ?? null;
          const messageId = (sendRes as { messageId?: string }).messageId ?? null;

          const { data: inserted, error } = await sb
            .from("negotiations")
            .insert({
              order_id: data.order.id,
              project: data.order.project,
              supplier_name: contact.name,
              supplier_email: contact.email,
              supplier_language: contact.language,
              inbox_id: infra.inboxId,
              thread_id: threadId,
              message_id: messageId,
              subject: email.subject,
              status: "awaiting_reply",
              order_snapshot: { ...data.order, items, subtotal, supplier: contact.name, supplier_language: contact.language },
            })
            .select("id")
            .single();
          if (error) throw error;
          results.push({ supplier: contact.name, email: contact.email, negotiationId: inserted.id });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`startNegotiationForOrder: send to ${contact.name} failed:`, message);
          results.push({ supplier: contact.name, email: contact.email, error: message });
        }
      }

      const ok = results.every((r) => !r.error);
      return ok
        ? { ok: true as const, results }
        : { ok: false as const, error: results.find((r) => r.error)?.error ?? "send failed", results };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("startNegotiationForOrder failed:", message);
      return { ok: false as const, error: message };
    }
  });

/** Manual send (used by the existing agent page). Sends one email to one supplier. */
export const sendOrderEmail = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      inboxId: z.string().min(1),
      supplierEmail: z.string().email(),
      supplierName: z.string().min(1).max(200),
      order: orderShape,
    }),
  )
  .handler(async ({ data }) => {
    const email = composeOrderEmail(data.order as unknown as Order, {
      supplierName: data.supplierName,
      items: data.order.items as Order["items"],
      subtotal: data.order.subtotal,
    });
    try {
      const res = await agentMail().inboxes.messages.send(data.inboxId, {
        to: data.supplierEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      return {
        ok: true as const,
        messageId: (res as { messageId?: string }).messageId ?? null,
        sentAt: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("sendOrderEmail failed:", message);
      return { ok: false as const, error: message };
    }
  });

export const sendNudgeEmail = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      inboxId: z.string().min(1),
      supplierEmail: z.string().email(),
      order: orderShape,
    }),
  )
  .handler(async ({ data }) => {
    const email = composeNudgeEmail(data.order as unknown as Order);
    try {
      await agentMail().inboxes.messages.send(data.inboxId, {
        to: data.supplierEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      return { ok: true as const, sentAt: new Date().toISOString() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("sendNudgeEmail failed:", message);
      return { ok: false as const, error: message };
    }
  });

export const listInboxMessages = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      inboxId: z.string().min(1),
      limit: z.number().int().min(1).max(100).default(25),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const res = await agentMail().inboxes.messages.list(data.inboxId, {
        limit: data.limit,
      });
      const messages = ((res as { messages?: unknown[] }).messages ?? []).map((m: unknown) => {
        const anyM = m as Record<string, unknown>;
        return {
          id: String(anyM.messageId ?? anyM.id ?? ""),
          threadId: anyM.threadId ? String(anyM.threadId) : null,
          from: String(anyM.from ?? ""),
          to: Array.isArray(anyM.to) ? anyM.to.map(String) : [],
          subject: String(anyM.subject ?? ""),
          preview: String(
            (anyM.extractedText as string | undefined) ??
              (anyM.text as string | undefined) ??
              "",
          ).slice(0, 400),
          receivedAt: String(anyM.receivedAt ?? anyM.createdAt ?? ""),
          labels: Array.isArray(anyM.labels) ? anyM.labels.map(String) : [],
        };
      });
      return { ok: true as const, messages };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("listInboxMessages failed:", message);
      return { ok: false as const, error: message, messages: [] };
    }
  });

export const getInboxMessage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      inboxId: z.string().min(1),
      messageId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const res = await agentMail().inboxes.messages.get(data.inboxId, data.messageId);
      const anyM = res as unknown as Record<string, unknown>;
      return {
        ok: true as const,
        message: {
          id: String(anyM.messageId ?? anyM.id ?? data.messageId),
          threadId: anyM.threadId ? String(anyM.threadId) : null,
          from: String(anyM.from ?? ""),
          to: Array.isArray(anyM.to) ? anyM.to.map(String) : [],
          cc: Array.isArray(anyM.cc) ? anyM.cc.map(String) : [],
          subject: String(anyM.subject ?? ""),
          text: String((anyM.text as string | undefined) ?? (anyM.extractedText as string | undefined) ?? ""),
          html: (anyM.html as string | undefined) ?? null,
          receivedAt: String(anyM.receivedAt ?? anyM.createdAt ?? ""),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("getInboxMessage failed:", message);
      return { ok: false as const, error: message };
    }
  });

/**
 * List negotiations for an inbox with their latest classification.
 * Used to tag supplier replies in the conversation UI (approved / partial /
 * declined / question) without the user having to open each email.
 */
export const listNegotiationsForInbox = createServerFn({ method: "POST" })
  .inputValidator(z.object({ inboxId: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      const { data: rows, error } = await adminClient()
        .from("negotiations")
        .select(
          "id, order_id, project, thread_id, status, classification, reply_message_id, message_id, last_reply_at, sent_at, supplier_name, supplier_email, supplier_language, subject, needs_user_reason, inbox_id",
        )
        .eq("inbox_id", data.inboxId)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return { ok: true as const, negotiations: rows ?? [] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("listNegotiationsForInbox failed:", message);
      return { ok: false as const, error: message, negotiations: [] };
    }
  });

/* ============================================================
   Human-in-the-loop actions (used by "Needs your attention").
   ============================================================ */

const SUPPORTED_LANGS: SupplierLanguage[] = ["en", "de", "fr", "it"];
function pickLang(snapshot: { supplier_language?: string } | null, fallback: string | null | undefined): SupplierLanguage {
  const s = (snapshot?.supplier_language || "").toLowerCase().slice(0, 2) as SupplierLanguage;
  if (SUPPORTED_LANGS.includes(s)) return s;
  const f = (fallback || "").toLowerCase().slice(0, 2) as SupplierLanguage;
  if (SUPPORTED_LANGS.includes(f)) return f;
  return "en";
}

type NegotiationFull = {
  id: string;
  inbox_id: string | null;
  thread_id: string | null;
  message_id: string | null;
  reply_message_id: string | null;
  supplier_email: string | null;
  supplier_language: string | null;
  subject: string | null;
  order_snapshot: Order & { supplier_language?: string };
  classification: Record<string, unknown> | null;
};

async function loadNegotiation(id: string): Promise<NegotiationFull> {
  const sb = adminClient();
  const { data, error } = await sb
    .from("negotiations")
    .select("id, inbox_id, thread_id, message_id, reply_message_id, supplier_email, supplier_language, subject, order_snapshot, classification")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as NegotiationFull;
}

async function sendReplyOrFresh(
  neg: NegotiationFull,
  email: { subject: string; text: string; html: string },
): Promise<string | null> {
  const am = agentMail();
  const inboxId = neg.inbox_id;
  if (!inboxId) throw new Error("Negotiation has no inbox_id");
  const replyTo = neg.reply_message_id || neg.message_id;
  try {
    if (replyTo) {
      const sent = await am.inboxes.messages.reply(inboxId, replyTo, {
        text: email.text,
        html: email.html,
      });
      return (sent as { messageId?: string }).messageId ?? null;
    }
    const sent = await am.inboxes.messages.send(inboxId, {
      to: neg.supplier_email ?? "",
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return (sent as { messageId?: string }).messageId ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sendReplyOrFresh failed:", message);
    throw err;
  }
}

/** Human approves: send confirmation to supplier, mark confirmed. */
export const approveNegotiation = createServerFn({ method: "POST" })
  .inputValidator(z.object({ negotiationId: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      const neg = await loadNegotiation(data.negotiationId);
      const lang = pickLang(neg.order_snapshot, neg.supplier_language);
      const leadTime =
        (neg.classification as { lead_time?: string | null } | null)?.lead_time ?? null;
      const email = composeConfirmationEmail(neg.order_snapshot, { leadTime }, lang);
      const replyMessageId = await sendReplyOrFresh(neg, email);
      const sb = adminClient();
      await sb
        .from("negotiations")
        .update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          needs_user_reason: null,
          reply_message_id: replyMessageId,
          last_reply_at: new Date().toISOString(),
        })
        .eq("id", neg.id);
      return { ok: true as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("approveNegotiation failed:", message);
      return { ok: false as const, error: message };
    }
  });

/** Human declines + sources elsewhere: send decline-ack, mark declined. */
export const declineAndReplaceNegotiation = createServerFn({ method: "POST" })
  .inputValidator(z.object({ negotiationId: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      const neg = await loadNegotiation(data.negotiationId);
      const lang = pickLang(neg.order_snapshot, neg.supplier_language);
      const email = composeDeclineAckEmail(neg.order_snapshot, lang);
      const replyMessageId = await sendReplyOrFresh(neg, email);
      const sb = adminClient();
      await sb
        .from("negotiations")
        .update({
          status: "declined_replaced",
          needs_user_reason: null,
          reply_message_id: replyMessageId,
          last_reply_at: new Date().toISOString(),
        })
        .eq("id", neg.id);
      return { ok: true as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("declineAndReplaceNegotiation failed:", message);
      return { ok: false as const, error: message };
    }
  });

/** Human writes a free-text reply to the supplier. */
export const humanFollowupNegotiation = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      negotiationId: z.string().min(1),
      message: z.string().min(1).max(5000),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const neg = await loadNegotiation(data.negotiationId);
      const lang = pickLang(neg.order_snapshot, neg.supplier_language);
      const translated = await translateForSupplier(data.message, lang);
      const email = composeHumanReplyEmail(
        neg.order_snapshot,
        { messageEn: translated.en, messageNative: translated.native },
        lang,
      );
      const replyMessageId = await sendReplyOrFresh(neg, email);
      const sb = adminClient();
      await sb
        .from("negotiations")
        .update({
          status: "awaiting_reply",
          needs_user_reason: null,
          reply_message_id: replyMessageId,
          last_reply_at: new Date().toISOString(),
        })
        .eq("id", neg.id);
      return { ok: true as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("humanFollowupNegotiation failed:", message);
      return { ok: false as const, error: message };
    }
  });

