## Goal

Replace the static CSS dot field on `body` with an interactive version: dots stay muted by default and brighten in a soft radius around the cursor (and touch points).

## Approach

Use a fixed full-viewport `<canvas>` overlay that renders the dot grid in JS. Canvas is the right tool here — CSS gradients can't vary opacity per-dot based on cursor distance, and a canvas at this density (~24px grid) is essentially free on modern hardware. The existing CSS body dots are removed so dots don't double up.

### 1. New component: `src/components/InteractiveDotField.tsx`

- Renders a `<canvas>` fixed to the viewport, `pointer-events: none`, `z-index: 0`, behind app content.
- On mount: size canvas to `window.innerWidth × innerHeight × devicePixelRatio`, listen for `resize`.
- Listens to `mousemove`, `mouseleave`, `touchmove`, `touchend` on `window` to track the active point (or `null` when away).
- Uses `requestAnimationFrame` to redraw. Dots laid out on a fixed grid (~22px spacing). For each dot:
  - distance `d` from cursor → factor `f = max(0, 1 - d/radius)` with radius ~140px, smoothed (`f * f * (3 - 2f)`).
  - alpha = `lerp(0.16, 0.95, f)`; radius = `lerp(0.9px, 1.6px, f)`.
  - color: `rgba(var(--brand-rgb), alpha)` read once from `:root`.
- When cursor is absent, draws all dots at base alpha (matches current look exactly).
- Respects `prefers-reduced-motion`: skip the rAF loop and only redraw on actual move events (no idle redraws).

### 2. `src/styles.css`

Remove the `background-image: radial-gradient(...)` + `background-size` + `background-attachment` lines from the `body` rule (lines 146–153). Keep `--brand-rgb` and the `.dot-bg` / `.dot-bg-strong` utility classes — those are used on local panels, not the body.

### 3. `src/routes/__root.tsx`

In `RootComponent`, mount `<InteractiveDotField />` as the first child inside `QueryClientProvider` so it lives behind all routes. App content already sits in normal flow above it.

## Technical notes

- The canvas reads `--brand-rgb` from `getComputedStyle(document.documentElement)` once on mount, so it stays in sync with the token.
- `pointer-events: none` ensures the overlay never intercepts clicks/scroll.
- No SSR flash: the canvas is a blank fixed layer until React hydrates, which is visually identical to the dot field appearing — and the page background is already light, so there's nothing jarring.
- One global instance only — keeps it cheap.

## Files touched

- **Add** `src/components/InteractiveDotField.tsx`
- **Edit** `src/styles.css` (remove body dot background rules)
- **Edit** `src/routes/__root.tsx` (mount the component)