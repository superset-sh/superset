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
3. Run-history loading state when there is no selected run, no cached/fetched
   run data, and run-history sources have not settled.
4. No-runs empty panel when there is no selected run and run-history sources
   have settled with no runs.

The header uses the same `isEditingPrompt` flag. `Save` and `Cancel` only appear
in prompt edit mode.

## Run History Readiness Contract

TanStack DB / Electric live queries are cache-first. Existing run rows must
render even when the collection is not ready, but an empty array is not enough to
prove the Automation has no run history while the live query is still loading.

The detail route therefore computes a `showRunHistoryLoading` state only when:

- merged cached/fetched run rows are empty, and
- the live run-history query is not ready or the fresh tRPC run-history query is
  still loading.

The main body and Previous Runs sidebar both avoid the `No runs yet` empty state
while this flag is true.

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
