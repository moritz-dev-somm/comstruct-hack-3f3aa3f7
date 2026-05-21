## Goal

Skip the expensive intent-extraction + hybrid-search retrieval round-trip for the 6 hard-coded suggestion chips in `src/routes/index.tsx` (lines 87-94). For these specific prompts, feed the LLM a hand-curated SKU list from the live catalog so it can answer instantly and consistently.

## Curated mappings (chosen from the 116-product catalog)

```
"PPE pack for a new worker"
  C073 Bauhelm weiß ×1, C021 Schutzbrille klar ×1, C019 Arbeitshandschuhe Gr.9 ×2,
  C023 Atemschutzmaske FFP2 ×5, C022 Gehörschutzstöpsel ×5,
  C024 Warnweste orange ×1, C075 Kniepolster ×1

"Drywall screws for metal studs"
  (catalog has no dedicated drywall screw — closest universal fine-thread)
  C001 Schraube TX20 4x40 ×200, C002 Schraube TX20 5x60 ×100,
  C032 Bit TX20 ×1

"Window sealing kit"
  C042 PU-Schaum ×2, C076 Montageschaum Reiniger ×1,
  C039 Silikon transparent ×2, C040 Silikon weiß ×2, C041 Acryl weiß ×2,
  C026 Abdeckfolie 4x5m ×2, C027 Panzertape silber ×1, C025 Malervlies ×1

"Concrete drilling set"
  C035 Bohrer 10mm ×2, C034 Bohrer 8mm ×2,
  C006 Dübel 10mm ×50, C005 Dübel 8mm ×50,
  C071 Betontrennscheibe ×1

"Refill: gloves, masks, blades"
  C019 Arbeitshandschuhe Gr.9 ×10, C020 Arbeitshandschuhe Gr.10 ×10,
  C098 Handschuh Latex ×20, C023 Atemschutzmaske FFP2 ×20,
  C097 Staubmaske einfach ×30, C072 Flexscheibe Metall ×5,
  C071 Betontrennscheibe ×2

"SDS bits + plugs for anchors"
  (catalog has no SDS-specific bits — use general Bohrer as proxy)
  C034 Bohrer 8mm ×1, C035 Bohrer 10mm ×1,
  C004 Dübel 6mm ×50, C005 Dübel 8mm ×50, C006 Dübel 10mm ×50
```

These are picked by deep-reading the full catalog (categories Safety, Sealing, Anchors, Fasteners, Hand Tools, Power & Light); each SKU exists today.

## Implementation (single file: `src/routes/api/chat.ts`)

1. Add a `PRESET_CHIPS: Record<string, Array<{ sku: string; qty: number }>>` constant keyed by the normalized chip text (trimmed + lowercased). Include both the original English chip strings from `SUGGESTED_CHIPS`.

2. In the POST handler (around line 521, right after `lastUserText` is computed), check if `lastUserText.trim().toLowerCase()` matches a preset key. If yes:
   - Call existing `fetchProductsBySkus()` for those SKUs.
   - Convert to `RetrievedItem[]` with `requested_quantity` populated from the preset.
   - Preserve the preset's SKU order.
   - Skip `extractIntents`, `retrieveRelevant`, and `expandQueryToKeywords` entirely.
   - Build `relevantItemsContext` via the existing `buildRelevantItemsContext()` helper (no change needed — it already prints `USER REQUESTED QUANTITY`).

3. Fall through to the normal retrieval path for any non-matching message — zero impact on regular chats.

4. The LLM still receives the system prompt as-is, so it composes the answer with `[[product:SKU:QTY]]` markers, follow-ups, and tool calls (`add_to_cart`, etc.) like normal. No client-side change needed.

## Out of scope

- No DB changes, no new server fns, no UI changes in `src/routes/index.tsx`.
- No change to the streaming protocol or system prompt.
- No new tools — the LLM still uses `add_to_cart` and may still call `search_products` if it wants alternatives.
- Multilingual chip aliasing: only the exact English chip strings are matched. If we later localize the chips, the preset keys need to grow — out of scope here.

## Verification

- Click each of the 6 chips in a fresh conversation; confirm the assistant answers in ≤2s with the curated SKUs and quantities embedded as product pills.
- Type a non-chip message ("I need waterproof gloves"); confirm the existing intent-extraction / hybrid-search path still runs (check console: no `extractIntents` skipped log).
- Add-to-bundle button still works on chip responses (recommendations populate from `[[product:SKU:QTY]]` markers as before).
