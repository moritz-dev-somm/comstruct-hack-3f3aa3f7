## Problem

"Add the bundle to cart" sends the literal text `"Add the bundle to cart"` back to the chat model. The model has no reliable notion of "the bundle", so it sometimes apologises, re-searches the catalog, or asks follow-up questions instead of adding anything — exactly the failure seen in the session replay (the AI replied it "cannot find the SKU for the rubber hammer bundle" and re-ran a search).

The recommended items the user sees in "Recommended for this job" are already tracked client-side as `recommendedIds` (populated from inline `[[product:SKU:QTY]]` tokens during streaming). The button should use that state directly instead of round-tripping through the LLM.

## Fix (`src/routes/index.tsx`)

1. **Add quantities to recommendations state.** Change `recommendedIds: string[]` to a structure that keeps the suggested qty per SKU (e.g. `recommendedItems: { sku: string; qty: number }[]`). Update the two places that populate it:
   - The inline `[[product:SKU:QTY]]` regex parse during the `delta` stream event (line ~350) — capture group 2 is already the qty; default to 1 when missing.
   - The `recommend` stream event (line ~363) — keep skus, default qty 1.
   Persist the new shape in localStorage and keep a thin `recommendedIds` derived array for the existing UI that just needs SKUs (line 274, 561, 826, 840, 848).

2. **Replace the button's handler.** In `ChatView` (line 868), instead of `onSuggestion("Add the bundle to cart")`, call a new prop `onAddBundle()` that:
   - Looks up each recommended item in `allProducts`.
   - Calls `cart.add({ productId, name, price, qty, category, unit, supplier })` for each (same shape as line 399).
   - Shows one toast: `Added N items to cart`.
   - Opens the cart drawer (`setCartOpen(true)`).
   - No LLM call.

3. **Hide the button when there is nothing to add.** Only render the "Add the bundle to cart" suggestion when `recommendedItems.length > 0`. Today it renders after every assistant turn, even when the bundle is empty.

4. **Wire `onAddBundle` from the parent** (the `Home` component, around line 561) and pass `cart` / `setCartOpen` through.

## Out of scope

- No changes to the streaming protocol, backend chat route, or the LLM system prompt — the failure is purely a client-side UX bug.
- Quantity merging rules in the cart stay as-is (`cart.add` already increments existing line items).
- The unrelated hydration warning in the runtime logs is not touched.

## Verification

- Trigger a chat that produces `[[product:...]]` recommendations, click "Add the bundle to cart": all recommended items appear in the cart with the suggested quantities, cart drawer opens, toast fires, no new assistant message is generated.
- Start a fresh chat with no recommendations yet: the "Add the bundle to cart" button is not shown.
- Refresh the page mid-session: recommendations + quantities are restored from localStorage and the button still works.
