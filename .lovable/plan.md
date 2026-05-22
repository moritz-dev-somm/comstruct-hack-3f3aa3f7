# Make the login page pro-grade

## Goal
Replace the current basic single-column login with a confident, brand-forward sign-in screen that feels like the entry point of a serious B2B procurement product. Use the real comstruct logo (already in `src/assets/comstruct-logo.png`), the brand wine red, and the existing construction icon set.

## Layout — split screen (desktop), single column (mobile)

```text
┌──────────────────────────┬─────────────────────────┐
│  BRAND PANEL (left, 55%) │  AUTH PANEL (right)     │
│                          │                         │
│  [comstruct logo]        │   Sign in               │
│                          │   one-line subtitle     │
│  Big quiet headline      │                         │
│  "Order C-materials in   │   [ Foreman | Super- ]  │
│   plain language."       │     role segmented      │
│                          │                         │
│  3 small feature rows    │   Username              │
│  with line icons:        │   Password              │
│   · Voice & scan         │                         │
│   · AI supplier agent    │   [ Sign in →    ]      │
│   · Live order tracking  │                         │
│                          │   demo creds chip       │
│  wine-red bg + dot field │   footer line           │
└──────────────────────────┴─────────────────────────┘
```

Mobile (`< md`): brand panel collapses into a compact top band (logo + one-line tagline) above the auth card.

## Brand panel
- Background: brand wine red (`bg-brand`), brand-foreground text, with the existing semi-transparent dot field overlay (re-use the `dot-bg` pattern but inverted to read on red — implemented with a `radial-gradient` of `--brand-foreground` at low alpha).
- comstruct logo (`comstructLogo` import) at top-left, ~h-9.
- Headline (Helvetica Neue, large, tight tracking, ~3rem on desktop): "Order C-materials in plain language."
- Three feature rows underneath, each: small `IconTile tone="light"` from `construction-icons.tsx` (e.g. `BlueprintIcon`, `GearIcon`, `CompassIcon`) + 1-line label + faint subline.
- Subtle vertical brand-foreground hairline accent on the right edge.

## Auth panel (right)
- Plain near-white surface (no card border — the page already has `dot-bg`; let it breathe).
- Inside, max-w-sm column, centered vertically.
- Heading: "Sign in" + muted "Choose your role to continue".
- Role selector becomes a clean segmented control (two pills inside a rounded `bg-muted` track) instead of the current big tile pair — feels more pro. Each pill shows icon + role name only; the description moves up to live under the heading and swaps per role.
- Inputs: keep `Input` + `Label` but tighten — h-11, monospace caret feel, focus ring uses brand color.
- Primary CTA: full-width brand button "Sign in" with subtle right-arrow `ArrowRight` icon.
- Below the form, a single muted line with the auto-filled demo credentials shown as a small tag ("Demo: foreman / foreman") so it's obvious this is a demo without cluttering the form.
- Footer: tiny, centered "comstruct · construction procurement, simplified" + version-style monospace timestamp on the right (purely decorative, gives the "serious product" feel).

## Technical notes
- File: `src/routes/login.tsx` only.
- Import `comstructLogo` from `@/assets/comstruct-logo.png`, and `BlueprintIcon`, `GearIcon`, `CompassIcon`, `IconTile` from `@/components/construction-icons`.
- Add `ArrowRight` to the existing lucide import.
- No new dependencies. No business logic changes — same `handleSubmit`, same `signIn`, same `Route` validation.
- Respect brand rules: no dark mode, no box-shadows, semantic tokens only (`bg-brand`, `text-brand-foreground`, `border-border`, `bg-card`, `bg-muted`).
- Keep keyboard accessibility: segmented control uses `role="tablist"` / `role="tab"` like today; labels stay tied to inputs.

## Out of scope
- Any change to `useRole`, `DEMO_USERS`, or routing.
- No real auth provider, no SSO buttons (this is a demo login).
- No image generation — uses existing logo + existing SVG construction icons only.
