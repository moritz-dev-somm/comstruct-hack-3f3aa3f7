## Goal

When a foreman submits an order ≥ €200, the PM still approves first. Once approved, instead of sending the PO straight to the original supplier, the agent **fans out an RFQ ("please quote your best price + shipping") to the top 3 suppliers active in the cart's dominant category**, waits up to 24h (or closes early if all reply), then **automatically places the PO with the lowest total (price × qty + shipping)**.

## Behaviour matrix (locked from your answers)

| Condition | Result |
|---|---|
| Subtotal < €200 | Unchanged (auto-approved → PO to original supplier) |
| Subtotal ≥ €200 | Tier = `pm`. PM approves → status becomes `rfq_in_progress` instead of `ordered` |
| Subtotal ≥ €2000 | Same as above but central tier first, then RFQ |
| RFQ recipients | Up to 3 suppliers from `suppliers` table whose catalog covers the dominant cart category (excluding the original supplier-of-record; original is included as RFQ #1 so they get a chance to defend) |
| <3 eligible | Send to whatever's available (min 1) |
| Wait window | 24h hard deadline, but close early if all invited suppliers respond |
| ≥1 response | Auto-pick lowest `lineTotal + shipping_cost_eur`; create real PO to winner; original supplier (if losing) gets nothing — they were just bidding |
| 0 responses | Escalate to human (`needs_user`) with reason "No RFQ responses in 24h" |
| Supplier "out of stock" | Treated as non-bid (excluded from winner selection) |
| Supplier asks question / wants human | Excluded from auto-decision; if all 3 bow out → escalate |

## New order statuses

Extend `OrderStatus` with:
- `rfq_in_progress` (amber) — RFQ emails sent, waiting for quotes
- `rfq_failed` (red) — escalated, no usable quotes

`approved` becomes a transient state for ≥€200 orders before flipping to `rfq_in_progress`.

## DB schema (`rfqs` + `rfq_quotes` tables)

```sql
create table public.rfqs (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  status text not null default 'open', -- open | decided | escalated
  deadline_at timestamptz not null,
  invited_suppliers text[] not null,
  winner_supplier text,
  winner_total_eur numeric,
  decided_at timestamptz,
  escalation_reason text,
  created_at timestamptz default now()
);

create table public.rfq_quotes (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  negotiation_id uuid references public.negotiations(id),
  supplier_name text not null,
  unit_price_eur numeric,        -- supplier's quoted unit price (if changed)
  line_total_eur numeric,        -- qty × quoted unit price
  shipping_cost_eur numeric,
  total_eur numeric,             -- line_total + shipping
  lead_time_days int,
  status text not null default 'pending', -- pending | quoted | declined | unanswered
  raw_reply_excerpt text,
  received_at timestamptz
);
```

Both with permissive RLS (matches existing tables).

## Files added / changed

**New**
- `agent/rfq.server.ts` — `startRfqForOrder(order)`: pick top-3 suppliers by category, create `rfqs` row, send 3 RFQ emails (one negotiation each, flagged with `rfq_id` in `order_snapshot`), set 24h deadline.
- `agent/rfq.server.ts` — `recordRfqQuote(negotiationId, classification)`: insert/update `rfq_quotes` row from classifier output.
- `agent/rfq.server.ts` — `maybeDecideRfq(rfqId)`: if all invited responded OR past deadline → pick winner (lowest `total_eur`), mark RFQ `decided`, create new `negotiations` row to send the actual PO to winner, flip order to `ordered`. If 0 quotable → escalate, set order `rfq_failed`.
- `src/lib/rfq.functions.ts` — read-side server fn `getRfqForOrder(orderId)` for UI.

**Changed**
- `agent/templates.ts` — add `composeRfqEmail(...)` (multilingual EN/DE/FR/IT) explicitly asking for "best unit price + shipping cost + lead time for the attached list, valid 24h".
- `agent/conditions.ts` — when `cls.verdict === 'confirmed_with_issue'` or `'fully_confirmed'` and the negotiation belongs to an RFQ, **skip the existing auto-approve logic** and route to `record_rfq_quote` instead.
- `agent/agent.server.ts` — add `AgentAction` kind `record_rfq_quote`; classifier prompt extended to always extract `unit_price_eur` (currently only does `shipping_cost_eur` + `lead_time_days`).
- `src/routes/api/public/agentmail/webhook.ts` — after classifying a reply, if the negotiation is tagged `rfq`, call `recordRfqQuote` then `maybeDecideRfq` instead of sending confirmation/clarification.
- `src/routes/api/public/agent-timeouts.ts` — extend the cron sweep to also call `maybeDecideRfq` for any open RFQ past its deadline.
- `src/lib/orders.tsx` — add `rfq_in_progress` + `rfq_failed` to `OrderStatus` + `STATUS_META`; in `approve()`, if `tier !== 'auto'` AND subtotal ≥ €200, set status to `rfq_in_progress` instead of `ordered` and invoke `startRfqForOrder` via a new server fn; expose `placeWinningPo(orderId, supplier, total)` for the RFQ resolver to call back.
- `src/routes/procurement.orders.$orderId.tsx` — new "RFQ quotes" panel: list of invited suppliers, their quoted unit price / shipping / lead time / total, winner highlighted, deadline countdown.
- `src/routes/procurement.orders.tsx` — status badge for `rfq_in_progress` shows "X/Y quotes in" tooltip.

## Supplier discovery

`pickRfqSuppliers(order)`:
1. Compute dominant category = most common `category` across cart items (by line value).
2. Query `select distinct supplier from products where category = $1 and supplier is not null limit 10`.
3. Look those up in `suppliers` table to get email + language (skip ones with no contact).
4. Always include the order's original supplier first (so it can defend the bid).
5. Take top 3 by total catalog size in that category.
6. Edge: 0 eligible → escalate immediately (`rfq_failed`, "No alternative suppliers in catalog").

## Winner selection

For each `rfq_quotes` row with `status='quoted'` and `total_eur` finite:
- Skip if classifier marked item unavailable.
- Total = (quoted_unit_price ?? original_unit_price) × qty + (shipping_cost_eur ?? 0).
- If no quoted price but supplier confirmed → fall back to original unit price for that supplier.
- Lowest wins. Tie-break by lead time, then alphabetical.

## Edge cases handled

- Supplier replies twice → quote updated in-place by `negotiation_id`.
- Supplier declines / out of stock → marked `declined`, excluded from winner pool.
- All 3 decline → `rfq_failed`, human escalation.
- Deadline passes with partial responses → decide with what we have (rule: ≥1 quoted wins, else escalate).
- Order is cancelled mid-RFQ → cron skips RFQs whose order is in `rejected`.
- Webhook fires after RFQ already decided → no-op (idempotent on `rfq.status='decided'`).
- Original supplier wins → still issue a fresh PO (don't reuse the RFQ thread).

## Testing

- Unit-ish: a script under `/tmp` that seeds an order ≥ €200, simulates 3 webhook payloads (one cheap, one expensive, one decline), and asserts the order ends `ordered` with the winning supplier.
- Manual: `stack_modern--invoke-server-function` to hit the timeout sweep after seeding a stale RFQ; assert auto-escalation.
- Build check + runtime check via preview after each major step.

## Out of scope (call out so you can decide)

- Sending the foreman a notification when a winner is picked (the order already updates in their `/orders` view).
- Multi-category orders splitting into multiple RFQs — current plan picks one dominant category. If you want per-category RFQs, say so and I'll add it.
- Letting the PM see/override the RFQ winner before the PO goes out (currently fully auto once PM approves).