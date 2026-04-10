# V1 Create Workspace Port On V2 Hosts

This doc replaces the earlier split plan and API draft.

## Goal

Match the V1 create-workspace experience on the V2 stack, with one intentional addition: explicit host-target selection.

1. V1 composer UX and semantics
2. V2 routes, collections, sidebar, and workspace rows
3. host-service as the semantic backend
4. `@superset/workspace-client` as the only host transport
5. the unified `/events` bus as the live-state channel

## Boundaries

### Renderer

Owns:

1. modal draft state
2. V1 composer UI plus host-target selection
3. picking one `WorkspaceHostTarget`
4. optimistic UI and navigation

Does not own:

1. branch/worktree/open/adopt decisions
2. repo scanning
3. PR-specific create behavior
4. setup or agent execution
5. a separate websocket or polling layer

### `@superset/workspace-client`

Owns:

1. one tRPC client per host URL
2. one `/events` connection per host URL
3. auth, reconnect, ref-counting, subscriptions

Does not own:

1. create semantics
2. repo/worktree logic

### Host-service

Owns:

1. `workspaceCreation.*` APIs
2. repo clone/ensure
3. branch generation and base-branch handling
4. PR/issue/worktree resolution
5. open vs create vs adopt behavior
6. setup/init execution
7. agent launch handoff

### Cloud/shared APIs

Stay thin:

1. hosts
2. workspace rows
3. project metadata
4. shared PR/issue/task data if proxied by host-service

## Target UX

Keep the V1 surface, plus explicit host target selection:

1. single composer
2. workspace name
3. branch name
4. prompt
5. attachments
6. linked internal issues
7. linked GitHub issues
8. linked PR
9. agent picker
10. setup toggle
11. inline compare-base/worktree picker
12. host target selection
13. auto-open/navigate after create

Do not keep the current V2 tabbed modal. Keep host target selection available without changing the core V1 composer flow.

## Target Host API

```ts
workspaceCreation.getContext({ projectId })
workspaceCreation.searchBranches({ projectId, query, filter, limit })
workspaceCreation.searchPullRequests({ projectId, query, limit })
workspaceCreation.searchInternalIssues({ projectId, query, limit })
workspaceCreation.searchGitHubIssues({ projectId, query, limit })
workspaceCreation.prepareAttachmentUpload(...)
workspaceCreation.commitAttachmentUpload(...)
workspaceCreation.create(...)

workspace.get({ id })
workspace.gitStatus({ id })
workspace.delete({ id })
```

Core create shape:

```ts
workspaceCreation.create({
  projectId,
  source,
  names: { workspaceName, branchName },
  composer: { prompt, compareBaseBranch, runSetupScript },
  linkedContext: {
    internalIssueIds,
    githubIssueUrls,
    linkedPrUrl,
    attachments,
  },
  launch: { agentId, autoRun },
  behavior: { onExistingWorkspace, onExistingWorktree },
})
```

Create returns:

1. outcome: `created_workspace | opened_existing_workspace | opened_worktree | adopted_external_worktree`
2. workspace row
3. warnings

The call blocks until the worktree and cloud row are fully created. The renderer awaits it and shows a loading state via the pending-workspace store. No event bus extension or init-state polling needed — worktree creation is fast (<60s) and setup-script progress is visible once the workspace opens.

## Event Bus

Use the existing host `/events` bus. No new event types for Phase 1.

Keep:

1. `git:changed`
2. `fs:events`

## Phases

### Phase 1

1. Replace the V2 modal UI with the V1 composer plus explicit host target selection
2. Expand the V2 draft/store to hold full V1 state
3. Add `workspaceCreation.getContext`
4. Add `workspaceCreation.searchBranches`
5. Add semantic `workspaceCreation.create` with full V1 outcome resolution (`created_workspace`, `opened_existing_workspace`, `opened_worktree`, `adopted_external_worktree`)

### Phase 2

1. Move PR and issue linking behind host-service
2. Move attachments to upload refs
3. Remove remaining V2-only modal shell pieces

## Decisions Locked

1. V1 composer UX and semantics win over preserving the current V2 modal structure.
2. Host-service is the only semantic backend boundary for modal behavior.
3. `@superset/workspace-client` is the only host transport boundary.
4. Create blocks until done; renderer shows loading via pending-workspace store. No event bus extension needed for Phase 1.
5. Visible host selection is intentionally part of the first-pass UX.
6. Phase 1 `workspaceCreation.create` includes full V1 create/open/adopt semantics.
