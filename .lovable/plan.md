# Bring comstruct to the foreman's phone (Telegram chat bot)

## Recommendation: Telegram, not WhatsApp

You said "prefer WhatsApp, but use Telegram if WhatsApp is much harder." It is much harder. Here's why we should pick Telegram:

|  | Telegram | WhatsApp (via Twilio) |
|---|---|---|
| Setup | Create a bot in @BotFather (2 min). Free. | Twilio account + Meta WhatsApp Business verification (days), or sandbox where each user must text a join code first |
| Proactive notifications | Allowed anytime, free-form | Outside a 24h "customer-care window", **only pre-approved Meta templates** can be sent. So order-update messages need template approval (each variant). |
| Interactive answers / surveys | Inline keyboards (quick-reply buttons, multi-step) built in | Interactive buttons require approved interactive templates in prod; works freely only inside the 24h window |
| Phone number `+41793602194` as routing key | Not directly — Telegram routes by `chat_id`, established by the user sending `/start` to the bot once | Yes — phone number is the address, but you still need that user to opt in once (sandbox: send a join code; production: they must message you first or accept a template) |

Either path requires a one-time "I am Marco" handshake. Telegram is free-form after that; WhatsApp adds permanent template-approval friction that would block the demo. **Plan below assumes Telegram.** If you later want WhatsApp too, the same dispatcher/inbound architecture works — only the transport changes.

The phone number `+41793602194` is stored as Marco's contact-of-record. On first `/start`, the bot asks the user to confirm "Are you Marco (+41 79 360 21 94)?" — one tap binds Telegram `chat_id` → foreman, then everything routes by phone in the UI/data, by `chat_id` on the wire.

## What the foreman will be able to do in the chat

1. **Receive proactive updates** for every order event (no app refresh needed):
   - PO sent to a supplier
   - Supplier confirmed (with delivery date + shipping)
   - Supplier asked a clarification → forwarded as a survey
   - Supplier declined → buttons: *Find alternatives* / *Cancel order* / *Keep waiting*
   - RFQ failed (no alternative supplier) → same action buttons
   - Order delivered
2. **Answer the agent's clarifying questions inline** via tap-buttons (e.g. "Pick an alternative: A — Hilti TE-C ø8mm / B — Bosch ø8mm / Cancel"). Free-text answers also accepted and parsed by the AI agent.
3. **Ask anything** in free text: "What did Uvex say?", "When is order BC-0142 arriving?", "Cancel BC-0139", "Re-order the last cement order". The same Lovable AI agent already on `/api/chat.ts` handles it, with order context loaded server-side. Tool-calls (cancel, retry RFQ, find alternatives, draft a new order from the catalog) are wired so the agent can act, not just describe.
4. **React to a decline**: when a supplier declines or RFQ fails, the bot proactively offers buttons — one tap triggers the same action paths already in the app (cancel, prefill a new search). No need to open the web app.

## What you need to do once

- Connect the Telegram connector in Lovable (I'll prompt you).
- Create the bot in @BotFather (1 min), give the token to Lovable when prompted.
- Open Telegram on your phone, search the bot, tap **Start**, tap **Yes, that's me** when it asks about +41 79 360 21 94. Done — you'll start getting order updates.

## Build outline (technical)

### Data
New tables:
- `foreman_channels` — `foreman_username` (PK, "marco.foreman"), `phone`, `telegram_chat_id`, `bound_at`. Pre-seed Marco's row with `phone = +41793602194`, `telegram_chat_id = null`.
- `chat_messages` — `id`, `foreman_username`, `direction` (in/out), `kind` (note | question | action_result), `payload jsonb`, `created_at`. Used for transcript + sending full history to the AI agent.
- `pending_actions` — `id`, `foreman_username`, `order_id`, `kind` (clarify_supplier | decide_decline | decide_rfq_failed), `options jsonb`, `status` (open | resolved), `resolved_value`, `created_at`. Lets us reconcile inline-button taps to the right order.

### Server routes
- `src/routes/api/public/telegram/webhook.ts` — Telegram update receiver. Verifies `X-Telegram-Bot-Api-Secret-Token`, handles:
  - `/start` → bind `chat_id` to a foreman after the "Yes, that's me" tap
  - `callback_query` (button tap) → resolve `pending_actions` row, run the matching app action (cancel order, prefill chat, retry RFQ)
  - text message → append to `chat_messages`, call the AI agent with order context + tools, send the reply back
- `src/lib/telegram.server.ts` — gateway helpers: `sendMessage(chatId, text, keyboard?)`, `answerCallbackQuery`, `sendOrderUpdate(orderId, kind, payload)` (looks up chat_id, formats card, attaches inline keyboard).

### Notification dispatcher hooks
Call `sendOrderUpdate(...)` from:
- `src/lib/orders.tsx` → `createFromCart`, `approve`, `reject`, `applyRfqResult`, `advanceToDelivered`
- `src/routes/api/public/agentmail/webhook.ts` → at each branch where negotiation status flips (declined, confirmed, needs_user, issues_raised)

### AI agent for inbound text
Reuse the existing system prompt from `src/routes/api/chat.ts`; add tools the agent can call from Telegram:
- `cancel_order(order_id, reason)`
- `retry_alternatives(order_id)`
- `summarize_order(order_id)`
- `answer_supplier_clarification(negotiation_id, answer_text)` — writes back through the agentmail flow
- `find_products(query)` and `draft_order(items)` — to start a new order from chat (final approval still happens in the app for now, or auto-confirmed if you want).

### Optional later
- WhatsApp transport (Twilio) reusing the same dispatcher/inbound interfaces, once templates are approved.
- Push the same updates into the web `/orders` page via realtime so the two channels stay in sync.

## Out of scope for this plan
- Real authentication of the foreman (we keep the demo-credential model — the `/start` binding is the only "auth").
- Multi-tenant or multi-foreman fan-out (the dispatcher is built for it, but the demo only seeds Marco).
