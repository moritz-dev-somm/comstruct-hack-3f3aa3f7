
## Login pages for Foreman and Supervisor

Today `/login` is a one-click role picker — no credentials, no form. We'll turn it into a proper sign-in experience while keeping the demo frictionless: a form with username + password, fields pre-filled with the correct demo credentials so anyone can hit "Sign in" and land in the right workspace.

### UX

`/login` becomes the entry point with two role tabs:

```text
┌─────────────────────────────────────────┐
│         Sign in to comstruct            │
│                                         │
│   [ Foreman ]  [ Supervisor ]           │  ← tabs
│                                         │
│   Username  [ marco.foreman          ]  │
│   Password  [ ••••••••••••           ]  │
│                                         │
│   [        Sign in        ]             │
│                                         │
│   Demo credentials are pre-filled.      │
└─────────────────────────────────────────┘
```

- Switching tabs swaps the pre-filled credentials (and the headline / subtitle / icon).
- Pressing **Sign in** validates against the demo credentials, then routes:
  - Foreman → `/`
  - Supervisor → `/procurement`
- Wrong credentials show an inline error (`Invalid username or password`).
- A subtle hint below the form explains the demo creds are pre-filled so reviewers don't second-guess it.

### Demo credentials

Hardcoded in `src/lib/role.tsx` (single source of truth, no backend needed — this is a demo):

| Role        | Username           | Password         |
| ----------- | ------------------ | ---------------- |
| Foreman     | `marco.foreman`    | `comstruct-demo` |
| Supervisor  | `lena.supervisor`  | `comstruct-demo` |

### Auth model

This is a frontend-only demo session — we keep using the existing `RoleProvider` + `localStorage` (`comstruct-role`). No Supabase Auth, no DB changes. We extend `RoleProvider` with a tiny `signIn(username, password)` helper that:

1. Looks up the credentials in a local `DEMO_USERS` map.
2. On match, sets the role and returns `{ ok: true, role }`.
3. On mismatch, returns `{ ok: false }`.

The existing `logout()` and protected-route redirects (e.g. `index.tsx` sending unauthenticated users to `/login`, `procurement.tsx` doing the same for non-supervisors) keep working unchanged.

### Files

- **`src/lib/role.tsx`** — add `DEMO_USERS` map + `signIn(username, password)` method on the context. Keep `setRole` for backward compatibility (still used internally).
- **`src/routes/login.tsx`** — rewrite as a real form:
  - `useState` for `tab` (`"foreman" | "supervisor"`), `username`, `password`, `error`, `submitting`.
  - `useEffect` resets `username` / `password` to the demo values whenever `tab` changes.
  - Tabs styled with brand tokens (no custom hex — uses `bg-brand`, `text-brand-foreground`, etc.).
  - Form uses existing shadcn `Input` + `Button` if available, otherwise the same plain tailwind components already used on this page.
  - If a `redirect` search param is present (TanStack `validateSearch`), navigate there after success instead of the role's default landing.
  - Submitting state with a spinner so it feels like a real sign-in (200ms artificial delay).
  - Head metadata updated: `Sign in — comstruct` title, description.

### Verification

- Visit `/login` → form shows with foreman pre-filled.
- Click **Sign in** → lands on `/` as foreman.
- Logout (existing `LogOut` button in header) → back to `/login`.
- Switch to **Supervisor** tab → fields auto-fill with supervisor creds → **Sign in** → lands on `/procurement`.
- Clear the password and submit → inline error appears.
- Refresh after sign-in → still signed in (localStorage), no redirect to `/login`.
