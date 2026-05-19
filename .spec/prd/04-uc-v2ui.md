---
stability: FEATURE_SPEC
last_validated: 2026-05-18
prd_version: 1.1.0
functional_group: V2UI
---

# Use Cases: V2 Renderer Polish (V2UI)

| ID | Title | Source Finding |
|----|-------|----------------|
| UC-V2UI-01 | Unify optimistic user-message reconciliation on message signature | V2-M2 + duplicate-user-msg analysis (2026-05-18) |
| UC-V2UI-02 | Align active-turn assistant filter with message-list helpers | V2-M3 + duplicate-assistant-msg analysis (2026-05-18) |
| UC-V2UI-03 | Make snapshot polling adaptive and stop background polling | V2-H12 |
| UC-V2UI-04 | Surface PendingQuestionMessage submission errors inline and selectable | V2-M4 |
| UC-V2UI-05 | Evict workspaceClientsCache entries on provider unmount | V2-M1 |
| UC-V2UI-06 | Lift useWorkspaceChatController to a single shared instance | V2-M5 |
| UC-V2UI-07 | Cancel the active turn when a ChatPane unmounts mid-run | V2-H7 (renderer half) |
| UC-V2UI-08 | Sanitize text dropped into the Tiptap composer | post-PRD analysis (drag-drop injection) |
| UC-V2UI-09 | Replace hardcoded `isFocused` in v2 ChatPane | post-PRD analysis (cross-pane shortcut bleed) |
| UC-V2UI-10 | Throttle screen-reader announcements during streaming | post-PRD analysis (a11y regression) |
| UC-V2UI-11 | Runtime-validate `getSnapshot` payload at the renderer boundary | post-PRD analysis (defense-in-depth) |
| UC-V2UI-12 | Virtualize the message list for long conversations | post-PRD analysis (performance) |

---

## UC-V2UI-01: Unify optimistic user-message reconciliation on message signature

**Description**: `useWorkspaceChatDisplay.ts:168-186` still uses text-equality (and a fragile file-count delta) to detect when the optimistic user message has been adopted by the snapshot. The robust `hasMatchingUserMessage` / `toUserMessageSignature` path in `optimisticUserMessage.ts:31-62` must replace it so both the existing-session and new-session send paths converge on one reconciliation strategy. Addresses V2-M2.

**Mechanism — the user-visible duplicate**: Beyond text-equality fragility, the existing structure has a guaranteed one-frame duplicate render on every send. The `messages` useMemo at `useWorkspaceChatDisplay.ts:195-204` composes `[...historicalMessages, optimisticUserMessage]` unconditionally; the clear runs in a separate `useEffect` (lines 165-193) AFTER the render that already contains both the new persisted message AND the still-set optimistic. Path #2 of the same analysis: if Mastra normalizes the persisted text (whitespace trim, line endings, mention serialization), the text-equality check `part.text === optimisticText` fails forever and the duplicate becomes permanent. Path #3: the file-only fallback `fileMessageCountAtSendRef.current` comparison breaks if a file upload errors server-side — the count never increments and optimistic never clears. Path #4: the single-slot refs (`optimisticTextRef`, `optimisticIdRef`, `fileMessageCountAtSendRef`) get clobbered on rapid back-to-back sends, so the first send's tracking is destroyed by the second's.

**Acceptance Criteria**:
- ☐ A user can send two identical-text messages back-to-back in the same session and see two distinct user bubbles persist after the snapshot poll completes, with no flicker or premature optimistic clear.
- ☐ A user can send a user message containing only an image or file attachment (no text) and observe the optimistic bubble clear precisely when a snapshot message with the same `image:<mimeType>:<data>` or `file:<mediaType>:<filename>:<data>` signature arrives — not on a coarse file-count increment.
- ☐ A developer can search `useWorkspaceChatDisplay.ts` and find that `optimisticTextRef`, `fileMessageCountAtSendRef`, and the inline text-equality `.some(...)` block have been deleted in favor of a single signature-based check imported from `optimisticUserMessage.ts`.
- ☐ A unit test can feed a sequence containing one persisted user message and one matching optimistic message into the reconciliation effect and assert that the optimistic bubble is cleared exactly once after the matching real message arrives.
- ☐ A developer can confirm the optimistic state in `ChatPaneInterface` (`pendingUserTurn` path) and the optimistic state in `useChatDisplay` both call the same shared helper from `optimisticUserMessage.ts`.
- ☐ (Race-closing) A developer can read the `messages` useMemo at `useWorkspaceChatDisplay.ts:195-204` and confirm it calls `hasMatchingUserMessage({ messages: historicalMessages, candidate: optimisticUserMessage })` BEFORE appending the optimistic entry; the optimistic is never appended when a structurally-matching persisted message already exists, so the render between "poll arrived" and "clear effect ran" produces a single user bubble (not "one → two → one").
- ☐ (Render-trace test) A test can step the hook through (a) `commands.sendMessage` called, (b) snapshot arrives containing the matching persisted message, (c) clear effect runs and sets `optimisticUserMessage` to `null` — and assert that the returned `messages` array contains exactly ONE user bubble at every observable render between (a) and the post-(c) settled state.
- ☐ (Concurrency) A developer can confirm the single-slot ref pattern (`optimisticTextRef`, `optimisticIdRef`, `fileMessageCountAtSendRef`) is gone or extended to a Map keyed by signature; two rapid back-to-back sends each retain their own tracking entry without overwriting each other, and both clear independently when their matching persisted message arrives.
- ☐ (Normalization safety) A unit test sends a message containing trailing whitespace / a Tiptap-serialized `@mention` / a paste with zero-width characters; if the server normalizes the persisted text, the signature comparison still resolves to a match and the optimistic still clears.

