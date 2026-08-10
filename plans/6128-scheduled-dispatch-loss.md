# #6128: scheduled dispatch silently lost on the terminal slot of bounded rules

## Root cause (fixed in this branch)

Race between the two halves of the scheduled path, no host/relay involvement:

1. `apps/api/src/app/api/automations/evaluate/route.ts` enqueues the QStash
   dispatch job, then advances `next_run_at` — or, when the rrule is exhausted
   (`COUNT`/`UNTIL`), sets `enabled = false`. The disable UPDATE reliably lands
   before QStash's outbound HTTP delivery.
2. `apps/api/src/app/api/automations/dispatch/[id]/route.ts` reloaded the row
   and returned 200 `{skipped: "disabled"}` for any `enabled = false`
   automation — it couldn't tell "user paused" from "we just disabled this
   because of the very slot being delivered".

So the **terminal occurrence of every bounded rule** was dropped: no run row
(every row-writing path lives inside `dispatchAutomation`, downstream of the
guard), no `workspaces.create`, and QStash saw a 200 so retries and the
`run-failed` failure callback never fired. `FREQ=DAILY;COUNT=1` can never fire.
Run-now works because `runNow` (`packages/trpc/src/router/automation/automation.ts`)
calls `dispatchAutomation` directly with no `enabled` check.

The earlier Mac-host losses in the report (`skipped_offline`,
`Tunnel disconnected`) are a separate, genuine host-availability class — those
did write rows. Relay-presence accuracy is tracked in #6014/#6160.

## Fix shipped here

- `evaluate` computes the next occurrence before enqueueing and sends
  `terminal: true` on the payload when the rule is exhausted.
- `dispatch` lets a disabled automation through when the payload is terminal
  AND `bucketToMinute(next_run_at)` still equals `scheduledFor` (the disable
  path leaves `next_run_at` at the terminal occurrence; any other transition
  moves it, so stale replays can't match).
- Any delivery still dropped on the disabled guard now persists a
  `dispatch_failed` run row (`automation disabled before dispatch delivery`)
  instead of vanishing.

Regression tests: `evaluate/route.test.ts`, `dispatch/[id]/route.test.ts`.

## E2E verification (2026-08-06, local stack)

Real QStash enqueue→deliver (QStash dev server on :8080), real `next dev`
API on :4721, workspace's isolated Neon branch DB. Seeded automations owned
by kiet@superset.sh with a nonexistent `targetHostId` (so a dispatch attempt
records `skipped_offline` rather than touching a host). Before/after gate:

| Scenario | Pre-fix (stashed) | Post-fix |
|---|---|---|
| `FREQ=DAILY;COUNT=1` terminal slot | dispatch handler hit, returned 200 `skipped:"disabled"`; **0 run rows**, `enabled:false` — bug reproduced | run row `skipped_offline` persisted, `enabled:false` |
| `FREQ=MINUTELY;COUNT=2` | (not run — slot 1 was already known-good) | slot 1 AND terminal slot 2 both persisted rows across two ticks, then clean disable |
| Late delivery to a paused automation (`terminal:false`) | silent 200, no row | `dispatch_failed` row "automation disabled before dispatch delivery" |

Not exercised e2e: the happy path through relay→`workspaces.create`→agent
(no live host/relay in the local stack). That path is `dispatchAutomation`,
which is byte-identical for scheduled and manual runs and unchanged by this
fix; manual runs prove it in production. Test rows were deleted from the
branch DB afterwards; the evaluate ticks also swept other due automations
seeded in the branch copy (branch-local writes only).

## Remaining product/infra decisions (not done here)

1. **Stop overloading `enabled` for exhaustion.** A finished series and a
   paused automation are indistinguishable (`packages/db/src/schema/schema.ts`
   has only the boolean). A `completedAt` timestamp or status enum would let
   the UI say "completed" vs "paused" and would remove the need for the
   `terminal` flag entirely. Needs a migration + UI work.
2. **Retry/backfill for missed slots.** `evaluate` advances `next_run_at`
   unconditionally, and `skipped_offline` is terminal in
   `packages/trpc/src/router/automation/dispatch.ts` — a missed minute is gone
   forever. Options: bounded re-enqueue on `skipped_offline`, or a catch-up
   sweep re-selecting recent slots that lack a successful run row. Interacts
   with hosts that are asleep on purpose (do users want a burst on wake?).
3. **Relay presence accuracy** (`v2Hosts.isOnline`) — #6014 shows the daemon
   healthy while the cloud sees it offline. Separate failure class; needs its
   own investigation of relay check-in/tunnel state, plus a CLI diagnostic
   exposing the cloud's view of host presence.
