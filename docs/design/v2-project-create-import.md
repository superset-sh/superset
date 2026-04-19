# V2 Project Create & Import

Design for the v2 "create project" and "import project" flows. V2 projects are cloud-driven; materialization is per-host but resolved lazily, not pre-computed. Companion: `v2-host-project-paths.md` — path mapping + throw-on-create mechanics for workspaces.

> **History note.** An earlier draft of this doc introduced a cloud `v2_host_projects` table to pre-compute "which hosts back which projects" for the sidebar, and modelled four per-row states (Normal / Host offline / Not set up here / Stale path). PR review pushed back — the signal table and its derived row states are load-bearing only if the sidebar itself is backing-aware, and we don't need it to be. This rewrite collapses backing into a local-only, action-time check. See "Why not a cloud backing signal" below for the full argument.

---

## Backing: local-only, action-time

A project is **backed on a host** iff that host's `host-service.projects` table has a row for it (`packages/host-service/src/db/schema.ts:32`):

```ts
projects {
  id text PK               // matches cloud v2_projects.id
  repoPath text NOT NULL   // local main repo path
  repoProvider, repoOwner, repoName, repoUrl, remoteName
  createdAt
}
```

`workspaces.projectId` FKs to this — no project row means no workspaces on that host.

**That's the entire signal.** Backing is a local-device concept. The current host either has the row (can create workspaces, open files) or doesn't (needs setup first). Remote hosts' backing state is their own business — we never need to render or reason about it.

There is no pre-computed sidebar state that depends on backing. The sidebar shows whatever the user has pinned. Backing is checked at the point of action (workspace creation, git ops) and resolved inline when missing.

---

## Why not a cloud backing signal

Rejected: a cloud `v2_host_projects` table that rows "host H backs project P", Electric-synced to the client so the sidebar can render "Host offline" / "Not set up here" markers.

The benefit would have been a preemptive hint: "you set this up on desktop, you're on laptop now — this row won't work here." Nice, but:

- Every action the user takes already flows through a modal or a mutation that can check backing itself. The hint is redundant with the corrective UX.
- The cost is a new cloud table, an Electric collection, a client-side live query, a three-way state derivation in the renderer, and ongoing consistency questions (what if the cloud signal lags the local truth).
- If the hint turns out to be worth the floor, it can be added later as an on-demand `project.list` probe when a row is hovered or opened — no schema change needed.

**Decision.** Cloud rows describe projects. Local rows describe this device's materialization. No join table, no cross-device backing sync.

---

## State matrix

Two axes, one per data source:

| # | Cloud `v2_projects` | Host-service `projects` | Meaning | Action |
| --- | --- | --- | --- | --- |
| 1 | ✓ | ✗ | Cloud-only on this host (teammate, other device, or failed-midway create) | `project.setup` |
| 2 | ✓ | ✓ | Backed here | — |
| 3 | ✗ | — | Brand new | `project.create` |

Stale `repoPath` on disk is not a distinct state. Git ops and `workspace.create` fail when the path is gone; the failure opens the same `project.setup` flow with `acknowledgeWorkspaceInvalidation: true`. Wrong-remote drift is prevented at entry by `project.setup`'s remote validation.

---

## Host-service as orchestrator

Every client calls host-service. Desktop today; web/mobile route through host-service later. The host-service RPC **is the create flow** — cloud-row creation, optional GitHub repo provisioning, local git, local DB insert.

Neither `project.create` nor `project.setup` auto-creates a workspace. A project can exist and be backed on a host with zero workspaces. Workspaces are always explicit user action ("import branch" or "create new with clone").

### `project.create`

User-facing intent: **"clone a new project."** Cloud row + local clone.

```ts
project.create({
  name: string,
  mode:
    | { kind: "empty";       parentDir: string;                         visibility: "private" | "public" }
    | { kind: "clone";       parentDir: string; url: string }
    | { kind: "importLocal"; repoPath: string }                         // git root of existing local repo
    | { kind: "template";    parentDir: string; templateId: string;     visibility: "private" | "public" }
}) → { projectId: string; repoPath: string }
```