---

## UC-V2UI-02: Align active-turn assistant filter with message-list helpers

**Description**: `useWorkspaceChatDisplay.ts:78-81` filters the in-flight turn using `hasAnsweredQuestionToolCall`, but the renderer-side helper `messageListHelpers.ts:107-111` uses both `hasAnsweredQuestionToolCall` and `hasPendingQuestionToolCall`. The divergence strips pending-question messages from the visible list mid-turn. Addresses V2-M3.

**Mechanism — the duplicate-assistant bug**: When v2 forked this filter from `packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts:81-94`, it dropped TWO guards the canonical filter had: (1) `!!stopReason` — keep only fully-committed prior phases, and (2) `messageId !== currentMessage.id` — drop the historical entry whose id collides with the streaming message during the brief commit-to-history transition window. Without guard (2), the same logical assistant message renders TWICE in `ChatMessageList.tsx`: once inside `renderedMessages.map(...)` (lines 187-220) and again as the separate `currentMessage` block (lines 236-248). React doesn't dedupe because the keys differ (`message.id` vs `current-${currentMessage.id}`). The current AC #3 ("pending question survives the filter") does NOT close this — keeping a pending-question message AND having it id-collide with `currentMessage` is exactly when the duplicate fires. The fallback in `messageListHelpers.removeInterruptedSourceMessage` (lines 155-168) has the same flaw and must be aligned in lockstep.

**Acceptance Criteria**:
- ☐ A user can ask the agent a follow-up that triggers an `ask_user` tool call mid-turn and see the question context remain rendered every frame until they answer it, with no flicker or disappearance during snapshot polls.
- ☐ A developer can read `withoutActiveTurnAssistantHistory` and see it imports the exact same predicate (or shared utility) used by `messageListHelpers.getVisibleMessages` — no duplicated logic.
- ☐ A unit test can construct a `messages` array containing an assistant message with a pending question tool call mid-active-turn and assert that the message survives the `withoutActiveTurnAssistantHistory` filter.
- ☐ A developer can verify there is exactly one source of truth (a shared util in `renderer/components/Chat/ChatInterface/utils/messageHelpers` or equivalent) for the "should this assistant message survive active-turn pruning" decision; both consumers import from that single export.
- ☐ (Id-collision guard) A developer can read the consolidated filter and find an explicit guard that DROPS any historical assistant message whose `id === currentMessage.id`, independent of whether it has answered/pending question tool calls. This guard MUST run before the answered/pending-question allowlist check.
- ☐ (Id-collision unit test) A unit test constructs a `messages` array whose last assistant entry has the same `id` as `currentMessage` (with `hasAnsweredQuestionToolCall === true` AND `hasPendingQuestionToolCall === true` to defeat the allowlist), invokes `withoutActiveTurnAssistantHistory`, and asserts the returned list does NOT contain that entry — so `ChatMessageList` cannot render it alongside the `currentMessage` block.
- ☐ (Interrupted-preview parity) `messageListHelpers.removeInterruptedSourceMessage` fallback path (line 155-168 today) uses the same id-collision guard as the primary filter, so an interrupted preview never co-renders with its source message.
- ☐ (End-to-end no-duplicate) A user who triggers an `ask_user` mid-turn, answers it, and watches the agent continue streaming does NOT see two copies of the question-bearing assistant message at any point — verified by a Playwright (or @testing-library) test that asserts exactly one AssistantMessage DOM node carries the question content during the post-answer streaming window.

