# Three Chat Implementations Compared: OpenCode, t3code, Superset v2

**Date:** 2026-04-21
**Companion to:** `20260421-v2-chat-opencode-rebuild.md`

Each of these ships AI coding-agent chat UI. They solve the same problems with very different bets. This document puts the three side by side so we can choose which ideas to pull into Superset's v2 rebuild.

---

## TL;DR

| | OpenCode | t3code | Superset v2 (today) |
|---|---|---|---|
| Framework | **SolidJS** | React 19 | React 19 |
| Transport | SSE | WebSocket + JSON-RPC, event-sequenced | tRPC polling (250 ms) |
| State | Custom sync store (reactive) | Zustand, dual-stream (shell + detail) | Zustand + tRPC cache + TanStack DB (fragmented) |
| Domain model | Message → Part → Turn (parts are the unit) | Thread → Messages + Activities + Plans (orthogonal streams) | Message with `content[]` array (flat) |
| Optimistic UI | Client generates IDs, server echoes | Minimal (event-sourced) | Two competing systems (signature-match + transient turn) |
| Reconnect | Reconnect + rehydrate, no sequence tracking | **Sequence-numbered replay with gap detection** | Polling masks the problem |
| Timeline perf | **Windowed + staged + `content-visibility`** | **LegendList virtualization** | None — renders everything |
| Streaming text | **Paced client-side + stable/live markdown split** | Real-time as tokens arrive | Chunky polling updates |
| Composer editor | contenteditable + custom nodes | **Lexical** + mentions/slash/skills | **Tiptap** + mentions/slash |
| Pending UX (approvals/questions/plans) | **Docks** (not in message stream) | Panels above composer + inline banners | **Messages in the timeline** |
| Followup queue | Yes, built-in, auto-drains | No | No |
| Revert/fork | `session.revert({ messageID })` + RevertDock | Revert + plan follow-up | No |
| Testing posture | Tests exist, no special pattern | **`.logic.ts` + `.test.ts` + `.browser.tsx` split** | Scattered |

Two strong architectures, one weaker. **OpenCode wins on UI-layer design**; **t3code wins on reliability and testability**; **Superset v2 borrows a bit from each but pays for it with state sprawl and no clear model**.

---

## 1. The three big bets

### OpenCode: "The part is the unit"

```
Session
  └─ Message[] (UserMessage | AssistantMessage, linked by parentID)
       └─ Part[] (text, reasoning, tool, file, image, agent, compaction)
            each part is streamed, has its own state machine
```

- A **Turn** = (UserMessage + all AssistantMessages with `parentID === user.id`) — a virtual grouping.
- Parts are the atomic rendering unit. One registry (`PART_MAPPING`) maps `type` → component. Adding a new part type is adding one entry.
- Tools are parts with a discriminated `state` (`running` | `completed` | `error`). No guessing.
- Assistant messages can be many per turn (sub-agents, retries, compaction). The flat list naturally handles it.

**Consequence:** the timeline is a dumb `For` over user-message IDs; each maps to a `Turn` that composes parts. Everything else (thinking, tool previews, reasoning) is a part state, not a separate message component.

### t3code: "Events are the source of truth, clients derive"

```
Server sends events over WebSocket (orchestration.domainEvent, sequenced):
  thread.created, thread.message-sent, thread.proposed-plan-upserted,
  thread.activity-appended, thread.turn-diff-completed, thread.reverted, ...

Client subscribes to TWO streams:
  - shell stream: precomputed ThreadShell[] (low freq, 50ms server debounce)
  - detail stream: all events for the active thread (high freq)

Client's Zustand store holds flat maps:
  messageByThreadId, activityByThreadId, proposedPlanByThreadId, ...
  sidebarThreadSummaryById (computed server-side)

threadDerivation.ts builds a Thread object from those maps,
with a TWO-LEVEL WEAKMAP CACHE so identity holds across renders.
```

