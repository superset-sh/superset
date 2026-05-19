---
stability: FEATURE_SPEC
last_validated: 2026-05-19
prd_version: 1.0.0
functional_group: AUTO
---

# Use Cases: Automations (AUTO)

| ID | Title | Linear |
|----|-------|--------|
| UC-AUTO-01 | Surface automation run failures with full, legible error messages | [SUPER-771](https://linear.app/superset-sh/issue/SUPER-771) |
| UC-AUTO-02 | Run automations against a freshly-created workspace when the target is "New workspace" | [SUPER-783](https://linear.app/superset-sh/issue/SUPER-783) |

---

## UC-AUTO-01 — Surface automation run failures with full, legible error messages

**Linear:** [SUPER-771](https://linear.app/superset-sh/issue/SUPER-771) — High

Today an automation that fails dispatch (`RelayDispatchError`, `relay 503`, host offline, etc.) is squashed via `describeError(err, "dispatch")` in `dispatch.ts` and surfaced as a clipped tooltip in `PreviousRunsList.tsx`. The Slack #founders thread (2026-05-14) agreed automations should not fail silently and that the user should see a popup / notification on failure. This UC routes the real failure string to the runs list and adds a notification path so paid automations stop dying invisibly.

### Acceptance Criteria

- ☐ Automation Operator can see the full underlying error message on a failed automation run row, not a clipped tooltip
- ☐ Automation Operator receives a popup or notification when an automation run fails — silent failure is no longer possible for any dispatch error class
- ☐ Automation Operator can distinguish a `RelayDispatchError` from other dispatch failure classes from the runs-list copy alone
- ☐ `PreviousRunsList.tsx` renders the error reason in a non-clipped affordance that supports long messages
- ☐ System never strips or rewrites a dispatch error string on its way from `dispatch.ts` (`describeError(err, "dispatch")`) into the runs row
- ☐ Automation Operator can copy the full error message out of the runs-list affordance for sharing in Slack / bug reports
- ☐ Integration test in `packages/trpc/src/router/automation` verifies that an injected `RelayDispatchError` ends up on the run row exactly as emitted by `relay-client.ts`

---

## UC-AUTO-02 — Run automations against a freshly-created workspace when the target is "New workspace"

**Linear:** [SUPER-783](https://linear.app/superset-sh/issue/SUPER-783) — High

When an Automation Operator configures an automation with the "New workspace" target (instead of pinning an existing workspace), the run fails to spin up a fresh workspace and never starts the agent. "New workspace" is the expected default for scheduled agent runs, so this currently breaks the headline automations use case. The dispatch path *does* branch on a null `v2WorkspaceId` and call `createWorkspaceOnHost`, so the failure is most likely (a) the `workspaces.create` relay call failing or timing out on the host, or (b) the automation was saved without a `v2ProjectId` so dispatch has no project to create the workspace under. This UC reproduces, fixes the real cause, and adds a clear failure surface on the run row.

### Acceptance Criteria

- ☐ Automation Operator can configure an automation with target "New workspace" and have it spin up a clean workspace on dispatch
- ☐ System creates a fresh worktree on the target host via `workspaces.create` (relay-side) → `host-service/src/trpc/router/workspaces/workspaces.ts` (host-side) when `v2WorkspaceId` is null
- ☐ Automation Operator can see a clear failure reason on the `automation_runs` row when `workspaces.create` fails or times out — no silent no-op
- ☐ Automation Operator can always select "New workspace" from the `WorkspacePicker` even when the workspace list filters to empty (auto-routed automation case where `targetHostId` is null)
- ☐ System refuses to save (or run) a "New workspace"-targeted automation that has no `v2ProjectId`, raising a clear validation error on save instead of silently failing at dispatch
- ☐ Automation Operator can verify in the runs list that a "New workspace" dispatch passed the defense-in-depth checks (offline host, unpaid plan) before workspace creation was attempted, so those are not mistaken for the new-workspace failure
- ☐ System tolerates the persistent-webview-style edge of the `__new__` `CommandItem` being filtered out by `CommandInput` typing — the item stays selectable on the primary (no-search) path
- ☐ Integration test in `packages/trpc/src/router/automation/dispatch` covers the null-`v2WorkspaceId` path end-to-end against a stubbed host relay