---

## UC-V2UI-03: Make snapshot polling adaptive and stop background polling

**Description**: `useWorkspaceChatDisplay.ts:115,120-126` defaults `fps: 4` with `refetchIntervalInBackground: true` and no idle throttle. With multiple panes this hits 20+ req/sec to host-service even when minimized, masks the 5s `staleTime`, and accelerates battery drain. Addresses V2-H12.

**Acceptance Criteria**:
- ☐ A user with an open but idle v2 ChatPane (no active turn) generates at most 1 `chat.getSnapshot` HTTP request per second to host-service, measurable via host-service request logs.
- ☐ A user who triggers a turn sees snapshot polling rate ramp to 4 fps within one tick of `displayState.isRunning` flipping to `true`, then drop back to 1 fps (or lower) within one tick of it flipping to `false`.
- ☐ A user who minimizes the desktop window or switches away from the app generates zero `chat.getSnapshot` requests for any pane that is not actively running (`refetchIntervalInBackground` defaults to `false`).
- ☐ A developer can opt back into background polling by passing an explicit `pollWhileHidden: true` option to `useChatDisplay`, with the option documented in the hook's JSDoc.
- ☐ A unit test can render the hook with `isRunning` toggling and observe the underlying `refetchInterval` change between active and idle values.

---

## UC-V2UI-04: Surface PendingQuestionMessage submission errors inline and selectable

**Description**: `PendingQuestionMessage` currently logs submission failures to `console.error` with no inline UI; `QuestionInputOverlay` similarly resets state silently on error. Per `apps/desktop/AGENTS.md`, the renderer sets `user-select: none` on `body`, so error text must include `select-text cursor-text` classes. Addresses V2-M4.

**Acceptance Criteria**:
- ☐ A user whose `respondToQuestion` call fails (network drop, host-service down) sees an inline error within the `PendingQuestionMessage` surface, not just a silent console log.
- ☐ A user can triple-click the error text and copy it to clipboard — the error element carries the `select-text cursor-text` Tailwind classes (or equivalent semantic wrapper).
- ☐ A user can retry after a failure by re-submitting the answer without having to re-open the question; the prior error clears on next submit attempt.
- ☐ A developer can read the `PendingQuestionMessage` component and find that all rendered error/diagnostic text nodes include `select-text cursor-text` classes.
- ☐ A test can simulate a failed `respondToQuestion` mutation and assert the error message renders into the DOM with `userSelect === "text"` (or the equivalent assertion under the test runner).

---

## UC-V2UI-05: Evict workspaceClientsCache entries on provider unmount

**Description**: `WorkspaceClientProvider.tsx:38` uses a module-level `Map<string, WorkspaceClients>` keyed by `${cacheKey}:${hostUrl}` and never removes entries. Each opened-then-closed workspace leaks one tRPC client + QueryClient. Addresses V2-M1.

**Acceptance Criteria**:
- ☐ A user who opens and closes 20 distinct workspaces in a single desktop session retains at most 1-2 entries in `workspaceClientsCache` at any time (verified via dev-tools heap snapshot or an exported diagnostic counter).
- ☐ A developer can read the `WorkspaceClientProvider` and see a `useEffect` cleanup that deletes the cache entry for `${cacheKey}:${hostUrl}` when the last provider instance for that key unmounts (reference-counted, not first-unmount-wins).
- ☐ A test mounting two `WorkspaceClientProvider` instances with the same `cacheKey` then unmounting one observes the cache entry survives until both unmount.
- ☐ A test can assert that after provider unmount, `queryClient.clear()` and `queryClient.unmount()` have been called on the disposed entry so background queries stop.
- ☐ A developer can grep the workspace-client package and confirm no other module mutates `workspaceClientsCache` outside the provider's lifecycle.

---

## UC-V2UI-06: Lift useWorkspaceChatController to a single shared instance

**Description**: Both `ChatPane.tsx:19` and `ChatPaneTitle.tsx:31` call `useWorkspaceChatController` independently. React Query dedupes underlying queries but mutation handles, optimistic state, and `react-db` subscriptions don't necessarily dedupe — producing brief desync on rapid session switches. Addresses V2-M5.

**Acceptance Criteria**:
- ☐ A user who rapidly switches between two sessions in the same pane sees the title bar and the message body update in the same React commit (no observable lag between the title and the body reflecting the new session).
- ☐ A developer can find exactly one call site of `useWorkspaceChatController` in the v2 ChatPane subtree; `ChatPaneTitle` consumes its result via a context/provider hook.
- ☐ A test mounting `ChatPane` with a stubbed controller hook can observe `useWorkspaceChatController` is called exactly once even after multiple re-renders of `ChatPaneTitle`.
- ☐ A developer can confirm no behavior previously delivered by either independent call has been lost (session creation, model selection, slash command resolution still work from both surfaces).
- ☐ A test can simulate a session switch and assert the controller's returned `sessionId` updates in `ChatPane` and `ChatPaneTitle` within the same React tick.

