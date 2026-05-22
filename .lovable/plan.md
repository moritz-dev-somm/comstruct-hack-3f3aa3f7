
## Goal

Make the supplier agent smarter and more autonomous: auto-reject bad quotes, auto-failover to the next-best supplier, auto-cancel when no candidates remain, and let the agent answer supplier questions independently using full user/order context. Surface anything ambiguous in the "needs attention" panel.

## 1. Rejection & confirmation rules (hardcoded thresholds)

In `agent/conditions.ts` (or a new `agent/policy.ts`) introduce a single policy evaluator that classifies a supplier reply into:

- `accept` — proceed to confirm
- `needs_user` — surface in attention box (don't cancel)
- `auto_reject` — send cancellation email + failover
- `clarify` — agent answers supplier question itself (no user input)

Thresholds (hardcoded, easy to tune):

```text
shipping_cost_eur:
  auto_reject if  > 40 EUR  AND  > 50% of subtotal
  (both must be true → auto reject; otherwise accept)

lead_time_days:
  > 30 days        → auto_reject
  > 14 days        → needs_user (confirm long lead time)
  <= 14 days       → accept

supplier explicitly declines / out of stock / can't fulfil  → auto_reject
supplier asks a relevant question                            → clarify (agent answers) OR needs_user (if agent can't answer confidently)
```

## 2. Auto-failover to next supplier

When a quote is `auto_reject`:

1. Send polite cancellation/decline email to that supplier (templated, in supplier language).
2. Mark the negotiation as `rejected` with reason.
3. Pick the next supplier:
   - **Hybrid lookup**: first find suppliers carrying the same product (SKU/name match in `products`), excluding already-tried ones.
   - If none, fall back to top-3 by dominant category via existing `pickRfqSuppliers`.
4. Open a new negotiation with that supplier using the same order snapshot.
5. Record the chain on the order (`failover_history: [{ supplier, reason, at }, ...]`) so the UI can show "Tried Supplier A → rejected (shipping too high) → now contacting Supplier B".
6. If no candidates remain: cancel the order, send cancellation email to active supplier(s), set order status `cancelled_no_supplier`.

## 3. Cancelled-order UI

In `src/routes/procurement.orders.$orderId.tsx` and `src/lib/orders.tsx`:

- When order status is `cancelled*`, replace the "Approve & confirm" CTA with:
  - **"Return to search"** (primary) — restores the original cart + filters + chat context and routes the user back to the procurement search page pre-populated.
  - **"Discard"** (secondary, ghost) — archives the order.
- Add a visible failover trail in the order timeline (supplier chips with reject reason + cancellation email link).
- Persist the original search state (`cart_snapshot`, `search_query`, `filters`) on the order at creation time so "Return to search" works deterministically.

## 4. Smart agent replies (max context)

When the agent drafts any reply to a supplier (clarify, confirm, cancel), pass the LLM:

- Company profile (name, address, VAT, payment terms, primary contact, language)
- Project (name, site address, delivery window, foreman name & phone)
- Full order snapshot (items, quantities, totals)
- Full thread transcript so far
- Supplier profile (name, language, prior orders if any)
- The current policy decision + reason (so the email tone matches: decline vs. clarify vs. confirm)

The LLM is instructed to:

- Answer supplier questions **only if** the answer is unambiguously derivable from the above context.
- Otherwise return `needs_user: true` with a short question for the foreman, which the webhook surfaces into the attention box.
- Always reply in the supplier's language.

## 5. Attention box upgrades

In the order detail UI, the "Needs attention" panel becomes structured:

- **Question from supplier** — shows the supplier's question + agent's suggested answer, with "Send" / "Edit" / "Ignore".
- **Long lead time** — "Supplier X quotes 21 days. Confirm or cancel?" with one-click Confirm / Cancel & failover.
- **Ambiguous quote** — missing price / shipping → ask supplier for clarification (auto-drafted).

## 6. Files to touch

```text
agent/
  policy.ts                    (new — threshold evaluator, returns Decision)
  agent.server.ts              (wire policy into reply handler, add failover)
  rfq.server.ts                (failover candidate lookup)
templates/
  cancellation.ts              (new — multilang decline email)
src/lib/
  orders.tsx                   (failover_history, search_snapshot fields)
  order-status.ts              (add cancelled_no_supplier, failover_in_progress)
  negotiations.ts              (rejected status, reason)
src/routes/
  procurement.orders.$orderId.tsx  (cancelled CTAs, failover trail, attention panel)
  procurement.index.tsx        (accept ?restore=<orderId> to rehydrate search)
supabase migration:
  orders: add failover_history jsonb, search_snapshot jsonb, cancellation_reason text
  negotiations: add reject_reason text
```

## 7. Edge cases handled

- Supplier replies after we already failed over → auto-decline politely, do not reopen.
- Failover candidate is the same supplier (different email) → skip.
- All candidates exhausted mid-RFQ → cancel order, notify all open negotiations.
- Supplier asks an irrelevant question (e.g. "what's the weather") → ignore, do not surface.
- LLM hallucination guard: if drafted answer references info not in context, fall back to `needs_user`.
- "Return to search" when products no longer exist → restore what's available, flag missing items.

## 8. Verification

- Seed a test order > €200 → RFQ → simulate 3 replies (good / high-shipping / decline) → assert winner = good, failover trail logged, emails sent.
- Simulate all-reject → assert order cancelled, "Return to search" restores cart.
- Simulate supplier question "what's the delivery address?" → assert agent auto-answers from project context, no user prompt.
- Simulate "can you pay in 60 days?" when payment terms = 30 → assert escalates to user.
