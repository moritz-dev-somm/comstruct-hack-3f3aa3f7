# Reset 24h supplier timer only on real progress

## Goal

Today the 24h "no reply from supplier" sweep treats the latest inbound message (`last_reply_at`) as the reset point. That means a junk reply like "hi" silently buys the supplier another 24 hours even though nothing moved forward. We want the timer to reset only when the reply actually advances the negotiation.

## What counts as "progress"

A reply makes progress when at least one of the following is true for that turn:
- Supplier answered at least one of the agent's open questions (`answered_open_questions.length > 0`)
- Supplier filled in a checklist field that wasn't filled before (delivery date or shipping cost)
- The classifier verdict is `fully_confirmed`, `confirmed_with_issue`, or `declined` (the negotiation has moved to a terminal state for that supplier)

Anything else — pure "unclear" replies, repeated vague answers, "hi/ok/thanks" without new info — does NOT reset the timer.

## Behavior after the change

```text
PO sent ────► (timer = 24h from sent_at)
   │
   ├─ "hi"           → no progress      → timer keeps counting from sent_at
   ├─ "Delivery 5d"  → progress (date)  → timer resets to now
   ├─ "ok"           → no progress      → timer keeps counting from prev progress
   └─ 24h after last progress with no movement → flipped to "Needs your attention"
```

The timeout sweep keeps running on the same schedule; only the reference timestamp changes.

## Changes

1. Add a `last_progress_at` timestamp column on `negotiations`. Backfill existing rows to `last_reply_at ?? sent_at` so nothing flips immediately after the migration.
2. In the supplier-reply webhook, after classification, compute a `madeProgress` boolean using the three rules above. If true, set `last_progress_at = now()` on the update.
3. In `src/routes/api/public/agent-timeouts.ts`, change the staleness check from `last_reply_at || sent_at` to `last_progress_at || sent_at`, and update the "Needs you" reason to read "No progress from {supplier} for 24h."
4. No UI changes required. The existing "Needs your attention" queue already surfaces these as soon as the sweep flips them.

## Out of scope

- Changing the 24h SLA itself.
- Changing what the agent emails the supplier in response to a non-progress reply (that path was already covered when we improved clarification handling).
- Adding a visible "last progress" timestamp in the UI.
