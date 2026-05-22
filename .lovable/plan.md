## Goal

Currently every quantity stepper on `/` shows the qty as a read-only `<span>` between two HoldButtons. Let the user click the number and type a new quantity directly.

## Where

In `src/routes/index.tsx`, four places render the same `[−] {qty} [+]` pattern:

1. `InlineProductBubble` (chat bubble) — line ~1259
2. Product card grid — line ~1442
3. Product detail / drawer view — line ~1547
4. Cart drawer rows — line ~1798

Behavior in all four is identical: `cart.setQty(productId, n)` already exists in `src/lib/cart.tsx` and removes the item when `n <= 0`.

## Approach

Add a small `QtyInput` component (colocated in `src/routes/index.tsx` next to the other small inline components, or in `src/components/QtyInput.tsx` if cleaner) and use it in all four spots.

Behavior:
- Renders as a centered, tabular-nums number, visually matching the current `<span>` (same width / font-weight per call-site via a `className` prop) so layouts don't shift.
- Click / focus / tab into it → becomes an `<input type="text" inputMode="numeric" pattern="[0-9]*">` (text + numeric inputMode avoids browser spinners and gives mobile a number keypad).
- `onChange`: accept digits only, strip non-digits, allow temporary empty string while editing.
- `onBlur` / Enter: parse → clamp to `[0, 999]` → call `setQty`. Empty or 0 removes the item (matches existing `setQty` semantics). Escape reverts.
- Select all on focus so typing replaces the value.
- `aria-label="Quantity"`.

Props: `{ value: number; onChange: (n: number) => void; className?: string; size?: "sm" | "md" | "lg" }` — size maps to the existing width/font sizing used at each call-site (xs in chat bubble, base in cards, lg in detail view).

No change to `cart.tsx`, no change to `HoldButton`, no schema work.

## Edge cases

- Typing while a HoldButton repeat is firing: input owns focus, hold-repeat only fires on pointer events, so they don't conflict.
- Pasting "12abc" → keeps "12".
- Pasting "0" or clearing → item is removed via existing `setQty` behavior; that's the same outcome as pressing `−` to zero today.
- Max 999 prevents accidentally typed huge numbers blowing past sensible cart totals.

## Out of scope

- No new keyboard shortcut to jump to the quantity field from elsewhere.
- No unit-aware stepping (e.g. boxes of 10) — still 1-by-1 semantics.
- Quantity controls on other routes (catalog, orders) aren't on the current screen and aren't touched.
