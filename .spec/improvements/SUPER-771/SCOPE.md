---
ticket_id: SUPER-771
status: binding
chosen_option: moderate
loc_budget: 90
task_chunks: 1
investigator_specialist: electron-reviewer
challenger_specialist: code-reviewer
created_at: 2026-05-20
bound_at: 2026-05-21
---

# SUPER-771: Loud failures for automation runs

## Defect

Automation runs that fail with `dispatch_failed` or `skipped_offline` show only a tiny red dot in the run history; the error text is raw transport jargon (`dispatch: relay 503: {"error":"Host not connected"}`) surfaced only in a hover Tooltip capped at `max-w-xs`. Users are never proactively notified. Since these failures are intentionally not retried, the run is silently lost.

## Reproduction

Evidence: `.spec/improvements/SUPER-771/evidence/prong-a-previousrunslist.md`, `.spec/improvements/SUPER-771/evidence/prong-b-no-failure-notification.md`, `.spec/improvements/SUPER-771/evidence/grep-dispatch-failed-paths.txt`, `.spec/improvements/SUPER-771/evidence/grep-notification-paths.txt`

**Prong A**: `PreviousRunsList.tsx:80-89` wraps the error row in a `<Tooltip>` with `className="max-w-xs"`. The main row shows only a red dot + title + time-ago. No inline error affordance exists. The raw `run.error` string — e.g. `"dispatch: relay 503: {\"error\":\"Host not connected\"}"` — is tooltip-only, clipped at 256px, and lacks `select-text cursor-text` (required by `apps/desktop/AGENTS.md`).

**Prong B**: Full grep of `dispatch_failed` / `skipped_offline` in `apps/desktop/src/` (excluding tests) returns exactly two lines — both the `STATUS_DOT` color map in `PreviousRunsList.tsx`. No code path calls `electronTrpcClient.notifications.showNative.mutate(…)` or any other notification API on automation failure. The `showNative` mutation exists in `notifications.ts:96-122` and is called only for agent lifecycle events in `V2NotificationController/lib/lifecycleEvents.ts:158-173`.

Challenger re-verification (2026-05-21): all 4 evidence files VALID. Tooltip `max-w-xs` pattern confirmed at `PreviousRunsList.tsx:80-89`. `dispatch_failed|skipped_offline` grep re-run returns exactly 2 STATUS_DOT hits, no notification call sites. No fabricated evidence.

## Root cause

**Prong A — two sub-causes:**

(i) **Renderer surface**: `PreviousRunsList.tsx:80-89` — error is tooltip-only with `max-w-xs`; no inline text, no `select-text cursor-text`, no human translation.

(ii) **Error string source**: `relay-client.ts:67-68` formats errors as `relay ${status}: ${rawBody.slice(0, 500)}`. For a relay 503, `rawBody` = `{"error":"Host not connected"}`. `dispatch.ts:364-365` wraps this with a `dispatch: ` prefix via `describeError`. The persisted error is `"dispatch: relay 503: {\"error\":\"Host not connected\"}"` — a transport artifact, not user copy.

The QStash path (`run-failed/route.ts:90`) uses different framing: `"delivery failed after retries (status N): ..."` — a separate write site, separate format. QStash-path copy parity is deferred (see follow-ups).

**Prong B — absence:**

The renderer receives `automation_runs` rows via Electric SQL (`collections.ts:683-697`, `createPersistedElectricCollection`). On mount, the collection re-hydrates from the SQLite cache and delivers all existing rows (challenger-confirmed). No component subscribes to this collection for status transitions. The notification infrastructure (`notifications.ts` + `showNative` mutation) is in place but not wired to automation run events. Natural insertion point: a renderer-side provider/hook that observes the `automationRuns` collection for rows newly entering `dispatch_failed` / `skipped_offline` and calls `showNative`, with a per-session `useRef` set tracking already-notified run IDs to handle Electric re-emit on mount/reconnect.

## Binding scope (chosen: moderate)

The founders' explicit ask in the #founders Slack thread (2026-05-14) was "popup/notification" — this scope addresses BOTH prongs because the visibility goal requires both. Per the umbrella spec, this remains a single PR (task_chunks=1); the renderer-surface and notifier-provider work share file-level dependencies (Electric collection access) and produce an atomic user-visible fix.

