# SUPER-771-loud-failures: Loud failures for automation runs

> Status: ⬜ Pending
> Assignee: electron-implementer
> Priority: P1
> Type: bugfix
> Files: packages/trpc/src/router/automation/relay-client.ts, packages/trpc/src/router/automation/dispatch.ts, apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/components/PreviousRunsList/PreviousRunsList.tsx, apps/desktop/src/renderer/routes/_authenticated/providers/AutomationFailureNotifier/AutomationFailureNotifier.tsx, apps/desktop/src/renderer/routes/_authenticated/providers/AutomationFailureNotifier/index.ts, apps/desktop/src/renderer/routes/_authenticated/layout.tsx
> Patterns: minimum-diff-discipline, anti-stub
> Scope: .spec/improvements/SUPER-771/SCOPE.md
> Design: .spec/tasks/SUPER-771/design/PreviousRunsList-failed-row.md, .spec/tasks/SUPER-771/design/AutomationFailureNotifier.md

## Context

Automation runs that fail with `dispatch_failed` or `skipped_offline` currently show only a tiny red dot in the run history; the error text is raw transport jargon (`dispatch: relay 503: {"error":"Host not connected"}`) clipped inside a `max-w-xs` hover tooltip. Users are never proactively notified, and since these failures are intentionally not retried, the run is silently lost.

Root cause summary: two prongs. (A) `PreviousRunsList.tsx:80-89` renders the error tooltip-only with `max-w-xs` and no `select-text` affordance, while the error string from `relay-client.ts:67-68` + `dispatch.ts:364-365` is a raw transport artifact instead of human copy. (B) No code observes `automationRuns` for status transitions to `dispatch_failed` / `skipped_offline`, so no notification fires. Electric SQL delivers the row updates via `createPersistedElectricCollection`; the natural insertion point is a renderer-side provider observing `collections.automationRuns`.

For full reproduction evidence, root-cause file:line refs, considered alternatives, and challenger notes, READ:
`.spec/improvements/SUPER-771/SCOPE.md`

That document is your binding contract. You may NOT touch files outside the `> Files:` list above. The two `> Design:` specs are hard visual + behavioral constraints — implement to the spec, do not riff.

## Acceptance Criteria

- [ ] AC-1: When `run.status` is `dispatch_failed` or `skipped_offline`, the failed run row in `PreviousRunsList` displays the error text inline (below or beside the title), not exclusively on hover.
- [ ] AC-2: The inline error text carries `select-text cursor-text` CSS classes so users can copy it into bug reports.
- [ ] AC-3: A relay 503 "Host not connected" failure displays as human-readable copy (e.g., "Target machine was offline") rather than `dispatch: relay 503: {"error":"Host not connected"}`.
- [ ] AC-4: The `describeError` helper (or `relay-client.ts` message format) translates known relay status codes (503 → "Target machine was offline"; other codes → fallback human string) without breaking the existing `describeError` call signature.
- [ ] AC-5: When an automation run row transitions to `dispatch_failed` or `skipped_offline` in the Electric-synced collection, a desktop notification appears: title = "Automation failed", body = human-readable error (not raw relay text).
- [ ] AC-6: The notification fires at most once per run ID **within the current app session**, tracked via a `useRef<Set<string>>` of already-notified run IDs. Cross-session and cross-window dedup are explicitly deferred.
- [ ] AC-7: The `AutomationFailureNotifier` provider mounts inside `_authenticated/layout.tsx` and observes `collections.automationRuns`. It tracks already-notified run IDs in a `useRef` (not persisted state) to satisfy AC-6 within the current session.

## Test Criteria

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | `PreviousRunsList` renders an inline error span (not tooltip-only) when run.status is `dispatch_failed` or `skipped_offline` | AC-1 | `bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/\$automationId/components/PreviousRunsList` | [ ] TRUE [ ] FALSE |
| 2 | The inline error span carries className containing `select-text` and `cursor-text` | AC-2 | `bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/\$automationId/components/PreviousRunsList` | [ ] TRUE [ ] FALSE |
| 3 | A relay 503 with body `{"error":"Host not connected"}` is normalized to a human-readable string (e.g., "Target machine was offline") in `run.error` | AC-3 | `bun test packages/trpc/src/router/automation/relay-client` | [ ] TRUE [ ] FALSE |
| 4 | `describeError` translates known relay status codes via the relay-client message normalization and preserves its existing call signature | AC-4 | `bun test packages/trpc/src/router/automation/dispatch` | [ ] TRUE [ ] FALSE |
| 5 | When a new row enters the `automationRuns` collection with `dispatch_failed` or `skipped_offline` status, `electronTrpcClient.notifications.showNative.mutate` is called with title `"Automation failed"` and body matching `run.error` | AC-5 | `bun test apps/desktop/src/renderer/routes/_authenticated/providers/AutomationFailureNotifier` | [ ] TRUE [ ] FALSE |
| 6 | When the same failed run ID is re-emitted by the collection (Electric reconnect or re-render), `showNative.mutate` is called exactly once across all emissions within a single component lifetime | AC-6 | `bun test apps/desktop/src/renderer/routes/_authenticated/providers/AutomationFailureNotifier` | [ ] TRUE [ ] FALSE |
| 7 | `AutomationFailureNotifier` is rendered inside `_authenticated/layout.tsx` and the component uses `useRef<Set<string>>` (not `useState`) for the notified-IDs set | AC-7 | `bun test apps/desktop/src/renderer/routes/_authenticated/providers/AutomationFailureNotifier && grep -q "<AutomationFailureNotifier" apps/desktop/src/renderer/routes/_authenticated/layout.tsx` | [ ] TRUE [ ] FALSE |

