# Recoverable project deletion

Goal: nobody accidentally destroys a project other people are actively using on a shared device.
Not a goal: stopping a deliberate insider.

Supersedes the permission-tier approach from #7867. Research (GitHub, GCP, Linear, Figma, Slack,
Drive, NN/g) converges on: make the easy action affect only you, make delete undoable, and warn with
live activity instead of blocking.

## Behavior

| Action | Who | Effect | Undo |
|---|---|---|---|
| Hide from sidebar | anyone | per-user, local | Undo toast (exists today) |
| Delete on a device | org owner or device owner | project + workspaces vanish for everyone on that device; teardown runs; terminals and agents stop | Restore for 30 days |
| Restore | org owner or device owner | project and the workspaces deleted with it come back | — |
| Purge | host, after 30 days | rows removed; clean worktrees removed, dirty ones left on disk | none |

Re-adding the same repo folder while its project is deleted restores that project.

## Host (`packages/host-service`)

- `projects.deleted_at`, `projects.deleted_by_user_id` (migration).
- `project.remove` becomes a soft delete:
  1. stamp `deletedAt`, archive every live workspace with `archivedAt = deletedAt`, broadcast;
  2. teardown (best-effort) and dispose terminal sessions per workspace.
  Worktrees stay on disk.
- `project.restore`: clear `deletedAt`, un-archive workspaces whose `archivedAt` equals it and whose
  worktree still exists.
- `project.listDeleted`: deleted projects with `purgeAt`.
- `project.deletionImpact`: per workspace, who created it, live terminals, running agents, last activity.
  Read by the dialog when it opens; nothing polls it.
- Purge sweep at startup and every 6 hours: the old hard-delete steps (worktree remove without force,
  row delete) for projects past the window.
- Deleted projects are hidden from `project.list`, `project.get`, `findByPath`, workspace creation and
  archived-workspace listings. The archived-workspace reconciler skips their workspaces (it would
  otherwise destroy the worktrees kept for restore).

## Desktop

- Delete permission: org owner or device owner, decided in the renderer from member lists.
- Dialog: devices checklist; per device the live activity from `deletionImpact`
  ("Alice · 2 terminals running · active 3 min ago"); type the project name only when someone else
  has live activity; footer offers Hide from sidebar next to Delete; copy says it can be restored for
  30 days.
- Settings → Projects: "Recently deleted" with Restore and days left.

## Out of scope

- Per-user permission on deleting individual workspaces.
- Cloud notification to affected users.
