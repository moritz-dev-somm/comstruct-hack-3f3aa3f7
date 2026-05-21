## Why you see "No agent inbox configured yet"

`src/routes/procurement.agent.tsx` reads the agent inbox from **`localStorage["comstruct-agent-inbox-v1"]`** only (line 19–31, 176). Nothing in the page ever writes to that key — the inbox is actually provisioned server-side and stored in the `agent_settings` table.

The DB already has it:

```
id        | inbox_id                            | inbox_address                       | has_webhook
singleton | comstruct-procurement@agentmail.to  | comstruct-procurement@agentmail.to  | t
```

So in any browser where you never went through the (now-removed) provisioning step, `loadInbox()` returns `null`, the page renders the empty state, and the message list / negotiations queries are disabled (`enabled: !!inbox`). The logs you see come from the webhook ingesting supplier email server-side, which has no dependency on your browser's localStorage — that's why logs exist while the panel looks empty.

A second smaller issue: even on a browser that does have the localStorage entry, `inbox` is captured once with `useState(() => loadInbox())` and never refreshed, so a user that signs in on a fresh device is stuck on the empty state.

## Fix (`src/routes/procurement.agent.tsx`)

1. Replace the localStorage-only `loadInbox()` source with a server fetch:
   - Call the existing `ensureAgentInbox` server fn (already exported from `src/lib/supplier-agent.functions.ts`) via `useServerFn` + `useQuery` on mount.
   - On success (`{ ok: true, inboxId, address }`), use that as the `inbox` value powering the messages/negotiations queries.
   - Keep writing the result to `localStorage["comstruct-agent-inbox-v1"]` as a warm cache so subsequent loads can show data immediately while the server query revalidates.
2. While the inbox query is loading, show a small "Loading agent inbox…" state instead of the misleading "No agent inbox configured yet."
3. Only show the "No agent inbox configured yet" message when the server returns `{ ok: false }` — and surface the returned `error` underneath so future provisioning failures are visible.
4. Remove the unused `StoredInbox` write path assumption from the comment block; keep the shape but treat the server response as source of truth.

## Out of scope

- No backend, DB, RLS, or `agent_settings` schema changes — the row is already there and correct.
- No webhook / negotiation logic changes.
- No styling overhaul of the agent panel.

## Verification

- Open `/procurement/agent` in a fresh browser (or after clearing localStorage): the panel hydrates from the server, lists existing conversations, and never shows "No agent inbox configured yet".
- Temporarily break `ensureAgentInbox` (e.g. revoke `AGENTMAIL_API_KEY` in a local test): the panel surfaces the error message instead of silently showing the empty state.
