# Design

## State Model

Automation detail should derive three states independently:

- `requestedRunId`: the optional run id from the URL.
- `selectedRunId`: the run id to display, resolved from `requestedRunId` or the
  newest recent run. If neither exists, this is `null`.
- `isEditingPrompt`: true only when the URL search contains `editPrompt=true`.

The previous behavior collapsed `!selectedRunId` into `isEditingPrompt`, which
made no-run Automations look like edit pages. The fix keeps these concepts
separate so the route can render an empty detail state without editing.

## Rendering Contract

The detail body renders in this order:

1. Prompt editor when `isEditingPrompt`.
2. Run result panel when `selectedRunId`.
3. No-runs empty panel when there is no selected run.

The header uses the same `isEditingPrompt` flag. `Save` and `Cancel` only appear
in prompt edit mode.

## Prompt Draft Contract

The prompt draft initializes once per Automation id and syncs from the latest
Automation prompt only outside edit mode. This prevents Electric/tRPC row
refreshes from overwriting text the user is currently editing.

## Acceptance Strategy

Use a layered gate:

- Source-level regression test for the route state condition that previously
  caused the bug.
- Helper unit tests for selected-run id resolution.
- Real Electron Desktop Automation CLI flow for the no-run detail page,
  `Edit prompt`, `Cancel`, `Save`, screenshot evidence, console errors, and
  database persistence.
