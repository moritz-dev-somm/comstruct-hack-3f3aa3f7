## Problem

In conversation mode, the bottom action bar uses `backdrop-blur` (`src/routes/index.tsx` ~line 572). CSS `backdrop-filter` creates a new containing block for `position: fixed` descendants. That means the listening overlay in `VoiceButton.tsx` and the camera/scan flow in `ScanButton.tsx`, which both use `fixed inset-0 z-[60]`, are no longer pinned to the viewport — they are pinned to the tiny bottom bar. Result: tapping the mic or scan button "renders something at the bottom of the page" instead of opening the full-screen capture UI, while the same buttons on the home page work because their ancestor has no `backdrop-filter`.

## Fix

Render the two overlays through a React portal into `document.body`, so they always escape any ancestor containing block and behave identically wherever they're triggered.

### Steps

1. `src/components/VoiceButton.tsx`
   - Wrap the `<ListeningOverlay …/>` render in `createPortal(…, document.body)`.
   - Guard for SSR (`typeof document !== "undefined"`).

2. `src/components/ScanButton.tsx`
   - Wrap the `<ScanFlow …/>` render in `createPortal(…, document.body)` with the same SSR guard.

3. Verify the bottom bar in `src/routes/index.tsx` still looks right (keep its `backdrop-blur` — no change there).

### Verification

- Open chat (start a conversation), tap the compact mic → full-screen listening overlay appears, same as on home.
- Tap the compact scan button in chat → full-screen camera/instructions flow appears.
- Home page behavior unchanged.
- No layout shift behind the bottom bar.

## Out of scope

No changes to permissions handling, transcript logic, scan API, or styling of the overlays themselves.
