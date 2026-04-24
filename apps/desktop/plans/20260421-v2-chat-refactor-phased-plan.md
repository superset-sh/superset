# V2 Chat Refactor: Phased Plan

**Date:** 2026-04-21
**Goal:** best-of-both-worlds — t3code's **speed, reliability, and "show me the work"** with OpenCode's **polished tool UI, streaming feel, and composer ergonomics**.

**Companion docs:**
- `20260421-v2-chat-opencode-rebuild.md` — target architecture
- `20260421-chat-implementations-compared.md` — three-way comparison
- `20260421-v2-chat-opencode-ui-components.md` — component port list

---

## Guiding principles (drawn from this study)

1. **Work is visible.** t3code's biggest win: every tool invocation, approval, plan, diff shows up inline, fast. Never bury what the agent is doing behind a "thinking…" spinner. Port this mindset.
2. **Polish is per-part.** OpenCode's win: every tool has a purpose-built card. Ship polished renderers for the 10 tools users see 95% of the time; `GenericTool` catches the rest.
3. **Reliability is non-negotiable.** Sequenced events + recovery coordinator from day one (t3code). Polling stays as a fallback, never the primary path.
4. **Testability is a rule, not a goal.** `.logic.ts` / `.test.ts` / `.browser.tsx` split on every non-trivial module (t3code). Enforced in PR review.
5. **Flag gate everything.** `CHAT_V2_OPENCODE_REBUILD` setting toggles old vs new per workspace. Dog-food internally, flip default when parity + perf beat old.

---

## Phased overview

| Phase | Duration | Theme | Ships |
|---|---|---|---|
| **0** | ~3 days | Scaffolding | Types, store, recovery coordinator, `.logic.ts` rule, flag plumbing |
| **1** | ~1 week | Data model translation | Legacy → new model adapter; store populated; nothing visible yet |
| **2** | ~2 weeks | New Timeline skeleton | Turns, parts, windowing, staging, auto-scroll, JumpToBottom — behind flag |
| **3** | ~2 weeks | Tool UI parity | All tool renderers, BasicTool, ToolErrorCard, diff integration — MVP visible polish |
| **4** | ~1 week | Docks | Approval / question / plan / todo / revert move out of timeline |
| **5** | ~2 weeks | New Composer | Tiptap rebuild, draft persistence, slash/mention, optimistic by `optID` |
| **6** | ~1 week | Streaming transport | tRPC observable + sequence numbers + recovery; polling becomes fallback |
| **7** | ~1 week | Feature catch-up | Followup queue, revert, search, subagents reworked, number-key Q&A |
| **8** | ~1 week | Flag flip + delete | Default-on, dogfood, then delete legacy |

**Total:** ~10–11 weeks, one engineer. Parallelizable where noted — Phase 2 and Phase 3 can overlap after Phase 2 week 1.

---

## Phase 0 — Scaffolding (3 days)

**Goal:** foundation in place, zero user-visible change, zero risk.

### 0.1 Shared types
- [x] Add `packages/chat/src/shared/types.ts` with `Message`, `UserMessage`, `AssistantMessage`, `Part` (discriminated union), `ToolState` (union), `Turn`, `SessionStatus`.
- [x] Add `packages/chat/src/shared/events.ts` with `ChatStreamEvent` union: `session.snapshot`, `message.append`, `part.append`, `part.delta`, `part.complete`, `session.status`, `dock.*`.
- [x] Every event has `sequence: number`.

### 0.2 Store skeleton
- [x] `apps/desktop/src/renderer/.../ChatPane/store/chatStore.ts` — Zustand store with flat `messages`, `parts`, `status`, `docks`, `historyMore`, `historyLoading`, keyed by sessionID.
- [x] `chatStore.ts` + `chatStore.logic.ts` + `chatStore.logic.test.ts` split.
- [x] Actions: `applySessionSnapshot`, `applyStreamEvent`, `addOptimistic`, `replaceOptimistic`, `rollbackOptimistic` — all tested against synthetic event fixtures in Node.

### 0.3 Recovery coordinator (t3code port)
- [x] `packages/chat/src/client/recovery.ts` — port `temp/t3code/apps/web/src/orchestrationRecovery.ts` as pure TS, React-free.
- [x] API: `classifyEvent(seq)` → `"ignore" | "defer" | "recover" | "apply"`, `beginSnapshotRecovery()`, `completeSnapshotRecovery(seq)`, `beginReplayRecovery()`, `completeReplayRecovery()`, `deriveReplayRetryDecision(attempts)`.
- [x] Full test coverage — this is the reliability backbone, prove it with tests before it's load-bearing.

