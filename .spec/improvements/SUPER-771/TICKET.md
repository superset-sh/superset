---
ticket_id: SUPER-771
ticket_url: https://linear.app/superset/issue/SUPER-771
tracker: linear
title: "Loud failures for automation runs (surface error + notify)"
labels: [bug, automations, ux, notifications]
priority: High
fetched_at: 2026-05-20
fetched_by: kb-improvement-plan
source: user-paste (grooming notes from command args)
---

# ISSUE

When an automation run fails, the only signal is a tiny red dot in the run history with a truncated tooltip (e.g. `dispatch: relay 503:`) — the actual failure reason is cut off and the user is never proactively told. Most failures are "target host offline" / relay-unreachable, which we deliberately do not retry, so a silent failure means the run is just lost. We want failures to be surfaced loudly (notification/popup) with a complete, human-readable error.

## References

| Source | Who | Link | Date |
|---|---|---|---|
| Slack #founders thread | Kiet Ho / Satya Patel | link | 2026-05-14 |

**Origin:** Kiet raised that automations should not "fail silently"; he and Satya agreed on a popup/notification when a run fails ("hey these failed to run") rather than a silent retry. The screenshot shows the truncated `dispatch: relay 503:` tooltip in the run history.

## Implementation notes

### Files

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/components/PreviousRunsList/PreviousRunsList.tsx:80-89` — renders `run.error` only inside a hover Tooltip capped at `max-w-xs`; the full message is effectively hidden. This is the surface in the screenshot.
- `packages/trpc/src/router/automation/dispatch.ts:157,364-368` — `describeError(err, "dispatch")` produces the `dispatch: <message>` strings. For a relay 503 the inner message is `relay 503: {"error":"Host not connected"}`.
- `packages/trpc/src/router/automation/relay-client.ts:67-72` — `RelayDispatchError` formats `relay ${status}: ${body}`; the 503 body comes from `apps/relay/src/index.ts:160` (`{"error":"Host not connected"}`).
- `apps/api/src/app/api/automations/run-failed/route.ts:90` — the QStash retry-exhaustion path writes a separate `delivery failed after retries (status N): ...` error onto the run row.
- `packages/db/src/schema/schema.ts` — `automationRuns.error` / `status` (`skipped_offline`, `dispatch_failed`) is the persisted failure data.

### Approach

Two parts.

1. **Make the error legible where it already renders:** the run-history row should show the failure inline (not only a clipped tooltip), and translate raw transport strings into human copy — `relay 503` / `Host not connected` should read as "Target machine was offline" rather than `dispatch: relay 503:`.
2. **Surface failures proactively:** when a run lands in `dispatch_failed` / `skipped_offline`, fire a desktop notification or in-app popup ("Automation 'X' failed to run — target machine offline"), since we intentionally do not retry.

Error normalization should live close to `describeError` so both the dispatch path and the run-failed QStash path produce consistent, user-facing copy.

### Gotchas

- Per `AGENTS.md`, rendered error text must carry `select-text cursor-text` so users can copy it into bug reports.
- We explicitly decided against auto-retrying failed automations (Satya, same thread) — the fix is **visibility, not retry**.

## Grooming comments

Groomed into the canonical format. Traced the `dispatch: relay 503:` error to its source: `RelayDispatchError` (relay-client.ts) → `describeError(err, "dispatch")` in dispatch.ts, surfaced as a clipped tooltip in PreviousRunsList.tsx. Origin found in the #founders Slack thread (2026-05-14) where Kiet and Satya agreed automations should not fail silently and want a popup/notification. Set priority to High (was No priority) — silent, un-retried failures of a paid feature. Status/assignee/cycle untouched.
