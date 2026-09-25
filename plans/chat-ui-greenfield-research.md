# Greenfield Chat UI — Competitor & Ecosystem Research Synthesis

**Date:** 2026-08-04. **Scope:** a from-scratch chat UI for desktop (Electron) and mobile (iOS Expo). Existing internal chat code is explicitly *not* a design reference — it is treated only as an inventory of what is being replaced and what the new UI must plug into.

**Inputs:** four parallel research passes — (1) OpenAI Codex (`codex-rs` source + docs), (2) T3 Chat / T3 Code + Conductor, (3) the open-source chat UI ecosystem (AI SDK v7, assistant-ui, ai-elements, LibreChat, Cherry Studio, opencode, Cline/Roo, happy, vibe-kanban, ACP), (4) an internal integration-constraints map. Full reports with sources and confidence labels are archived separately; this doc is the decision-ready distillation.

---

## 1. The headline: the industry converged, independently, on one architecture

Every serious multi-surface agent product examined — Codex (closed, but open protocol), T3 Code (MIT, structurally a Superset near-clone), opencode, Zed, assistant-ui — arrived at the same shape:

```
agent harness(es)
      │  normalize (per-harness adapter)
      ▼
ONE semantic item vocabulary  ──►  durable append-only event spine (persisted)
      │                                   │
      │  live deltas (non-durable,        │  replay = the SAME pure reducer
      │  droppable, per-client opt-out)   │  that handles live events
      ▼                                   ▼
headless shared core (reducer + derived timeline + markdown block splitter)
      │
      ├── thin Electron/React-DOM renderer (its own list, chrome, composer)
      └── thin Expo/RN renderer          (its own list, chrome, composer)
```

Nobody who shipped multiple frontends kept per-surface message formats. Nobody who solved reconnection kept token-replay. The convergence is strong enough to treat as settled, not as a choice.

### The seven load-bearing decisions (each confirmed by ≥3 independent sources)

1. **One tagged-union item vocabulary; notifications carry full item snapshots, upserted by id.** Codex's `ThreadItem` (`item/started` and `item/completed` both ship the *entire* item — the client reducer is `map.set(item.id, item)`); ACP v2 deleted its separate `tool_call` create event because create/update racing was a real bug class; Cline's reducer is built to converge "under ANY arrival order, duplication, or loss." Deltas (`text.delta`, `tool.input.delta`) are a strictly optional optimization layer — non-durable, droppable, and individually opt-out-able per client (Codex `capabilities.optOutNotificationMethods` — a phone on cellular declines the terminal-output firehose; desktop keeps it).

2. **Live and replay go through literally the same pure reducer.** Codex's `project_rollout_line` (~60 lines, stateless) is why a resumed thread renders identically to a live one; T3 Chat gets the same property by rendering off the local DB that streaming writes into; T3 Code states it as an invariant ("the read model cannot durably disagree with the event log"). This one decision eliminates the "history renders differently than live" bug class *and* makes mobile nearly free: the phone replays the spine, then attaches to the live tail.

3. **The timeline is derived, never stored.** T3 Code's `deriveTimelineEntries` / `deriveWorkLogEntries` / `derivePendingApprovals`; happy's grouping hooks. Collapsing tool start/update/complete into one feed row, turn grouping, and stale-approval degradation are all projection concerns, recomputed from the log — so they can change without migrations.

4. **The backend ships semantics, not raw payloads.** Codex parses shell commands host-side (`commandActions`: "Read foo.ts", not `sed -n '1,50p' foo.ts`); ACP requires an agent-supplied human-readable `title` per tool call; Claude Code provides `SDKToolUseSummaryMessage`. Neither renderer parses shell or hand-writes summary strings; at 390pt wide this is the difference between readable and not.

5. **Approvals are items, with rich decision enums.** Bound to the transcript row that already exists (not a detached modal), with `status: declined` as a normal state rather than an error. Codex and T3 Code independently ship the identical four-way enum: `accept` / `acceptForSession` / `decline` (agent continues) / `cancel` (turn stops). ACP v2's `state_update: requires_action` is the list-level "Needs Input" badge signal — on mobile the thread list is the app.

