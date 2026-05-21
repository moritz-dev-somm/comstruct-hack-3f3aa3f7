## Goal
Move all email-agent code out of `src/lib/` into a new root-level `/agent/` folder, and make sure it still runs against `AGENTMAIL_API_KEY` (now stored as a Cloud secret, not in `.env`).

## Files to move

```text
src/lib/agent-mail/conditions.ts        → agent/conditions.ts
src/lib/agent-mail/templates.ts         → agent/templates.ts
src/lib/agent-mail/types.ts             → agent/types.ts
src/lib/supplier-agent.functions.ts     → agent/supplier-agent.functions.ts
```

The route file `src/routes/procurement.agent.tsx` **stays put** — TanStack file-based routing requires it under `src/routes/`. Only its import path changes.

## Wiring changes

1. **tsconfig.json**
   - Extend `include` to cover the new folder: add `"agent/**/*.ts"`.
   - Add path alias: `"@agent/*": ["./agent/*"]` next to the existing `@/*` alias.

2. **Update imports**
   - `agent/supplier-agent.functions.ts`: change `./agent-mail/templates` → `./templates` (and same for `./types` / `./conditions` as needed).
   - `src/routes/procurement.agent.tsx`: change `@/lib/supplier-agent.functions` → `@agent/supplier-agent.functions`, and update the inline doc-comment paths that mention `src/lib/agent-mail/...`.

3. **Delete old files** after the move so nothing imports the stale paths.

## Secret handling

`AGENTMAIL_API_KEY` is already present as a Cloud secret (confirmed via `fetch_secrets`). The existing code reads it correctly inside the server-function handler:

```ts
const apiKey = process.env.AGENTMAIL_API_KEY;
if (!apiKey) throw new Error("AGENTMAIL_API_KEY is not configured");
```

Because this lookup happens inside `.handler()` (not at module scope), it works for runtime secrets injected by Cloud — no further change needed. Nothing reads it from `import.meta.env`, so removing it from `.env` is safe.

## Verification

- Typecheck passes after alias + include update.
- `/procurement/agent` route still renders and the "Provision inbox" / "Send email" actions execute the server functions without `AGENTMAIL_API_KEY is not configured`.

## Notes
- No business-logic changes — purely a file move + import rewrite + tsconfig tweak.
- Vite's `@lovable.dev/vite-tanstack-config` uses `tsConfigPaths`, so adding the alias in `tsconfig.json` is enough; no `vite.config.ts` edit required.
