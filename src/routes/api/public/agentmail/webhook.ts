import { createFileRoute } from "@tanstack/react-router";
import {
  adminClient,
  agentMail,
  classifyReply,
  getAgentSettings,
  verifyAnsweredQuestions,
  verifySvixSignature,
} from "../../../../../agent/agent.server";
import type {
  ReplyClassification,
  ThreadContext,
  ThreadMessage,
} from "../../../../../agent/agent.server";
import {
  composeAnswerQuestionsEmail,
  composeClarificationRequestEmail,
  composeConfirmationEmail,
  composeFollowupEmail,
  buildAnswersFromOrder,
  type SupplierLanguage,
} from "../../../../../agent/templates";
import {
  decideAction,
  mergeAnsweredChecklist,
  type CounterState,
} from "../../../../../agent/conditions";
import type { ChecklistField } from "../../../../../agent/agent.server";
import {
  extractOrderIdFromSubject,
  parseEmailAddress,
  registrableDomain,
  senderMatchesNegotiation,
} from "../../../../../agent/email-match";
import type { Order } from "@/lib/orders";

// English labels for the two checklist questions — used as canonical strings
// in the classifier's "OPEN QUESTION FROM AGENT" list.
const CHECKLIST_LABEL_EN: Record<ChecklistField, string> = {
  delivery_date: "Earliest delivery date you can commit to",
  shipping_cost: "Shipping costs",
};

const MAX_TRANSCRIPT_TURNS = 10;

type NegotiationClassification = Partial<ReplyClassification> & {
  answered_checklist?: ChecklistField[];
  reply_count?: number;
  /** ENGLISH canonical strings — language-stable identifiers for open questions. */
  open_questions?: string[];
  prior_answers?: string[];
};

type NegotiationRow = {
  id: string;
  order_id: string;
  thread_id: string | null;
  inbox_id: string | null;
  supplier_email: string | null;
  supplier_name: string | null;
  status: string | null;
  classification: Partial<ReplyClassification> | null;
  order_snapshot: Order & { supplier_language?: string };
  followup_count: number | null;
  clarification_count: number | null;
  last_processed_message_id: string | null;
  thread_messages: ThreadMessage[] | null;
  sent_at: string;
};

const SUPPORTED_LANGS: SupplierLanguage[] = ["en", "de", "fr", "it"];
function pickLang(
  reply: string | null | undefined,
  snapshot: string | null | undefined,
): SupplierLanguage {
  const c = (reply || "").toLowerCase().slice(0, 2) as SupplierLanguage;
  if (SUPPORTED_LANGS.includes(c)) return c;
  const s = (snapshot || "").toLowerCase().slice(0, 2) as SupplierLanguage;
  if (SUPPORTED_LANGS.includes(s)) return s;
  return "en";
}