6. **Streaming markdown has one known-good recipe, and it lives in the shared core.** (a) Split into blocks and memoize — only the last block re-renders (LibreChat measured −88% code-block renders; Codex's TUI commits only at newline boundaries for the same reason); (b) never run the syntax highlighter mid-stream — plain text until the fence closes, then Shiki (Jan, Cherry Studio); (c) coalesce writes to ≤1 commit per animation frame with a synchronous flush before abort (LibreChat + Cherry Studio independently, ~10× render reduction); (d) split frozen history from the live tail so settled content never re-renders (Cherry Studio's measured 8.3ms p50 frames = Codex's stable-region/tail split, arrived at independently). All of (a)–(d) are pure string/AST/state work with zero DOM dependency — they port to RN unchanged. `remend` (incomplete-markdown healer) is literally the same npm package on both platforms.

7. **Don't chase the scroll bottom.** Anchor the user's message to the top, reserve viewport-height space below, write zero scroll positions during streaming (virtua's chatbot story, `react-native-streaming-message-list`, Legend List's built-in `anchoredEndSpace`). Every catalogued scroll bug — including Claude Code's own — is a bug in the chasing strategy. One hard-coded exception: permission prompts always scroll into view.

---

## 2. Competitor positioning (what this buys us)

- **T3 Code** (`pingdotgg/t3code`, MIT) is the closest structural analog to Superset that exists — Electron + web + shipped iOS/Android Expo app + relay/pairing remote access, wrapping vendor CLIs — and it is fully readable. Its mobile app shipped where T3 *Chat*'s never did; the stated blocker for T3 Chat mobile was streaming-markdown performance on React Native, and it held a fast, RN-connected team for 12+ months. **That is our schedule risk, not an implementation detail.**
- **Codex** is the strongest protocol reference (and its mobile app is a *remote control* to a desktop host over a relay — exactly our topology; `remote_control.rs` is a copyable pairing/revocation protocol).
- **Conductor** is macOS-only (Tauri, not Electron), has no shipped mobile app, and just launched cloud workspaces. Its differentiated ground is review depth: checkpoints ("time travel" via private git refs), inline diff comments fed to the agent as context, the PR page as one unified timeline.
- **The open ground:** T3 Code has the multi-surface breadth; Conductor has the review depth; **neither has both.** A Superset chat UI built on the convergent architecture plus our existing diff-viewer investment attacks that gap.

---

## 3. What the new UI must integrate with (constraints only — not patterns)

From the internal map; full detail in the archived report. The user-facing summary: today there are three parallel chat stacks (mastra polling, ACP streaming, dead durable-streams), two fully duplicated UI kits, and **no durable message history anywhere** (the only streaming stack's history is a 5,000-envelope in-memory ring). The constraints a greenfield build inherits:

- **The relay tunnel is chat-agnostic** but buffers HTTP (no SSE through it) and puts JWTs in WS query params with per-reconnect token mint. WS + snapshot-replay is the viable remote transport; 8MB backpressure cap exists today.
- **Sequence cursors are not epoch-qualified** — `since=<seq>` is unsafe across host restarts. The new spine's cursor must be `(epoch, seq)` from day one (Cline's `ts + seq + epoch` fence is the reference).
- **iOS backgrounding kills the WS in ~20 min** (and expo/expo#42946 kills in-flight HTTP streams on background). Resume = reopen + replay-from-cursor; a foreground stream must never be the source of truth.
- **`packages/session-protocol` is the one internally-designed, RN-proven protocol** (ACP-based envelope + fold + reconnecting WS client) and is mid-split into sync/react packages; `packages/workspace-client` is the designated surviving transport package. The planned `packages/chat-protocol` ("SCP v1") referenced in older plans **does not exist** — do not plan against it.
- **Slash-command discovery is inherently host-side** (fs walking) and already exposed over RPC; platform-neutral matching logic exists and is tested.
- Auth/credential plumbing (Anthropic/OpenAI OAuth flows, host-scoped Claude auth) must be kept or re-homed, not dropped.
- Prior art: `plans/v2-chat-greenfield-architecture.md` (712 lines, unimplemented) independently proposed the same event-log spine, but its non-goals (keep mastracode, keep AI SDK UIMessage as canonical) are **open decisions now, not constraints** — this research points at ACP-shaped items rather than UIMessage as the canonical vocabulary, with an adapter where AI SDK/ai-elements types are convenient.

---

## 4. Recommended shape (proposal, to pressure-test together)

**One new client package (name TBD — `packages/chat` is occupied by Stack A until it retires), with entry points as the boundaries** (`./protocol`, `./core`, `./react` subpath exports — the `packages/session-protocol` shape, which is the one internally-designed package that worked and is proven on RN):

- **`src/protocol/`** — the item vocabulary as zod schemas (parse, don't assert, at every process/network boundary); deps: zod only. Start from ACP v2's shapes (`ToolCall {toolCallId, title, kind, status, content[], locations[], rawInput, rawOutput}`, diff content with `oldText: null` for creates, plan replace-wholesale, `usage_update` as a level) plus Codex's lessons (item-bound approvals, `declined` as status, `(epoch, seq)` cursors, per-client delta opt-out). Six or seven item kinds at launch, not twenty — the tagged union makes growth additive.
- **`src/core/`** — headless: the pure reducer (live + replay), derived-timeline projections (turn grouping, tool-lifecycle collapsing, pending approvals incl. stale ones), markdown block-splitter with fence/highlight gating, rAF write-coalescing, outbox with optimistic-send + server-confirmed draft clearing. No DOM, no RN imports — enforced by lint.
- **`src/react/`** — hooks/bindings, react as an optional peer dep.
- **Hard rule:** no host-side code in this package — harness adapters, the event-log writer, anything touching `node:fs` lives in host-service. The server/client line (not protocol-vs-core) is the boundary that rotted in the old `packages/chat`.
- **Host side** — durable append-only event log (SQLite on the host, the same place `host.db` lives) written by the harness adapter (Claude Code → items via the `claude-code-acp` mapping as reference; Codex later via its app-server). WS spine over the existing relay with `(epoch, seq)` resume and full-snapshot catch-up.
- **Renderers** — `apps/desktop` and `apps/mobile` each own their list (web: `content-visibility` first, TanStack Virtual `anchorTo:'end'` pinned-exact if needed; iOS: Legend List v3, `recycleItems={false}`, no `inverted`), their chrome, and their composer; transcript row components take `renderMarkdown`/`renderDiff`/`renderCode` as injected render props so one row tree serves both platforms.

**Deliberately not adopted:** assistant-ui as a dependency (steal its package boundaries; its RN binding is 0.1.x), ai-elements copy-in as a foundation (no upgrade path, no virtualization, composer lacks mentions/slash), Expo DOM components for the transcript (production blank-WebView failure at 3–10KB props), `useChat` as the runtime (its own greenfield plan and T3 Chat both rejected it for multi-subscriber event-driven models).

---

## 5. Proposed plan of attack

**Phase 0 — decisions + de-risking spikes (days, not weeks):**
1. Decide the canonical vocabulary: ACP-shaped items (recommended) vs AI SDK `UIMessage` parts — this is the fork against the old greenfield plan and shapes everything downstream.
2. Decide harness coupling: normalize per-harness adapters into our vocabulary (recommended, Zed-style) vs exposing harness-native shapes.
3. Spike the RN streaming-markdown wall *first* (T3 Chat's 12-month lesson): benchmark hand-rolled AST renderer (Evan Bacon's chat-template approach) vs `react-native-streamdown` (worklets Bundle Mode — we have prior SHA-1-race scar tissue) on a real agent transcript.
4. Verify the five flagged unknowns hands-on: streamdown#473 (code fences don't stream), expo#42946 (background kills streams), Legend List's React-DOM entrypoint claim, AI SDK v7 ESM/Node-22 vs our module formats, `content-visibility` at coding-transcript scale.

**Phase 1 — protocol + spine:** `chat-protocol` schemas, host event log + adapter for Claude Code, WS spine with `(epoch, seq)` resume, `chat-core` reducer + projections. Testable headless (golden-transcript fixtures replayed through the reducer).

**Phase 2 — desktop renderer:** transcript + composer on the new spine behind a flag, one item kind at a time (text → tool call → diff → approval → plan).

**Phase 3 — mobile renderer:** same core, Legend List, outbox + connection pills, "Needs Input" list-level status, spine-replay resume across backgrounding.

**Phase 4 — parity + retirement:** attachments, slash commands over RPC, session list; then retire the old stacks.

---

## 6. Where the full reports live

Scratchpad (session): `report-codex.md`, `report-t3-conductor.md`, `report-oss-chat.md`, `report-internal.md`, plus `agentux.md` (1,232-line raw agent-UX pass with verbatim schemas). Four external artifacts to read end-to-end before writing protocol code: ACP `schema/v2/schema.json`, `zed-industries/claude-code-acp/src/tools.ts`, `sst/opencode` `packages/session-ui` + `session-event.ts`, `slopus/happy` reducer/grouping/tool views.
