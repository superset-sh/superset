# V2 Project Setup & Import UI

Integrates `project.setup` (bf07410ca) into V2 workspace creation and adds a standalone "New Project" flow.

## Phases

### Phase 1: Backend — workspace.create throws instead of auto-cloning

**Files:** `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts`

- Remove auto-clone from `ensureRepo` in the `create` mutation
- Throw `PROJECT_NOT_SETUP` if no local `projects` row for the given projectId
- Throw `PROJECT_PATH_MISSING` if row exists but `repoPath` is gone from disk
- Add `setupStatus: "ready" | "not_setup" | "path_missing"` to `getContext` response so the client can pre-check

### Phase 2: Pending page — catch setup errors

**Files:** `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pending/$pendingId/page.tsx`

- Detect `PROJECT_NOT_SETUP` / `PROJECT_PATH_MISSING` error codes from failed create
- Show inline setup UI (import existing dir / clone) instead of generic error
- Call `project.setup` on host-service, then auto-retry `workspaceCreation.create`

Setup UI (shared component, reused in Phase 3):

```
┌─────────────────────────────────────────┐
│  Set up "my-project" on this device     │
│                                         │
│  ○ Use existing directory               │
│    [~/work/my-project        ] [Browse] │
│    ✓ Matches github.com/org/my-project  │
│                                         │
│  ○ Clone repository                     │
│    [~/.superset/repos        ] [Browse] │
│                                         │
│           [Set Up & Create]             │
└─────────────────────────────────────────┘
```

New component: `ProjectSetupStep/` — lives under `DashboardNewWorkspaceModal/components/` (or a shared location) so both the pending page and create-project flow can use it.

### Phase 3: V2 "New Project" flow — separate from workspace modal

Similar to V1 (`_onboarding/new-project/` with CloneRepoTab, EmptyRepoTab, TemplateTab), but adapted for V2:

- New route or modal accessible from the V2 dashboard (e.g. sidebar "+" or dashboard action)
- Creates cloud project via `v2Project.create`
- Then flows into the same `ProjectSetupStep` for local setup (import/clone)
- After setup, project appears in the workspace modal's project picker

Exact V1 tabs to port and V2-specific adjustments TBD when we start this phase.

## Relevant Files

| File | Role |
|------|------|
| `packages/host-service/src/trpc/router/project/project.ts` | `project.setup` endpoint (done) |
| `packages/host-service/src/trpc/router/workspace-creation/workspace-creation.ts` | `workspaceCreation.create` + `getContext` |
| `apps/desktop/src/renderer/routes/_authenticated/_dashboard/pending/$pendingId/page.tsx` | Pending workspace page |
| `apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/` | V2 workspace creation modal |
| `apps/desktop/src/renderer/routes/_authenticated/_onboarding/new-project/` | V1 new project flow (reference) |
| `docs/design/v2-host-project-paths.md` | Design doc for project.setup |
