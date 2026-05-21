# Fix: Quick Reorder can't add items to cart

## Why it's broken

The three "past orders" at the bottom of the landing page are defined as English display strings:

```ts
items: ["Drywall screws TX25", "Gypsum board 12.5mm", "Joint tape 50m", "Corner bead"]
```

When you click **Add all to cart**, the handler tries to match each string against `products` by substring (in either direction). The live catalog has different names (often German, e.g. `Nagel 80mm`) and uses SKUs like `C001`, so no match is ever found and the toast says *"No matching products found in catalog"*. Nothing gets added.

## Fix

Switch the Quick Reorder data model from display strings to **real catalog SKUs**, and derive the visible item names from the live products list at render time. That guarantees every "Add all" click resolves cleanly.

### Changes (all in `src/routes/index.tsx`)

1. **Change the `QuickOrder` type** to carry SKUs, not display strings:
   ```ts
   type QuickOrder = {
     id: string;
     date: string;
     skus: string[];   // real catalog SKUs (C001, C014, ...)
     total: string;
   };
   ```

2. **Rewrite the three dummy orders** to use SKUs that actually exist in the catalog. Each order picks 3–4 SKUs that fit its theme:
   - `#E-4821` (drywall/finishing job) — fastener + driver + consumable SKUs
   - `#E-4789` (PPE refresh) — helmet, gloves, mask, glasses SKUs
   - `#E-4755` (anchoring/sealing) — anchor, sealant, gun SKUs

   To stay catalog-agnostic and avoid hardcoding SKUs that may not exist, build the three orders **dynamically from the live `products` list** inside `Home()`:
   - Pick the first N products from a few relevant categories (`Fasteners`, `Safety`, `Sealing` / `Anchors`).
   - Compute the real total from `product.price`.
   - Skip the Quick Reorder block entirely while `products` is still empty (loading).

3. **Render order items from the resolved products**:
   ```ts
   {order.skus
     .map((sku) => products.find((p) => p.sku === sku)?.name)
     .filter(Boolean)
     .slice(0, 3)
     .join(" · ")}
   ```
   No more "Drywall screws TX25" placeholder text — the user sees actual catalog names.

4. **Rewrite `onAddQuickOrder`** to take SKUs and resolve via `products.find(p => p.sku === sku)` — a direct, reliable lookup. Drop the substring matching entirely.

5. **Remove the now-unused module-level `QUICK_REORDER_ORDERS` constant** (the in-component block is the source of truth).

### Result

- Clicking **Add all to cart** on any Quick Reorder card adds every item to the cart and opens the cart drawer.
- The displayed product names and total match what's actually in the catalog.
- If the catalog is empty / still loading, the Quick Reorder block doesn't render (no broken cards).

## Out of scope

- Persisting real past orders to the DB — these remain demo orders, just wired to real catalog SKUs.
- Any styling / layout changes.
