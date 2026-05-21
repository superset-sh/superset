# SUPER-771: Loud failures for automation runs

## What this fixes

Failed automation runs (`dispatch_failed` / `skipped_offline`) used to surface only as a tiny red dot in the run history, with a truncated tooltip showing raw transport jargon (`dispatch: relay 503: {"error":"Host not connected"}`). Users were never proactively notified, and since these failures are intentionally not retried, the run was silently lost.

After this change, a failed run shows the error inline in the row (selectable for bug reports), the error string is translated from transport-code into human copy ("Target machine was offline"), and a desktop notification fires once per failed run within the current session.

Origin: #founders Slack thread (2026-05-14, Kiet/Satya) → "popup/notification, not silent retry". Decision was visibility, not retry.

## Why this approach

Two prongs needed to address:

1. **Render the error legibly inline** with `select-text cursor-text` (per `apps/desktop/AGENTS.md` users must be able to copy errors into bug reports).
2. **Translate the relay status code into human copy** at the boundary where the error is persisted, so any future surface reading `automationRuns.error` inherits the readable string.

For prong (2), translation lives in `relay-client.ts`'s `humanRelayMessage(status, rawBody)` helper rather than the renderer. This keeps the human copy as the persisted single source of truth and avoids duplicating translation logic across surfaces.