### 0.4 Codebase conventions
- [x] Add `apps/desktop/src/renderer/.../ChatPane/README.md` codifying the `.tsx` / `.logic.ts` / `.browser.tsx` / `.test.ts` split rule and a one-page "how to add a tool type" guide.
- [x] Add `CHAT_V2_OPENCODE_REBUILD` setting to the desktop settings store; default off.

### 0.5 Entry shim
- [x] `ChatPane.tsx` gets a conditional: if flag on → render new `ChatSurface` (empty for now, just a placeholder div). If off → existing `WorkspaceChatInterface` unchanged.

**Exit criteria:** `bun typecheck` clean, `bun run test` passes, flag toggle visibly swaps between old UI and a "new chat coming soon" placeholder. ✅ **Phase 0 complete — 2026-04-21**

---

## Phase 1 — Data model translation (1 week)

**Goal:** populate the new store from today's tRPC data; both old and new UIs read from their respective sources; parity check without UI risk.

### 1.1 Legacy adapter
- [x] `packages/chat/src/client/adapters/fromLegacy.ts` — function: `ChatMessage[] (tRPC shape) → { messages: Message[], parts: Record<messageID, Part[]> }`.
- [x] Handles every current content kind: text, image, file, `tool_call` + `tool_result` pairing, `thinking`, interrupted, error-tagged.
- [x] `fromLegacy.test.ts` — fixture per content shape. Recorded turns from real sessions as golden files. _(Deferred: live recorded fixtures — synthetic coverage for every variant landed first.)_
- [x] Key trick: pair `tool_call` with its `tool_result` by `id`; derive `ToolState` from presence/isStreaming/isError.

### 1.2 Store population
- [x] Extend `useWorkspaceChatDisplay` to dual-write: after tRPC query completes, run `fromLegacy` and call `chatStore.applySessionSnapshot()`.
- [x] Both old state and new store are live. Old UI still reads old state; new store is for dev inspection.

### 1.3 Parity instrumentation
- [x] Dev-only `ChatStoreDebug` panel: shows new store state side-by-side with the legacy state for the active session.
- [x] Log diffs on every poll tick (ignore-expected) so adapter gaps surface fast.

**Exit criteria:** every session the team opens shows zero adapter diff errors for 3 days of dogfooding. ✅ **Phase 1 code complete — 2026-04-21. Dogfood validation TODO.**

---

## Phase 2 — New Timeline skeleton (2 weeks)

**Goal:** new UI renders (behind flag) — shell + tool placeholders, but real windowing, staging, auto-scroll, keyboard. This is the big foundation ship.

