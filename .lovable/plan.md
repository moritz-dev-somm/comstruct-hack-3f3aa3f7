# Rebrand comstruct → Swiss Modernist

Keep all functionality, copy, routes, and the comstruct name. Only the visual language changes. No wine/sommelier references, no sommelia logos.

## 1. Tokens (`src/styles.css`)

Replace the current petrol-teal palette + Inter/Chivo Mono setup with Swiss Modernist tokens. All values in `oklch` (converted from the brand HSL/hex).

- `--background` → warm off-white (`#F5F2ED`)
- `--foreground` → near-black blue-undertone (`#161A1F`)
- `--primary` → bold warm red (`#C8281E`), `--primary-foreground` white
- `--card` → `#FDFCFA`, `--card border` `#EDEBE7`
- `--border` `#E0DDD6`, `--input` matches
- `--muted` `#E7E4DD`, `--muted-foreground` `#666A6E`
- `--secondary` `#C9C5BD`, `--accent` `#EEEBE4`
- `--destructive` → blue `#1D4F9E` (per brand guide; red is reserved for CTAs)
- `--ring` matches primary red
- `--sidebar*` → `#EDEAE3` family
- `--brand` / `--brand-foreground` → re-point to primary red + white (so existing `bg-brand` usages instantly re-skin; no component edits needed)
- Chart tokens → steel-blue / warm-red / forest / amber / muted-purple
- `--radius` → `0.5rem` (so `sm 3px / md 6px / lg 9px` come out right)
- Fonts: `--font-sans` and `--font-mono` both → `'Helvetica Neue', Helvetica, Arial, sans-serif`. Brand uses one family; mono is unused in this app so we collapse it too. (Keeps any `font-mono` className from breaking the look.)
- Remove the `.dark { … }` block entirely (light-only).
- Remove the global `font-weight: 500` on body — Swiss minimalism leans on regular weight + tracking, not heavier base weight.
- Keep the glove-friendly 48px min tap target and 18px base font-size (functional, not stylistic).
- Zero box-shadow: add a base rule nulling `box-shadow` on shadcn surfaces, and rely on borders. Add `--elevate-1: rgba(0,0,0,.03)` and `--elevate-2: rgba(0,0,0,.08)` for hover/active overlays.

## 2. Root layout (`src/routes/__root.tsx`)

- Drop the Google Fonts `<link>` for Inter + Chivo Mono — Helvetica is system-installed, no webfont needed.
- Update `<title>` and meta description to neutral comstruct copy (no sommelia references; current copy is already comstruct-flavored, just sanity-check).

## 3. Component touch-ups (minimal)

The big win comes from tokens. A few spots hardcode color or rely on the teal feeling — adjust only these:

- `src/routes/login.tsx`, `src/routes/procurement.tsx`: the brand square uses `bg-brand` with a `HardHat` icon. Keep the mark but switch the square to a clean red tile with white wordmark "comstruct" — no icon-in-tile, more Swiss. (Or keep `HardHat` if you prefer — confirm in implementation; default = remove icon, just a red square + wordmark beside it.)
- Any amber/emerald status pills hardcoded in routes (e.g. `bg-amber-500/20 text-amber-700` in the procurement sidebar badge) → re-tint to neutral muted + primary text so red stays reserved for CTAs. Keep semantic colors (green = approved, amber = pending) where they encode state.
- Sweep for hardcoded hex / `text-white` / `bg-black` and replace with tokens. Quick `rg` pass; expect a handful in chat / order detail / PDF preview.
- Ensure cards use `border` instead of `shadow-*`. Replace any `shadow-sm` / `shadow-md` on Card-like elements with a 1px border.

## 4. Memory update

Replace `mem://index.md` Core line and rewrite `mem://design/brand-comstruct.md` with the new Swiss Modernist tokens so future turns don't re-introduce petrol teal.

## Out of scope

- No copy rewrites, no new routes, no business-logic changes.
- No new logo asset — text wordmark "comstruct" in Helvetica Bold is the mark.
- PDF generation (`po-pdf.ts`) keeps its existing layout; only swap the accent hex to the new red.

## Technical notes

- HSL→oklch conversion done at write-time; values above are reference hex.
- `font-mono` collapse is intentional — only a couple of spots use it (price tickers); they'll render in Helvetica and look more Swiss, not worse.
- Light-only: remove `.dark` block + the `dark:` Tailwind variants are harmless leftovers; no need to sweep them out, they just never activate.