<!-- REQUIREMENT-CONTRACT v1
AC-1: When run.status is dispatch_failed or skipped_offline, the failed run row in PreviousRunsList displays the error text inline (below or beside the title), not exclusively on hover.
  verify: bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/components/PreviousRunsList
AC-2: The inline error text carries select-text cursor-text CSS classes so users can copy it into bug reports.
  verify: bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/components/PreviousRunsList
AC-3: A relay 503 "Host not connected" failure displays as human-readable copy (e.g., "Target machine was offline") rather than dispatch: relay 503: {"error":"Host not connected"}.
  verify: bun test packages/trpc/src/router/automation/relay-client
AC-4: The describeError helper (or relay-client.ts message format) translates known relay status codes without breaking the existing describeError call signature.
  verify: bun test packages/trpc/src/router/automation/dispatch
AC-5: When an automation run row transitions to dispatch_failed or skipped_offline in the Electric-synced collection, a desktop notification appears with title "Automation failed" and body matching the human-readable error.
  verify: bun test apps/desktop/src/renderer/routes/_authenticated/providers/AutomationFailureNotifier
AC-6: The notification fires at most once per run ID within the current app session, tracked via a useRef<Set<string>> of already-notified run IDs.
  verify: bun test apps/desktop/src/renderer/routes/_authenticated/providers/AutomationFailureNotifier
AC-7: The AutomationFailureNotifier provider mounts inside _authenticated/layout.tsx and observes collections.automationRuns. It tracks already-notified run IDs in a useRef (not persisted state).
  verify: bun test apps/desktop/src/renderer/routes/_authenticated/providers/AutomationFailureNotifier && grep -q "<AutomationFailureNotifier" apps/desktop/src/renderer/routes/_authenticated/layout.tsx
TC-1: Maps to AC-1
TC-2: Maps to AC-2
TC-3: Maps to AC-3
TC-4: Maps to AC-4
TC-5: Maps to AC-5
TC-6: Maps to AC-6
TC-7: Maps to AC-7
-->

## Out of scope

- QStash retry-exhaustion path (`apps/api/src/app/api/automations/run-failed/route.ts`) — copy parity deferred to follow-ups.
- Schema changes (no `failureReason` enum, no new columns).
- Retry-now UI affordance on the failed row.
- Cross-window notification dedup (within-session ref-dedup is sufficient for v1).
- Cross-session notification dedup (re-surfacing on app reopen is acceptable).
- Extending `apps/desktop/src/lib/trpc/routers/notifications.ts` `v2NotificationSourceSchema` to add an `automation` source type — implementer must OMIT `clickTarget` in the `showNative.mutate` call.
- Run-history virtualization.
- Failure-detail modal.
- Sibling branch `super-771-loud-failures` — explicitly ABANDONED; do not consult its design.

## Risks

- **HIGH**: Sibling worktree has been removed but branch `super-771-loud-failures` still exists with 4 commits. Do not cherry-pick — the binding scope's architecture is different (no new tRPC procedure; renderer-side provider only).
- **MEDIUM**: Notification fires on app launch for pre-existing failures because Electric re-hydrates from SQLite cache on mount. This is the desired behavior per founders' "proactively tell user" intent.
- **LOW**: `notifications.ts:38-41` `v2NotificationSourceSchema` only accepts `terminal` / `chat` source types. Implementer MUST NOT pass an automation source type — omit `clickTarget` entirely. Cross-window dedup via `activeNativeNotifications` will NOT work; within-session `useRef` dedup is the binding contract.
- **MEDIUM**: Translation strings are persisted in the DB `error` column. If wording changes, historical rows show old copy. Acceptable for v1; structured failureReason enum is a follow-up.

## Verification posture

Per `~/.claude/CLAUDE.md` Supreme Rule: the task is complete only when each AC is verified against REAL services. For UI ACs (AC-1, AC-2, AC-5, AC-7), that means visually verifying against a running app (`bun dev` in the worktree, navigate to an automation with a failed run, optionally trigger a new failure by stopping the local host service). For unit-test ACs (AC-3, AC-4, AC-6), the listed `Verify` command must exit 0 against the real dependency.

Both design specs (`> Design:` line above) are hard visual + behavioral constraints. Read them before writing code; do not deviate from the spec without amending it via the scope-amendment escape valve in the umbrella spec §4.7.

## Implementation order suggestion (non-binding)

The natural seam in this task is the IPC line. Implement in this order to keep each step verifiable:

1. **AC-3, AC-4** (server-side): Extract a relay-error normalization helper in `packages/trpc/src/router/automation/relay-client.ts` mapping status codes → human strings. Wire `describeError` to consume it. Add unit tests. Verify TC-3, TC-4 pass.
2. **AC-1, AC-2** (renderer surface): Modify `PreviousRunsList.tsx` per `design/PreviousRunsList-failed-row.md`. Component test. Verify TC-1, TC-2 pass.
3. **AC-5, AC-6, AC-7** (provider): Create `AutomationFailureNotifier/` directory + provider per `design/AutomationFailureNotifier.md`. Mount in `_authenticated/layout.tsx`. Component test + visual verification with `bun dev`. Verify TC-5, TC-6, TC-7 pass.

Each step should produce one commit referencing its AC(s) per umbrella spec §4.2 (`fix: <imperative> (AC-N, AC-M)`).
