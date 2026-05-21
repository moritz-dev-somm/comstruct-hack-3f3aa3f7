# Why "I need nails" misses the catalog

The catalog has two perfectly fine rows (`C011 60 mm Nail`, `C012 Nail 80 mm`), embeddings are populated on every product, and our per-keyword hybrid search runs for each intent. So why does the model say "tell me more about the job"?

Three independent gates are dropping nails:

1. **Plural / language mismatch in `hybrid_search_materials` keyword check.** The SQL only matches the keyword filter against `name`, `description`, and `keywords` (the German-leaning columns). `ILIKE '%nails%'` against the German `name='Nagel 80mm'` and English-but-singular `keywords={nail,80mm}` returns 0. The English columns (`name_en`, `description_en`, `keywords_en`) are never consulted.
2. **Hard 0.3 cosine-similarity gate.** When the keyword score is 0 (see #1), a row only survives if `similarity > 0.3`. A 1-word query like "nails" produces a low-information embedding, so borderline matches get culled and the RPC returns `[]`.
3. **Wrong `category_filter` from intent extraction.** `extractIntents` is encouraged to pick a category, and the small Gemini Flash Lite model sometimes picks the wrong one (or "Other"). Category filter is a hard `WHERE`, so a misclassification removes nails entirely. When that happens, the ILIKE fallback in `searchProducts` also misses ("Nagel" doesn't contain "nails").

When all three combine, the system prompt gets `(no catalog items matched this turn)`, and the model falls back to asking the user to clarify — exactly what you're seeing.

## Fix

Four small, surgical changes. Nothing about the chat UX, recommendation rendering, or hybrid search at the bottom of the chat changes.

### 1. Make `hybrid_search_materials` bilingual + plural-tolerant (SQL migration)

Update the RPC so `keyword_score` is computed over both language sets and tolerates a singular/plural mismatch:

- Match each keyword against `name`, `name_en`, `description`, `description_en`, `keywords`, `keywords_en`.
- Normalize: lowercase both sides; if a keyword ends in `s` and is >3 chars, also try the singular form (cheap, no extensions needed).
- Drop the `similarity > 0.3` gate. Replace with `similarity > 0.05` so the RPC always returns up to `match_count` rows ranked by `hybrid_score`. The application layer (and the LLM) decide relevance, not the database.

### 2. Bias `extractIntents` toward leaving `category_filter` null

In `src/routes/api/chat.ts`, tweak the system prompt for `extractIntents` to: "Set `category_filter` only when the user explicitly names a category or the item is unambiguous (e.g. 'safety helmet' → Safety). When in doubt, leave it null." This removes the most common false-exclusion without touching anything else.

### 3. Stop the LLM from asking when items exist

In the main chat system prompt (`SYSTEM_PROMPT_BASE` in `src/routes/api/chat.ts`), add one sentence near the "Pick 1-20 specific catalog items" rule:

> If the relevant catalog items below contain anything plausibly matching the user's request, recommend them with sensible defaults — do NOT ask clarifying questions. Only ask for clarification when the catalog list is empty AND `search_products` also returns nothing.

This makes "I need nails" reliably resolve to "Here are [[product:C011:100]] and [[product:C012:50]] — 60 mm for studwork, 80 mm for formwork. Which length?" instead of an open question.

### 4. Belt-and-braces: lowercase the keyword filter in the chat retrieval call

In `retrieveRelevant` (chat.ts), pass `intent.q.toLowerCase()` as the keyword filter, since the SQL `ILIKE` is already case-insensitive but we'll be doing the singular-trim in SQL on the lowered form.

## Files touched

- `supabase/migrations/<new>.sql` — replace `hybrid_search_materials` with the bilingual / plural-tolerant version, threshold lowered to 0.05.
- `src/routes/api/chat.ts` — two prompt edits (extractIntents + SYSTEM_PROMPT_BASE) and the `.toLowerCase()` on the keyword filter.

## What this does NOT change

- The end-of-chat hybrid catalog search (`/api/hybrid-search`) keeps its current behavior and now benefits from the same RPC improvements automatically.
- Embeddings, the embeddings model, and the `search_document` trigger stay as-is.
- No UI changes.

## Expected outcome

"I need nails", "Nägel", "brauche Nägel", "screws", "Schrauben" — single-word foreman queries — will return catalog rows on the first turn, and the assistant will recommend defaults instead of interrogating the user.