- Messages and **activities** (tool calls, approvals, thinking, errors) are **separate streams**. The UI interleaves them when rendering.
- Every event has a `sequence: number`. `orchestrationRecovery.ts` tracks `latestSequence` + `highestObservedSequence`. A gap → auto-replay. Snapshot → replay → apply normally. Exponential backoff with progress tracking if replay fails.
- Draft persistence is serious: schema-versioned (V1→V5), localStorage debounced 300 ms, `beforeunload` flushes pending writes.
- Testing is first-class: `.logic.ts` files hold all derivation/reduction logic as pure functions, tested in Node. `.browser.tsx` variants handle UI-specific tests in Vitest + Playwright.

**Consequence:** this codebase survives network chaos. Session restarts, reconnects, partial streams — all handled with boring code rather than clever UI tricks. That's the stated #2 priority in their AGENTS.md and it shows.

### Superset v2 today: "Messages are everything, UI fills in"

```
Server owns assistant streaming
Client polls getDisplayState + listMessages @ 250ms
Messages have `content: ContentPart[]` (text | image | file | tool_call | tool_result | thinking)
Tool results stitched back to their calls at render time

Optimistic UI:
  - optimisticUserMessage: prefix-ID + signature (text+files hash) matching
  - transientUserTurn: parallel "pending" state with append/restart variants

Approvals / questions / plans render as MESSAGES in the list,
  filtered out after resolved via multiple helper passes.
```

- Polling is honest about not streaming. You pay 4 RPS continuously; content arrives in chunks of 250 ms worth of work.
- Two optimistic systems solving overlapping problems is the clearest symptom of underspecified state. Signature-matching is order- and whitespace-sensitive.
- Rendering approvals as messages conflates "this is history" with "this is blocking UI". Timeline filters have to know about every special case.
- State lives across `useState` × 12 + Zustand + tRPC cache + TanStack DB. No single source of truth.

**Consequence:** every feature has edge cases. State transitions are hard to reason about. Tests are scattered because the shape of "correct" is not written down.

---

## 2. Side-by-side: domain model

### OpenCode

```ts
type Part = TextPart | ReasoningPart | ToolPart | FilePart | ImagePart | AgentPart | CompactionPart;
type ToolState =
  | { kind: "input-streaming"; input }
  | { kind: "running"; input }
  | { kind: "completed"; input; output }
  | { kind: "error"; input; error };

interface UserMessage   { role: "user";      id; sessionID; time; model?; agent? }
interface AssistantMessage { role: "assistant"; id; sessionID; parentID; time: { created; completed? }; modelID; providerID; error? }
type Message = UserMessage | AssistantMessage;

// Flat store
sync.data = {
  message: { [sessionID]: Message[] },
  part:    { [messageID]: Part[] },
  session_status: { [sessionID]: "idle" | "busy" | "retry{...}" },
};
```

### t3code

```ts
interface ChatMessage {
  messageId; role: "user" | "assistant"; text; attachments; turnId; streaming: boolean;
}
interface OrchestrationThreadActivity {
  id; kind: "approval.requested" | "tool.call" | "thinking" | ...; tone; payload: unknown;
}
interface ProposedPlan { id; sourceTurnId; markdown; implemented }
interface TurnDiffSummary { turnId; filesChanged: Array<{ path; additions; deletions }> }

// Flat store, two streams, server-projected shells
environmentState.{messageByThreadId, activityByThreadId, proposedPlanByThreadId, ...}

// Derived view
Thread = getThreadFromEnvironmentState(state, threadId)  // WeakMap-cached
```

### Superset v2

```ts
// From tRPC router inference
interface ChatMessage {
  id; role: "user" | "assistant"; createdAt;
  content: Array<
    | { type: "text"; text }
    | { type: "image"; mimeType; data }
    | { type: "file"; data; mediaType; filename }
    | { type: "tool_call"; id; name; args }
    | { type: "tool_result"; id; result; isError }
    | { type: "thinking"; ... }
  >;
}

// Plus a bunch of auxiliary state:
//   pendingApproval, pendingPlanApproval, pendingQuestion (on displayState)
//   activeSubagents (Map)
//   currentMessage (in-flight assistant)
//   isRunning (boolean flag)
//   interruptedMessage (captured on abort)
//   pendingUserTurn (transient, append/restart kinds)
//   optimistic messages (prefix-id, signature-matched)
```

**Observations:**

