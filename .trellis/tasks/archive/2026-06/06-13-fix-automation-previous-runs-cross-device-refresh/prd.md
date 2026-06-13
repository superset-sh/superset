# Fix Automation Previous Runs cross-device refresh

## Goal

Ensure Automation detail Previous Runs shows newly created runs across devices even when Electric live sync lags.

## Problem

When a user triggers an Automation run from another device, the API creates the run and the UI reports it as running. If the user leaves the detail page and reopens the Automation before Electric/TanStack live sync catches up, the right sidebar's Previous Runs list can omit the newly-created run.

This is especially visible in cross-device use because the cloud write has completed but the local renderer cache has not necessarily repainted yet.

## Requirements

- Automation detail Previous Runs must not depend solely on Electric live collection rows.
- The detail page must merge cached live rows with a fresh cloud `automation.listRuns` query for the same automation.
- When duplicate run rows exist in cached and fetched sources, the UI must keep the freshest row by run timestamps.
- Newly-created manual runs must appear in Previous Runs after navigating away from and back to the Automation detail page, even if Electric sync lags.
- Active runs shown from the fresh query should continue polling until they reach a terminal status.
- Keep the fix scoped to Automation run-history rendering. Do not change database schema, run lifecycle semantics, or Automation dispatch behavior.

## Acceptance Criteria

- [ ] `PreviousRunsList` receives a merged run list from Electric cached rows and `automation.listRuns`.
- [ ] Fresh fetched rows are de-duped with cached rows by run id and sorted newest-first.
- [ ] A stale cached active row is replaced by a fresher fetched completed/failed/skipped row.
- [ ] `Run now` invalidates the fresh run-history query so the created row is visible promptly.
- [ ] Focused automation run-selection tests cover fresh query backfill and de-dupe behavior.
- [ ] Desktop typecheck and root lint pass.

## Notes

- This is a lightweight bugfix. PRD-only is sufficient.
- Related class of bugs: renderer views that display cloud-owned rows must render cached Electric data first, but they also need fresh tRPC backfill when the user action has already succeeded on the API.
