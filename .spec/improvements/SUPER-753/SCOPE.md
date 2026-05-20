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

---

## Challenge

_Challenger role: `code-reviewer` (fresh-eyes, different specialist than investigator)._

### Reproduction re-verification

**Evidence file at time of challenge was VACUOUS** — the investigator's
`failing-test-output.txt` contained only `bun test v1.3.11 (af24e281)` (the bun version
header), not the claimed failure output `expected: [] / received: ["a_1"]`. The
investigator ran the test but their redirect captured only the header line.

This was caught by the challenger and patched by the orchestrator before binding: the
evidence file has since been replaced with the genuine 27-line failure transcript,
which matches the investigator's narrative exactly:

```
- []
+ [
+   "a_1",
+ ]
(fail) dual-poll race — flicker reproduction (FAILING)
0 pass / 1 fail / 1 expect() calls
```

Even before the patch, the challenger independently confirmed the bug is code-provable
by reading the failing test file end-to-end alongside `use-chat-display.ts:34-37`. With
`messages = [u_1, a_1_in_flight, optimistic-123]`:

1. `findLastUserMessageIndex` scans from the tail, lands on `optimistic-123`.
2. `activeTurnMessages = messages.slice(optimisticIndex + 1) = []`.
3. Dedup filter has nothing to remove. `a_1` survives.
4. `assistantIds = ["a_1"]` — the failing assertion.

Bug is deterministic. **Status remains `proposal`, NOT `investigation-incomplete`** —
the bug is code-provable independently of the evidence-file deficiency, which has been
remediated.

### Smaller-than-minimum analysis

**Option 4 (challenger-proposed): micro-patch — skip `"optimistic-"` IDs in the turn-boundary search.**

**one_line**: Change `findLastUserMessageIndex` predicate to skip `"optimistic-"`-prefixed
IDs — 2-3 LOC in one private function, zero test code changes.

**files_in_scope**:
- `packages/chat/src/client/hooks/use-chat-display/use-chat-display.ts`

**loc_budget**: ~3 LOC changed (0 test LOC — the existing failing test from the
investigator validates the fix with no modifications).

**Proposed patch** (lines 34-37 of `use-chat-display.ts`):

```typescript
// BEFORE
function findLastUserMessageIndex(messages: ListMessagesOutput): number {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index]?.role === "user") return index;
    }
    return -1;
}

// AFTER
function findLastUserMessageIndex(messages: ListMessagesOutput): number {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const m = messages[index];
        // INVARIANT: optimistic messages use "optimistic-" ID prefix (both injection channels)
        if (m?.role === "user" && !m.id?.startsWith("optimistic-")) return index;
    }
    return -1;
}
```

**Why smaller than minimum**: The investigator's ~20 LOC Option 1 budget assumed
replacing or wrapping `findLastUserMessageIndex` with a more sophisticated filter (or
adding an `excludeOptimistic` parameter and updating callsites). The actual change is a
2-line predicate modification inside the existing private function. No test changes
needed — the existing failing test already exercises this exact code path.

**Prefix reliability**: Both optimistic injection channels use the `"optimistic-"`
prefix:

- `use-chat-display.ts:240`: `` `optimistic-${Date.now()}` ``
- `ChatPaneInterface/utils/optimisticUserMessage.ts:16`: `` `optimistic-${crypto.randomUUID()}` ``