export const Route = createFileRoute("/api/public/agentmail/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const settings = await getAgentSettings();
        if (!settings?.webhook_secret) return new Response("Not configured", { status: 503 });

        const ok = await verifySvixSignature({
          secret: settings.webhook_secret,
          id: request.headers.get("svix-id") ?? "",
          timestamp: request.headers.get("svix-timestamp") ?? "",
          signature: request.headers.get("svix-signature") ?? "",
          body,
        });
        if (!ok) return new Response("Invalid signature", { status: 401 });

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        if (!String(payload.event_type ?? "").startsWith("message.received")) {
          return new Response("ok", { status: 200 });
        }

        const message = payload.message as Record<string, unknown> | undefined;
        const threadPayload = payload.thread as Record<string, unknown> | undefined;
        if (!message) return new Response("no message", { status: 200 });

        const threadId = String(
          (message.thread_id as string | undefined) ??
            (message.threadId as string | undefined) ??
            (threadPayload?.thread_id as string | undefined) ??
            (threadPayload?.threadId as string | undefined) ??
            "",
        );
        const inboxId = String(
          (message.inbox_id as string | undefined) ?? (message.inboxId as string | undefined) ?? "",
        );
        const from = String(message.from ?? "");
        const subject = String(message.subject ?? "");
        const replyText = String(
          (message.extracted_text as string | undefined) ??
            (message.extractedText as string | undefined) ??
            (message.text as string | undefined) ??
            (message.preview as string | undefined) ??
            "",
        );
        const messageId = String(
          (message.message_id as string | undefined) ??
            (message.messageId as string | undefined) ??
            "",
        );

        const sb = adminClient();

        // Ignore loops on our own outbound.
        if (
          settings.inbox_id &&
          from.toLowerCase().includes(String(settings.inbox_id).toLowerCase())
        ) {
          return new Response("self", { status: 200 });
        }

        /* -------- 1. Resolve negotiation: thread match → fallback -------- */
        let neg: NegotiationRow | null = null;
        let matchedByFallback = false;

        if (threadId) {
          const { data } = await sb
            .from("negotiations")
            .select("*")
            .eq("thread_id", threadId)
            .maybeSingle();
          neg = (data as NegotiationRow | null) ?? null;
        }

        if (!neg) {
          // Fallback: subject contains [ORD-xxxx] AND sender domain matches an open negotiation
          const orderId = extractOrderIdFromSubject(subject);
          const { email: fromEmail } = parseEmailAddress(from);
          const fromDomain = registrableDomain(fromEmail);
          if (orderId && fromDomain) {
            const { data } = await sb
              .from("negotiations")
              .select("*")
              .eq("order_id", orderId)
              .in("status", ["sent", "awaiting_reply"])
              .order("sent_at", { ascending: false });
            const candidates = (data as NegotiationRow[] | null) ?? [];
            const matches = candidates.filter((n) =>
              senderMatchesNegotiation(from, {
                supplier_email: n.supplier_email,
                status: n.status,
              }),
            );
            if (matches.length === 1) {
              neg = matches[0];
              matchedByFallback = true;
            } else if (matches.length > 1) {
              // Ambiguous — escalate the newest one.
              neg = matches[0];
              matchedByFallback = true;
              await sb
                .from("negotiations")
                .update({
                  status: "needs_user",
                  needs_user_reason: `Ambiguous inbound from ${fromEmail}: matched ${matches.length} open negotiations.`,
                  last_inbound_from: fromEmail,
                  last_reply_at: new Date().toISOString(),
                })
                .eq("id", neg.id);
              return new Response("ambiguous", { status: 200 });
            }
          }
        }

        if (!neg) {
          console.warn("webhook: unmatched inbound", { threadId, from, subject });
          return new Response("ok", { status: 200 });
        }

        /* -------- 2. Idempotency -------- */
        if (messageId && neg.last_processed_message_id === messageId) {
          return new Response("dup", { status: 200 });
        }

        /* -------- 3. Sender authenticity -------- */
        // Look up supplier row for extra domain hints.
        let supplierRow: { email: string | null } | null = null;
        if (neg.supplier_name) {
          const { data } = await sb
            .from("suppliers")
            .select("email")
            .eq("name", neg.supplier_name)
            .maybeSingle();
          supplierRow = (data as { email: string | null } | null) ?? null;
        }

        const senderOk = senderMatchesNegotiation(
          from,
          { supplier_email: neg.supplier_email, status: neg.status },
          supplierRow,
        );
        if (!senderOk) {
          const { email: fromEmail } = parseEmailAddress(from);
          await sb
            .from("negotiations")
            .update({
              security_reject_reason: `Inbound from ${fromEmail} did not match supplier ${neg.supplier_email}.`,
              last_inbound_from: fromEmail,
              last_processed_message_id: messageId || null,
            })
            .eq("id", neg.id);
          console.warn("webhook: sender rejected", { negotiationId: neg.id, fromEmail });
          return new Response("ok", { status: 200 });
        }

        /* -------- 4. Classify -------- */
        const order = neg.order_snapshot as Order;
        const orderSummary =
          `Order ${order.id} for project "${order.project}". Items:\n` +
          order.items.map((i) => `- ${i.qty} × ${i.name} @ ${i.price} EUR`).join("\n") +
          `\nSubtotal: ${order.subtotal} EUR`;

        const prevClassification = (neg.classification ?? {}) as NegotiationClassification;
        const prevAnswered = Array.isArray(prevClassification.answered_checklist)
          ? (prevClassification.answered_checklist as ChecklistField[])
          : [];
        const prevOpenQuestions = Array.isArray(prevClassification.open_questions)
          ? (prevClassification.open_questions as string[]).filter(Boolean)
          : [];
        const prevAnswers = Array.isArray(prevClassification.prior_answers)
          ? (prevClassification.prior_answers as string[]).filter(Boolean)
          : [];
        const prevTranscript: ThreadMessage[] = Array.isArray(neg.thread_messages)
          ? neg.thread_messages
          : [];

        const thread: ThreadContext = {
          priorOpenQuestions: prevOpenQuestions,
          priorAnsweredChecklist: prevAnswered,
          priorAnswersSummary: prevAnswers,
          transcript: prevTranscript,
        };

        const cls = await classifyReply({ orderSummary, supplierReply: replyText, thread });

        // Second-pass recall check against the FULL transcript (including this
        // new reply). If the strong model finds an answer the first pass
        // missed, we move it out of still_open and into prior_answers.
        const verifyTranscript: ThreadMessage[] = [
          ...prevTranscript,
          {
            role: "supplier",
            lang: cls.reply_language ?? undefined,
            text: replyText,
            at: new Date().toISOString(),
          },
        ];
        const verify = await verifyAnsweredQuestions({
          stillOpen: cls.still_open_questions ?? [],
          transcript: verifyTranscript,
          latestReply: replyText,
        });
        const verifiedAnsweredOpen = Array.from(
          new Set([
            ...(cls.answered_open_questions ?? []),
            ...verify.newlyAnswered.map((a) => a.question),
          ]),
        );
        const verifiedStillOpen = verify.confirmedStillOpen;

        const followupCount = Number(neg.followup_count ?? 0);
        const clarificationCount = Number(neg.clarification_count ?? 0);
        const answeredChecklist = mergeAnsweredChecklist(prevAnswered, cls);
        const prevReplyCount = Number(prevClassification.reply_count ?? 0);
        const replyCount = prevReplyCount + 1;
        const lang = pickLang(
          cls.reply_language,
          (neg.order_snapshot as { supplier_language?: string })?.supplier_language,
        );

        // Build effective classification used by the policy decision.
        const effectiveCls: ReplyClassification = {
          ...cls,
          answered_open_questions: verifiedAnsweredOpen,
          still_open_questions: verifiedStillOpen,
          // If the only reason we were "unclear" was unanswered open questions
          // that the verifier just resolved, downgrade verdict so policy does
          // not send another clarification email.
          verdict:
            cls.verdict === "unclear" &&
            (cls.still_open_questions?.length ?? 0) > 0 &&
            verifiedStillOpen.length === 0 &&
            (cls.missing_checklist?.length ?? 0) === 0 &&
            (cls.unclear_points?.length ?? 0) === 0
              ? "fully_confirmed"
              : cls.verdict,
        };

        // Accumulate concise "facts already given" — include verifier evidence.
        const newAnswers: string[] = [];
        if (cls.checklist?.delivery_date)
          newAnswers.push(`delivery_date: ${cls.checklist.delivery_date}`);
        if (cls.checklist?.shipping_cost)
          newAnswers.push(`shipping_cost: ${cls.checklist.shipping_cost}`);
        for (const ans of verifiedAnsweredOpen) newAnswers.push(`answered: ${ans}`);
        for (const ev of verify.newlyAnswered)
          newAnswers.push(`evidence (${ev.question}): ${ev.evidence}`);
        const mergedAnswers = Array.from(new Set([...prevAnswers, ...newAnswers])).slice(-30);

        /* -------- 5. Decide + execute -------- */
        const state: CounterState = {
          followup_count: followupCount,
          clarification_count: clarificationCount,
          reply_count: replyCount,
          answered_checklist: answeredChecklist,
          order_subtotal_eur: Number(order.subtotal ?? 0),
        };
        const action = decideAction(effectiveCls, state);

        let nextStatus: string = neg.status ?? "awaiting_reply";
        let needsUserReason: string | null = null;
        let replyMessageId: string | null = null;
        let nextFollowup = followupCount;
        let nextClarification = clarificationCount;

        const am = agentMail();
        const reply = async (e: { text: string; html: string }) => {
          try {
            const sent = await am.inboxes.messages.reply(
              inboxId || neg!.inbox_id || "",
              messageId,
              {
                text: e.text,
                html: e.html,
              },
            );
            replyMessageId = (sent as { messageId?: string }).messageId ?? null;
          } catch (err) {
            console.error("webhook: send failed", err);
          }
        };

        // Outbound text/html captured to append to the transcript below.
        let outboundText = "";
        // Open questions we'll persist as ENGLISH canonical strings.
        let nextOpenQuestions: string[] = verifiedStillOpen;

        switch (action.kind) {
          case "send_confirmation": {
            const email = composeConfirmationEmail(order, { leadTime: cls.lead_time }, lang);
            await reply(email);
            outboundText = email.text;
            nextStatus = "confirmed";
            nextOpenQuestions = [];
            break;
          }
          case "send_checklist_followup": {
            const email = composeFollowupEmail(order, action.fields, lang);
            await reply(email);
            outboundText = email.text;
            nextStatus = "following_up";
            nextFollowup = followupCount + 1;
            nextOpenQuestions = action.fields.map((f) => CHECKLIST_LABEL_EN[f]);
            break;
          }
          case "send_answer_questions": {
            const qa = buildAnswersFromOrder(order, action.questions);
            const email = composeAnswerQuestionsEmail(order, qa, lang);
            await reply(email);
            outboundText = email.text;
            nextStatus = "answering_questions";
            break;
          }
          case "send_clarification_request": {
            const pointsNative = (cls.unclear_points ?? []).filter(Boolean);
            const pointsEn = (cls.unclear_points_en ?? []).filter(Boolean);
            const email = composeClarificationRequestEmail(
              order,
              lang,
              pointsNative,
              action.pendingChecklist,
              pointsEn,
            );
            await reply(email);
            outboundText = email.text;
            nextStatus = "clarifying";
            nextClarification = clarificationCount + 1;
            // Persist ENGLISH bullets as the canonical open questions so
            // cross-language matching is stable next turn.
            nextOpenQuestions = pointsEn.length
              ? pointsEn
              : pointsNative.length
                ? pointsNative
                : action.pendingChecklist.map((f) => CHECKLIST_LABEL_EN[f]);
            break;
          }
          case "escalate_silent": {
            nextStatus = "needs_user";
            needsUserReason = action.reason;
            break;
          }
          case "no_op": {
            needsUserReason = action.reason;
            break;
          }
        }

        // Append this turn (inbound + any outbound) to the raw transcript.
        const nextTranscript: ThreadMessage[] = [
          ...prevTranscript,
          {
            role: "supplier",
            lang: cls.reply_language ?? undefined,
            text: replyText.slice(0, 5000),
            at: new Date().toISOString(),
          },
        ];
        if (outboundText) {
          nextTranscript.push({
            role: "agent",
            lang,
            text: outboundText.slice(0, 5000),
            at: new Date().toISOString(),
          });
        }
        const cappedTranscript = nextTranscript.slice(-MAX_TRANSCRIPT_TURNS);

        const { email: fromEmail } = parseEmailAddress(from);

        await sb
          .from("negotiations")
          .update({
            status: nextStatus,
            classification: {
              ...effectiveCls,
              followup_count: nextFollowup,
              clarification_count: nextClarification,
              reply_count: replyCount,
              answered_checklist: answeredChecklist,
              open_questions: nextOpenQuestions,
              prior_answers: mergedAnswers,
              last_action: action.kind,
              last_action_reason: (action as { reason?: string }).reason ?? null,
            },
            thread_messages: cappedTranscript,
            reply_excerpt: replyText.slice(0, 1000),
            reply_message_id: replyMessageId,
            needs_user_reason: needsUserReason,
            last_reply_at: new Date().toISOString(),
            confirmed_at: nextStatus === "confirmed" ? new Date().toISOString() : null,
            followup_count: nextFollowup,
            clarification_count: nextClarification,
            last_processed_message_id: messageId || null,
            last_inbound_from: fromEmail,
            security_reject_reason: null,
            ...(matchedByFallback && threadId ? { thread_id: threadId } : {}),
          })
          .eq("id", neg.id);

        return new Response("ok", { status: 200 });
      },
    },
  },
});