### Acceptance criteria

- **AC-1**: When `run.status` is `dispatch_failed` or `skipped_offline`, the failed run row in `PreviousRunsList` displays the error text inline (below or beside the title), not exclusively on hover. Verify by opening an automation with a previously-failed run row.
- **AC-2**: The inline error text carries `select-text cursor-text` CSS classes so users can copy it into bug reports (per `apps/desktop/AGENTS.md`).
- **AC-3**: A relay 503 "Host not connected" failure displays as human-readable copy (e.g., "Target machine was offline") rather than `dispatch: relay 503: {"error":"Host not connected"}`. Verify by inducing a 503 with the relay service offline.
- **AC-4**: The `describeError` helper (or `relay-client.ts` message format) translates known relay status codes (503 → "Target machine was offline"; other codes → fallback human string) without breaking the existing `describeError` call signature.
- **AC-5**: When an automation run row transitions to `dispatch_failed` or `skipped_offline` in the Electric-synced collection, a desktop notification appears: title = "Automation failed", body = human-readable error (not raw relay text). Verify by disabling the host service and triggering a scheduled run.
- **AC-6** (clarified by challenger): The notification fires at most once per run ID **within the current app session**, tracked via a `useRef<Set<string>>` of already-notified run IDs. Cross-session dedup (notification firing on app reopen for a run that was already failed when the app last closed) is acceptable for v1 — the founders' intent is "proactively tell the user", and re-surfacing a forgotten failure on app reopen serves that goal. Cross-window dedup is also acceptable in v1 (deferred to follow-ups). Verify by triggering a failure, then triggering a second failure of the same run ID (e.g., via repeated scheduled trigger of a still-offline host) → only one notification fires within the session.
- **AC-7**: The `AutomationFailureNotifier` provider mounts inside `_authenticated/layout.tsx` and observes `collections.automationRuns`. It tracks already-notified run IDs in a `useRef` (not persisted state) to satisfy AC-6 within the current session.

### Files in scope

```
packages/trpc/src/router/automation/relay-client.ts
packages/trpc/src/router/automation/dispatch.ts
apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/components/PreviousRunsList/PreviousRunsList.tsx
apps/desktop/src/renderer/routes/_authenticated/providers/AutomationFailureNotifier/AutomationFailureNotifier.tsx (new)
apps/desktop/src/renderer/routes/_authenticated/providers/AutomationFailureNotifier/index.ts (new)
apps/desktop/src/renderer/routes/_authenticated/layout.tsx
```

The implementer is licensed to touch these files and no others. Any file not listed above is OUT of scope.

### Out of scope

