
## 1. Bilingual agent disclosure

**Where:** `agent/templates.ts`

Today `AGENT_DISCLOSURE_TEXT` / `AGENT_DISCLOSURE_HTML` are a single English string. `assembleBilingual` appends it once at the very bottom of both the text and HTML body, so the German/French/Italian half of every email ends with an English-only disclaimer.

**Change:**
- Replace the two constants with a lookup table:
  ```ts
  const DISCLOSURE: Record<SupplierLanguage, string> = {
    en: `Sent automatically by ${COMPANY.name}'s AI procurement agent.`,
    de: `Automatisch gesendet vom KI-Beschaffungsagenten der ${COMPANY.name}.`,
    fr: `Envoyé automatiquement par l'agent IA d'approvisionnement de ${COMPANY.name}.`,
    it: `Inviato automaticamente dall'agente IA per gli acquisti di ${COMPANY.name}.`,
  };
  ```
- In `assembleBilingual`, render the English disclosure under the English block and the native-language disclosure under the native block (so each half is self-contained). For `language === "en"` keep the single English line.
- Mirror the same change in the HTML wrapper (small italic `<p>` under each block).

No call-site changes needed — every template already routes through `assembleBilingual` with the language.

## 2. Root cause of missed answers

The classifier already has thread context, but recognition still fails. The root cause is **information loss between turns**, not a prompt-tuning issue:

1. **Classifier sees only the latest reply text + a short summary of prior facts.** The actual prior supplier emails are never re-sent to the model. If turn N-1 was misclassified (e.g. it missed a "ships next Tuesday" buried in a quoted block), that fact is permanently absent from `prior_answers`, and turn N can never recover it.
2. **`open_questions` are stored in whatever language the model emitted in `unclear_points`** (often the supplier's language for clarification emails). The classifier prompt instructs the model to copy them **verbatim** into `answered_open_questions`. When language and phrasing drift between turns, the verbatim match collapses to `[]` and we falsely conclude "still open".
3. **Single-pass JSON with `response_format: json_object`** is noisier than function calling. The model occasionally drops `answered_open_questions` entirely or returns `still_open_questions` as a paraphrase that doesn't match the stored strings, so the webhook treats every question as unanswered.
4. **Short / implicit replies** ("ok", "passt", "compris") are correctly described as ambiguous, but with no anchor to the open question they default to `unclear` → another clarification email.

### Fix (no new infra, two LLM calls per inbound)

**A. Preserve raw thread in DB**, not just summary bullets.
- Add a `thread_messages` JSON column on `negotiations` storing `{role: "agent"|"supplier", lang, text, at}[]` (cap last 10 turns).
- Webhook appends the inbound text to `thread_messages` before classifying, and appends every outbound after sending.

**B. Send the raw thread to the classifier.**
- Extend `ThreadContext` with `transcript: ThreadMessage[]`.
- Update `CLASSIFY_SYSTEM` + user prompt to include the full transcript above `LATEST SUPPLIER REPLY`. This is the single biggest recall win: the model can re-derive facts the previous pass missed.

**C. Stop relying on verbatim string matching for open questions.**
- Give each open question a stable `id` (`q_<uuid>`) and store `open_questions: {id, text_en, text_native}[]`.
- Pass `{id, text_en}` to the classifier; ask it to return `answered_ids` / `still_open_ids`. IDs are language-agnostic and survive paraphrase.

**D. Add a dedicated second-pass "answer-check" LLM call** (one call, one prompt, all open questions at once). After the main classifier returns, if `still_open_ids` is non-empty, run a focused recall pass:
- Inputs: list of `{id, text_en}` + the full transcript + the latest reply.
- Use function calling (`tool_choice: "function"`) with a schema:
  ```json
  { "answered": [{ "id": "q_…", "evidence": "<quoted phrase>", "confidence": 0..1 }] }
  ```
- Use `openai/gpt-5` (stronger recall than `gpt-5-mini`) and `reasoning: { effort: "low" }`.
- Merge: any `confidence >= 0.6` moves the id from `still_open_ids` to `answered_ids` and the `evidence` string is appended to `prior_answers`.

**E. Switch the main classifier from `response_format: json_object` to tool-calling** with the same schema it already emits. Eliminates the "model dropped a key" failure mode that silently regresses state.

### Does this need an LLM call?

Yes — the recognition problem is fundamentally semantic ("does this German sentence answer 'Earliest delivery date you can commit to?'"). Regex/keyword logic will keep producing the same false negatives. The cost is bounded: one extra `gpt-5` call only fires when the first pass reports unresolved questions, which is exactly the case the user is complaining about.

## Technical summary

Files touched:
- `agent/templates.ts` — per-language `DISCLOSURE`, dual-render in `assembleBilingual`.
- `agent/agent.server.ts` — `ThreadContext.transcript`, IDs for open questions, switch to tool-calling, new `verifyAnsweredQuestions()` second-pass function.
- `agent/conditions.ts` — accept `still_open_ids` (just length check), no policy change.
- `src/routes/api/public/agentmail/webhook.ts` — append to `thread_messages`, build open-question objects with IDs, merge second-pass results into `open_questions` + `prior_answers`.
- New Supabase migration: add `thread_messages jsonb default '[]'::jsonb` to `negotiations`; change `classification.open_questions` shape (backfill: wrap any existing `string[]` into `{id: uuid(), text_en: s, text_native: s}` lazily in code, no destructive migration).

Out of scope: UI tag changes, conditions thresholds.