- OpenCode and t3code both separate the *content* (parts / activities) from the *message*. Superset v2 bundles them into a `content[]` array and then has to filter/stitch them at render time.
- OpenCode's parts are a closed set of types with their own state machines. t3code's activities are a bag of `payload: unknown` — more flexible, less type-safe. Superset v2 sits between: typed content variants but with pair-stitching required (`tool_call` + `tool_result`).
- **Turn abstraction:** OpenCode has it (via `parentID`). t3code has it (via `turnId` on every message + activity). Superset v2 doesn't.

---

## 3. Side-by-side: state & transport

| Concern | OpenCode | t3code | Superset v2 |
|---|---|---|---|
| Transport | SSE from `codex app-server` wrapper | WebSocket + JSON-RPC, custom `wsRpcClient` | tRPC over IPC/HTTP with **polling** |
| Event model | Per-part deltas + snapshots | Sequenced domain events on two channels (shell + detail) | `getDisplayState` + `listMessages` snapshots on each poll |
| Store | Custom reactive sync object; SolidJS memos project slices | Zustand + `threadDerivation.ts` with WeakMap cache | Zustand + tRPC cache + TanStack DB (fragmented) |
| Optimistic UI | Client builds `UserMessage + Part[]`, server echoes IDs | Mostly not needed (echo is fast) | Signature-hash + `transientUserTurn` (two systems) |
| Reconnect | Re-open SSE; server replays | **Sequence-gap detection → snapshot + replay state machine with exponential backoff** | Next poll catches up |
| Offline / fault tolerance | Not a focus | Deep care | Polling masks it |

The standout pattern is t3code's `orchestrationRecovery.ts`:

```
classifyDomainEvent(sequence):
  sequence <= latestSequence     → "ignore"
  not bootstrapped or recovering → "defer"
  sequence > latest + 1          → "recover"  (gap → replay)
  sequence === latest + 1        → "apply"

bootstrap → beginSnapshotRecovery → completeSnapshotRecovery(snapshotSeq)
          → if observed > snapshot: beginReplayRecovery → completeReplayRecovery
          → deriveReplayRetryDecision(backoff: 2^(attempts-1), maxNoProgressRetries)
```

This is real event-sourcing rigor. Superset v2 has nothing like it; OpenCode relies on the server to resend, which is fine for SSE but doesn't verify gaps.

---

## 4. Side-by-side: timeline rendering

### OpenCode — `createSessionHistoryWindow` + `createTimelineStaging` + `content-visibility`

- Initial render: 10 turns (`turnInit`).
- Scroll up: reveal 8 cached turns (`turnBatch`); prefetch server history when within 16 of top (`turnPrefetchBuffer`), cooldown 400 ms.
- Preserve scroll on reveal: snapshot `scrollTop + scrollHeight`, restore after layout.
- Mount staging: first turn immediately, then 3 more per `requestAnimationFrame` so first paint is fast.
- `content-visibility: auto` + `contain-intrinsic-size: auto 500px` on every non-active turn.
- `data-scrollable` attr on code blocks / tool output so wheel inside them doesn't trigger "user took over scrolling" at the root.

### t3code — LegendList virtualization + stick-to-bottom

- `LegendList` (Legend Labs, a high-performance virtualized list) wraps all rows.
- Logic split: `MessagesTimeline.logic.ts` has `deriveMessagesTimelineRows` (pure; tested in Node with 50+ cases in `.logic.test.ts`).
- Rows derived from interleaved (messages, activities, plans, turn-diffs, working-indicator).
- `scrollToEnd` fired once when row count transitions 0 → N (first-paint snap). Later messages don't auto-snap unless user is at bottom.
- `onIsAtEndChange` toggles visibility of "Scroll to Latest" button.

### Superset v2 — no windowing

- `ChatMessageList` reads filtered `visibleMessages` out of `useWorkspaceChatDisplay`.
- Underlying `Conversation` component from `@superset/ui/ai-elements` may use `react-virtual`, but the filtering passes (`visibleMessages`, `renderedMessages`, `interruptedPreview`, `previewToolParts`, `pendingPlanToolCallId`) happen before virtualization, so we still build the full derived array on every change.
- `footerScrollTrigger` (int counter bumped on submit) drives scroll — works but is a signaling hack.

