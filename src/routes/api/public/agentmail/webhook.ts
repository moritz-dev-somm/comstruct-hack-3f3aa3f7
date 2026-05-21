import { createFileRoute } from "@tanstack/react-router";
import {
  adminClient,
  agentMail,
  classifyReply,
  getAgentSettings,
  verifySvixSignature,
} from "../../../../../agent/agent.server";
import { composeConfirmationEmail, composeFollowupEmail } from "../../../../../agent/templates";
import type { ReplyClassification } from "../../../../../agent/agent.server";
import type { Order } from "@/lib/orders";

/**
 * AgentMail webhook receiver.
 * - Verifies Svix signature against the stored webhook secret.
 * - On `message.received`, finds the matching negotiation by thread_id,
 *   classifies the reply with Lovable AI, then either auto-confirms
 *   (clean accept) or marks the negotiation as needing user review.
 */
export const Route = createFileRoute("/api/public/agentmail/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const svixId = request.headers.get("svix-id") ?? "";
        const svixTs = request.headers.get("svix-timestamp") ?? "";
        const svixSig = request.headers.get("svix-signature") ?? "";

        const settings = await getAgentSettings();
        if (!settings?.webhook_secret) {
          console.error("webhook: no secret configured");
          return new Response("Not configured", { status: 503 });
        }
        const ok = await verifySvixSignature({
          secret: settings.webhook_secret,
          id: svixId,
          timestamp: svixTs,
          signature: svixSig,
          body,
        });
        if (!ok) {
          console.warn("webhook: invalid signature");
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const eventType = String(payload.event_type ?? "");
        if (!eventType.startsWith("message.received")) {
          return new Response("ok", { status: 200 });
        }

        const message = payload.message as Record<string, unknown> | undefined;
        const thread = payload.thread as Record<string, unknown> | undefined;
        if (!message) return new Response("no message", { status: 200 });

        const threadId = String(message.threadId ?? thread?.threadId ?? "");
        const inboxId = String(message.inboxId ?? "");
        const from = String(message.from ?? "");
        const replyText = String(
          (message.extractedText as string | undefined) ??
            (message.text as string | undefined) ??
            (message.preview as string | undefined) ??
            "",
        );
        const messageId = String(message.messageId ?? "");

        const sb = adminClient();
        // Find the negotiation this reply belongs to.
        const { data: neg } = await sb
          .from("negotiations")
          .select("*")
          .eq("thread_id", threadId)
          .maybeSingle();

        if (!neg) {
          console.warn("webhook: no negotiation for thread", threadId);
          return new Response("ok", { status: 200 });
        }

        // Don't react to our own outbound (just in case).
        if (from.toLowerCase().includes(String(settings.inbox_id ?? "").toLowerCase())) {
          return new Response("self", { status: 200 });
        }

        const order = neg.order_snapshot as Order;
        const orderSummary =
          `Order ${order.id} for project "${order.project}". Items:\n` +
          order.items
            .map((i) => `- ${i.qty} × ${i.name} @ ${i.price} EUR`)
            .join("\n") +
          `\nSubtotal: ${order.subtotal} EUR`;

        const cls = await classifyReply({ orderSummary, supplierReply: replyText });

        // Carry forward how many targeted follow-ups we have already sent for
        // missing PO checklist fields, so we never loop forever.
        const prevCls = (neg.classification ?? {}) as Partial<ReplyClassification>;
        const prevFollowups = Number(prevCls.followup_count ?? 0);

        // Pick supplier language from the original order snapshot (default en).
        const supplierLang = ((neg.order_snapshot as { supplier_language?: string })?.supplier_language ??
          "en") as "en" | "de" | "fr" | "it";

        let nextStatus: string;
        let needsUserReason: string | null = null;
        let replyMessageId: string | null = null;
        let followupCount = prevFollowups;

        const missing = cls.missing_checklist ?? [];
        const shouldFollowUp =
          cls.verdict === "fully_confirmed" && missing.length > 0 && prevFollowups < 1;

        if (cls.verdict === "fully_confirmed" && missing.length === 0) {
          // Clean confirm, all requested fields present → auto-confirm.
          try {
            const conf = composeConfirmationEmail(order, { leadTime: cls.lead_time });
            const sent = await agentMail().inboxes.messages.reply(inboxId, messageId, {
              text: conf.text,
              html: conf.html,
            });
            replyMessageId = (sent as { messageId?: string }).messageId ?? null;
          } catch (err) {
            console.error("webhook: failed to send confirmation", err);
          }
          nextStatus = "confirmed";
        } else if (shouldFollowUp) {
          // Order accepted but one of the PO checklist fields is missing →
          // send a single targeted follow-up, stay in awaiting state.
          try {
            const followup = composeFollowupEmail(order, missing, supplierLang);
            const sent = await agentMail().inboxes.messages.reply(inboxId, messageId, {
              text: followup.text,
              html: followup.html,
            });
            replyMessageId = (sent as { messageId?: string }).messageId ?? null;
            followupCount = prevFollowups + 1;
          } catch (err) {
            console.error("webhook: failed to send targeted follow-up", err);
          }
          nextStatus = "awaiting_reply";
        } else if (cls.verdict === "fully_confirmed" && missing.length > 0) {
          // Already followed up once and supplier still didn't answer → escalate.
          nextStatus = "needs_user";
          needsUserReason = `Supplier confirmed but still missing: ${missing.join(", ")}`;
        } else {
          nextStatus = "needs_user";
          needsUserReason =
            cls.verdict === "declined"
              ? `Supplier declined: ${cls.summary}`
              : cls.verdict === "needs_clarification"
                ? `Supplier asked a question: ${cls.summary}`
                : cls.verdict === "confirmed_with_issue"
                  ? `Issues: ${cls.issues.join("; ") || cls.summary}`
                  : `Unclear reply: ${cls.summary}`;
        }

        await sb
          .from("negotiations")
          .update({
            status: nextStatus,
            classification: { ...cls, followup_count: followupCount },
            reply_excerpt: replyText.slice(0, 1000),
            reply_message_id: replyMessageId,
            needs_user_reason: needsUserReason,
            last_reply_at: new Date().toISOString(),
            confirmed_at: nextStatus === "confirmed" ? new Date().toISOString() : null,
          })
          .eq("id", neg.id);

        return new Response("ok", { status: 200 });
      },
    },
  },
});
