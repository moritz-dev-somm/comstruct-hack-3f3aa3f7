import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  agentMail,
  ensureAgentInfra,
  adminClient,
  HARDCODED_SUPPLIER_EMAIL,
} from "@agent/agent.server";
import { composeOrderEmail, composeNudgeEmail } from "@agent/templates";
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

      // Group items by supplier (fallback for items with no supplier).
      const groups = new Map<string, typeof data.order.items>();
      for (const it of data.order.items) {
        const key = (it.supplier && it.supplier.trim()) || FALLBACK_SUPPLIER_NAME;
        const arr = groups.get(key) ?? [];
        arr.push(it);
        groups.set(key, arr);
      }

      const attachmentByName = new Map(
        data.attachments.map((a) => [a.supplierName, a]),
      );

      const results: Array<{ supplier: string; email: string; negotiationId?: string; error?: string }> = [];

      for (const [supplierName, items] of groups) {
        const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
        const contact = await resolveSupplierContact(sb, supplierName);
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
              inbox_id: infra.inboxId,
              thread_id: threadId,
              message_id: messageId,
              subject: email.subject,
              status: "awaiting_reply",
              order_snapshot: { ...data.order, items, subtotal, supplier: contact.name },
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
