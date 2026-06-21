# Automation no-runs detail prompt edit regression

## Goal

Fix Automation detail behavior when an automation has no run history: opening the detail should show an empty-state detail page, and Edit Prompt Save/Cancel must return to detail.

## Problem

Automation detail previously used the absence of a selected run id as a signal to
enter prompt-edit mode. That made a newly-created Automation with zero runs open
directly into the prompt surface instead of the normal detail shell. In that
state, the header showed `Save` and `Cancel` even though the user had not clicked
`Edit prompt`; on some no-run paths those controls appeared unresponsive because
the route had no run selection to return to.

The correct product model is:

- Detail mode is controlled by route state and selected run state separately.
- `editPrompt=true` is the only route state that opens prompt editing.
- A no-run Automation still has a valid detail page: metadata/sidebar plus an
  empty-state result area with `Edit prompt` and `Run now`.
- `Save` and `Cancel` must both return to the detail page even when there is no
  run id in the URL.

## Requirements

- Do not enter prompt edit mode solely because an Automation has no run history.
- Preserve existing behavior when a specific run id is selected.
- If no run id is requested and recent runs exist, select the newest recent run.
- If no run id is requested and no recent runs exist, render an explicit no-runs
  empty state only after run-history live data and fresh query loading have
  settled.
- Do not show `No runs yet` while the Automation run-history live query is not
  ready and no cached/fetched runs exist yet.
- The no-runs empty state must expose `Edit prompt` and `Run now`.
- Prompt editing must remain opt-in through `editPrompt=true`.
- `Cancel` from prompt edit must return to the Automation detail route without
  `editPrompt=true`.
- `Save` from prompt edit must persist the prompt, update prompt history, and
  return to the Automation detail route without `editPrompt=true`.
- Do not reset in-progress prompt edits on every live Automation row refresh.
- Keep the fix scoped to the desktop Automation detail route and its owned
  helpers/components.

## Acceptance Criteria

- [x] Opening a zero-run Automation detail page shows a detail empty state, not
      the prompt editor.
- [x] The detail header in zero-run mode shows normal detail actions, not
      `Save`/`Cancel`.
- [x] Clicking `Edit prompt` enters edit mode and shows `Save`/`Cancel`.
- [x] Clicking `Cancel` from a zero-run edit returns to the detail empty state.
- [x] Clicking `Save` from a zero-run edit persists the prompt and returns to the
      detail empty state.
- [x] Source-level regression tests cover the route state split.
- [x] Unit tests cover selected-run id resolution for requested, recent, and
      empty run lists.
- [x] The no-runs empty state is gated behind run-history readiness so cold
      loads do not flash an incorrect empty state before previous runs arrive.
- [x] Desktop Automation CLI acceptance validates the real Electron flow with
      screenshots and renderer console checks.
- [x] Root lint and typecheck pass.

## Notes

- Trellis task was created during PR cleanup because this canary regression did
  not have an active Trellis task in this worktree when the fix began.
