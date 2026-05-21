# Supplier Agent — Completion Plan

Scope per spec §1–§14. Minimal-diff: extend existing `agent/*`, webhook, and UI surfaces. No new npm deps.

## Sequencing (8 steps, each independently reviewable)

### 1. Database migration
Add to `negotiations`:
- `supplier_language text`
- `last_inbound_from text`
- `last_processed_message_id text` (idempotency)
- `security_reject_reason text`
- `clarification_count int default 0`
- `followup_count int default 0` (promote from jsonb so policy can index it cheaply; keep jsonb mirror for audit)

No new table for events — keep using `classification` jsonb + `negotiation.history`-style append in jsonb. RLS policies stay open as today (project pattern).

### 2. Pure helpers (testable, no I/O) → `agent/email-match.ts`
- `parseEmailAddress(raw)` — handles `"Name" <a@b>` and bare
- `registrableDomain(host)` — small public-suffix allowlist (`co.uk`, `com.au`, `ch`, `de`, `fr`, `it`, `com`, `net`, `org`, …); strips subdomains to eTLD+1
- `senderMatchesNegotiation(from, negotiation, supplierRow?)` — exact email OR same registrable domain on open negotiations OR domain on `suppliers` row
- `extractOrderIdFromSubject(subject)` — `[ORD-####]`
Unit tests via `bunx vitest run` in `agent/email-match.test.ts`.

### 3. Classifier extension → `agent/agent.server.ts`
Extend `ReplyClassification` with: `reply_language`, `summary_en`, `answerable_questions[]`, `unanswerable_questions[]`, `suggested_outbound` enum. Update `CLASSIFY_SYSTEM`:
- Accept any language; always emit `summary_en` in English
- Conservative verdict rules (unchanged)
- Distinguish answerable vs unanswerable questions
- Emit `suggested_outbound` so policy can default to it when conditions don't override

Backward-compat: optional fields default safely.

### 4. Outbound templates → `agent/templates.ts`
New bilingual composers mirroring `composeFollowupEmail` shape (native + English when lang≠en):
- `composeConfirmationEmail` (update existing for i18n if missing)
- `composeChecklistFollowupEmail` (rename current targeted follow-up)
- `composeClarificationRequestEmail`
- `composeAnswerQuestionsEmail` — answers built from `order_snapshot` + company block
- `composeIssuesAckEmail` — "received, routing to procurement"
- `composeDeclineAckEmail`
- `composeNudgeEmail` — localize
Pick language: `classification.reply_language` if supported, else `order_snapshot.supplier_language`, else `en`.

### 5. Policy layer → `agent/conditions.ts`
Replace ad-hoc switch with `decideAction(classification, negotiation)` returning a discriminated `AgentAction`:
```ts
type AgentAction =
  | { kind: 'send_confirmation' }
  | { kind: 'send_checklist_followup'; fields: ChecklistField[] }
  | { kind: 'send_answer_questions'; questions: string[] }
  | { kind: 'send_clarification_request' }
  | { kind: 'send_decline_ack' }
  | { kind: 'send_issues_ack' }
  | { kind: 'escalate_silent'; reason: string }
  | { kind: 'no_op'; reason: string }
```
Implements the §7 matrix using `followup_count` / `clarification_count`. Never confirms unless `verdict==='fully_confirmed' && issues.length===0 && missing_checklist.length===0`.

### 6. Webhook rewrite → `src/routes/api/public/agentmail/webhook.ts`
Replace inline branching with the pipeline from §2 architecture:
1. Idempotency: skip if `messageId === negotiation.last_processed_message_id`
2. Resolve negotiation: thread match → fallback (domain + `[ORD-####]` in subject + open status); ambiguous → `needs_user` "Unmatched supplier email"
3. `senderMatchesNegotiation`; fail → store `security_reject_reason`, return 200, no outbound
4. `classifyReply` (extended)
5. `decideAction` → execute (send via `agentMail()`, update status + counters + classification jsonb + history append)
6. On fallback match success, update `negotiations.thread_id` to new thread

### 7. Infra + env → `agent/agent.server.ts`
- `publicBaseUrl()` → `process.env.PUBLIC_APP_URL ?? "https://comstruct-hack.lovable.app"`
- `ensureAgentInbox` already returns inbox id/address; expose via a small `createServerFn` (`getAgentInboxFn`) so `/procurement/agent` hydrates from server (not orphan localStorage)
- `startNegotiationForOrder`: persist `supplier_language` on the negotiation row from `suppliers.language` (lookup by email)

### 8. UI
- **orders.tsx / procurement.orders.$orderId.tsx / orders.$orderId.track.tsx**: render per-negotiation card with `derived status`, `summary_en`, `needs_user_reason`, `last_reply_at`, last agent action label (derived from `classification.suggested_outbound` / last status transition). Track page: "Order accepted" turns done when any negotiation reaches `confirmed`.
- **procurement.agent.tsx**: on mount, if no localStorage inbox, fetch via new `getAgentInboxFn`. Show "Unmatched" and "Rejected (domain)" badges on threads whose latest negotiation row has `security_reject_reason` or is unmatched.

## Out of scope (explicit)
- No `negotiation_events` audit table — using existing jsonb fields.
- No new translation API — classifier does multilingual natively.
- No auth changes; RLS stays public per project pattern.
- Hydration warnings in orders page (separate issue — `new Date().toLocaleString()` SSR mismatch) tracked separately unless you want me to fix in same pass.

## Technical notes
- Cloudflare Worker runtime: keep using `crypto.subtle` (already there) for HMAC; no Node `crypto`.
- All AI calls keep going through Lovable AI Gateway with `openai/gpt-5-mini`.
- AgentMail SDK send: reuse existing `am.inboxes.messages.send(...)` shape from `composeOrderEmail` send site.
- Idempotency key is per-message; webhook returns 200 for all "handled" outcomes (including rejected senders) to avoid Svix retry storms.

## Tests
- `agent/email-match.test.ts` for domain/sender matching (exact, subdomain, foreign domain, malformed)
- `agent/conditions.test.ts` for policy matrix (8 rows × counter states)
Run with `bunx vitest run agent/`.

## Estimated diff
~6 files edited, ~3 files created, 1 migration. Total ~700 LOC net new.

---

Confirm and I'll execute steps 1→8 in order, pausing only at the migration approval prompt.