# SUPER-753 — Deferred Follow-Ups

These were noticed during investigation but are NOT in any of the three scope options.
Each should become its own improvement ticket.

---

## FU-1: 60fps polling override should be reverted to 4fps (or adaptive)

**Why deferred**: The `fps: 60` override at `ChatPaneInterface.tsx:273` amplifies
the dual-poll race (more ticks = more race windows) but is not the root cause of the
specific flicker bug. Reverting to 4fps alone would reduce flicker frequency but not
eliminate it.

**Impact**: H4 finding from the red-hat review. ~250 IPC calls/sec/pane with
`refetchIntervalInBackground: true`. Battery drain + amplifies M5/M6 per-request
costs. One-line fix (`fps: 60` → `fps: isRunning ? 4 : 1`).

**Suggested ticket**: "Adaptive chat polling rate: `fps: 4` active, `fps: 1` idle,
no background polling"

---

## FU-2: Key optimistic messages by mutation-return ID, not text content

**Why deferred**: The text-equality reconciliation bug at `use-chat-display.ts:177-206`
(H10 from the red-hat review) is a separate bug from the turn-boundary dedup failure.
It causes phantom duplicate messages when the user sends identical texts repeatedly,
and fails entirely for file-only messages. Fixing it requires the `sendMessage`
mutation to return the committed message ID — a server-side change outside Option 1/2 scope.

**Suggested ticket**: "Chat: key optimistic user message by server-assigned ID to
fix duplicate-message phantom on repeated sends"

---

## FU-3: Eliminate `withoutActiveTurnAssistantHistory` entirely (requires subscription)

**Why deferred**: The dedup filter is a band-aid that compensates for the dual-poll
race. The correct fix is to eliminate the race by switching to a push-based
`session.watchDisplayState` subscription (Option 3). This is already being planned
in the `justinrich-chatbugs` and `chat-v2` worktrees as part of the greenfield
chat architecture. Coordinate with those workstreams rather than creating a competing PR.

**Suggested ticket**: Already tracked in `justinrich-chatbugs/plans/v2-chat-greenfield-architecture.md`.

---

## FU-4: `ensureSessionReady` / session-start gap causes "session still starting" errors

**Why deferred**: The ticket mentions "ensure the session ID is established before the
first send so there's no 'session still starting' gap." This is a separate startup
race (the session creation RPC vs. the first `sendMessage` call). It is visible in
`ChatPaneInterface.tsx`'s `sendMessageForSession` path and the
`commands.sendMessage` guard at `use-chat-display.ts:224-229`. The flicker fix does
not close this gap — it only prevents the duplicate-message render once the session
IS running.

**Suggested ticket**: "Chat: eliminate 'session still starting' error on fast first-send
by ensuring session ID is resolved before UI accepts input"
