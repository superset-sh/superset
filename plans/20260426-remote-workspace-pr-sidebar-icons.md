# Remote Workspace PR Sidebar Icons

## Why

The dashboard sidebar icon is supposed to communicate the most specific workspace state available:

1. creation or working state
2. pull request state
3. host fallback state

That priority already exists inside `DashboardSidebarWorkspaceIcon`, but remote and cloud workspaces often never receive pull request metadata. When a remote workspace has a matching PR, the row can still fall back to the host icon because the sidebar data layer sets `pullRequest` to `null` for every non-local workspace.

This makes remote and cloud PR workspaces look like plain cloud/remote workspaces, which hides useful review context and makes the sidebar inconsistent with local workspace rows.

## Root Cause

`useDashboardSidebarData` currently fetches PR metadata from the active local host service by workspace ID. That path only works for workspaces hosted by the current machine.

For non-local workspaces:

- `localWorkspaceIds` excludes them.
- `pullRequestData` never includes them.
- `sidebarWorkspace.pullRequest` is explicitly set to `null`.

There is a second display gap in the collapsed sidebar path: `DashboardSidebarWorkspaceItem` passes PR state to expanded rows, but `DashboardSidebarCollapsedWorkspaceButton` does not accept or forward `pullRequestState`, so collapsed rows cannot show PR icons even if the workspace has PR metadata.

## Intended Behavior

For every dashboard sidebar workspace:

- Failed creation shows the error icon.
- Creating or working shows the spinner.
- A linked PR shows the PR icon for its state.
- Only workspaces without PR state fall back to the host icon.

PR icon mapping should stay unchanged:

- `open`: pull request icon
- `draft`: draft pull request icon
- `merged`: merge icon
- `closed`: closed pull request icon

Host fallback icons should stay unchanged from the icon PR:

- local device: dot icon
- remote offline: offline cloud icon
- cloud or reachable remote: cloud icon

## Proposed Fix

Use the synced `githubPullRequests` collection as the cross-host PR metadata source for sidebar rows.

For each workspace:

1. Determine the workspace project repository ID.
2. Find synced PRs for that repository.
3. Match a PR to the workspace branch.
4. Attach normalized PR metadata to `sidebarWorkspace.pullRequest`.

Local workspaces should continue to prefer host-service PR data because it is workspace-specific and refreshed by the local runtime. Synced GitHub PR data should be used as a fallback for local workspaces and as the primary source for remote/cloud workspaces.

The collapsed sidebar path should also accept and forward `pullRequestState` to `DashboardSidebarWorkspaceIcon`.

## Branch Matching

The sidebar can match the common branch forms already used by PR checkout:

- same-repo PR: `workspace.branch === pr.headBranch`
- fork PR: `workspace.branch === lowercasedAuthorLogin + "/" + pr.headBranch`

This mirrors the local branch naming used for cross-repository PR checkouts.

## Timestamp Handling

Electric collection rows may provide timestamps as serialized strings even when the TypeScript model says `Date`. Any sorting or recency comparison should normalize timestamps first instead of calling `Date#getTime()` directly on collection values.

## Test Plan

Static checks:

```bash
bunx biome check apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarData/useDashboardSidebarData.ts apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/DashboardSidebarWorkspaceItem.tsx apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/components/DashboardSidebarCollapsedWorkspaceButton/DashboardSidebarCollapsedWorkspaceButton.tsx
bun run --cwd apps/desktop typecheck
```

Manual checks:

1. Use a project with a synced GitHub repository and at least one PR.
2. Open a remote or cloud workspace whose branch matches that PR.
3. Confirm the expanded sidebar row shows the PR icon instead of the cloud icon.
4. Collapse the sidebar and confirm the collapsed row also shows the PR icon.
5. Confirm a remote/cloud workspace without a matching PR still shows the host fallback icon.
6. Confirm failed, creating, and working states still override the PR icon.
7. Confirm the dashboard no longer crashes when PR timestamps arrive as strings.

## Risks

Branch-name matching can produce false negatives if a workspace branch was renamed after checkout or uses a custom fork prefix. The fix intentionally avoids broad fuzzy matching to prevent showing the wrong PR on a workspace.

Synced GitHub PR data may lag behind host-service data. Local workspaces should keep preferring host-service data to preserve the fresher runtime path.
