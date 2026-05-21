# Faster model + looser selection cap

## Model choice

Switch the default from `google/gemini-2.5-pro` to **`openai/gpt-5-mini`** via the **Lovable AI Gateway** (the user's own `OPENAI_API_KEY` will be used since it's set, but specifically the mini variant).

Wait — the user said "use openai mini". The current code routes to `https://api.openai.com/v1/chat/completions` with `gpt-4o` when `OPENAI_API_KEY` is present. The OpenAI "mini" equivalent is **`gpt-4o-mini`**.

Tier comparison (OpenAI direct API):
- `gpt-4o` — strongest reasoning, slower, more expensive (current fallback when OPENAI_API_KEY is set)
- **`gpt-4o-mini` — ~10× cheaper, ~2× faster than gpt-4o, strong enough for product matching from a catalog. Best fit for the "middle ground" the user wants.**
- `o3-mini` — faster/cheaper reasoning model but different behavior (not a direct chat replacement)

So: change the OpenAI branch model from `gpt-4o` to **`gpt-4o-mini`**.

## Context window — will the catalog fit?

Yes, easily. `gpt-4o-mini` supports a **128,000-token** context window.

Current catalog summary emits per product: SKU, name, price/unit, supplier, flags, description, attributes, keywords, use-cases. Roughly 400–700 chars per enriched product. At ~500 products that's ~250 KB ≈ **~70k tokens** — well under half the limit.

No trimming needed today.

## Loosen the SKU cap

Update the system prompt rule from "Pick 1–5 specific catalog items" to **"Pick 1–20 specific catalog items"**, and reword to encourage a complete bill of materials (fastener + plug + tool + consumables) rather than a single best item.

No code change needed for `add_to_cart` — the model already calls it once per SKU in a loop.

## Technical changes

Single file: `src/routes/api/chat.ts`

1. In `callGateway()`: change the OpenAI branch model from `"gpt-4o"` to `"gpt-4o-mini"`.
2. In `SYSTEM_PROMPT_BASE`: change rule 2 from `"Pick 1–5 specific catalog items"` to `"Pick 1–20 specific catalog items by SKU + name that solve it, with sensible quantities. Pick a complete bill of materials when needed (e.g. fastener + plug + tool + consumables)."`

## Out of scope

- Not touching the Lovable Gateway fallback model (`google/gemini-2.5-pro`) — it only activates when `OPENAI_API_KEY` is absent.
- Not changing tools or the €200 approval rule.