**acceptance_criteria**:
- AC-1: `bun test packages/chat/src/client/hooks/use-chat-display/use-chat-display-race.test.ts`
  exits 0 (the investigator's failing test passes after the predicate change).
- AC-2: `bun test packages/chat/src/client/hooks/use-chat-display/use-chat-display.test.ts`
  continues to exit 0 (no regression).
- AC-3: Human verification — no flickering/duplicate assistant message on first
  message send in a new chat session.

**out_of_scope**:
- Consolidating the dual optimistic-message injection paths (Option 1's AC-4 and
  Option 2's AC-5/AC-6). That cleanup is FU-2.
- H10 text-equality reconciliation. That is FU-2.
- H4 60fps polling override. That is a separate defect already in follow-ups.

**risks**:
- The `"optimistic-"` prefix is an informal convention, not a typed contract. If a
  future optimistic-message creation site uses a different prefix, the dedup filter
  will silently break again. Mitigation: add `// INVARIANT` comments at both
  ID-creation sites.
- Does NOT fix the secondary user-message duplicate (the dual-channel optimistic
  state). That remains FU-2 territory.
- Does NOT consolidate the dual optimistic paths.

**rationale**: A 2-3 LOC predicate change inside a private function directly passes the
failing test without requiring test modifications. This is genuinely smaller than
Option 1's ~20 LOC estimate AND doesn't bundle in Option 1's AC-4 (dual-path
consolidation), which is a secondary concern.

### Minimum-proves-symptom-fix

**Yes — with one noted caveat.**

Causal trace after Option 4 micro-patch:

1. `findLastUserMessageIndex([u_1, a_1_in_flight, optimistic-123])` → skips
   `optimistic-123`, returns index of `u_1`.
2. `turnStartIndex = indexOf(u_1) + 1`.
3. `activeTurnMessages = [a_1_in_flight]`.
4. Dedup filter: `a_1_in_flight.stopReason === undefined` and `id === currentMessage.id`
   → filtered out.
5. Result: `[u_1, optimistic-123]` — no assistant messages in history.
6. `currentMessage` renders `a_1` exactly once. No flicker.

**Caveat (AC-3 human-visible)**: A residual brief user-message duplicate can occur when
both the `ChatPaneInterface.tsx:326` `setData` path and the hook's own
`optimisticUserMessage` state are active simultaneously (same text, two channels). That
is the H10/FU-2 bug — separate from the assistant-message flicker targeted by this
fix. AC-3 verification should specifically confirm the **assistant-message** flicker is
gone; a brief user-message flash is a separate tracked issue.

### Hidden scope-creep flags

- `apps/desktop/.../ChatPaneInterface.tsx` (Option 2): The `setData` injection removal
  (AC-5, AC-6) fixes a secondary structural issue, not the root cause tested by the
  failing test. The failing test does not require touching `ChatPaneInterface.tsx`.
  This file change is cleanup belonging in FU-2, not a requirement for the flicker
  fix. Including it in Option 2 expands conflict surface in a high-overlap file
  unnecessarily.
- `packages/chat/src/server/trpc/utils/runtime/runtime.ts` (Option 3): Adding harness
  event emission is **new functionality** with no relationship to the dedup bug. This
  is the first milestone of the v2 greenfield architecture, not a flicker fix. It
  should be removed from SUPER-753 scope entirely.
- `packages/chat/src/server/trpc/zod.ts` (Option 3): New subscription input schema —
  pure new API, not a flicker fix. Same disposition.
- `packages/chat/src/server/trpc/service.ts` (Option 3): New
  `session.watchDisplayState` procedure. Same disposition.

### File-overlap risk assessment

- **Option 1 / Option 4 (minimum/micro-patch)**: **LOW**. One file, ≤20 LOC (Option 4
  is 3 LOC) inside a private function, no exported-symbol rename, no new public API.
  A merge conflict with `justinrich-chatbugs` or `chat-v2` would be a trivial hunk
  resolvable in seconds. The private function is internal to `use-chat-display.ts` —
  the greenfield worktrees that plan to rewrite this hook entirely will either
  trivially absorb the patch during rebase or delete the function as part of their
  rewrite. No coordination required before landing.
- **Option 2 (moderate)**: **MEDIUM-HIGH**. `ChatPaneInterface.tsx` is confirmed
  modified in both `justinrich-chatbugs` and `chat-v2` worktrees. The `setData`
  injection region (lines ~319-348) is exactly where the greenfield work concentrates.
  Coordinate with both worktree owners before landing.
- **Option 3 (strategic)**: **HIGH** — directly competes with both active greenfield
  worktrees on `use-chat-display.ts` AND adds new server procedures. Defer to the
  greenfield sprint.

### Verdict

**Challenger proposes smaller.** Option 4 (micro-patch, ~3 LOC, one file, no test
changes) is the genuine minimum floor — smaller than the investigator's Option 1
(~20 LOC). Human should choose between:

- **Option 4** (micro-patch): fastest, smallest conflict surface, fixes the exact
  failing test, defers dual-path cleanup to FU-2.
- **Option 2** (moderate): fixes the dual-path structural issue simultaneously, but
  adds `ChatPaneInterface.tsx` overlap risk in a high-conflict file.
- **Option 1** (investigator's minimum): superseded by Option 4 — same fix conceptually
  but a larger LOC footprint and includes AC-4 (dual-path consolidation) which is FU-2
  cleanup, not flicker-fix scope.

Option 3 should be deferred to the greenfield sprint owned by `chat-v2` /
`justinrich-chatbugs`.
