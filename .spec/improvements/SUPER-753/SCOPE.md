---
ticket_id: SUPER-753
ticket_url: https://linear.app/superset-sh/issue/SUPER-753/nail-the-start-flow-for-new-chat-sessions-kill-the-message-flicker
tracker: linear
branch: improvement/SUPER-753-chat-start-flicker
status: proposal
investigator_specialist: electron-reviewer
created_at: 2026-05-20
---

# SUPER-753 — Nail the start flow for new chat sessions, kill the message flicker

## Defect

**Symptom**: When a user sends the first message in a new chat session, the assistant
reply flickers — briefly showing a duplicate copy of the in-flight assistant message
before the UI self-heals.

**Observed**: The in-flight assistant message (being streamed, `stopReason=undefined`)
appears twice: once in `currentMessage` (from `getDisplayState`) and once in the
`historicalMessages` list (from `listMessages`). The dedup filter
`withoutActiveTurnAssistantHistory` is supposed to remove it from history, but it
silently becomes a no-op when an optimistic user message was appended to the history
list after the in-flight assistant message.

**Expected**: No duplicate. The streaming assistant message appears exactly once, driven
by `currentMessage`.

## Reproduction

**Failing test**: `packages/chat/src/client/hooks/use-chat-display/use-chat-display-race.test.ts`

Run: `bun test packages/chat/src/client/hooks/use-chat-display/use-chat-display-race.test.ts`

Evidence: `.spec/improvements/SUPER-753/evidence/failing-test-output.txt`

The test proves the exact state that the UI enters on every new-message send:
1. `ChatPaneInterface.tsx:326` injects an optimistic user message into the
   `listMessages` TanStack Query cache via `setData`. This makes the optimistic
   message the LAST item in `historicalMessages`.
2. `withoutActiveTurnAssistantHistory` calls `findLastUserMessageIndex` to find
   the boundary between "previous turns" and "active turn" messages.
3. `findLastUserMessageIndex` returns the index of the OPTIMISTIC message (the
   tail), so `activeTurnMessages = messages.slice(optimisticIndex + 1) = []`.
4. The dedup filter has nothing to filter. The in-flight assistant message
   (`a_1`, no `stopReason`) remains in `historicalMessages`.
5. `useChatDisplay` renders BOTH `currentMessage` (the streaming slot) AND
   `historicalMessages[...a_1]` — duplicate visible to the user.

The test output shows:
```
expected: []
received: ["a_1"]
```

This is deterministic: it fires on EVERY new message where `ChatPaneInterface`
uses the `setData` path to inject an optimistic user message before the polled
`listMessages` response arrives with the in-flight assistant message appended.

## Root cause

**File**: `packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts:77`

`findLastUserMessageIndex` traverses the merged message list (including any
optimistic user message appended by `ChatPaneInterface.tsx:326`) to find the
"active turn boundary". When the optimistic user message sits AFTER an in-flight
assistant message in the list, the function lands on the optimistic message as the
last user message. This makes `activeTurnMessages` (the slice after it) empty,
defeating the entire dedup guard.

The root cause is that `withoutActiveTurnAssistantHistory` was written for a world
where the merged list is `[...historicalMessages]` only — but `ChatPaneInterface`
injects optimistic messages into the TanStack Query cache (`session.listMessages`
cache key), causing the merged list to be
`[...historicalMessages, optimisticMessage]`.
`optimisticMessage` lands after any in-flight assistant turn, so the turn-boundary
calculation is always wrong during the flicker window.

**Secondary contributor** (same root cause): `useChatDisplay` itself also manages
its own optimistic message (`setOptimisticUserMessage` at line 170), meaning
optimistic user messages enter the final `messages` array via two separate channels:

1. `ChatPaneInterface.tsx:326` → TanStack Query cache (`historicalMessages`)
2. `useChatDisplay.ts:209` → direct concat onto `historicalMessages`

When both channels fire in the same render cycle, the same optimistic text can
appear twice AND the turn-boundary calculation breaks.

## Specialist consultation summary

None required for minimum/moderate options. The strategic option (tRPC subscription
+ reducer) requires the observable pattern per `apps/desktop/AGENTS.md`.

