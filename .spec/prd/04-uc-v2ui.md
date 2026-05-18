---
stability: FEATURE_SPEC
last_validated: 2026-05-18
prd_version: 1.0.0
functional_group: V2UI
---

# Use Cases: V2 Renderer Polish (V2UI)

| ID | Title | Source Finding |
|----|-------|----------------|
| UC-V2UI-01 | Unify optimistic user-message reconciliation on message signature | V2-M2 |
| UC-V2UI-02 | Align active-turn assistant filter with message-list helpers | V2-M3 |
| UC-V2UI-03 | Make snapshot polling adaptive and stop background polling | V2-H12 |
| UC-V2UI-04 | Surface PendingQuestionMessage submission errors inline and selectable | V2-M4 |
| UC-V2UI-05 | Evict workspaceClientsCache entries on provider unmount | V2-M1 |
| UC-V2UI-06 | Lift useWorkspaceChatController to a single shared instance | V2-M5 |
| UC-V2UI-07 | Cancel the active turn when a ChatPane unmounts mid-run | V2-H7 (renderer half) |

---

## UC-V2UI-01: Unify optimistic user-message reconciliation on message signature

**Description**: `useWorkspaceChatDisplay.ts:168-186` still uses text-equality (and a fragile file-count delta) to detect when the optimistic user message has been adopted by the snapshot. The robust `hasMatchingUserMessage` / `toUserMessageSignature` path in `optimisticUserMessage.ts:31-62` must replace it so both the existing-session and new-session send paths converge on one reconciliation strategy. Addresses V2-M2.

**Acceptance Criteria**:
- ☐ A user can send two identical-text messages back-to-back in the same session and see two distinct user bubbles persist after the snapshot poll completes, with no flicker or premature optimistic clear.
- ☐ A user can send a user message containing only an image or file attachment (no text) and observe the optimistic bubble clear precisely when a snapshot message with the same `image:<mimeType>:<data>` or `file:<mediaType>:<filename>:<data>` signature arrives — not on a coarse file-count increment.
- ☐ A developer can search `useWorkspaceChatDisplay.ts` and find that `optimisticTextRef`, `fileMessageCountAtSendRef`, and the inline text-equality `.some(...)` block have been deleted in favor of a single signature-based check imported from `optimisticUserMessage.ts`.
- ☐ A unit test can feed a sequence containing one persisted user message and one matching optimistic message into the reconciliation effect and assert that the optimistic bubble is cleared exactly once after the matching real message arrives.
- ☐ A developer can confirm the optimistic state in `ChatPaneInterface` (`pendingUserTurn` path) and the optimistic state in `useChatDisplay` both call the same shared helper from `optimisticUserMessage.ts`.

---

## UC-V2UI-02: Align active-turn assistant filter with message-list helpers

**Description**: `useWorkspaceChatDisplay.ts:78-81` filters the in-flight turn using `hasAnsweredQuestionToolCall`, but the renderer-side helper `messageListHelpers.ts:107-111` uses both `hasAnsweredQuestionToolCall` and `hasPendingQuestionToolCall`. The divergence strips pending-question messages from the visible list mid-turn. Addresses V2-M3.

**Acceptance Criteria**:
- ☐ A user can ask the agent a follow-up that triggers an `ask_user` tool call mid-turn and see the question context remain rendered every frame until they answer it, with no flicker or disappearance during snapshot polls.
- ☐ A developer can read `withoutActiveTurnAssistantHistory` and see it imports the exact same predicate (or shared utility) used by `messageListHelpers.getVisibleMessages` — no duplicated logic.
- ☐ A unit test can construct a `messages` array containing an assistant message with a pending question tool call mid-active-turn and assert that the message survives the `withoutActiveTurnAssistantHistory` filter.
- ☐ A developer can verify there is exactly one source of truth (a shared util in `renderer/components/Chat/ChatInterface/utils/messageHelpers` or equivalent) for the "should this assistant message survive active-turn pruning" decision; both consumers import from that single export.

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
