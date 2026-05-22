# Declutter foreman top header

## Goal
The foreman page header (`src/routes/index.tsx`) is overcrowded. Move the project/site dropdown (Rämistrasse etc.), the Orders link, and the Switch user button into a left-side foldout drawer triggered by a burger icon. Keep only: burger, logo, language selector, and cart in the top bar.

## New top bar layout
```text
[≡] [logo]                                    [lang] [🛒 cart]
```

## Drawer (slides in from left)
Opens when burger is tapped. Contains, stacked vertically:

- "Current site" label + site dropdown (same `Select` with the 5 Strasse options)
- "My orders" link (navigates to `/orders`)
- "Switch user" button (calls `logout()` then navigates to `/login`)

Drawer auto-closes after selecting a site, clicking Orders, or switching user.

## Implementation notes (technical)
- Use existing shadcn `Sheet` component (`@/components/ui/sheet`) with `side="left"` — already in the project (`src/components/ui/sheet.tsx`).
- Add local `const [menuOpen, setMenuOpen] = useState(false)` in `FloEntryInner`.
- Replace the current header block (lines ~506–568 in `src/routes/index.tsx`):
  - Left cluster: burger `<Button variant="ghost" size="icon">` with `Menu` icon from lucide + logo button.
  - Right cluster: `<LanguageSelector />` + cart button only.
- Move the site `Select` and Orders/Switch-user buttons into `<SheetContent side="left">`.
- No business logic changes — same handlers, same state (`project`, `setProject`, `logout`, `navigate`).
- Scope: only the foreman header in `src/routes/index.tsx`. Other roles' headers (procurement, agent) untouched.
