## Goal
Add a `/login` landing page with two buttons — **Foreman** and **Supervisor** — that route into the two existing sides of the app. No real auth yet (just role selection persisted locally).

## Scope

### 1. New route `src/routes/login.tsx`
- Full-screen centered layout matching brand (petrol-teal primary, Inter), comstruct logo/wordmark on top.
- Title: "Who's signing in?"
- Two large `Card` buttons side-by-side (stacked on mobile):
  - **Foreman** — icon `HardHat`, subtitle "Order materials from the site" → on click: store role, navigate to `/` (the existing foreman/order chat home).
  - **Supervisor** — icon `ClipboardList` (or `BarChart3`), subtitle "Approvals, orders, analytics, catalog" → on click: store role, navigate to `/procurement`.
- No password / form fields for now.

### 2. Lightweight role state
- Add `src/lib/role.tsx` with a tiny context + `localStorage` persistence: `role: "foreman" | "supervisor" | null`, `setRole`, `logout`.
- Wrap app in `RoleProvider` inside `src/routes/__root.tsx` (alongside existing `CartProvider`/`OrdersProvider`).
- No route guards in this step — login is opt-in entry, deep links still work. (We can add `_authenticated` guards in a follow-up if desired.)

### 3. Minor wiring
- Add a small "Switch role" / logout link in the procurement sidebar footer (`src/routes/procurement.tsx`) and in the foreman header on `/` that clears role and returns to `/login`. Keeps the two sides discoverable.
- `/login` route head: title "Sign in — comstruct".

## Out of scope (ask if you want it)
- Real authentication (Supabase email/Google) and route protection via `_authenticated` layouts.
- Per-role permissions enforced server-side.
- Distinguishing individual users (names, avatars).

## Files touched
- new: `src/routes/login.tsx`, `src/lib/role.tsx`
- edit: `src/routes/__root.tsx` (provider), `src/routes/procurement.tsx` (switch-role link), `src/routes/index.tsx` (switch-role link in header)
