# Voice‑in / voice‑out ordering with Vapi

## Goal
When the foreman taps the microphone, instead of just dictating text and reading a silent reply, the assistant should listen, transcribe, answer, **and speak the answer back out loud** — a real hands‑free, gloves‑on conversation. We use the `VAPI_API_KEY` already in Cloud secrets.

## Why Vapi (and what it actually is)
Vapi is **not** a simple "text → audio bytes" TTS API. It is a real‑time voice‑agent orchestrator: it streams microphone audio in, runs speech‑to‑text, calls an LLM, streams text‑to‑speech back, and handles barge‑in / turn‑taking — all over WebRTC. There is no standalone `/synthesize` endpoint we can POST text to.

That means the right shape of this integration is:

- Use the official **`@vapi-ai/web`** SDK in the browser to start a live voice call when the mic is held.
- Point that Vapi call at a **Vapi assistant** that uses our existing `/api/chat` server function as its **custom LLM**, so our system prompt, product catalog, and tools (`search_products`, `flag_as_a_material`) keep driving the answer. Only STT + TTS move to Vapi.
- Mirror everything Vapi says/hears into the existing chat transcript so the screen still shows the conversation and the recommended product pills still appear.

The keyboard / typed flow and the short "tap to dictate then send text" path stay exactly as they are today. This is purely an *additional* mode triggered by a new "hold to talk" interaction.

## User‑facing behaviour
- Two ways to use the mic, clearly distinct:
  1. **Tap mic** (today's behaviour) — dictate, accept the transcript, send as a normal text message. No spoken reply. Unchanged.
  2. **Hold mic / "Voice mode"** (new) — opens a live Vapi voice session. The assistant streams its answer as speech *and* writes the transcript into the chat. The user can interrupt by speaking. Tapping again ends the session.
- While in voice mode: a small pill at the bottom of the screen shows "Listening… / Speaking…" and a stop button.
- Product pills, follow‑up suggestions, and the cart still work — they're rendered from the same transcript the typed flow uses.
- If voice mode fails (no mic permission, Vapi unreachable, missing key), we fall back to today's dictate‑then‑send flow and toast the reason. Nothing is lost.

## Technical design

### 1. Server: provision a short‑lived Vapi session
New TanStack server function `src/lib/vapi.functions.ts` → `createVoiceSession()`:
- Reads `process.env.VAPI_API_KEY`.
- Calls Vapi's REST API to create (or fetch a cached) **assistant** configured with:
  - `model.provider = "custom-llm"`, `model.url = <our deployed /api/chat URL>` so Vapi forwards each turn to our existing chat endpoint (system prompt, product catalog, tools all stay server‑side and unchanged).
  - A sensible Vapi voice (e.g. `vapi` provider, neutral English voice — configurable later).
  - `firstMessageMode = "assistant-speaks-first-with-model-generated-message"` off; we want the user to talk first.
- Returns a JSON payload `{ assistantId, publicKey }` for the browser. The **secret** API key never leaves the server. `publicKey` is Vapi's public key for the workspace (safe to expose, same model as Supabase anon key); if the workspace only exposes the secret key, we instead create a short‑lived **call token** server‑side and return that.

A small adapter inside `/api/chat` accepts Vapi's custom‑LLM OpenAI‑compatible request shape (it already speaks OpenAI's chat completions format, so this is a thin branch — detect the Vapi caller via a shared secret header and skip the SSE wrapping, returning streamed OpenAI deltas directly).

### 2. Client: voice mode hook + UI
- Add `@vapi-ai/web` as a dependency.
- New hook `src/hooks/useVapiVoice.ts`:
  - Lazy‑loads the SDK (it's ~250 KB, only fetched when the user enters voice mode).
  - On `start()`: calls `createVoiceSession()`, then `vapi.start(assistantId)`.
  - Subscribes to Vapi events: `speech-start` / `speech-end` (assistant), `volume-level`, `message` (final user transcript + final assistant transcript + tool calls), `call-end`, `error`.
  - Emits these to the parent so `src/routes/index.tsx` can append user/assistant messages to its existing `messages` state, run the same `[[product:...]]` / `[[followups:...]]` parsing, and trigger `handleTool` for `flag_as_a_material`.
- Extend `src/components/VoiceButton.tsx` with a `mode: "dictate" | "live"` prop, or add a sibling `VoiceModeButton` for hero/compact slots. Tap = dictate (existing). Long‑press OR a dedicated second button = live voice mode.
- Add a `VoiceSessionOverlay` (small, non‑modal status pill above the bottom bar) showing state + a stop button.

### 3. Transcript ↔ chat integration
- Final user utterance from Vapi → push as a `user` message → existing chat rendering kicks in.
- Streamed assistant text from Vapi → append into the same streaming‑assistant message bubble, so the UI looks identical to a typed reply. Product pills render exactly as today because the underlying tokens come from the same LLM via `/api/chat`.
- Tool calls from `/api/chat` (e.g. `search_products`) execute on the server as today; Vapi just streams the resulting natural‑language answer to the user's ear.

### 4. Failure / fallback handling
- If `VAPI_API_KEY` is missing or the session call fails: disable voice mode, log a warning, keep the existing tap‑to‑dictate button working.
- If the browser blocks the mic during a live session: end the Vapi call, toast, and offer to re‑try.

### 5. Cost & privacy notes (mention to user, not implementation)
- Vapi voice minutes are billed per minute on the Vapi side.
- Audio is streamed to Vapi's infrastructure for STT/TTS; the LLM call itself still happens on our server.

## Files touched
- `src/lib/vapi.functions.ts` (new) — `createVoiceSession` server fn.
- `src/routes/api/chat.ts` — small custom‑LLM compatibility branch for Vapi.
- `src/hooks/useVapiVoice.ts` (new) — SDK wrapper + event bridge.
- `src/components/VoiceButton.tsx` — add live‑mode entry point (or sibling component).
- `src/components/VoiceSessionOverlay.tsx` (new) — status pill.
- `src/routes/index.tsx` — wire transcript events into the existing chat state.
- `package.json` — add `@vapi-ai/web`.

## Out of scope for this plan
- Multi‑language voice selection UI (we pick a sensible default; can expose later).
- Persisting voice sessions across reloads.
- Replacing the existing dictate‑then‑send flow (it stays as a cheaper, no‑Vapi‑minutes option).