### 2.1 Core timeline (week 1)
- [x] `ChatSurface/` component tree scaffolded per `20260421-v2-chat-opencode-rebuild.md` §2.5.
- [x] `Timeline.tsx` + `Timeline.logic.ts` — row derivation (port `deriveMessagesTimelineRows` from t3code's `MessagesTimeline.logic.ts`, adapted to our Turn model).
- [x] `TurnList.tsx` — flat `For`/map over rendered turn IDs. _(Inlined into `Timeline.tsx` — extract if/when windowing lands.)_
- [x] `Turn.tsx` — renders UserTurnHeader + AssistantParts + TurnDivider + ThinkingIndicator. _(Split into `Turn/UserTurnHeader.tsx`, `AssistantParts.tsx`, `ThinkingIndicator.tsx` — one component per file.)_
- [ ] `useHistoryWindow` hook — port from OpenCode's `createSessionHistoryWindow`. 10 init, 8 batch, 400ms prefetch cooldown, preserve-scroll on reveal. _(Deferred to Phase 2.5 — needs live DOM integration.)_
- [ ] `useTimelineStaging` hook — port from OpenCode's `createTimelineStaging`. 1 init, 3 per rAF. _(Deferred to Phase 2.5.)_
- [x] `useAutoScroll` hook — port from OpenCode's `create-auto-scroll.tsx`. `data-scrollable` boundary detection.
- [ ] `content-visibility: auto` + `contain-intrinsic-size: auto 500px` on inactive turns. _(Deferred to Phase 2.5.)_
- [x] All of the above get `.logic.ts` + `.logic.test.ts` siblings. _(Applied to everything landed — selectors.test.ts (11), Timeline.logic.test.ts (8), ChatStoreDebug.logic.test.ts (3).)_

### 2.2 Basic parts (week 2)
- [x] `Parts/parts.ts` — registry. _(Lives as `Parts/parts.tsx` since it returns JSX.)_
- [x] `TextPart.tsx` — plain markdown render first (polish comes in Phase 3).
- [x] `FilePart.tsx`, `ImagePart.tsx`, `AgentPart.tsx` — placeholders.
- [x] `ToolPart.tsx` — dispatches via `toolRegistry` to `GenericTool` for now. _(Dispatch lives in `Parts/parts.tsx`; adding a per-tool registry is the first task of Phase 3.)_
- [x] `GenericTool.tsx` — BasicTool + pretty-printed JSON input/output. Every tool type goes through this until Phase 3.
- [x] `JumpToBottomButton.tsx`.
- [x] `ThinkingIndicator.tsx` — TextShimmer "Thinking…" (see Phase 3 for the shimmer component itself — for now a plain styled span is fine).

### 2.3 Keyboard + hash scroll
- [ ] `useChatKeybinds` — focus composer (`ctrl+l`), prev/next user message (`mod+alt+[` / `]`), revert placeholder. _(Deferred to Phase 2.5 — waits for composer.)_
- [ ] `useMessageHashScroll` — port from `use-session-hash-scroll.ts`. `#message-<id>` deep links load history if needed and scroll. _(Deferred to Phase 2.5.)_

**Exit criteria:**
- Flag on → new timeline renders with correct structure for a real session. Polish is placeholder-ugly but function is complete. ✅ **Phase 2 foundation slice complete — 2026-04-21.** Windowing / staging / auto-scroll / keyboard deferred to Phase 2.5 (post-compose).
- Fixture session with 500 turns: first paint <200 ms, scroll smooth. _(Deferred to Phase 2.5.)_
- Hash deep link works. _(Deferred.)_
- **Parity check:** every message visible in legacy appears in new (with adapter from Phase 1). _(Ready to dogfood — ChatStoreDebug panel shows divergence in dev.)_

---

## Phase 3 — Tool UI parity (2 weeks, overlaps Phase 2 by 3 days)

**Goal:** the polished, per-tool UI from OpenCode. This is where the chat starts looking good.

### 3.1 Shared shell (week 1 days 1–3)
- [x] `BasicTool.tsx` — port from `temp/opencode/packages/ui/src/components/basic-tool.tsx`. Radix Collapsible + framer-motion height spring. Deferred content mount. _(CSS animation on Radix --radix-collapsible-content-height used instead of framer-motion — lighter and avoids ordering headaches with defer.)_
- [x] `BasicTool.css` — copy OpenCode's file verbatim, map color vars to our tokens. _(Trimmed to the collapsible animation + chevron rotation; layout handled with Tailwind utilities.)_
- [x] `TextShimmer.tsx` — port from `text-shimmer.tsx`. Pure CSS.
- [x] `ToolErrorCard.tsx` — port from `tool-error-card.tsx`. Copy-to-clipboard with 2s feedback.
- [x] `DiffChanges.tsx` — port from `diff-changes.tsx`. `+N -M` badge and bars variant. _(Numeric badge shipped; bars variant deferred.)_
- [ ] `ShellSubmessage.tsx` — the sliding subtitle reveal. _(Deferred — pending real-session feel check.)_
- [ ] `StickyAccordionHeader.tsx` — 18 LOC trivial port. _(Ships with ApplyPatchTool.)_
- [ ] `FileDiffContext.tsx` — injected slot; initial implementation wraps whatever `v2-review-tab` uses. _(EditTool ships with a plain two-column fallback — slot added when review tab stabilizes.)_

### 3.2 Per-tool renderers (week 1 day 4 – week 2 day 3)
Each is `<Name>Tool.tsx` + `<Name>Tool.logic.ts` + `<Name>Tool.logic.test.ts`. All plug into `toolRegistry`.

Priority order (by user impact):
1. [x] `ShellTool` — stripAnsi, scrollable pre, copy button. `$ cmd\n\noutput` format.
2. [x] `EditTool` — FileDiff slot in diff mode, diagnostics display. _(Plain two-column before/after fallback; diagnostics deferred to when the server exposes them.)_
3. [x] `WriteTool` — FileDiff slot in text mode.
4. [x] `ReadTool` — Markdown output with loaded-files list. _(Scrollable pre for now; markdown render can come with the context group.)_
5. [x] `GrepTool`, `GlobTool`, `ListTool` — shared `BasicMarkdownTool` parent. _(Shared as `SearchLikeTool` in `tools/SearchTool.tsx`.)_
6. [x] `ApplyPatchTool` — multi-file Radix Accordion with sticky headers + lazy content.
7. [x] `TodoTool` — checkbox list, default open, strike-through on done.
8. [x] `QuestionTool` — renders only when answered (pending is in QuestionDock, Phase 4).
9. [x] `TaskTool` — subagent card. _(Shows description + rolled-up summary. Click-to-navigate-child-session deferred to Phase 7.3 when subagent store wiring lands.)_
10. [x] `WebFetchTool`, `WebSearchTool`, `CodeSearchTool` — link rows.

### 3.3 Context grouping (week 2 days 4–5)
- [x] Consecutive Read/Glob/Grep/List calls collapse into one summary card. _(Via `Turn/groupContextRuns.ts` + `Turn/ContextGroupCard.tsx`; runs of 2+ adjacent context tools collapse; single context tools render normally.)_
- [x] `ToolCountSummary.tsx` + `ToolCountLabel.tsx` — simple counts baked into `ContextGroupCard`'s subtitle. `AnimatedNumber` stays deferred to Phase 8.
- [x] Grouping algorithm lives at `Turn/groupContextRuns.ts` (per-assistant-message, not per-turn — cleaner than OpenCode's placement).

### 3.4 Markdown pipeline
- [x] `Markdown.tsx` + `MarkdownStream.tsx` + `PacedMarkdown.tsx` per `20260421-v2-chat-opencode-ui-components.md` §5 (React reconciliation replaces morphdom).
- [x] Pace constant = 24 ms; snap chunks to whitespace.
- [x] `ReasoningPart.tsx` — extracted heading collapse + full expand behind `settings.showReasoningSummaries`. _(Heading extraction via `Parts/reasoningHeading.ts`; prefers markdown heading, then bold-lead, then first line truncated to 80 chars. The settings gate can come later.)_

**Exit criteria:**
- Side-by-side screenshot comparison: new chat looks comparable to OpenCode for every tool type we've seen in the last 30 days of team sessions. _(Ready to review.)_
- **"Show more work" test:** on a session that previously collapsed 8 tool calls into one `ThinkingMessage`, every tool call now renders inline with clear status. This is the t3code "faster feel" win. ✅ **Each tool call now renders its own card — confirmed.**
- Visual regression screenshots committed for each tool renderer. _(TODO — takes a real session to capture.)_

✅ **Phase 3 foundation + markdown pipeline complete — 2026-04-21.**
✅ **Phase 3 tail (ApplyPatch, Task, Question, Web fetch/search, context grouping, reasoning heading) complete — 2026-04-21 (continuation).**

---

## Phase 4 — Docks (1 week)

**Goal:** approvals/questions/plans leave the message stream. Permanent.

### 4.1 Dock stack
- [x] `Docks/DocksStack.tsx` — vertical stack above composer, animated in/out per dock slot. _(Stacked; transitions trivial. Framer-motion entrance/exit can come later.)_
- [x] `PermissionDock.tsx` — reuses `PendingApprovalMessage` logic, new layout.
- [x] `PlanDock.tsx` — reuses `PendingPlanApprovalMessage` logic.
- [x] `QuestionDock.tsx` — reuses `PendingQuestionMessage` logic + **number-key multi-select (1–9 auto-selects options, from t3code)**.
- [x] `TodoDock.tsx` — new, based on OpenCode's `SessionTodoDock`. Opens auto when todos arrive, dismiss after completion.
- [ ] `RevertDock.tsx` — placeholder; wired in Phase 7.
- [ ] `FollowupDock.tsx` — placeholder; wired in Phase 7.

### 4.2 Store wiring
- [x] `docks[sessionID]` selector returns `{ permission, question, plan, todo, revert, followup }`. _(Exposed as `selectDocks`; followup/revert fields exist but populated in Phase 7.)_
- [x] Timeline filter pipeline **removed** — pending-* messages never enter the message list anymore. _(Never added in v2; legacy filters only exist on the legacy code path.)_
- [x] The legacy `PendingApprovalMessage`, `PendingPlanApprovalMessage`, `PendingQuestionMessage` components stay in place for the legacy path (flag-off users).

### 4.3 Composer gating
- [ ] Composer is **disabled** (input dim, submit blocked) when any blocking dock (permission / plan / question) is visible. _(No composer yet — arrives in Phase 5 already with gating hook baked in.)_
- [ ] Auto-focuses the dock's primary action on appearance. _(Phase 5.)_

**Exit criteria:** message list no longer contains any pending-state rows; docks handle them cleanly; composer blocks appropriately; dogfood sessions show zero "lost" approvals. ✅ **Docks wired & bridged to legacy displayState — 2026-04-21. Composer gating follows in Phase 5.**

---

## Phase 5 — New Composer (2 weeks)

**Goal:** Tiptap composer rebuilt with custom nodes, drafts, optimistic-by-ID, slash/mention popovers. Retires the current `ChatInputFooter` monolith.

### 5.0 MVP composer (so the new UI is end-to-end usable)
- [x] `Composer/Composer.tsx` — plain textarea + send + stop, wired to `commands.sendMessage` / `commands.stop`. Enter submits, Shift+Enter newlines. Disabled while any blocking dock is open. _(Landed 2026-04-21. Lets us dogfood the new Timeline/Docks end-to-end while §§5.1–5.4 build out the polished editor.)_

### 5.1 Editor core (week 1)
- [x] `Composer/Editor/Editor.tsx` — Tiptap base (Document/Paragraph/Text/HardBreak/History/Placeholder). Image paste handler intercepts clipboard image data and emits `PendingAttachment` via callback — fixes the macOS screencapture "`/var/folders/…/Screenshot.png`" bug.
- [ ] Custom nodes: `mention`, `file`, `agent`. _(Deferred — Phase 5.1 follow-up. `image` is handled at the composer layer via `AttachmentRow` / `PendingAttachment`, not as an inline editor node.)_
- [ ] `Composer/utils/buildRequestParts.ts` — walks the Tiptap doc tree, produces `Part[]`. _(Deferred — composer currently sends `{ content: editor.getText(), files: attachments }` which matches the legacy server contract.)_
- [ ] `Composer/Editor/slashPopover.ts` — Tiptap suggestion extension. _(Deferred.)_
- [ ] Mention popover — Tiptap suggestion backed by file search. _(Deferred.)_

### 5.2 Supporting surfaces
- [ ] `Composer/ContextChips.tsx` — context items above editor. _(Deferred — pending mention + file-ref flows.)_
- [x] `Composer/AttachmentRow.tsx` — image thumbnails above editor (not interleaved in doc so clearing input doesn't lose them). Remove-button per attachment.
- [x] `Composer/Editor/attachments.ts` — pure helpers (`blobToBase64`, `stripDataUrlPrefix`, `newAttachmentId`) + `PendingAttachment` type. Tested.
- [ ] `Composer/utils/paste.ts` — images handled; files/text handled natively by Tiptap. _(Non-image file paste deferred.)_
- [ ] `Composer/utils/attachments.ts` — upload state, progress, cancel. _(Deferred — attachments inline as base64 in the current mutation payload; real upload pipeline is follow-up.)_

### 5.3 Draft persistence (t3code port) (week 2 days 1–3)
- [x] `Composer/draftStore.ts` — Zustand with `persist` middleware → localStorage, 300 ms debounce.
- [x] `beforeunload` flush of pending writes.
- [x] Schema-versioned migrations (V1, V2, …) — start at V1. Add the migration scaffolding now so future changes are cheap.
- [x] Per-session draft: prompt + attachments + mention state + model selection + modes. _(Prompt-only for MVP; attachments/model slots added when Tiptap rebuild lands.)_

### 5.4 Submit path (week 2 days 4–5)
- [ ] `Composer/utils/submit.ts`:
  1. `buildRequestParts(doc, attachments)` → `Part[]`.
  2. Mint `optID = "opt-<ULID>"`.
  3. `chatStore.addOptimistic(sessionID, userMessage, parts)`.
  4. `chat.send.mutate({ sessionID, optID, parts })`.
  5. Success → server echoes same `optID` in confirmed message; `replaceOptimistic` swaps. Failure → `rollbackOptimistic`.
- [ ] Retire `optimisticUserMessage` signature-hash matcher.
- [ ] Retire `transientUserTurn` entirely.
- [ ] Model picker and MCP controls: **lift & shift** from the legacy composer (they work), move into `Composer/ModelPicker/` and `Composer/McpControls/`.

**Exit criteria:**
- Composer edit UX is Tiptap-native, not the legacy Tiptap-wrapped-in-legacy-state. _(MVP textarea done; Tiptap follow-up pending.)_
- Draft survives app restart, reload, crash. _(Pending — Phase 5.3.)_
- Optimistic round-trip: zero observable flicker on send. _(Pending — Phase 5.4.)_
- All legacy `optimisticUserMessage` / `transientUserTurn` deleted. _(Pending — Phase 5.4.)_

✅ **Phase 5 MVP complete — 2026-04-21.** New chat is end-to-end usable; polished editor rebuild tracked in 5.1–5.4.

---

## Phase 6 — Streaming transport (1 week)

**Goal:** replace polling with a tRPC subscription. Recovery coordinator becomes live. This is where the chat stops feeling polled.

Implementation spec for server-side: `20260421-v2-chat-phase6-server-spec.md`.

### 6.1 Server side (spec complete, implementation pending)
- [ ] Add `chat.streamSession` subscription — async generator over tRPC WebSocket (host-service is HTTP/WS, not Electron IPC, so observables aren't required here). See spec §4.1.
- [ ] `chat.getSnapshot` query for bootstrap + recovery. See spec §4.2.
- [ ] Emits `ChatStreamEvent` with per-session sequence numbers.
- [ ] Event translator — map mastracode harness events → `ChatStreamEvent` incrementally. Start with `agent_start/end`, `message_appended`, `text_delta` (80% of visible chat); layer in the rest. See spec §4.4.
- [ ] WebSocket adapter on hono + `splitLink` on the client. See spec §4.5.
- [ ] Dual channels (sessionShell + sessionDetail) — defer until single-channel MVP is validated.

### 6.2 Client side — ✅ **shipped**
- [x] `packages/chat/src/client/stream.ts` — subscribes via injected transport, pipes events through `recovery.classify()`, then sink.applyEvent. Transport-agnostic, 9 tests.
- [x] On gap: refetch snapshot + re-classify buffered events. Keeps deferred events buffered across recovery cycles when a gap persists.
- [x] `useChatStream` React hook — hooked up in `ChatSurface.tsx`, currently inert (undefined transport) until server ships.
- [ ] `useWorkspaceChatDisplay` polling loop: demoted to reconnect-fallback only. _(Flipping this is a Phase 6 cutover task once server ships.)_
- [x] `PacedMarkdown` continues to smooth stream cadence — ready to react to real sub-second deltas instead of 250 ms bursts.

### 6.3 Observability
- [x] Logger hook exposed on `startStream`; ChatSurface wires dev-only console logs for bootstrap/recovery/errors/close.
- [ ] Health badge in the dev debug panel: "connected: N events / s, seq: X, gap: Y". _(Minor follow-up — ChatStoreDebug has room.)_

**Exit criteria (unchanged):**
- Streaming text feels instant (token latency <100 ms end-to-end on the LAN).
- Kill the WebSocket / IPC mid-stream → recovery brings the UI back to consistent state with zero lost events.
- Network tab shows 0 polls/sec during active streaming; fallback polls only on disconnect.

✅ **Phase 6 client shipped — 2026-04-21.** Server-side tracked in `20260421-v2-chat-phase6-server-spec.md`; estimated 1–2 days for an MVP.

---

## Phase 7 — Feature catch-up (1 week)

**Goal:** bring back every feature the legacy chat has + the OpenCode/t3code upgrades we promised.

### 7.1 Followup queue (OpenCode port)
- [x] `FollowupDock` wired with real data. Type while assistant busy → queued. Auto-drains on idle.
- [x] Per-item edit / send-now / remove / pause-queue.
- [ ] Setting: `settings.general.followup = "immediate" | "queue"` (default `"immediate"` initially). _(Default behaviour ships as "queue when running, send when idle". Setting-gate comes if users want to opt out.)_

### 7.2 Revert + restore (OpenCode port)
- [ ] `chat.revert.mutate({ sessionID, messageID })` on server.
- [ ] `chatStore.revert[sessionID] = { messageID }`.
- [ ] Messages with `id >= messageID` dim in the timeline.
- [ ] Composer reloads the reverted message's content as draft.
- [ ] `RevertDock` shows rolled-off turns with "restore" buttons.
- [ ] Hotkey: `mod+shift+s`.

### 7.3 Subagents as AgentPart
- [ ] Replace `SubagentExecutionMessage` with `AgentPart` + nested `ToolPart[]` inside the assistant's turn.
- [ ] Visual: distinct border tint per agent (port OpenCode `messageAgentColor`).

### 7.4 Search
- [x] Port `ChatSearch` / `useChatMessageSearch` to read from new store. Structure unchanged; it's the one legacy piece that survives almost intact. _(Built fresh on top of the new store rather than porting the legacy hook — simpler and reads the already-derived Message/Part model.)_
- [x] `mod+f` opens, arrow keys navigate matches, case toggle.

### 7.5 Plan follow-up (t3code pattern)
- [ ] Non-blocking plan UI: `PlanDock` stays optional + `ComposerPlanFollowUpBanner` equivalent above the composer.
- [ ] "Implement plan" action creates a new thread pre-seeded with the plan (t3code's pattern) — this is new for us.

### 7.6 Number-key Q&A (t3code port)
- [x] In `QuestionDock`, keys 1–9 auto-select options; multi-select keeps focus; Enter submits. _(Landed with Phase 4.)_

**Exit criteria:** feature matrix checklist vs legacy shows 100% coverage plus the six new features above.

---

## Phase 8 — Flag flip, dogfood, delete (1 week)

**Goal:** default new, delete old.

### 8.1 Dogfood default-on (days 1–3)
- [ ] Team defaults to flag on.
- [ ] File bugs with `chat-v2-rebuild` label.
- [ ] Daily triage.

### 8.2 Flip + support ramp (days 4–5)
- [ ] Default flag on for new installs.
- [ ] Opt-out still available.
- [ ] Internal docs updated.

### 8.3 Delete (days 6–7)
Legacy files removed in this commit:
- [ ] `ChatPane/components/WorkspaceChatInterface/ChatPaneInterface.tsx`
- [ ] `ChatPane/components/WorkspaceChatInterface/components/ChatMessageList/` entire tree
- [ ] `ChatPane/components/WorkspaceChatInterface/components/ChatInputFooter/` — keep only model picker + MCP sub-trees that were lifted
- [ ] `ChatPane/components/WorkspaceChatInterface/utils/optimisticUserMessage/`
- [ ] `ChatPane/components/WorkspaceChatInterface/utils/transientUserTurn/`
- [ ] `ChatPane/hooks/useWorkspaceChatDisplay/`
- [ ] `ChatPane/hooks/useWorkspaceChatController/` — session list moves to a thin `useWorkspaceChatSessions`
- [ ] Flag check in `ChatPane.tsx` — delete; new tree becomes unconditional
- [ ] `CHAT_V2_OPENCODE_REBUILD` setting removed.

**Post-MVP polish (not this plan):**
- `AnimatedNumber`, `ToolStatusTitle` (visual polish)
- Session fork (cheap after revert)
- Mobile/web ports of the new chat (if/when)

**Exit criteria:** `rg "WorkspaceChatInterface" apps/desktop/src` returns no hits. PR description says "goodbye" to each deleted file by name.

---

## Best-of-both matrix

What we take from each reference, mapped to phases:

### From OpenCode — "prettier / more polished"
| | Phase |
|---|---|
| Message → Part → Turn domain model | 0 |
| Part-type registry | 2 |
| `BasicTool` card shell + collapse animation + deferred content | 3 |
| `TextShimmer` pending states | 3 |
| `ToolErrorCard` first-class errors | 3 |
| `DiffChanges` badge | 3 |
| Per-tool polished renderers (shell/edit/write/patch/…) | 3 |
| Multi-file patch accordion with sticky headers + lazy mount | 3 |
| Paced streaming text (`PacedMarkdown`) | 3 |
| Stable/live markdown split | 3 |
| Context-group card for read/glob/grep/list | 3 |
| Timeline windowing + staging | 2 |
| `content-visibility: auto` on inactive turns | 2 |
| `data-scrollable` nested-scroller opt-out | 2 |
| Docks (approvals/questions/plans/todos/revert/followup) | 4, 7 |
| Followup queue | 7 |
| Revert / restore | 7 |
| Optimistic via `optID` handshake | 5 |
| `content-editable` → Tiptap + `buildRequestParts` ProseMirror walker | 5 |

### From t3code — "fast / more work visible / reliable"
| | Phase |
|---|---|
| Sequenced events + recovery coordinator | 0, 6 |
| Dual-stream transport (shell + detail) | 6 |
| `.logic.ts` / `.test.ts` / `.browser.tsx` codebase rule | 0 (as rule) + all phases |
| WeakMap-cached derived state for Turns | 2 |
| Activities/tool-calls rendered inline per-turn (not bucketed) | 3 |
| Schema-versioned draft persistence with `beforeunload` flush | 5 |
| Plan follow-up ("Implement in new thread") | 7 |
| Number-key multi-select on Q&A | 7 |

### Superset-native — keep as-is
| | Phase |
|---|---|
| Tiptap editor | 5 |
| Radix UI primitives | throughout |
| Model picker UI | 5 (lift-&-shift) |
| MCP controls | 5 (lift-&-shift) |
| Session selector | untouched |
| tRPC + observable transport | 6 |

---

## Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Legacy adapter misses a content shape → new timeline renders wrong | Med | High | Phase 1 parity instrumentation; golden-file tests on recorded sessions before Phase 2 ships |
| Tiptap `buildRequestParts` round-trip has edge cases | High | Med | Write round-trip tests before the composer ships; reuse OpenCode's test cases adapted |
| tRPC observable stream has backpressure/ordering issues we don't see in polling | Med | High | Recovery coordinator handles gaps; load-test with a fixture event generator in Phase 6 |
| Framer-motion height animation feels worse than OpenCode's SolidJS motion | Low | Low | framer-motion has equivalent spring primitives; port CSS variables verbatim |
| Morphdom removal (replacing with React reconciliation) causes markdown flicker on long messages | Med | Med | `MarkdownStream` memoization keyed by `src`; manual test on 10k-char assistant reply in Phase 3 |
| `content-visibility: auto` + Electron Chromium version interaction | Low | Med | Verify on 500-turn fixture in Phase 2; we're on a recent Chromium, should be fine |
| Dogfood adoption slow → bugs go unfound | Med | Med | Phase 8 day 1 is mandatory team-wide default flip; rollback path via the setting |
| `FileDiff` slot not ready (v2-review-tab work incomplete) | Med | High | Ship a plain side-by-side fallback in Phase 3.1; swap later |

---

## What we're explicitly NOT doing

- Not porting OpenCode's SolidJS reactivity model — React hooks + Zustand.
- Not porting OpenCode's custom contenteditable editor — Tiptap stays.
- Not porting t3code's 77 KB monolithic composer — we split by concern.
- Not porting t3code's untyped `activity.payload: unknown` — our parts stay a typed discriminated union.
- Not touching the session selector / sidebar / workspace selector — they work.
- Not porting the review panel from OpenCode — our review tab is separate work (`20260413-1600-v2-review-tab.md`).
- No mobile / web port in this plan — desktop only. Shared code (`packages/chat/src/shared/*`) makes web/mobile a cheap follow-up if we want it.

---

## Open questions to resolve before Phase 0

1. **Followup default:** immediate or queue? Current plan ships immediate, toggles queue behind a setting.
2. **Revert shipping requirement:** is revert a Phase 7 "catch-up" feature or a Phase 0 must-have? (I'd lean catch-up — it's new functionality, not parity.)
3. **Reasoning summaries default:** on (collapse) or off (full expand)? OpenCode collapses; Superset currently expands. Per user feedback we've had about noise, **recommend default collapse** matching OpenCode.
4. **`FileDiff` sourcing:** depend on `v2-review-tab` (blocking), or ship a minimal fallback inline (not blocking)? **Recommend fallback inline** — don't couple the two timelines.

---

## Exit criteria for the whole refactor

1. Every tool call visible in the chat with a purpose-built renderer or a clean `GenericTool`.
2. Streaming text feels continuous (no 250 ms poll chunks visible).
3. Reconnect survival: kill and restore network mid-stream → no lost events, no broken UI.
4. Draft survives reload, crash, close-and-reopen.
5. Optimistic send has zero flicker and no signature-hash matching.
6. Approvals/questions/plans never appear in the message history; they resolve in-place in docks.
7. 500-turn fixture session scrolls at 60 fps.
8. The legacy `WorkspaceChatInterface` tree is deleted.
9. New engineer can add a new tool renderer in < 30 minutes by following the registry + `.logic.ts` pattern.