**Winner for pure perf:** OpenCode (`content-visibility` on top of windowing beats even virtualization for this shape of content). t3code's LegendList is close second and well-tested. Superset v2 isn't in the same tier.

---

## 5. Side-by-side: streaming

### OpenCode
- SSE delta → part `.text` updates in store.
- **`createPacedValue`**: client-side pacing, reveals chars in small chunks sized to text length, snapped to whitespace, at ~24 ms/chunk. Feels like typing.
- **`markdown-stream.ts`**: splits the rendering buffer into a *stable* prefix (only re-renders on diff via morphdom) and a *live* trailing code block. Top of a long reply doesn't flicker while the tail streams.
- Tool output streams into its own part with `state: "running"`; completes to `state: "completed"`.

### t3code
- `streaming: boolean` on the message; text updates in real time as events arrive.
- No explicit pacing — relies on network cadence to pace naturally.
- Markdown renders fully each delta. Fine in practice; less polished than OpenCode on very long replies.

### Superset v2
- Content arrives in 250 ms polling chunks. Feels chunky.
- Tool call/result render as separate content entries; state computed at render time from pair presence + isStreaming flag.

**Winner:** OpenCode by a mile. t3code is fine; Superset is noticeably worse.

---

## 6. Side-by-side: composer

| | OpenCode | t3code | Superset v2 |
|---|---|---|---|
| Editor | `contenteditable` + custom nodes (`data-type` spans) | **Lexical** + plugins | **Tiptap** + extensions |
| Mentions | Custom popover + inline span | Lexical mention plugin + `@path` files | Tiptap mention extension |
| Slash commands | Popover on `/` prefix, filter options | `composerSlashCommandSearch` + `ComposerCommandMenu`, skills support | `SlashCommandPreview` + `useSlashCommandExecutor`, built-ins (`/new`, `/stop`, `/model`, `/mcp`) + tRPC-fetched custom |
| Draft persistence | Per-session via `Persist.workspace` | **Per-thread Zustand + localStorage, 300ms debounce, beforeunload flush, schema V1→V5 migrations** | `keep-chat-drafts` work in flight |
| Paste handler | Images→data URL, files→file URL, text | Images + terminal contexts | Via Tiptap defaults + `useDocumentDrag` |
| Attachments | `PromptImageAttachments` + `PromptContextItems` chips above input | Inline Lexical nodes + image previews | `AttachmentChip` + attachment state threaded through ChatPaneInterface |
| Serialization | `buildRequestParts()` walks editor DOM → `Part[]` | `deriveComposerSendState` validates + sends | `sendMessage` util |
| Submit | Optimistic `UserMessage + Part[]` → `sdk.session.sendMessage` | `orchestration.dispatchCommand` RPC | tRPC mutation + optimistic insert |

**Notable:** t3code's composer is **monolithic — one 77 KB file**. Tested well, but hard to change. OpenCode splits into ~10 files under `components/prompt-input/`. Superset v2 splits into many files too but the state threading is tangled.

**Recommendation for Superset rebuild:** keep Tiptap (good match for our stack), adopt OpenCode's file split and `buildRequestParts` pattern, adopt t3code's draft persistence with flush-on-unload + schema migrations.

---

## 7. Side-by-side: approvals, questions, plans

### OpenCode — **docks**
- `SessionPermissionDock`, `SessionQuestionDock`, `SessionTodoDock`, `SessionRevertDock`, `SessionFollowupDock` sit above the composer.
- When an approval request arrives, the composer is *blocked* and the dock appears. Answered → it disappears.
- None of these ever live in the message list. The message list is pure history.

### t3code — **panels above composer**
- `ComposerPendingApprovalPanel`, `ComposerPendingUserInputPanel`, `ComposerPlanFollowUpBanner`, `ProviderStatusBanner`.
- Same idea as OpenCode but they call them panels. Pending approvals are derived from activities + state; resolved activities become history.
- Plans are *non-blocking*: `ProposedPlanCard` renders inline with an "Implement" button that spawns a new thread or continues in place. Plan follow-up banner appears when a plan is active.

### Superset v2 — **messages in the timeline**
- `PendingApprovalMessage`, `PendingPlanApprovalMessage`, `PendingQuestionMessage` (last one is actually an overlay in the footer, so already partly a panel).
- They appear as rows in `ChatMessageList`, then get filtered out by multiple utility passes once resolved.
- Conflates "history" and "blocking UI". Requires the filtering machinery that nobody else needs.