---

## UC-V2UI-07: Cancel the active turn when a ChatPane unmounts mid-run

**Description**: `ChatPaneInterface.tsx:739-744` only clears retry timers on unmount; with `abortOnUnmount: true` on `workspaceTrpc`, closing a pane during an active turn drops the HTTP socket but leaves the host-service Mastra harness running. The agent keeps executing tool calls after the user dismissed the UI. Addresses V2-H7 (renderer half — paired with UC-HOST-08 host-side drain).

**Acceptance Criteria**:
- ☐ A user can close a v2 ChatPane while `displayState.isRunning === true` and the host-service emits a `stop` request for that `(sessionId, workspaceId)` before the pane finishes unmounting.
- ☐ A developer running the desktop app in dev mode can confirm via host-service logs that no tool calls (file writes, bash) execute against a session whose only pane has been closed for more than 2 seconds.
- ☐ A test mounting `ChatPaneInterface` with a fake `useChatDisplay` that returns `isRunning: true` can unmount the component and assert `commands.stop` was called exactly once.
- ☐ A developer can read the cleanup `useEffect` and verify the `isRunning` value used at unmount comes from a ref or latest-value pattern (not a stale closure) so the cleanup fires correctly across rapid mount/unmount cycles.
- ☐ A user opening a fresh pane against the same session after the unmount cleanup can resume interaction without any "session is locked / already running" state on the host-service side (depends on UC-RUN-05 clean teardown).

---

## UC-V2UI-08: Sanitize text dropped into the Tiptap composer

**Description**: `ChatInputDropZone.tsx:31-37` reads `event.dataTransfer.getData("text/plain")` and inserts it directly into the Tiptap input via `textInput.setInput(...)` with no validation. Any drag source — a browser pane, another desktop app, a webpage element — can push arbitrary text into the chat composer, including a leading `/` that becomes an unintended slash command on the next submit. This is a low-grade injection surface and a UX trap (paste a multi-megabyte log accidentally and the composer locks up).

**Acceptance Criteria**:
- ☐ A user dragging text starting with `/` from a browser pane / external app into the composer does NOT trigger slash-command execution on submit; the leading `/` is either escaped, the text is inserted at the current cursor with a non-leading position, or the drop is refused with a toast.
- ☐ A user dragging text that exceeds a sane upper bound (e.g., 64 KB after trim) sees an inline notice ("Drop too large — paste in chunks") and the text is NOT silently inserted.
- ☐ A user dragging a string containing newlines or control characters sees them normalized (CR/LF → LF, zero-width chars stripped) before insertion.
- ☐ A developer can read the drop handler and find an explicit validation/normalization step between `dataTransfer.getData("text/plain")` and `textInput.setInput(...)`.
- ☐ A unit test exercises three drop payloads — `"/reset"`, a 100 KB string, a string with embedded `​` — and asserts the post-drop input value matches the documented sanitization rules for each.

---

## UC-V2UI-09: Replace hardcoded `isFocused` in v2 ChatPane

**Description**: `ChatPane.tsx:31` passes `isFocused` (a JSX shorthand for `isFocused={true}`) unconditionally. Hooks like `useFocusPromptOnPane` (consumed by `ChatInputFooter`) and `useChatMessageSearch` key keyboard shortcuts off this boolean. With multiple ChatPanes open, every pane registers as focused — pressing Cmd-F opens every pane's search bar at once, focus-prompt shortcuts compete, and the user can't tell which pane will receive their input.

**Acceptance Criteria**:
- ☐ A user with two v2 ChatPane instances open in the same workspace observes that pressing Cmd-F (or the local search shortcut) opens the search bar in EXACTLY the focused pane, not both.
- ☐ A user clicking between two ChatPanes sees the focus shortcuts re-route to the newly-focused pane within one React commit.
- ☐ A developer reading `ChatPane.tsx` finds `isFocused` sourced from the v2 pane-registry focus signal (or whichever upstream context tracks active-pane state), not a literal `true`.
- ☐ A unit test mounting two `ChatPane` instances under a stubbed focus provider can flip the focused pane and assert only the focused pane's `useChatMessageSearch` reports `isSearchEnabled === true`.

---

## UC-V2UI-10: Throttle screen-reader announcements during streaming

