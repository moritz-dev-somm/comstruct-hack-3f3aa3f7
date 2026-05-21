import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AgentMail } from "agentmail";
import { composeOrderEmail, composeNudgeEmail } from "./agent-mail/templates";
import type { Order } from "./orders";

/**
 * Server functions for the supplier-negotiation agent.
 *
 * Right now these are thin wrappers around the AgentMail SDK — enough to
 * (a) make sure we have an inbox to send from, (b) fire an order email at a
 * supplier, (c) list whatever has landed in the inbox so the UI can show it.
 *
 * Persistence of `Negotiation` records is intentionally NOT here yet. Once
 * we know which DB table to use, classification + decideOnReply should run
 * inside a server fn triggered by a polling/webhook route.
 */

function client(): AgentMail {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) throw new Error("AGENTMAIL_API_KEY is not configured");
  return new AgentMail({ apiKey });
}

/**
 * Make sure an inbox exists for the agent. `client_id` makes this idempotent
 * — calling it repeatedly with the same id returns the same inbox.
 *
 * `username` is a placeholder until procurement picks the real handle.
 */
export const ensureAgentInbox = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      username: z.string().min(1).max(64).optional(),
      clientId: z.string().min(1).max(128).default("comstruct-procurement-agent-v1"),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const inbox = await client().inboxes.create({
        username: data.username,
        clientId: data.clientId,
      });
      return {
        ok: true as const,
        inboxId: inbox.inboxId,
        address: (inbox as { inboxId: string; address?: string }).address ?? inbox.inboxId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("ensureAgentInbox failed:", message);
      return { ok: false as const, error: message };
    }
  });

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

/** Send the initial order email to a supplier. */
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
    // We accept a partial Order shape over the wire; cast for the templater.
    const email = composeOrderEmail(data.order as unknown as Order);
    try {
      const res = await client().inboxes.messages.send(data.inboxId, {
        to: data.supplierEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      return {
        ok: true as const,
        messageId: (res as { messageId?: string; id?: string }).messageId
          ?? (res as { id?: string }).id
          ?? null,
        sentAt: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("sendOrderEmail failed:", message);
      return { ok: false as const, error: message };
    }
  });

/** Send a "still waiting on you" nudge in the same thread. */
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
      await client().inboxes.messages.send(data.inboxId, {
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

/** List the latest messages in the agent inbox so the UI can display them. */
export const listInboxMessages = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      inboxId: z.string().min(1),
      limit: z.number().int().min(1).max(100).default(25),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const res = await client().inboxes.messages.list(data.inboxId, {
        limit: data.limit,
      });
      // Map to a serialization-safe DTO.
      const messages = (res.messages ?? []).map((m) => {
        const anyM = m as Record<string, unknown>;
        return {
          id: String(anyM.messageId ?? anyM.id ?? ""),
          threadId: anyM.threadId ? String(anyM.threadId) : null,
          from: String(anyM.from ?? ""),
          to: Array.isArray(anyM.to) ? anyM.to.map(String) : [],
          subject: String(anyM.subject ?? ""),
          preview:
            String(
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
