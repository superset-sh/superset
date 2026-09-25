# Sidebar project sort & filter

The dashboard sidebar's Projects section can be sorted three ways and filtered
by name. Both controls live in the Projects header
(`components/DashboardSidebarWorkspacesHeader`) and apply only to that section:
Pinned keeps pin order, Sessions keeps its own order.

This is the third landing of the feature. #5956 shipped it sorting on
`updatedAt` and was reverted in #5996 (a render crash on string timestamps, and
`updatedAt` only moves on metadata writes, so messaging an agent never
reordered anything). #6005 re-landed it by polling each host's live
terminal-agent bindings every 10 s. This version replaces both signals with a
column the host persists.

## Sort modes

Persisted per user as `sidebarProjectSortMode` in `v2UserPreferences`
(`manual` by default; a stale value from #5956 heals to `manual`).

| Mode | Project order | Order inside a project |
| --- | --- | --- |
| Manual order | drag order (`tabOrder`), untouched | `tabOrder` |
| Last active | most recently active workspace, newest first | workspaces and folders by activity, newest first |
| Date created | `project.createdAt`, newest first | workspace / folder `createdAt`, newest first |

Rules shared by the non-manual modes (`utils/sortDashboardSidebarProjects`):

- A folder ranks among loose workspaces by its newest member (Last active) or
  its own `createdAt` (Date created); its members are sorted inside it too.
- The local `main` workspace stays first inside its project.
- A project with no workspaces ranks by its own `updatedAt`, then `createdAt`.
- Ties break by name, then id, so the order is stable across renders.
- Timestamps are coerced NaN-safely. Persisted caches can revive `Date`
  columns as ISO strings; a value that fails to parse sinks to the bottom of
  its list instead of throwing.
- Manual returns the input array by reference, and a project whose children
  are already in order keeps its identity, so memoized rows are not disturbed.

Sorting and filtering are derived views computed in `DashboardSidebar`; the
data hook and the persisted `tabOrder` are never rewritten, which is what lets
Manual restore the exact prior drag order.

## The activity signal

Each host-service stamps `workspaces.last_activity_at` (epoch ms) on its own
SQLite row and serves it as `lastActivityAt` on `workspace.list` and on every
`workspace:changed` snapshot. A workspace's activity time is

```text
lastActivityAt ?? updatedAt
```

and deliberately not `max(lastActivityAt, updatedAt)`: renaming a workspace or
moving it into a folder bumps `updatedAt`, and housekeeping must not jump a
row to the top of "Last active". Once a row carries any `lastActivityAt`, that
alone ranks it.

**What counts.** Every normalized agent lifecycle event that reaches
`notifications.hook`: prompt submit, tool use, stop, permission request, and
session attach/detach, for every supported agent CLI. Creating a workspace
stamps creation as its first activity.

**What does not count, by design.** Plain non-agent terminal typing; the user
merely opening or viewing a workspace (that would reshuffle the list under the
pointer while navigating); pull-request status changes; renames, tag edits,
and folder moves.

**Throttle.** `touchLocalWorkspaceActivity` writes at most once per 30 s per
workspace. The first event after a quiet period writes immediately (so a
prompt to an idle workspace reorders within about a second); the chatty
tool-use events inside the window are dropped. Each write broadcasts the row
as `workspace:changed` / `updated`, so renderers reorder over the event-bus
subscription they already hold, with no polling. Only `lastActivityAt` moves;
`updatedAt` stays a metadata signal and no analytics fire.

**Old hosts.** A host-service that predates the column omits the field. The
renderer normalizes that to `null` in one place
(`useHostWorkspaces.utils#toHostWorkspaceItem`, plus the `workspace:changed`
patch), and such rows rank by `updatedAt`. Rows that exist when the host
migrates stay `null` until their first agent event.

### Why a host column replaced polling

- The bindings that #6005 polled are live-only: `terminalAgents.list` returns
  rows for running sessions, so a workspace dropped in the ranking the moment
  its agent session ended. The column survives session end and host restarts.
- Since Electric sync was removed, the host-service owns workspace rows and
  already streams them to every renderer. Recording activity where the row
  lives makes the renderer's data path a single extra field instead of a
  per-host `useQueries` fan-out with a 10 s interval.
- No cloud persistence: activity is per host, like the rows themselves. A
  remote host's ranking is exactly as fresh as its last snapshot.

## Filter

A magnifier in the Projects header expands into an inline input. The query is
ephemeral React state in `DashboardSidebar` (`utils/filterDashboardSidebarProjects`):

- Case-insensitive, trimmed substring match over project names, workspace
  display names, and folder names. Branch names are not searched: v2 names are
  branch-derived, and matching hidden text would surface rows whose visible
  label does not contain the query.
- A project whose name matches is kept whole. Otherwise it is pruned to its
  matching workspaces and folders; a matching folder keeps all its members.
  Projects with nothing matching are dropped, and an empty result shows a muted
  "No projects match" row.
- Surviving projects and matched folders render expanded through derived
  objects; the persisted collapse state is never written, so Escape restores
  it exactly.
- Expanding the filter while the Projects section is collapsed un-collapses
  the section, and collapsing the section closes the filter. Collapsing the
  sidebar to the icon rail clears the query too, since the header is hidden
  there and an invisible filter would silently hide projects. The header
  keeps the "Projects" accessible name while the input takes its row.
- ⌘1–⌘9 skip the "expand the collapsed project/folder" step while a filter
  is active: the filtered view already shows matches expanded, and the
  toggle would rewrite the persisted collapse state.
- Sort applies first, then filter. ⌘1–⌘9 labels come from the sorted but
  unfiltered list so targets do not shift while typing. Bulk selection's
  selectable set comes from the displayed list so select-all cannot reach
  hidden rows. The workspace-status subscriptions stay unfiltered so they do
  not churn per keystroke.

## Drag-and-drop gating

While the sort mode is not Manual or the filter is non-empty, the rendered
lists are a transformed view; committing a drop would persist that view into
`tabOrder` and corrupt the real order of hidden or reordered siblings. The
sidebar's single `DndContext` therefore runs on gated sensors
(`useSidebarDnd({ disabled })`): each sensor's activators decline to start a
drag while `disabled` is set, so projects, workspaces, folders, pinned rows,
and sessions are all inert at once, with no per-sortable flags. The sensor
list itself never changes shape (dnd-kit spreads it into a hook dependency
array, and an empty-list swap trips React's "changed size between renders"
warning). Switching back to Manual (or clearing the filter) re-enables
dragging and restores the prior order without a reload. The sort menu shows
a "Drag to reorder in Manual order" hint while a non-manual mode is active.

## Known limitations

- Activity is per host and not mirrored to the cloud, so a host you cannot
  reach ranks by its last snapshot.
- The 30 s throttle means a second burst of events inside the window is not
  reflected until the next one; ranking is "last active within 30 s", which is
  the intended resolution for a sidebar.
- A messaged workspace ranks by its newest event, it does not pin to #1: an
  agent still working elsewhere keeps bumping its own row and can legitimately
  out-rank it moments later.
- Pinned and Sessions sections ignore both controls.
- Unit tests cover the pure sort/filter utils, the host store's throttle and
  broadcast, and the hook wiring; the reorder-on-prompt path is verified live
  over CDP, not in a component test.