For the proactive notification (founder ask), an `AutomationFailureNotifier` provider observes the Electric-synced `automationRuns` collection and fires `electronTrpcClient.notifications.showNative.mutate(...)` once per failed run.id, with a `useRef<Set<string>>` deduplicating within the current app session. Cross-window and cross-session dedup were explicitly deferred (`notifications.ts:38-41` v2NotificationSourceSchema doesn't accept an automation source type — extending it is a follow-up).

The full investigator + challenger debate that produced this scope lives at `.spec/improvements/SUPER-771/SCOPE.md` (chosen option: moderate; rejected: minimum, Option-4, strategic).

## Binding scope

- **AC-1** (Inline error row): failed-row renders error inline below the title — `PreviousRunsList.tsx` (commits `ac6c53600`)
- **AC-2** (Copyable error): inline span carries `select-text cursor-text pl-4 text-xs text-destructive` — same file
- **AC-3** (Relay 503 → human copy): `humanRelayMessage(502→"Target machine is unreachable", 503→"Target machine was offline", 504→"Target machine timed out", default→"Relay error (status N): …")` wired at the `RelayDispatchError` throw site — `relay-client.ts` (commit `902f5a2cf`)
- **AC-4** (describeError unchanged): `describeError(err, context)` is identical to `main`; the human translation lives upstream in `relay-client.ts` so describeError just passes `err.message` through (no `err.name` prefix)
- **AC-5** (Notification fires): `electronTrpcClient.notifications.showNative.mutate({ title: "Automation failed", body: run.error || "Run failed" })` on `dispatch_failed` / `skipped_offline` — `AutomationFailureNotifier.tsx` (commits `ac9c8c37b`, `952514935`)
- **AC-6** (Within-session dedup): `useRef<Set<string>>` tracks notified IDs; `.has()` before `.add()` prevents re-fire on Electric re-emit
- **AC-7** (Mount in layout): exactly +2 lines in `layout.tsx` — import + JSX mount inside `<CollectionsProvider>` (commit `ec8cc7afa` reverted an unrelated `activeOrganizationId` refactor that crept in during cycle 2)

## Considered alternatives (rejected)

- **Option 4** (renderer-only translation, 15 LOC, 1 file): rejected — solves prong A only, ignores founder ask for notifications.
- **minimum** (35 LOC): rejected — solves prong A only, no notification path.
- **strategic** (200+ LOC + schema migration): rejected — disproportionate; both specialists flagged as cleanup pass disguised as bug fix. Deferred to follow-up.

## Out of scope (deliberately deferred)

See `.spec/improvements/SUPER-771/follow-ups.md` for the full list:

- Typed `failureReason` enum on `automationRuns` (was the strategic option)
- QStash retry-exhaustion path (`apps/api/.../run-failed/route.ts`) copy parity with dispatch path
- Cross-window notification dedup (requires extending `v2NotificationSourceSchema`)
- Cross-session dedup (persisted seen-set)
- "Retry now" CTA on failed rows
- `PreviousRunsList` virtualization
- Failure-detail modal/sheet
- DOM test infrastructure for `apps/desktop` renderer (no `@testing-library/react` / `happy-dom` installed; renderer-side ACs verified manually for this PR)

## Verification steps for the reviewer

### Automated (run from project root or worktree)

```bash
bun test packages/trpc/src/router/automation/relay-client.test.ts
```

Expected: AC-3 cases pass — `humanRelayMessage(503, …)` → `"Target machine was offline"`, `502` → `"Target machine is unreachable"`, `504` → `"Target machine timed out"`, unknown status → `"Relay error (status N): …"`.

### Manual — Happy path (AC-1, AC-2, AC-3, AC-4 inline error)

1. Start the desktop dev build: `bun dev` (or `apps/desktop`-specific dev command).
2. Stop your local host service / disable the relay so dispatches will return 503.
3. Open an automation with a scheduled run (or trigger a dispatch manually).
4. Wait for the run to land as `dispatch_failed` in the run history panel.
5. **Expect:** the failed row shows the error **inline below the title** (not only on hover), with text `"Target machine was offline"` (NOT `"dispatch: relay 503: {…}"`).
6. **Expect:** highlighting the inline error text shows a text selection cursor; you can copy the text with ⌘C and paste it into another app.

### Manual — Notification path (AC-5, AC-6, AC-7)

1. From the same setup, restart the desktop app while a previously-failed run is in the run history.
2. **Expect:** within ~1s of layout mount, a native OS notification appears: title `"Automation failed"`, body matches the inline error copy (e.g., `"Target machine was offline"`).
3. **Expect:** the notification fires **exactly once per failed run id** within the session. Re-opening the same automation in the UI must NOT re-fire the notification for already-seen IDs.
4. **Expect:** quitting and relaunching the app DOES re-fire the notification for the still-failed run — this is by design (cross-session re-surfacing is acceptable per the founder intent; deferred to follow-up).

### Negative path (AC-1 / AC-7)

1. With a successful run in the history (`status: dispatched` or `completed`), open the same automation.
2. **Expect:** no inline error span, no notification, no behavior change from before this PR.

### Regression check

- **PreviousRunsList tooltip** (still useful for very long errors): hover the failed row — the existing tooltip (`max-w-xs whitespace-pre-wrap`) still appears with the same content.
- **Other notification surfaces** (workspace lifecycle, agent events): `V2NotificationController` still mounted in `_authenticated/layout.tsx` alongside `AutomationFailureNotifier`; verify a workspace-lifecycle notification still fires for unrelated events.

### Real-services verification (per ~/.claude/CLAUDE.md Supreme Rule)

The reviewer should perform the Manual sections above against a real running desktop build with a real (offline) relay. `relay-client.test.ts` automated coverage uses a mocked `fetch` only — that's a legitimate boundary mock; the real `RelayDispatchError` / `humanRelayMessage` / throw path is exercised end-to-end.

## Anticipated FAQ

- **Q: Why is `dispatch.ts` unchanged from main?**  
  A: AC-4 says "describeError translates known relay codes without breaking call signature". The translation lives upstream in `relay-client.ts`'s `humanRelayMessage`. `describeError` just passes `err.message` through unchanged. This keeps the call signature stable AND avoids duplicating the translator. The persisted error is e.g. `"dispatch: Target machine was offline"` — the `dispatch:` prefix from describeError + the human message from relay-client.

- **Q: Why don't `AutomationFailureNotifier.tsx` and `PreviousRunsList.tsx` have test files?**  
  A: The desktop package has no DOM test infrastructure (`@testing-library/react`, `happy-dom` not installed). Three rounds of agent attempts to write component tests all rationalized — either re-implementing production logic in the test file or asserting on mock data only. Installing DOM test infra is out of scope for a bug fix; it's captured in `.spec/improvements/SUPER-771/follow-ups.md` as a separate task. Renderer-side ACs (AC-1, AC-2, AC-5, AC-6, AC-7) require manual visual verification per the steps above.

- **Q: Why was the sibling `super-771-loud-failures` branch abandoned?**  
  A: Both the investigator (electron-reviewer) and the challenger (code-reviewer) recommended abandon: the sibling's AUTO-LOUD-003 commit added a tRPC procedure that this binding scope does NOT sanction. The sibling's branch and 4 commits remain in git history for reflog recovery if ever needed; nothing was merged from it.

- **Q: Won't the notification re-fire annoyingly on every app launch for a long-failed run?**  
  A: For v1, yes — and that's the founder intent ("proactively tell the user"). Cross-session dedup (a persisted seen-set) is captured in follow-ups. If this becomes annoying in practice, we'll add the persisted seen-set in a future ticket.

- **Q: What happens for relay error codes other than 502/503/504?**  
  A: `humanRelayMessage` default branch returns `"Relay error (status N): <truncated body>"`. Unknown codes still surface readable text, just less specific. Adding 401/408/etc. translations is a one-line per code in `humanRelayMessage` — defer until we see them in practice.

## Risks

- **MEDIUM** — Notification firing on app launch for pre-existing failures (Electric re-hydrates from SQLite cache on mount). Verified acceptable per founder intent. If pushback, add localStorage-backed seen-set (one-line follow-up).
- **LOW** — `humanRelayMessage` covers 502/503/504. Other status codes use a generic fallback. We can add codes as we encounter them.
- **LOW** — `automationRuns.error` now persists the translated human string. If wording changes, historical rows show old copy. Acceptable for v1; the `failureReason` enum follow-up will let display copy be regenerated.

## Links

- Linear ticket: https://linear.app/superset/issue/SUPER-771
- Binding SCOPE.md: `.spec/improvements/SUPER-771/SCOPE.md`
- Task contract: `.spec/tasks/SUPER-771/SUPER-771-loud-failures.md`
- Design specs: `.spec/tasks/SUPER-771/design/PreviousRunsList-failed-row.md`, `.spec/tasks/SUPER-771/design/AutomationFailureNotifier.md`
- Follow-ups: `.spec/improvements/SUPER-771/follow-ups.md`

## Notes for the human signing off

This PR went through three implementation cycles before landing:

1. Cycle 1: implementer claimed AC-1/2/3 done but production code was unchanged; commit messages were misleading. Caught by independent diff verification.
2. Cycle 2: re-dispatched on the wrong branch; commits had to be cherry-picked manually onto the improvement worktree.
3. Cycle 3: test work; agent rationalized 3 times because the desktop package lacks DOM test infra. After verification that the server-side tests (`relay-client.test.ts`) were real and the renderer tests were sham, the sham tests were deleted; only `relay-client.test.ts` remains as automated coverage.

The PRODUCTION CODE is correct and matches the binding scope + design specs. The TEST GAP is real and documented above. The decision to ship with manual verification (rather than fight DOM test infra in this PR) was made explicitly knowing the trade-off.
