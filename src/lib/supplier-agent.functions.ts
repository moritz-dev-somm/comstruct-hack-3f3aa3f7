import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  agentMail,
  ensureAgentInfra,
  adminClient,
  HARDCODED_SUPPLIER_EMAIL,
  HARDCODED_SUPPLIER_NAME,
} from "@agent/agent.server";
import { composeOrderEmail, composeNudgeEmail } from "@agent/templates";
import type { Order } from "@/lib/orders";

const orderShape = z.object({
  id: z.string(),
  project: z.string(),
  subtotal: z.number(),
  items: z.array(
    z.object({
      productId: z.string().optional(),
      name: z.string(),
      qty: z.number(),
      price: z.number(),
      unit: z.string().optional(),
      category: z.string().optional(),
    }),
  ),
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

/**
 * Auto-triggered when the foreman submits a cart. Provisions infra, sends the
 * initial purchase-request email to the hardcoded supplier, and writes a
 * negotiation row so the webhook can match the reply back.
 */
export const startNegotiationForOrder = createServerFn({ method: "POST" })
  .inputValidator(z.object({ order: orderShape }))
  .handler(async ({ data }) => {
    try {
      const infra = await ensureAgentInfra();
      const email = composeOrderEmail(data.order as unknown as Order);
      const am = agentMail();
      const sendRes = await am.inboxes.messages.send(infra.inboxId, {
        to: HARDCODED_SUPPLIER_EMAIL,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      const threadId = (sendRes as { threadId?: string }).threadId ?? null;
      const messageId = (sendRes as { messageId?: string }).messageId ?? null;

      const sb = adminClient();
      const { data: inserted, error } = await sb
        .from("negotiations")
        .insert({
          order_id: data.order.id,
          project: data.order.project,
          supplier_name: HARDCODED_SUPPLIER_NAME,
          supplier_email: HARDCODED_SUPPLIER_EMAIL,
          inbox_id: infra.inboxId,
          thread_id: threadId,
          message_id: messageId,
          subject: email.subject,
          status: "awaiting_reply",
          order_snapshot: data.order,
        })
        .select("id")
        .single();
      if (error) throw error;

      return {
        ok: true as const,
        negotiationId: inserted.id,
        threadId,
        supplier: HARDCODED_SUPPLIER_EMAIL,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("startNegotiationForOrder failed:", message);
      return { ok: false as const, error: message };
    }
  });

/** Manual send (used by the existing agent page). */
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
    const email = composeOrderEmail(data.order as unknown as Order);
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
