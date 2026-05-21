# Supplier agent — emails, policy, and human-in-the-loop UI

Everything below stays inside `agent/`, `src/lib/supplier-agent.functions.ts`, the AgentMail webhook, and `src/routes/procurement.agent.tsx`. No DB schema changes (we already store `classification` JSONB and `followup_count` / `clarification_count`).

## 1. Email text & bilingual ordering (templates.ts)

- **Remove** "so we can route it to the right person quickly." from the initial PO (`flagDiscrepancy`) — and the equivalent in `de`, `fr`, `it`.
- **Remove** the German `outroSingle` "Eine kurze Zeile genügt — die übrige Bestellung muss nicht wiederholt werden." Apply the same shortening across `en/fr/it`: drop the outro entirely from clarification emails (it duplicates the intro intent).
- **Clarification fallback fix.** Today, when no `unclear_points` exist we still send the generic "Could you confirm the specific point you left open…" *plus* the intro that already asks the same thing. New behaviour:
  - `composeClarificationRequestEmail` takes an extra `pendingChecklist: ChecklistField[]` arg.
  - If `points` is empty, fall back to the **still-unanswered checklist questions** from the very first email (`earliestDelivery`, `shippingCosts`) — reusing `STRINGS[lang].earliestDelivery` / `.shippingCosts` so the wording matches the original ask.
  - Drop the standalone `fallback` string; the email now always has concrete bullets.
- **Bilingual ordering.** In every composer (`composeOrderEmail`, `composeFollowupEmail`, `composeClarificationRequestEmail`, `composeAnswerQuestionsEmail`, `composeIssuesAckEmail`, `composeDeclineAckEmail`, `composeConfirmationEmail`, `composeNudgeEmail`, `bilingual()`), put **English first**, then the supplier's language block. Subject becomes `[ID] <english> / <native>`.
- **Short confirmation on every supplier confirmation** — `composeConfirmationEmail` already runs on `send_confirmation`; keep, but trim to ~3 short lines.
- **No automatic cancel email** when supplier declines. Replace `send_decline_ack` action with `no_op` + needs_user. The decline-ack email is only sent later when a human authorizes a replacement purchase (new server fn, see §4).

## 2. Policy / state machine (agent/conditions.ts + webhook)

Add a richer `CounterState` and reply-cap logic:

```
CounterState {
  followup_count, clarification_count,
  reply_count,                 // total supplier replies seen
  answered_checklist: ChecklistField[],  // accumulated across the thread
  pending_checklist: ChecklistField[],   // = ["delivery_date","shipping_cost"] − answered
}
```

- **Hard cap: 5 replies.** Webhook increments `reply_count` on every inbound. When `reply_count >= 5` and not already `confirmed`, force `escalate_silent` with reason `Reply limit reached (5) — human review needed.`
- **Human handoff triggers** (all → `escalate_silent` + `needs_user_reason`):
  - Supplier explicitly asks for a human (new classifier field `wants_human: boolean`, plus regex backstop on phrases like `talk to`, `speak with`, `sprechen`, `parler à`, `un commercial`).
  - Supplier asks a question we cannot auto-answer (existing `unanswerable_questions` non-empty).
  - Supplier says item unavailable / declined (verdict `declined` OR `confirmed_with_issue` with `unavailable`/`out of stock`/`nicht verfügbar` in `issues`).
  - 24h silence (see §3).
- **Auto-approve thresholds** for `confirmed_with_issue`:
  - `lead_time_days <= 14` AND no `issues` other than shipping/lead-time → `send_confirmation` automatically.
  - `shipping_cost_eur <= max(20, 5% × order.subtotal)` → counts as acceptable.
  - Otherwise → `escalate_silent` (`Needs human approval: lead time X days / shipping €Y`).
  - Classifier returns `lead_time_days: number|null` and `shipping_cost_eur: number|null` for this.
