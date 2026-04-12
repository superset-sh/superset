# V2 Pending Project in Sidebar

Show every cloud v2Project in the sidebar. Unsetup projects render as "pending" rows with a ⚠ Set up badge. Click → opens `AddRepositoryDialog` pre-selected to that project.

Builds on: `v2-host-project-paths.md`, `v2-project-setup-ui.md`, `v2-add-repository-flows.md`, `v2-local-workspace-on-setup.md`.

## Why

Today sidebars only show projects with local workspaces. New users and multi-device users see empty sidebars. Setup is reactive (submit → error → setup). Making cloud projects visible as pending rows makes setup discoverable.

## States

| State | Condition | UI |
|---|---|---|
| Set up | local `projects` row, path valid | Normal expandable row |
| Pending | cloud project, no local row | Collapsed, ⚠ Set up badge |
| Path missing | local row, path gone | Collapsed, ⚠ Path missing badge |

## Click Behavior

- Pending / path-missing row → open `AddRepositoryDialog` with `preSelectedProjectId`
- Set-up row → expand/collapse (unchanged)

## Changes

**Host-service** — new endpoint:
```ts
project.listSetupStatus() → Record<projectId, "ready" | "path_missing">
// Absent from result = "not_setup" (default on client)
```

**Renderer:**
- `useV2ProjectList` merges setup status from the endpoint
- New `DashboardSidebarProjectPendingRow` component
- `DashboardSidebar` renders pending rows inline with set-up rows
- `AddRepositoryDialog` accepts `preSelectedProjectId`; store opener takes optional projectId

## Impact on Add Repository button

Narrows from "pick a project, set up" (now handled by pending rows) to the browse-first flow in `v2-add-repository-flows.md` — for repos not yet in the cloud.

## Edge Cases

- Path disappears between sessions → next status refresh flips to `path_missing`, badge reappears, re-setup same flow (setup is upsert)
- Host-service offline → treat all as pending, or show offline banner
- Pinning (`v2SidebarProjects`) applies to pending rows too

## Phases

1. `project.listSetupStatus` endpoint
2. Extend `useV2ProjectList` with status
3. `DashboardSidebarProjectPendingRow` + sidebar wiring
4. `preSelectedProjectId` in `AddRepositoryDialog`
5. Narrow sidebar header button to browse-first flow

## Open Questions

- Show repo slug inline on pending rows?
- How do pending projects render on `/v2-workspaces` grid page?