## Option 1: minimum

**one_line**: Fix `withoutActiveTurnAssistantHistory` to exclude optimistic messages
from the turn-boundary search, so the dedup filter works correctly regardless of
whether an optimistic message was injected into the history list.

**files_in_scope**:
- `packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts`
- `packages/chat/src/client/hooks/use-chat-display/use-chat-display-race.test.ts`
  (the failing test created as evidence; must be made passing by the fix)

**loc_budget**: ~20 LOC changed, ~10 LOC new (test assertions).

**acceptance_criteria**:
- AC-1: `bun test packages/chat/src/client/hooks/use-chat-display/use-chat-display-race.test.ts`
  exits 0 (currently fails with `["a_1"] !== []`).
- AC-2: `bun test packages/chat/src/client/hooks/use-chat-display/use-chat-display.test.ts`
  continues to exit 0 (no regression in existing tests).
- AC-3: Human verification — start a fresh chat session, send a message, observe
  no duplicate/flickering assistant message in the first response turn.
- AC-4: The dual `sendMessage` path in `ChatPaneInterface.tsx` (the `setData`
  injection path at :326) and the `useChatDisplay` internal optimistic path (:209)
  must not both fire for the same message. If both exist, one must be deleted or
  gated. (The fix may consolidate to one optimistic path as a side effect of the
  turn-boundary fix — that is in scope.)

**out_of_scope**:
- Changing the polling interval or introducing a tRPC subscription (that is Option 3).
- Removing `withoutActiveTurnAssistantHistory` entirely (that requires the subscription).
- Any changes outside `use-chat-display.ts` except deleting the `setData` injection
  in `ChatPaneInterface.tsx` IF the fix requires consolidating to a single optimistic
  path.
- Fixing the broader H4 finding (60fps polling override in ChatPaneInterface.tsx:273).
  That is a separate defect.
- Addressing H10 text-equality reconciliation bug (keying optimistic messages by ID
  instead of text). That is a follow-up.

**risks**:
- The `ChatPaneInterface.tsx:326` `setData` injection path was introduced to provide
  faster optimistic feedback than the hook's internal path; removing it may cause a
  perceived regression in instant-feedback latency. Mitigation: keep the internal
  optimistic path in `useChatDisplay`, which already serves this purpose.
- The fix to `findLastUserMessageIndex` must not break the "preserve completed prior
  turns" invariant (covered by existing test "preserves completed turns...").
- Two worktrees (`justinrich-chatbugs`, `chat-v2`) are modifying `use-chat-display.ts`
  and `ChatPaneInterface.tsx` — see File-Overlap Warnings below.

---

## Option 2: moderate

**one_line**: Fix the turn-boundary bug (Option 1) AND eliminate the dual-optimistic-
message path by removing `ChatPaneInterface`'s `setData` injection so all optimistic
state flows through a single channel in `useChatDisplay`.

**files_in_scope**:
- `packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts`
- `packages/chat/src/client/hooks/use-chat-display/use-chat-display-race.test.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/ChatPaneInterface/ChatPaneInterface.tsx`

**loc_budget**: ~50 LOC changed.

**acceptance_criteria**:
- AC-1 through AC-4 from Option 1, plus:
- AC-5: `grep -n "listMessages.setData" apps/desktop/src/.../ChatPaneInterface.tsx`
  returns zero matches (the dual-path injection is gone).
- AC-6: The `sendMessageToSession` helper in `ChatPaneInterface.tsx` no longer writes
  directly to the `listMessages` cache; all optimistic user messages flow through
  `useChatDisplay.commands.sendMessage`.

**out_of_scope**:
- Introducing a tRPC subscription.
- Removing `withoutActiveTurnAssistantHistory` (still needed as long as polling is
  used — removing it is only safe once the subscription lands).
- The H4 60fps polling override fix.

**risks**:
- Removing `ChatPaneInterface`'s `setData` path requires verifying that
  `useChatDisplay`'s internal optimistic path correctly handles the
  `sendMessageToSession` helper call path (used when the session ID changes between
  the send call and the optimistic inject). If not handled, there may be a brief
  regression in optimistic feedback for that edge case.