- **Accumulated checklist.** Webhook merges `cls.checklist.delivery_date != null` and `cls.checklist.shipping_cost != null` into a `answered_checklist` array on the negotiation row (stored inside `classification.answered_checklist`). The clarification/follow-up emails use only the still-pending fields.

## 3. 24h-no-reply timeout

Add a public endpoint and pg_cron:

- `src/routes/api/public/agent-timeouts.ts` (POST). Auth: `apikey` header = anon. Scans `negotiations` where status ∈ {sent, awaiting_reply, clarifying, following_up, answering_questions} AND `greatest(sent_at, last_reply_at) < now() - interval '24 hours'`. For each row → set `status = 'needs_user'`, `needs_user_reason = 'No reply in 24h — human follow-up needed.'`. No outbound email.
- pg_cron job every 15 minutes calling that endpoint.

## 4. Human-in-the-loop server actions

`src/lib/supplier-agent.functions.ts` adds three server fns the UI calls:

- `approveNegotiation(id)` — used when human approves auto-confirmable-but-escalated cases (lead time high, shipping high). Sends `composeConfirmationEmail` reply to the supplier's last message; sets status `confirmed`.
- `declineAndReplaceNegotiation(id)` — used after human re-sources elsewhere. Sends `composeDeclineAckEmail` ("thanks, sourcing elsewhere"); sets status `declined`. *This is the only place that email is sent now.*
- `humanFollowupNegotiation(id, text)` — sends a free-text reply on the same thread; clears `needs_user`; sets status `awaiting_reply`.

All three reuse `am.inboxes.messages.reply()` with the negotiation's last message id (already stored as `reply_message_id` / `message_id`).

## 5. UI — Action queue + clearer tags (procurement.agent.tsx)

This page already loads `negotiations` via `listNegotiationsForInbox`. Extend the response to include `status`, `needs_user_reason`, `last_reply_at`, `classification` (it already does) and `order_snapshot.subtotal`.

- **New top section "Needs your attention"** (mobile-first card list). Shows every negotiation where `status === 'needs_user'` OR `derivedStatus === 'action_required'`. Each card:
  - Supplier + order id + 1-line reason (`needs_user_reason` or generated from classification).
  - Primary action button(s): `Approve` / `Decline & source elsewhere` / `Send custom reply` (opens a small textarea).
  - Subtle, mobile-friendly: full-width on `<sm`, two-column grid on `≥md`. Sticky-ish header on mobile.
- **Tag rewrite.** Replace the current `VERDICT_META` with action-state meta keyed by `negotiation.status` (not classifier verdict) so each tag describes "what's happening" not "how the AI labelled it":
  - `confirmed` → "Confirmed" (green check)
  - `awaiting_reply` → "Waiting on supplier"
  - `clarifying` → "We asked a clarification"
  - `following_up` → "We asked for missing details"
  - `answering_questions` → "We answered supplier"
  - `issues_raised` → "Supplier flagged issues"
  - `declined` → "Supplier declined"
  - `needs_user` → "Needs you" (brand-red pill — same as Action queue)
- **Per-message annotation** stays, but uses the same colour family so list ↔ thread are visually consistent.

## 6. Out of scope

- No new tables or DB columns.
- No changes to chat, catalogue, or cart.
- No real Stripe / payments flow.
- The PO-cancel email is intentionally NOT a real cancel to the supplier — it's the "we'll source elsewhere this time" ack we already had, just gated behind human confirmation.

## Technical notes

- Bilingual swap is one-line per composer (`renderTextBlock(english,…) + sep + renderTextBlock(primary,…)`).
- `classifyReply` JSON schema adds `wants_human`, `lead_time_days`, `shipping_cost_eur` — fall back to current behaviour when missing so older rows still work.
- `decideAction` becomes the single source of truth — the webhook just executes the returned action; no inline overrides.
- pg_cron migration is the only DB change; rest is code.