`visibility` lives on the GitHub-provisioning modes (`empty`, `template`) only — those need to tell the GitHub App whether to create a private or public repo. `clone` and `importLocal` reuse an existing remote, so visibility is already set on the remote.

Path semantics are baked into each variant so there's no overloaded meaning: `parentDir` for modes that create a new directory; `repoPath` (git root) for `importLocal`.

Internal order:

1. Cloud: create `v2_projects` row (+ GitHub repo for empty/importLocal/template)
2. Local git: clone / init+push / link+push / scaffold+push
3. Upsert local `host-service.projects` row with `repoPath` + remote metadata
4. Return

**GitHub repo creation is in scope** — otherwise `empty` and `template` degrade to `clone`.

**Always materializes on the calling host.** No "cloud-only" mode. Other hosts use `project.setup`.

**No rollback on mid-flow failure.** Cloud row created but local clone fails → project is in cell 1. User retries via `project.setup`. Cell 1 is a first-class state, not a failure mode.

Phase 1 ships `clone` and `importLocal` only; `empty` and `template` throw `not_implemented`.

### `project.setup`

User-facing intent: **"import or fix."** Either a cell-1 project that already exists in cloud (clone/import on this host), or a cell-2 repair (re-point the path after the directory moved or got deleted).

```ts
project.setup({
  projectId: string,
  acknowledgeWorkspaceInvalidation?: boolean,   // required when projects row already exists
  mode:
    | { kind: "clone";  parentDir: string }     // host-service clones into parentDir
    | { kind: "import"; repoPath: string }      // point at an existing git root; remote is validated
}) → { repoPath: string }
```

`acknowledgeWorkspaceInvalidation` is the repair-vs-first-time discriminator. Path re-point can invalidate existing workspace rows; caller must ack.

### `project.list`

```ts
project.list() → Array<{
  id: string          // matches v2_projects.id
  repoPath: string
}>
```

One row per `host-service.projects` entry on the calling machine. Pure DB read, no filesystem check.

**No proactive stale-path detection.** Operations that hit a missing path (`workspace.create`, git calls) surface the error at that moment, and their error handlers invalidate `["project", "list"]` and open `project.setup` with `acknowledgeWorkspaceInvalidation: true` pre-set. Lazy recovery is sufficient — the user sees the problem the first time they try to do something.

Renderer reads via React Query with invalidation on `["project", "list"]` after `project.create` / `project.setup` / `project.remove` (and on operation errors that indicate a vanished path). No subscription, no polling.

### `project.findByPath`

```ts
project.findByPath({ repoPath }) → {
  candidates: Array<{ id, name, slug, organizationId, organizationName }>
}
```

Validates `repoPath` is a git root, reads the remote URL, forwards to cloud `v2Projects.findByGitHubRemote` via `ctx.api`. Client uses this to drive the folder-first import picker.

### `project.remove`

Deletes the local `host-service.projects` row, removes worktrees, and `rmSync`s the repo directory. Cloud-side cleanup of `v2_projects` is a separate decision (org/team concern).

### Client responsibilities

Native pickers (`dialog.showOpenDialog`) stay in the client — host-service has no UI. Client collects the path, passes it into `project.create` / `project.setup`.

---

## Existing types — reuse, don't redeclare

| Need | Source |
| --- | --- |
| Cloud project row | `typeof v2Projects.$inferSelect` (`packages/db/src/schema/schema.ts:380`) |
| Cloud project + clone URL | `v2Projects.get` output (`packages/trpc/src/router/v2-project/v2-project.ts`) |
| Cloud project creation | `v2Projects.create` — takes `{ organizationId, name, slug, repoCloneUrl }` (jwt-scoped) |
| Workspace (cloud) | `typeof v2Workspaces.$inferSelect` (has `projectId`, `hostId`) |
| Host (cloud) | `typeof v2Hosts.$inferSelect` (has `machineId`, `isOnline`) |
| Host-service project row | `typeof projects.$inferSelect` |
| Host-service workspace row | `typeof workspaces.$inferSelect` |
| Current host identity | `useLocalHostService().machineId` + `activeHostUrl` |
| Pinned-in-sidebar rows | `v2SidebarProjects` / `v2WorkspaceLocalState` (localStorage) |

