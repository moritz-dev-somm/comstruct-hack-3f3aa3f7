## Show resolved delivery date on the Orders tab

Suppliers reply with all sorts of phrasings — "by next Tuesday", "in 5 business days", "15.06.2026", "ASAP", "Lieferung am Freitag". Today the agent stores the raw string but the Orders tab doesn't render it, and we never resolve "next Tuesday" into a real calendar date. We'll add a resolver, persist the result, and surface it prominently to the foreman.

### Resolver — `agent/delivery-date.ts` (new)

Pure utility, no I/O:

```ts
resolveDeliveryDate(raw: string | null, anchor: Date): {
  iso: string | null;           // YYYY-MM-DD, earliest committed date
  isoEnd: string | null;        // same as iso for points; later date for ranges
  confidence: "high" | "medium" | "low" | "unresolved";
  needsClarification: boolean;  // true ⇒ raw mentions delivery but we can't pin it
  note: string;                 // short English explanation of how we derived it
}
```

Handles, in en/de/fr/it:
- Absolute dates: `2026-06-15`, `15.06.2026`, `15/06`, `15.06` (assume current/next year).
- "today", "tomorrow", "morgen", "demain", "domani".
- Weekday names with and without `this`/`next`/`am`/`prochain`/`prossimo` — uses anchor + Intl day index. `next Tuesday` from a Monday means **8 days out**, from a Wednesday means **6 days out** (next week's Tuesday — common convention).
- "in N days / weeks / months", "within N business/working days" (skip weekends), "N–M working days" → range.
- "end of (this/next) week" → Friday of that week. "end of (this/next) month" → last business day.
- "ASAP", "as soon as possible", "snellst möglich", "appena possibile" → low confidence, `iso = anchor + 2 business days`, `needsClarification = true`.
- Pure vague phrases ("when available", "we'll see", "soon") → `iso = null`, `needsClarification = true`.
- Unparseable but mentions delivery → `needsClarification = true`.
- No delivery wording at all → `confidence = "unresolved"`, `needsClarification = false`.

### Agent integration — `agent/agent.server.ts`

Extend `ReplyClassification` with:
```
delivery_date_iso, delivery_date_iso_end, delivery_date_confidence, delivery_date_needs_clarification
```
After the LLM call, run the resolver against `checklist.delivery_date` using the supplier reply's `received_at` (fallback `now`). If `needsClarification` and the latest outbound didn't already ask, append an English unclear point so the existing follow-up machinery asks the supplier for an exact calendar date in their language.

### Persistence — migration

Add to `negotiations`:
- `delivery_date_iso date`
- `delivery_date_iso_end date`
- `delivery_date_confidence text` (`high|medium|low|unresolved`)
- `delivery_date_raw text` (the original supplier wording, preserved)
- `delivery_date_needs_clarification boolean default false`

Webhook (`src/routes/api/public/agentmail/webhook.ts`) writes all five on every classification.

### Orders tab — `src/routes/orders.tsx`

Pick per-order delivery from negotiations: prefer `confirmed` status; otherwise the earliest `iso` across negotiations. Render in two places:

**Collapsed row** (new pill next to status):
```
📅 Delivery · Tue 26 May
📅 Delivery · 26–28 May
📅 Delivery · asking supplier
📅 Delivery · TBD
```
Tone: green (high), brand (medium), amber (low/asking), muted (unresolved).

**Expanded section** — new "Delivery" block above Timeline:
```
Delivery
   Tuesday, 26 May 2026                         high confidence
   Supplier said: "by next Tuesday" · 21 May
   [ Ask supplier for an exact date ]   ← only when needsClarification
```

Multi-supplier orders show one pill per supplier with the supplier name.

`src/lib/negotiations.ts` selects the new columns. `src/lib/order-status.ts` exports a `pickDeliveryForOrder(negs)` helper + tone classes (no change to existing status pipeline).

### Display

Use `Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" })` so it adapts to the foreman's locale. Year only when ≥ 6 months out.

### Verification

Unit-run the resolver in `/tmp/resolver-check.ts` against fixture strings:
- `"by next Tuesday"` anchored at `2026-05-22` (Fri) → `2026-06-02` (the Tue of the following week), high.
- `"in 5 business days"` → +5 business days, high.
- `"15.06"` (May anchor) → `2026-06-15`, high.
- `"Lieferung am Freitag"` (Fri anchor) → next Fri `2026-05-29`, medium.
- `"as soon as possible"` → +2 business days, low, `needsClarification = true`.
- `"sobald wir können"` → `iso = null`, `needsClarification = true`.

Then exercise the UI:
1. Send three demo negotiations with the strings above → Orders tab pills render correctly.
2. The "ASAP" case shows amber pill "asking supplier" and the agent's next outbound contains the clarification ask.
3. After supplier replies with a concrete date, the pill flips to green and the timeline records the confirmation.

### Files touched

- `agent/delivery-date.ts` (new, pure)
- `agent/agent.server.ts` (extend classification, call resolver, push unclear point)
- `src/routes/api/public/agentmail/webhook.ts` (persist new columns)
- `supabase/migrations/<ts>_negotiations_delivery_date.sql` (new)
- `src/lib/negotiations.ts` (select + type)
- `src/lib/order-status.ts` (`pickDeliveryForOrder`, format helpers)
- `src/routes/orders.tsx` (pill + expanded block)
- `src/integrations/supabase/types.ts` (regenerated by migration)