**Winner:** OpenCode and t3code tied. They arrive at the same conclusion independently (take these out of the message stream), which is a strong signal.

---

## 8. Side-by-side: followup, revert, fork

| Feature | OpenCode | t3code | Superset v2 |
|---|---|---|---|
| Queue messages while busy | **Yes, FollowupDock; auto-drains; edit/send-now/pause per item** | No | No |
| Revert to a past user message | **Yes — `session.revert({ messageID })`; composer reloads its content; later messages fade; RevertDock to restore** | **Yes — `thread.reverted` event; similar flow** | No |
| Fork a session from a message | Yes (`session.fork`) | Via "Implement plan in new thread" | No |
| Edit a prior user message | Via revert + edit + resend | Via revert | Via UserMessageEditor + "restart" — leaning on transientUserTurn |

The followup queue is a really nice UX beat that neither t3code nor Superset v2 have. Cheap to adopt.

---

## 9. Side-by-side: testing

### t3code's split pattern is the standout

```
MessagesTimeline.tsx            — JSX, hooks, rendering
MessagesTimeline.logic.ts       — pure functions: deriveMessagesTimelineRows, computeMessageDurationStart
MessagesTimeline.logic.test.ts  — 50+ cases in Node (fast)
MessagesTimeline.browser.tsx    — Vitest-browser mock of LegendList
MessagesTimeline.test.tsx       — browser tests: render, snap-to-bottom
```

Everything non-trivial lives in `.logic.ts`. Node tests run in ~100 ms, browser tests in ~1 s. The composer, store, recovery coordinator, draft migrator all follow this pattern.

### OpenCode has tests but no special pattern

Tests co-located with components (`apply-patch-file.test.ts`, `message-file.test.ts`, `markdown-stream.test.ts`, `scroll-view.test.ts`). Good coverage of utility functions; less systematic about UI.

### Superset v2

Some tests; no systematic split. Testing the chat tends to require wiring the full store + tRPC cache.

**This is the single biggest pattern worth stealing for Superset.** Extracting `.logic.ts` files is cheap, pays off fast, and makes the refactor self-verifying.

---

## 10. What to take from each

### From OpenCode (UI layer wins)

1. **Message → Part → Turn domain model.** Closed set of part types with state machines; turns derived from `parentID`.
2. **Part registry** — one map, one new entry per type.
3. **Docks** — approvals/questions/plans/todos/reverts/followups live outside the message list.
4. **Followup queue**.
5. **Revert flow** with RevertDock.
6. **Windowed history + staging + `content-visibility: auto`**.
7. **Paced client-side text** + stable/live markdown split.
8. **Optimistic via `optID` handshake** (client generates ID, server echoes).
9. **`data-scrollable` opt-out** on nested scrollers.
10. **File split of composer** under `components/prompt-input/`.

### From t3code (reliability + testability wins)

1. **Sequenced domain events + replay-recovery coordinator**. Snapshot → replay → apply, exponential backoff, progress tracking. Port this before shipping streaming.
2. **Dual-stream architecture**: shell (server-projected summaries) + detail (fine-grained events). Sidebar never has to wait for detail.
3. **`.logic.ts` + `.test.ts` + `.browser.tsx` split**. Adopt universally in the rebuild.
4. **WeakMap-cached derivations** in `threadDerivation.ts`. Thread object identity holds across renders when inputs do; React memo Just Works. Great pattern for our `selectTurns(sessionID)`.
5. **Draft persistence with real care**: schema-versioned migrations, 300 ms debounce, `beforeunload` flush. Currently the Superset `keep-chat-drafts` plan (2026-03-19) is doing some of this — t3code's code is the benchmark.
6. **Activities as an orthogonal stream** to messages. Thinking, approvals, errors all flow through the same activity pipeline; rendering interleaves.
7. **Plan flow with "Implement in new thread"**. Non-blocking plans with a follow-up banner is a model we don't have and users will like.
8. **Number-key multi-select on pending user input** (1–9 auto-select options). Small detail, high delight.

### From Superset v2 (what to keep)