---

## Sidebar integration

### Visibility

**Pin alone.** A pinned project (`v2SidebarProjects` row) renders. No backing-derived filtering, no backing-derived row decoration. Users don't lose their place when a host goes offline or when a project isn't set up locally yet.

Pin-management (auto-pin, cross-device pin sync, unpin UX) is tuned separately — pin is a binary input to this design.

### Data sources

One: the existing Electric-synced cloud collections (`v2Projects`, `v2Workspaces`, `v2Hosts`, `githubRepositories`) plus local pin state.

`useDashboardSidebarData` does not call host-service. No `project.list`, no `v2_host_projects` live query, no backing derivation.

### Rendering

- **Project row** — name, GitHub owner/repo, collapse toggle, context menu. No state indicator.
- **Workspace row** — `innerJoin(v2Workspaces, v2Hosts on workspaces.hostId)` supplies the `hostType` chip (`current-host | remote-device | cloud`, from `v2Hosts.machineId === currentMachineId`). Unchanged from today.
- **"+ New workspace" action** — routes into the inline setup flow (below) instead of failing cold when the current host isn't backed.

### "+ New workspace" inline setup

When the user clicks "+ New workspace":

1. New Workspace modal mounts, calls `activeHostClient.project.list.query()` (already needed to surface ready state).
2. If `projectId` is in the list → render the branch/name form as today.
3. If not → render an inline `project.setup` step (Pin & Set Up's modal contents) first. On success, the modal transitions to step 2.

`workspace.create` still throws `PROJECT_NOT_SETUP` with the `projectId` in the error payload — defense-in-depth for scripted callers and race conditions — but the modal never waits for the throw in the happy path.

### Remote-device workspace clicks

Workspaces are bound to the host they were created on. Clicking a remote-device workspace row lands on a "switch host or set up here" stub page (`WorkspaceNotOnThisHostState`) — not the workspace itself. Set-up-here from that stub is the same `project.setup` flow.

---

## Available — discovery inside the workspaces tab

Not a separate sidebar surface. Lives as a section inside the existing workspaces tab, alongside the pinned workspaces.

- Lists cloud projects in the user's org that aren't pinned locally (`v2_projects` ∖ `v2SidebarProjects`). No backing filter.
- Three entry points:
  - **"+ New project"** → `project.create`
  - **"Pin & set up"** on a row → adds pin + runs `project.setup`
  - **"Import existing folder"** → folder-first picker (below)
- Pins never drop back into Available. Once pinned, a project lives in the sidebar forever (or until user unpins — separate gesture, out of scope).

### Folder-first import — picker flow

1. User clicks "Import existing folder" → native picker (client).
2. Client calls `project.findByPath({ repoPath })`.
3. Host-service validates git root, reads remote, forwards to `v2Projects.findByGitHubRemote({ repoCloneUrl })` via `ctx.api`.
4. Cloud filters to projects in orgs the user belongs to, returns matches.
5. Client branches on `candidates.length`:
   - **0** → modal offers "No match — create as new project" (pivots to `project.create` `importLocal`).
   - **1, not yet set up on this host** → auto-advance to `project.setup({ projectId, mode: { kind: "import", repoPath } })`.
   - **1, already set up on this host** → confirm re-point (destructive; `acknowledgeWorkspaceInvalidation`).
   - **>1** → picker modal lists candidates (name + org); user picks; then `project.setup`.

Decisions:
- Picker only appears when ambiguity is real (≥2 matches). One match auto-advances. No match offers creation.
- Candidate list scoped to the user's accessible orgs, not global — respects v2 auth scope.
- `project.findByPath` handles the remote-read + cloud-query in one call (client doesn't fan out).
- `v2Projects.findByGitHubRemote` is a dedicated matcher, not a filter on `v2Projects.list` — auth is explicit and intent is clear. Named `findByGitHubRemote` (not `findByRemote`) because the input is a GitHub clone URL and the match goes through `githubRepositories.fullName`.

---

## User journeys

**Legend:** laptop + desktop, both connected unless noted. "Pin" = localStorage, per-device.

### 1. New user, new org — first project

| Step | Host-service `projects` | Cloud `v2_projects` | Pin | Sidebar | Available |
| --- | --- | --- | --- | --- | --- |
| start | — | — | — | empty | empty |
| "+ New project" → `project.create` | row | row | pinned | project, no workspaces | — |

### 2. Join an org with existing projects

| Step | Host-service `projects` | Pin | Sidebar | Available |
| --- | --- | --- | --- | --- |
| start | — | — | empty | every teammate project |
| "Pin & set up" → `project.setup` | row | pinned | the project, no workspaces | rest |

### 3. Adding a second host

| Step | Laptop host-svc | Desktop host-svc | Desktop pins | Desktop sidebar | Desktop Available |
| --- | --- | --- | --- | --- | --- |
| before (user on laptop) | A, B | — | — | — | — |
| log into desktop | unchanged | — | — | empty | A, B |
| "Pin & set up" A on desktop | unchanged | A | A | A | B |

Desktop starts empty (no pins on this device). Cross-device pin sync is pin-tuning, out of scope.

### 4. Same project backed on both hosts

| Event | Laptop sidebar (project P) | Desktop sidebar (project P) |
| --- | --- | --- |
| both backed, no workspaces yet | pinned, empty | pinned, empty |
| laptop creates α (hostId = L) | + α (current-host) | + α (remote-device) |
| desktop creates β (hostId = D) | + β (remote-device) | + β (current-host) |

Workspaces bind to their creating host; the `hostType` chip on each row reflects that. Remote-device rows open the "switch host or set up here" stub, not the workspace directly.

### 5. Pinned but not set up here

User on laptop; project P pinned; only desktop has it set up.

- Sidebar row renders normally (pin-only visibility).
- User clicks "+ New workspace" on P → modal opens, `project.list` shows no P → modal drops into inline setup first, then workspace-create.

No pre-emptive "Host offline" marker. The corrective flow runs at the moment it's needed.

### 6. repoPath deleted out of band

User deletes the project directory from Finder. Next git op or `workspace.create` fails with ENOENT. The failure handler:

1. Invalidates `["project", "list"]`.
2. Opens `project.setup` modal with `acknowledgeWorkspaceInvalidation: true` pre-set.
3. User picks a new folder or re-clones; flow completes.

---

## Flow summary

| Transition | RPC | Entry point |
| --- | --- | --- |
| cell 3 → cell 2 | `project.create` | Available "+ New project", sidebar dropdown "+ New project" |
| cell 1 → cell 2 | `project.setup` | Available "Pin & set up"; "Import existing folder" when candidates = 1; inline setup on "+ New workspace" |
| cell 2 → cell 2 (repair) | `project.setup` (`acknowledgeWorkspaceInvalidation: true`) | Error-path from workspace/git ops; re-point from "Import existing folder" |

---

## Open questions

1. **GitHub auth for repo creation.** Likely cloud-side (GitHub App installation), fetched via `ctx.api`. Org-picker UX is a separate design.
2. **Template source.** Cloud records, curated registry, or user-provided? Mode exists in the RPC shape; implementation stubbed until decided.
3. **Mid-flow failure visibility.** With no rollback, a cloud row can exist without any host-service row on any device. Available surfaces this naturally — decide whether the originating client also shows an inline "setup unfinished" recovery path.
4. **Orphaned cloud rows.** `v2_projects` rows with no host-service row anywhere, from abandoned retries. TTL cleanup is a separate decision.
5. **Preemptive "not set up here" hint.** Re-add if users report confusion. Cheapest path: on-hover `project.list` probe, no schema change.

Pin behavior (auto-pin on create/setup, cross-device pin sync, unpin UX) is out of scope here.

---

## Phasing

Moved to [`plans/20260417-v2-project-create-import-impl.md`](../../plans/20260417-v2-project-create-import-impl.md).
