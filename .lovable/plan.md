# Keep "Switch user" visible on every procurement tab

## Root cause

In `src/routes/procurement.tsx` the procurement layout is:

```text
<div min-h-screen flex>
  <aside hidden md:flex flex-col>   ← sidebar
    [logo + project picker]
    <nav flex-1>...links...</nav>
    [Switch user]                    ← pinned to bottom of the sidebar
  </aside>
  <main flex-1>...page...</main>
</div>
```

The outer flex row has no bounded height, so it stretches to fit `main`. On tabs whose content is taller than the viewport — Orders (long table), Analytics (charts), Approval rules — the aside grows with it. The Switch user block sits at the bottom of that grown aside, which is now below the fold. Pages with short content (Approvals, Agent, Catalog) happen to fit the viewport, so the button stays visible. That's why it looks like it "disappears in some tabs".

## Fix

Make the sidebar viewport-bounded and sticky so its bottom stays in view regardless of how tall the page is.

In `src/routes/procurement.tsx`, change the `<aside>` className from:

```
w-60 shrink-0 border-r bg-card hidden md:flex flex-col
```

to:

```
w-60 shrink-0 border-r bg-card hidden md:flex flex-col sticky top-0 h-screen
```

And add `overflow-y-auto` to the inner `<nav>` so a very long nav list scrolls inside the sidebar instead of pushing the footer off-screen.

That's the entire change. No layout shift on short pages, and on long pages the Switch user button is always pinned to the bottom of the viewport.

## Out of scope

- No changes to roles, auth, or the SwitchUserButton component itself.
- No changes to mobile (the mobile header already keeps the button in a fixed top bar).
- No changes to child route files — they don't render their own headers and aren't responsible for the bug.
