## Bug Analysis: Automation Previous Runs missing after cross-device Run Now

### 1. Root Cause Category

- **Category**: B/E - Cross-Layer Contract and Implicit Assumption
- **Specific Cause**: The Automation detail sidebar treated Electric/TanStack `automationRuns` live rows as the only source for Previous Runs. The API had already created the run, but the observing device could reopen the detail page before Electric sync repainted locally. Because the URL no longer carried `runId`, the selected-run `getRun` backfill path did not run, so the new run was invisible.

### 2. Why Fixes Failed

1. Earlier Automation work correctly added fresh `getRun` merging for the selected run, but that only covered result panels with a `runId` in search params.
2. The Previous Runs list was a separate list-level contract and remained live-query only.
3. The bug appeared only after navigation and cross-device use, so local same-page testing did not exercise the missing list backfill.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Code-spec | Add Previous Runs `automation.listRuns` fresh-query merge contract to Automation run workflow spec. | DONE |
| P0 | Test Coverage | Add unit coverage for merging fetched run history with cached Electric rows, de-duping by id, and choosing the freshest row. | DONE |
| P1 | Thinking Guide | Add cross-layer checklist item: API-confirmed writes need fresh-query backfill, not only Electric repaint. | DONE |
| P1 | Acceptance | Future desktop acceptance for Automation should include Run Now, leave detail page, reopen detail, and verify Previous Runs contains the run. | TODO |

### 4. Systematic Expansion

- **Similar Issues**: Automation list rows, Task detail activity, Chat session lists, Provider/model settings, Workspace sidebar rows, and any cloud-owned collection shown immediately after a write.
- **Design Improvement**: Treat Electric as cache-first sync, not as the sole post-write truth. For user-visible post-write confirmation, pair live collections with a fresh tRPC backfill query at the view boundary.
- **Process Improvement**: Cross-device bugs need a navigation/reopen step in validation because same-page local state can hide sync defects.

### 5. Knowledge Capture

- [x] Updated `.trellis/spec/trpc/backend/automation-run-workflow.md`.
- [x] Updated `.trellis/spec/guides/cross-layer-thinking-guide.md`.
- [x] Added focused renderer utility test for Previous Runs merge behavior.
- [ ] Add a future Desktop Automation acceptance covering cross-device Automation Run Now history visibility.
