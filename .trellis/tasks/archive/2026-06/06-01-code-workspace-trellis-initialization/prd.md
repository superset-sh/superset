# Code workspace Trellis initialization

## Goal

Make Trellis a lightweight Code workspace setup capability instead of a separate
workspace cockpit. When a user creates a Code Workspace, Superset should detect
whether the target project/worktree already has Trellis and offer a safe
initialization path when it does not.

The product direction is:

- Superset `Task` remains the canonical user-facing task/issue object.
- Trellis remains the Code workflow/kernel inside a repository.
- Trellis task records can later be imported or synced into Superset Tasks, but
  Code should not grow a separate Trellis board in the workspace sidebar.

## Requirements

### Confirmed Facts

- Workspace creation starts in the desktop renderer modal under
  `apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/`.
- The final create payload is submitted through
  `apps/desktop/src/renderer/stores/workspace-creates/useWorkspaceCreates.ts`
  and persisted by `CollectionsProvider` via host-service
  `workspaces.create`.
- Host-service owns the real git/worktree operation in
  `packages/host-service/src/trpc/router/workspaces/workspaces.ts`.
- The current `workspaces.create` input does not include any Trellis setup
  option.
- Trellis is already installed locally as `@mindfoldhq/trellis@0.6.0-beta.21`.
- Trellis CLI supports non-global usage through the repo dependency:
  `bunx --bun trellis init --help`, `trellis update`, and `trellis workflow`.
- `trellis init` writes `.trellis/` and platform adapters; `--yes` is
  non-interactive and skips conflicting files unless `--force` is explicitly
  used.
- If `.trellis/` already exists, `trellis init --yes` is conservative and tells
  users to add explicit platform flags or developer identity rather than
  reinitializing.
- Trellis task status is lightweight: `planning`, `in_progress`, `review`,
  `completed`/`done`, with phase inferred from status.
- Superset Tasks already have project scoping, status rows, priorities,
  assignees, labels, due dates, and workspace linkage.

### Product Requirements

- Add a Trellis setup step or section to the Create Workspace flow.
- Detect Trellis state for the selected project/worktree:
  - no `.trellis/`
  - `.trellis/` exists and appears usable
  - `.trellis/` exists but may need update/migration
- Do not silently initialize Trellis without the user choosing it, because it
  writes repository files.
- Existing Trellis projects must be preserved; never overwrite `.trellis/spec`,
  `.trellis/tasks`, or `.trellis/workspace` as part of workspace creation.
- The default behavior should be low-friction:
  - existing Trellis: use it
  - missing Trellis: show an explicit "Initialize Trellis" option
  - unknown/error state: allow workspace creation without Trellis and surface
    the diagnostic
- Do not rebuild the previous right-sidebar Trellis history/status cockpit.
- Plan Trellis-to-Superset Task import/sync as a separate slice unless the user
  explicitly wants it in this first implementation.

### Technical Requirements

- Renderer draft state must carry the user's Trellis setup choice into the
  workspace create snapshot.
- Host-service must be the only layer that probes or mutates the local
  filesystem for Trellis state.
- Trellis initialization should run after the worktree path is known and only
  for the workspace path being created or adopted.
- Initialization should call the repo-local Trellis CLI dependency, not a global
  `trellis` binary.
- The operation must be idempotent for existing/adopted worktrees.
- Failure to initialize Trellis should not leave a broken workspace record unless
  the user explicitly chooses a strict mode. The safer MVP is workspace created +
  Trellis warning surfaced.

## Acceptance Criteria

- [x] Create Workspace shows Trellis state for the selected project/worktree
      before submit or during the final setup review.
- [x] If no `.trellis/` exists, the user can opt into initializing Trellis.
- [x] If `.trellis/` exists, the UI recognizes it and does not offer destructive
      reinitialization.
- [x] Workspace creation payload includes the Trellis setup intent.
- [x] Host-service probes the resolved worktree path and runs local Trellis init
      only when requested and missing.
- [x] Existing Trellis user data is not overwritten.
- [x] Workspace creation still works when Trellis initialization fails; the
      failure is visible to the user.
- [x] No new right-sidebar Trellis board/cockpit is added.
- [x] Focused tests cover missing, existing, and failed Trellis initialization
      states.
- [x] Desktop acceptance smoke covers creating/opening a workspace with the
      Trellis setup option visible.

## Out of Scope

- A separate Trellis board in the workspace sidebar.
- Full A2A Work orchestration.
- Automatic Trellis task execution.
- Bidirectional Trellis/Superset Task synchronization.
- Database schema changes for Trellis task source metadata unless the first
  slice is explicitly expanded.

## Open Question

- Should the first implementation stop at Trellis detection/initialization in
  Create Workspace, or should it also import existing `.trellis/tasks/*` records
  into Superset Tasks?

## Notes

- Current recommendation: split it. First ship Trellis detection/initialization
  during Create Workspace. Then inspect the real Trellis task shape and design a
  clean import/sync model into Superset Tasks as a separate follow-up.
