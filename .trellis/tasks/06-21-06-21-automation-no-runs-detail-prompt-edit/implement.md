# Implementation

## Changes

- Split prompt edit state from selected-run state in
  `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/page.tsx`.
- Added `resolveSelectedAutomationRunId` to keep requested-run, newest-run, and
  no-run behavior explicit.
- Added `AutomationNoRunsPanel` as the detail body for Automations without run
  history.
- Added run-history readiness gating so cold loads do not flash the no-runs
  empty state before live/fresh run data has settled.
- Passed the same loading state into Previous Runs so the sidebar does not flash
  `No runs yet` while history is still loading.
- Guarded prompt draft initialization so live Automation object refreshes do not
  reset in-progress edits.
- Added regression coverage for the route state split and run-id resolution.

## Files

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/components/AutomationNoRunsPanel/AutomationNoRunsPanel.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/components/AutomationNoRunsPanel/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/components/AutomationDetailSidebar/AutomationDetailSidebar.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/components/PreviousRunsList/PreviousRunsList.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/utils/automationRunSelection/automationRunSelection.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/utils/automationRunSelection/automationRunSelection.test.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/automations/$automationId/page.test.ts`

## Known Adjacent Issues

- UI creation with target `This device` can fail with
  `automation.create` 403 `You don't have access to this host`. The E2E used a
  direct local API-created Automation with `targetHostId:null` to isolate this
  no-runs detail regression.
- The dev desktop host-service tunnel repeatedly logged reconnect errors. That
  appears related to the separate cross-device `Host is not online` behavior,
  not to the no-runs prompt edit regression.