- Tiptap (good pick, well-integrated).
- Session selector UI (works; leave alone).
- Model picker + MCP controls (work; isolate and port).
- Subagent concept — mostly fine as a specialized part type in the new model.

---

## 11. What NOT to copy

- **Not OpenCode's SolidJS reactivity model.** Fine patterns, wrong framework for us.
- **Not t3code's 77 KB ChatComposer.tsx.** Tested well, but they say themselves (AGENTS.md): "Duplicate logic across multiple files is a code smell" — and the composer is its inverse, a magnet for everything. Split by concern.
- **Not OpenCode's custom contenteditable editor.** Tiptap is the right bet for a React shop.
- **Not t3code's `activity.payload: unknown` bag.** Closed part-type union is better for type safety.
- **Not Superset v2's message-as-approval rendering, signature-hash optimistic, polling-only transport, or state fragmentation.** These are the things the rebuild is for.

---

## 12. Revised take on the rebuild plan

The rebuild plan written yesterday (`20260421-v2-chat-opencode-rebuild.md`) is mostly right but **light on two things that t3code makes obvious**:

1. **Reliability under reconnect.** Current plan has SSE in Phase 5 with reconnect-resync, but nothing like t3code's sequence-gap detection. **Recommendation:** include an `EventSequence` field on all stream events and add a recovery coordinator from day one — it's cheap to write, impossible to bolt on after.

2. **Testability of every non-trivial hook.** Current plan has `useChatSession` + `useHistoryWindow` + `useTimelineStaging` + `useAutoScroll` as hooks. **Recommendation:** mandate a `.logic.ts` split for each one (pure function core, hook wrapper) so Node tests can drive state transitions without React. t3code's `MessagesTimeline.logic.ts` is the template.

Additions to the rebuild plan's Phase 0 (scaffolding):

- [ ] Add `packages/chat/src/shared/events.ts` — sequenced domain event union.
- [ ] Add `packages/chat/src/client/recovery.ts` — port of `orchestrationRecovery.ts`, React-free, Node-testable.
- [ ] Codify `.logic.ts` + `.test.ts` + `.browser.tsx` convention in `AGENTS.md` or a `chat/README.md`.

Addition to Phase 2 (new Timeline):

- [ ] `Timeline.logic.ts` holds row derivation (like t3code's `deriveMessagesTimelineRows`) with exhaustive unit tests covering every state (streaming, interrupted, reverted, errored, pending subagents, multi-assistant turn).

Addition to Phase 4 (Composer):

- [ ] Draft persistence with schema version, debounce, and `beforeunload` flush. Don't reinvent what `composerDraftStore.ts` already got right.

Addition to Phase 5 (Streaming):

- [ ] Two channels: `sessionShell` (summaries for session list / sidebar) and `sessionDetail` (events for the active session). Mirror t3code's split so the session list stays responsive when a chatty session is active.

---

## 13. File references

OpenCode:
- `temp/opencode/packages/app/src/pages/session.tsx`
- `temp/opencode/packages/app/src/pages/session/message-timeline.tsx`
- `temp/opencode/packages/app/src/pages/session/composer/session-composer-region.tsx`
- `temp/opencode/packages/ui/src/components/message-part.tsx`
- `temp/opencode/packages/ui/src/components/markdown-stream.ts`
- `temp/opencode/packages/ui/src/hooks/create-auto-scroll.tsx`

t3code:
- `temp/t3code/apps/web/src/components/chat/MessagesTimeline.tsx` + `.logic.ts` + `.logic.test.ts` + `.browser.tsx`
- `temp/t3code/apps/web/src/components/chat/ChatComposer.tsx`
- `temp/t3code/apps/web/src/composerDraftStore.ts`
- `temp/t3code/apps/web/src/orchestrationRecovery.ts`
- `temp/t3code/apps/web/src/orchestrationEventEffects.ts`
- `temp/t3code/apps/web/src/store.ts`, `storeSelectors.ts`
- `temp/t3code/apps/web/src/threadDerivation.ts`
- `temp/t3code/packages/contracts/src/orchestration.ts`
- `temp/t3code/AGENTS.md`

Superset v2 (today):
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/` (all of it)
- `packages/chat/src/`
