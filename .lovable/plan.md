# Chat-driven foreman experience (Telegram)

## Recommendation: Telegram (not WhatsApp)

For a working end-to-end demo this week, Telegram is dramatically easier:

- **No business verification.** A bot is created in 30 seconds via @BotFather. WhatsApp Business API requires a verified Meta business account (days), and Twilio's WhatsApp sandbox forces every recipient to first text a join-code from their phone — fine for one tester, painful otherwise.
- **Rich interactive UI built in.** Telegram has inline keyboards (tap-to-answer buttons), ForceReply prompts, and native Polls — perfect for "survey-style" clarification questions and one-tap actions like *Find alternatives / Cancel order*.
- **Free, no per-message cost.** WhatsApp charges per conversation.
- **Lovable already has a Telegram connector** with a gateway that handles auth + token refresh. No bot token in our code.

The hardcoded phone number `+41 79 360 21 94` becomes a display-only label for "Marco Bianchi (foreman)". The actual delivery channel is the Telegram chat that the foreman opens with the bot by sending `/start` once.

If you later need WhatsApp specifically, the same notification + intent layer is reusable — only the transport swaps.

## What the foreman gets in chat

1. **Proactive order updates** pushed as state changes:
   - Order submitted / approved / PO sent
   - Supplier confirmed (with delivery date + shipping)
   - Supplier raised an issue or asked back
   - Supplier declined → followed by the failover RFQ result
   - "Needs your input" → an inline keyboard for next steps
   - Delivered
2. **Inline-keyboard actions** on every actionable message:
   - *Find alternatives* — triggers a fresh RFQ via the existing flow
   - *Cancel order* — cancels with a recorded reason
   - *Reorder* (after decline) — re-submits with the same items
   - *Answer agent question* — opens a ForceReply prompt; the typed answer is fed back to the supplier-agent loop as the foreman's clarification
3. **Free-form Q&A.** Any other message is forwarded to the existing chat AI (`/api/chat.ts`) with order context prefixed, and the answer replied in the same Telegram thread.

## High-level flow

```text
                            ┌────────────────────────┐
 Foreman ──/start──▶  Telegram bot                   │
                       (binds chat_id ↔ phone once)   │
                                                      ▼
 Order events ──▶ notifier ──▶ Telegram sendMessage (with buttons)
   (created, supplier reply,
    declined, RFQ result, …)

 Foreman taps button / replies
        │
        ▼
 /api/public/telegram/webhook ──▶ intent router ──▶
   • answer-clarification → updates negotiation, agent re-emails supplier
   • cancel-order         → reject(orderId, reason)
   • find-alternatives    → triggers RFQ for that order
   • reorder              → re-submits items
   • free text            → /api/chat.ts with order context
```

## Build steps

1. **Connect Telegram** via `standard_connectors--connect` (`telegram`). User creates the bot in @BotFather and links it once.
2. **DB**
   - `telegram_subscribers (phone text PK, chat_id bigint, created_at)` — captured on `/start`.
   - `telegram_notifications (order_id, neg_id nullable, kind text, sent_at)` — dedupe so we don't spam on poll/retry.
3. **Server**
   - `src/lib/telegram.server.ts` — `sendMessage`, `sendKeyboard`, `getSubscriberChatId(phone)`. Uses connector gateway with `LOVABLE_API_KEY` + `TELEGRAM_API_KEY` from env.
   - `src/routes/api/public/telegram/webhook.ts` — verifies `X-Telegram-Bot-Api-Secret-Token`, routes `/start`, free text, `callback_query` button taps, and ForceReply answers. No Supabase auth.
   - `src/lib/telegram-notify.server.ts` — `notifyOrderEvent(orderId, kind, payload)` called from:
     - the agentmail webhook on each classified reply / state transition,
     - the RFQ resolver when a winner is picked or RFQ fails,
     - `submitOrder` / `approve` / `reject` in `orders.tsx` (via a thin server fn so the client can also trigger).
4. **Webhook registration.** From the sandbox, call `setWebhook` through the gateway with the stable public URL `https://project--3593c438-9c10-4bf7-9844-2e194e2e97e9-dev.lovable.app/api/public/telegram/webhook` and a `secret_token` derived from `TELEGRAM_API_KEY` (SHA-256 base64url). Same derivation in the webhook handler for verification.
5. **Foreman bootstrap.** Show a tiny "Connect Telegram" tile on `/orders` with a `t.me/<bot>?start=<phone>` link so the foreman taps it once on their phone. After `/start`, the bot confirms in chat: *"Connected as Marco Bianchi (+41 79 360 21 94). I'll keep you posted on every order."*

## Open-question survey UX

For clarification questions the agent needs from the foreman:

- **Single-choice / yes-no** (e.g. "Supplier offers Tuesday instead of Monday — accept?") → inline keyboard, one tap = answer.
- **Free text** (e.g. "Which alternative brand is acceptable?") → ForceReply prompt; user types once and the answer is stored against the negotiation + emailed to the supplier by the existing agent loop.
- **Date** (e.g. "What's the latest acceptable delivery date?") → inline keyboard of the next 7 weekdays, plus *Other (type)* fallback.

## Technical details

- All Telegram traffic goes through the Lovable connector gateway — bot token never touches our code.
- Notifications are dispatched **server-side** at the same point we already update the DB, so they fire whether the foreman has the web UI open or not.
- Dedup is keyed by `(order_id, kind, neg_id)` so the same supplier-confirmed event can't double-send if the agentmail webhook retries.
- Free-text Q&A reuses `src/routes/api/chat.ts` by calling its internal function with `{ messages, context: { orderId } }` so the AI already has order-aware tools.
- Failure mode: if Telegram send fails (unlinked subscriber, etc.) we log and continue — never block the agent's main flow.

## What's NOT in scope of this plan

- WhatsApp transport (deferred; same notifier layer would plug in).
- Multi-user roles in chat (PM / central approver) — only the foreman gets a chat for v1.
- Voice messages / file uploads from the supplier surfaced in chat.
