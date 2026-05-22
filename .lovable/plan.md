## Overview
Add a non-functional language selector dropdown in the sticky header of the homepage (`/`). It will display European languages with their country flag emojis. No i18n or translation logic is wired — purely visual/placeholder.

## Where
The header lives in `src/routes/index.tsx` inside the `<header>` block (lines ~498–550). The selector will sit between the left-side logo and the right-side action buttons (Orders, Settings, Switch user, Cart).

## What to build

### 1. New component: `src/components/LanguageSelector.tsx`
- Uses the existing shadcn `DropdownMenu` primitives from `@/components/ui/dropdown-menu`.
- Trigger button shows a globe icon (`Globe` from `lucide-react`) + the currently selected language code (e.g. "EN"), styled to match the existing header buttons: rounded-full border, hover:bg-accent, h-10.
- Dropdown content lists European languages. Each item shows:
  - Country flag emoji (e.g. 🇬🇧)
  - Full language name (e.g. "English")
  - Optional: country code in muted text (e.g. "UK")
- Selection state is tracked locally with `useState` (default: "English" / 🇬🇧). Selecting an item updates the label and closes the menu — no other side effects.
- Scrollable list inside the dropdown (max-height + overflow-y-auto) since there are ~30 languages.
- Languages to include: English, Deutsch, Français, Italiano, Español, Português, Nederlands, Polski, Svenska, Norsk, Dansk, Suomi, Čeština, Magyar, Română, Ελληνικά, Български, Hrvatski, Slovenščina, Slovenčina, Lietuvių, Latviešu, Eesti, Українська, Русский, Српски, Bosanski, Shqip, Македонски, Malti, Gaeilge, Cymraeg, Íslenska, Lëtzebuergesch, Türkçe, Беларуская.

### 2. Wire into header
In `src/routes/index.tsx`:
- Import `<LanguageSelector />`.
- Place it in the right-side flex row (after the logo group, before or among the existing action buttons).
- Ensure it uses the same visual weight/spacing as adjacent header buttons.

## Design notes
- Light theme only (project has no dark mode).
- No box shadows — the dropdown menu already uses borders + subtle background which fits the design system.
- Keep the same border radius and sizing conventions as existing header buttons.
- Use design tokens: `bg-background`, `text-foreground`, `border-border`, `hover:bg-accent`, `text-muted-foreground`.