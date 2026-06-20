# Validation

## Desktop Acceptance

Environment:

- Worktree: `/Users/bichengyu/.codex/worktrees/c8ae/superset`
- Branch: `codex/tools-and-skills-management`
- API: `http://localhost:3161`
- Electric proxy: `http://localhost:3172`
- Desktop renderer: `http://localhost:3165`
- Desktop Automation port: `9322`
- Account: local dev seed user `admin@local.test`

Test data:

- Automation id: `3c218448-d063-4ea1-a334-f56f66997055`
- Automation name: `E2E no-runs detail 2026-06-20T17:04:53Z`
- Confirmed `automation.listRuns` returned zero runs before the no-runs detail
  assertions.

Path verified:

1. Opened `#/automations/3c218448-d063-4ea1-a334-f56f66997055`.
2. Verified the page shows `No runs yet` and
   `Run this Automation to see its report here.`
3. Verified detail state has `Edit prompt` and `Run now`, and does not show
   `Save` or `Cancel`.
4. Clicked `Edit prompt`.
5. Verified URL includes `editPrompt=true`, prompt editor is visible, and header
   shows `Cancel` and `Save`.
6. Clicked `Cancel`.
7. Verified URL no longer includes `editPrompt=true`, no-runs detail state is
   visible again, and `Save`/`Cancel` are gone.
8. Re-entered `Edit prompt`, changed the prompt through the ProseMirror editor,
   and clicked `Save`.
9. Verified URL returned to detail state, `Save`/`Cancel` disappeared, and the
   no-runs empty state remained visible.
10. Queried local Postgres through Drizzle and confirmed both `automations.prompt`
    and latest `automation_prompt_versions.content` contained the updated prompt
    with source `human`.
11. Captured renderer console errors with Desktop Automation CLI: `[]`.

## Screenshot Artifacts

Captured locally under the task directory. This worktree's local
`.git/info/exclude` ignores `artifacts/`, so the binary screenshots are not part
of the PR diff.

- `.trellis/tasks/06-21-06-21-automation-no-runs-detail-prompt-edit/artifacts/01-no-runs-empty-state.png`
- `.trellis/tasks/06-21-06-21-automation-no-runs-detail-prompt-edit/artifacts/02-edit-prompt-state.png`
- `.trellis/tasks/06-21-06-21-automation-no-runs-detail-prompt-edit/artifacts/03-cancel-return-empty-state.png`
- `.trellis/tasks/06-21-06-21-automation-no-runs-detail-prompt-edit/artifacts/04-save-return-empty-state.png`

## Checks

- `bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/\$automationId/utils/automationRunSelection/automationRunSelection.test.ts apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/\$automationId/page.test.ts`
  - 12 passed, 0 failed.
- Reviewer P2 follow-up:
  - Added `automationRunsReady` from the run-history `useLiveQuery`.
  - Added `showRunHistoryLoading` so the main panel does not render
    `AutomationNoRunsPanel` while run history is still loading and no cached or
    fetched rows exist.
  - Passed the same loading state into `PreviousRunsList` so the sidebar does
    not flash `No runs yet` during cold load.
- `bun run lint:fix`
  - Completed; no files changed.
- `bun run lint`
  - Passed.
- `bun run typecheck`
  - Passed; 29 successful Turbo tasks.
- `bun test`
  - Failed outside this change in `packages/pty-daemon` integration tests:
    `prepare-upgrade hands off live sessions to a successor binary`,
    `instant-exit shell still produces an exit message`, and
    `default close kills detached background process groups` timed out.
  - Bun 1.3.14 then crashed with a main-thread C++ exception.
  - The failure is not in the desktop Automation detail package or route, but it
    remains the current all-repo test baseline risk.

## Adjacent Findings

- Normal UI Automation creation with `This device` failed during exploratory E2E
  with `automation.create` 403 `You don't have access to this host`. This is a
  separate host-binding/access issue.
- Desktop dev logs showed repeated host-service tunnel reconnect errors. This
  likely relates to the separate cross-device `Host is not online` behavior and
  was not changed in this patch.
