## Changes to `src/routes/api/chat.ts`

1. **Model** (line 197): change OpenAI model from `"gpt-4o"` to `"gpt-4o-mini"`. Lovable Gateway fallback stays on `google/gemini-2.5-pro`.

2. **SKU cap** (line 121 of system prompt): change
   - from: `Pick 1–5 specific catalog items by SKU + name that solve it, with sensible quantities.`
   - to: `Pick 1–20 specific catalog items by SKU + name that together solve it, with sensible quantities. Aim for a complete bill of materials (e.g. fastener + plug + tool + consumables) rather than the bare minimum.`

No other changes — tools, €200 approval rule, catalog summary, and streaming logic stay identical.