- The `ChatPaneInterface.tsx` file is touched by two active worktrees
  (`justinrich-chatbugs`, `chat-v2`) — HIGH overlap risk.

---

## Option 3: strategic

**one_line**: Replace the dual-poll model entirely with a single push-based tRPC
observable subscription on `session.watchDisplayState`, fold events into a
client-side reducer in `useChatDisplay`, and delete both dedupe band-aids
(`withoutActiveTurnAssistantHistory` and the optimistic-reconciliation useEffect).

**NOTE**: This is the ticket author's proposed approach (HINT). It is the correct
architectural direction for this codebase. It is flagged here as separate-sprint
material because: (a) it requires a new server-side procedure and harness event
forwarding, (b) it touches `packages/host-service` and `packages/trpc` in addition
to the client, (c) two active worktrees (`justinrich-chatbugs`, `chat-v2`) are
already planning this exact architecture (see `plans/v2-chat-greenfield-architecture.md`
in both), meaning a standalone PR risks immediate conflict.

**files_in_scope**:
- `packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts` (rewrite)
- `packages/chat/src/server/trpc/service.ts` (add `session.watchDisplayState` subscription)
- `packages/chat/src/server/trpc/zod.ts` (subscription input schema)
- `packages/chat/src/server/trpc/utils/runtime/runtime.ts` (event emission)
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/ChatPaneInterface/ChatPaneInterface.tsx` (consume subscription)

**loc_budget**: ~400-600 LOC (significant rewrite). Justified: deletes ~150 LOC of
dedupe band-aids, adds ~450 LOC of subscription + reducer infrastructure.

**acceptance_criteria**:
- AC-1: No `withoutActiveTurnAssistantHistory` function exists in `use-chat-display.ts`.
- AC-2: No optimistic-reconciliation `useEffect` exists in `use-chat-display.ts`.
- AC-3: `grep -rn "getDisplayState\|listMessages" packages/chat/src/client/` returns
  zero hits (both polls replaced by subscription).
- AC-4: `session.watchDisplayState` subscription uses `observable()` pattern per
  `apps/desktop/AGENTS.md` (NOT async generator).
- AC-5: Start a new chat session and send a message — no flicker or duplicate
  message. Verified by human in dev mode.
- AC-6: Existing display-state unit tests rewritten for reducer behavior and pass.

**out_of_scope**:
- Removing the v1 stack registration (SUPER-753 scope is the flicker fix only).
- Implementing the v2 greenfield architecture from `justinrich-chatbugs`/`chat-v2`
  worktrees — this is a tactical fix of the existing v1 polling model.
- Fixing H4 60fps override (that is a separate one-line change regardless).

**risks**:
- **HIGH OVERLAP**: `justinrich-chatbugs` and `chat-v2` worktrees are both planning
  a full rewrite of `use-chat-display.ts` to a reducer-based architecture. A
  separate strategic PR here would conflict directly with that work. Recommend
  deferring Option 3 until the greenfield plan from those worktrees is resolved.
- The observable subscription requires the mastracode harness to emit display-state
  events synchronously; if it emits only on `agent_end`, the streaming intermediate
  state is lost and `currentMessage` can't be driven from events. Must verify harness
  event granularity before committing to this path.
- Implementer must use `observable()` not async generators — the existing test suite
  does not currently catch this mistake.

---

## File-Overlap Warnings

- `packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts`:
  ACTIVE in worktrees `justinrich-chatbugs` AND `chat-v2`. Both are planning a
  full rewrite of this file to a reducer-based subscription architecture. Any change
  here will conflict at merge time.

- `apps/desktop/src/renderer/.../ChatPaneInterface.tsx`:
  ACTIVE in worktrees `justinrich-chatbugs` AND `chat-v2`. Both modify this file
  as part of the greenfield chat architecture plan.

**Recommendation**: Option 1 (minimum, ~20 LOC) has the smallest merge conflict
surface. Option 2 risks a conflict in `ChatPaneInterface.tsx`. Option 3 directly
competes with the active greenfield worktrees and should be deferred.

## Deferred follow-ups

See `.spec/improvements/SUPER-753/follow-ups.md`