- QStash retry-exhaustion path (`apps/api/src/app/api/automations/run-failed/route.ts`) — copy parity deferred to follow-ups.
- Schema changes (no `failureReason` enum, no new columns).
- Retry-now UI affordance on the failed row.
- Cross-window notification dedup (within-session ref-dedup is sufficient for v1).
- Cross-session notification dedup (re-surfacing on app reopen is acceptable).
- Extending `apps/desktop/src/lib/trpc/routers/notifications.ts` `v2NotificationSourceSchema` to add an `automation` source type — only required if run-ID-keyed dedup via `activeNativeNotifications` is desired, which is deferred (challenger flag #3).
- Run-history virtualization.
- Failure-detail modal.

### Risks

- **HIGH: Sibling-worktree merge conflicts**. The sibling `/Users/justinrich/Projects/superset/.claude/worktrees/super-771-loud-failures/` branch has 3 commits (AUTO-LOUD-001/-002/-003) touching files also in this scope. Recommendation: **abandon the sibling**; do not cherry-pick its design (it added a tRPC procedure not sanctioned by this scope). The sibling's `PreviousRunsList.tsx` rendering pattern may be consulted for reference only.
- **MEDIUM: Notification firing on app launch for pre-existing failures**. Because Electric re-hydrates from SQLite on mount and delivers existing rows, the first launch after a failure WILL fire the notification. This is the desired behavior per founders ("proactively tell the user"), but should be confirmed during implementation review. If the founders push back, the fix is adding a `notifiedBefore?: Date` check or a localStorage-backed seen-set — but that is explicitly deferred for v1.
- **LOW: `notifications.ts` schema gap**. `v2NotificationSourceSchema` (`notifications.ts:38-41`) only accepts `terminal` / `chat` source types. For automation failures, `clickTarget` must be omitted in the `showNative.mutate` call → `getNativeNotificationKey()` falls back to a counter key, NOT run-ID-based. The implementer must NOT pass an automation source type and must NOT assume `activeNativeNotifications` cross-window dedup works. Within-session `useRef` dedup (AC-6) is the binding contract.
- **MEDIUM: Translation drift**. Putting human copy in `relay-client.ts` / `describeError` means the persisted `automationRuns.error` column carries the translated string. If error wording changes later, historical rows show old copy. Acceptable for v1; follow-up will introduce a structured `failureReason` enum so display copy can be regenerated.

## Considered alternatives

### Option 4 (challenger-proposed): renderer-only translation, 15 LOC, 1 file
Rejected. Delivers prong A only (inline error + `select-text`) and ignores the founders' explicit "popup/notification" ask. Reduces blast radius (no `packages/trpc` touch, no sibling conflict) and is the fastest implementation, but the visibility goal — not legibility alone — is the actual founder ask. Score: solves <50% of the reported defect.

### minimum (35 LOC, 3 files)
Rejected. Delivers prong A only via server-side `describeError` normalization + inline error display. Better long-term data quality than Option 4 (translated copy persists in DB, future surfaces inherit it), but still ignores prong B (no proactive notification). Same gap as Option 4 against the founder ask.

### strategic (200+ LOC, schema migration)
Rejected. Adds a typed `failureReason` enum column + Drizzle migration + QStash-path parity. Both specialists explicitly flagged this as scope creep ("cleanup pass dressed as a bug fix"). The schema change requires a Neon branch + production migration coordination that is disproportionate to the reported defect. Captured in `follow-ups.md` for a future sprint.

## Challenger notes

The challenger (code-reviewer, fresh-eyes) confirmed:

1. **Evidence is honest.** All 4 evidence artifacts re-verified against current main; no fabrication. Investigator's reproduction characterization is accurate.
2. **A smaller option exists** (Option 4). The picker rejected it because it does not satisfy the founder ask — but the picker has been informed that Option 4 is available and trades visibility-completeness for blast-radius.
3. **Minimum proves partial fix only** (prong A: yes, prong B: no). Documented above under "Considered alternatives → minimum".
4. **Electric re-emit confirmed.** `createPersistedElectricCollection` uses `@tanstack/electron-db-sqlite-persistence`; on mount it re-delivers cached rows. The `useRef<Set<string>>` dedup in AC-7 is necessary and correctly designed.
5. **AutomationFailureNotifier is the right structure.** Inlining into `V2NotificationController` would mix workspace/agent lifecycle with automation-run observation — separate concerns, no LOC savings.
6. **Sibling branch should be abandoned.** Its AUTO-LOUD-003 commit adds a tRPC procedure not sanctioned by this scope. Do not adopt its notification architecture; consult AUTO-LOUD-002 for the inline-error rendering pattern only.
7. **Hidden schema gap** in `notifications.ts:38-41` (`v2NotificationSourceSchema` accepts only terminal/chat sources). This DOES NOT block AC-5/AC-6/AC-7 as written — within-session `useRef` dedup is sufficient. The implementer must not rely on `activeNativeNotifications` cross-window dedup via run-ID keys.

## Scope amendments

(empty — populated only if the implementer surfaces a real blocker that requires the picker to re-bind)

## Deferred follow-ups

See `.spec/improvements/SUPER-771/follow-ups.md` for:

- Typed `failureReason` enum on `automationRuns` (deferred from strategic option)
- QStash retry-exhaustion path copy parity with dispatch path
- Cross-window notification dedup (extending `v2NotificationSourceSchema`)
- Cross-session notification dedup (persisted seen-set)
- "Retry now" CTA on failed rows
- `PreviousRunsList` virtualization
- Dedicated failure-detail modal/sheet