**Description**: The `Conversation` wrapper in `@superset/ui/ai-elements/conversation.tsx` exposes `role="log"` (implicit `aria-live="polite"`) on the message region with no accessible name. The inner `StreamingMessageText` updates the DOM at ~16 ms intervals while a turn streams. VoiceOver/NVDA either chatter incoherently as they try to announce every tick, or queue a backlog that finishes long after the message does. Either failure mode makes the chat unusable for assistive-tech users.

**Acceptance Criteria**:
- ☐ A developer can read the `Conversation` component and find an explicit `aria-label="Chat conversation"` (or `aria-labelledby` referencing a visible heading) on the `role="log"` region.
- ☐ The streaming text region (`StreamingMessageText`) does NOT carry `aria-live="polite"` on every tick. Instead, announcements are emitted at logical boundaries: on stream completion, OR on a quiescence pause (e.g., no new tokens for ≥ 500 ms), whichever comes first.
- ☐ A developer testing with VoiceOver on macOS hears one summary announcement per assistant message turn (or per quiescence pause), NOT a continuous stream of partial-token utterances.
- ☐ A developer can confirm the streaming-text component still updates visually at the existing ~16 ms cadence — only the assistive-tech announcement cadence is throttled.
- ☐ An automated accessibility check (axe-core or similar) reports no `aria-live` misuse warnings on the Conversation region.

---

## UC-V2UI-11: Runtime-validate `getSnapshot` payload at the renderer boundary

**Description**: The renderer consumes `workspaceTrpc.chat.getSnapshot` purely via inferred AppRouter TypeScript types — no runtime parse on the renderer side. Across host-service auto-update windows (the desktop app and the host-service can be on different versions during a rolling upgrade), a shape mismatch produces a render-time exception inside `ChatMessageList` rather than a graceful fallback. The 250 ms polling cadence ensures the bad shape recurs every tick, so the pane stays crashed until the user reloads.

**Acceptance Criteria**:
- ☐ A developer can find a `snapshotResponseSchema` (zod) defined either in `packages/chat/src/shared/` or alongside the workspace-client types, exported and consumed by `useWorkspaceChatDisplay`.
- ☐ The schema is applied at the `useQuery`'s `select` boundary (or inside the hook before `messages`/`displayState` derivation). Schema-parse failures are caught: the hook returns a stable fallback state (`messages: []`, `displayState: null`, `error: "Snapshot schema mismatch — host-service may be on an incompatible version"`).
- ☐ A unit test feeds three malformed snapshot payloads — missing `messages`, `currentMessage` with unexpected shape, extra top-level keys — into the hook and asserts the hook does NOT throw and returns the documented fallback state.
- ☐ Failures are surfaced once per session in `console.warn` (not per-tick spam) and tagged with the offending field path so logs are useful for triage.
- ☐ A developer can confirm the schema is co-located with — or extends from — the input zod schemas already used at the host-service tRPC boundary, so the two sides stay in sync via a single source of truth.

---

## UC-V2UI-12: Virtualize the message list for long conversations

**Description**: `ChatMessageList.tsx:187-220` renders the entire historical message array as plain DOM nodes inside a flex column. Combined with 4 fps snapshot polling and 16 ms `StreamingMessageText` ticks, conversations with hundreds of messages drop frames during active turns on lower-end Macs. The 16 ms streaming-text interval × N rendered message nodes adds up fast. *(Lower priority than the dedup fixes in UC-V2UI-01 / -02; sits at the back of the V2UI cut order.)*

**Acceptance Criteria**:
- ☐ A user can scroll a 500-message conversation while a turn is streaming with no observable jank (DevTools timeline shows 60 fps maintained on a 2021 M1 MacBook Air; documented benchmark scenario).
- ☐ The implementation chooses one of: (a) wrap `<AssistantMessage>` and `<UserMessage>` in `React.memo` with custom comparators that ignore stable context props and compare only content-bearing props, OR (b) windowed list via `@tanstack/virtual` or equivalent. Decision documented in a brief ADR-style note in `apps/desktop/docs/`.
- ☐ A developer can confirm completed (non-streaming) assistant message nodes do NOT re-render when `currentMessage` ticks during streaming — verified via React Profiler or a `useEffect`-based render counter test.
- ☐ Scroll-anchoring behavior (the `use-stick-to-bottom` integration) continues to work: the user-at-bottom auto-scroll is preserved during streaming.
- ☐ `MessageScrollbackRail` continues to receive a faithful view of `renderedMessages` for navigation — virtualization MUST NOT hide messages from the rail's anchor lookups.
