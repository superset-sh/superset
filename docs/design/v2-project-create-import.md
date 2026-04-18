# V2 Project Create & Import

Design for the v2 "create project" and "import project" flows. V2 projects are cloud-driven, and materialization is per-host. Companion: `v2-host-project-paths.md` — path mapping + throw-on-create mechanics for workspaces.

---

## Backing: source of truth

A project is **backed on a host** iff that host's `host-service.projects` table has a row for it (`packages/host-service/src/db/schema.ts:32`):

```ts
projects {
  id text PK               // matches cloud v2_projects.id
  repoPath text NOT NULL   // local main repo path
  repoProvider, repoOwner, repoName, repoUrl, remoteName
  createdAt
}
```

`workspaces.projectId` FKs to this. No project row → no workspaces possible on that host. `repoPath` can be stale on disk (cell 3) — handled with a repair CTA.

---

## State dimensions

Per host, a project has three signals; plus the global cloud signal:

| Axis | Values |
| --- | --- |
| Cloud `v2_projects` row | exists / missing |
| Host's `host-service.projects` row | exists / missing |
| `repoPath` on disk | valid git root / missing |

### Cells

| \# | Cloud | Host row | Disk | Meaning | Action |
| --- | --- | --- | --- | --- | --- |
| 1 | ✓ | ✗ | — | Cloud-only (teammate, other device) | `project.setup` (clone/import) |
| 2 | ✓ | ✓ | valid | Fully backed | — |
| 3 | ✓ | ✓ | missing | Stale path | Repair via `project.setup` |
| 5 | ✗ | — | — | Brand new | `project.create` |

Wrong-remote drift (host row exists but its remote doesn't match cloud's `repoCloneUrl`) is prevented at entry by `project.setup`'s remote validation. Not modelled here.

---

## Current sidebar (and what's broken)

The existing v2 sidebar (`useDashboardSidebarData`) is **pin-driven**, not backing-aware. Visibility comes from three per-device localStorage collections:

| Collection | Role |
| --- | --- |
| `v2SidebarProjects` | Project is in sidebar iff row exists. Holds `projectId`, `tabOrder`, `isCollapsed`. |
| `v2WorkspaceLocalState` | Workspace is in sidebar if row exists. Holds `sidebarState.projectId/tabOrder/sectionId`. |
| `v2SidebarSections` | Optional grouping rows. |

Nothing in the join consults `host-service.projects`. Pinned projects with no backing still render, and "New workspace" throws deep in the creation flow. This design fills that gap.

---

## Host-service as orchestrator

Every client calls host-service. Desktop today; web/mobile route through host-service later. The host-service RPC **is the create flow** — cloud-row creation, optional GitHub repo provisioning, local git, local DB insert, cloud backing signal.

Neither `project.create` nor `project.setup` auto-creates a workspace. A project can exist and be backed on a host with zero workspaces. Workspaces are always explicit user action ("import branch" or "create new with clone").

### `project.create` (new)

User-facing intent: **"clone a new project."** Handles the new-project side — cloud row + local clone.

```ts
project.create({
  name: string,
  visibility: "private" | "public",
  mode:
    | { kind: "empty";       parentDir: string }
    | { kind: "clone";       parentDir: string; url: string }
    | { kind: "importLocal"; repoPath: string }                      // git root of existing local repo
    | { kind: "template";    parentDir: string; templateId: string }
}) → { projectId: string; repoPath: string }
```

Path semantics are baked into each variant so there's no overloaded meaning: `parentDir` for modes that create a new directory; `repoPath` (git root) for `importLocal`.

Internal order:

1. Cloud: create `v2_projects` row (+ GitHub repo for empty/importLocal/template)
2. Local git: clone / init+push / link+push / scaffold+push
3. Upsert `host-service.projects` row with `repoPath` + remote metadata
4. Upsert cloud `v2_host_projects` row for (projectId, currentHostId) — see backing signal below
5. Return

**GitHub repo creation is in scope** — otherwise `empty` and `template` degrade to `clone`.

**Always materializes on the calling host.** No "cloud-only" mode. Other hosts use `project.setup`.

**No rollback on mid-flow failure.** Cloud row created but local clone fails → project is in cell 1. User retries via `project.setup`. Cell 1 is a first-class state, not a failure mode.

Phase 1 ships `clone` and `importLocal` only; `empty` and `template` throw `not_implemented`.

### `project.setup` (exists — `packages/host-service/src/trpc/router/project/project.ts:23`)

User-facing intent: **"import or fix."** Either a cell-1 project that already exists in cloud (clone/import on this host), or a cell-3 repair (re-point the path).

```ts
project.setup({
  projectId: string,
  acknowledgeWorkspaceInvalidation?: boolean,   // required when projects row already exists
  mode:
    | { kind: "clone";  parentDir: string }     // host-service clones into parentDir
    | { kind: "import"; repoPath: string }      // point at an existing git root; remote is validated
}) → { repoPath: string }
```

Changes from existing:

- Also upserts cloud `v2_host_projects` row for (projectId, currentHostId).
- `acknowledgeWorkspaceInvalidation` is the repair-vs-first-time discriminator. Path re-point can invalidate existing workspace rows; caller must ack.

### `project.list` (new)

```ts
project.list() → Array<{
  id: string          // matches v2_projects.id
  repoPath: string
}>
```

One row per `host-service.projects` entry on the calling machine. Pure DB read, no filesystem check.

**Phase 1: no proactive stale-path detection.** Operations that hit a missing path (e.g. `workspace.create`, `git` calls) surface the error at that moment, and their error handlers invalidate `["project", "list"]` so the sidebar can react. Lazy path to repair is good enough until users complain. Phase 4 adds proactive `statSync` + a Stale-path row state + a refetch interval to catch out-of-band disk changes.

Renderer reads via React Query with invalidation on `["project", "list"]` after `project.create` / `project.setup` / `project.remove` (and on operation errors that indicate a vanished path). No subscription, no polling — local `host-service.projects` only changes via our own mutations.

### Cloud backing signal: `v2_host_projects`

Since we no longer auto-seed workspaces, we can't derive "host H backs project P" from the workspaces table. We need a direct signal.

New cloud table, Electric-synced:

```ts
v2_host_projects {
  id uuid PK
  organizationId uuid
  projectId uuid → v2_projects.id
  hostId uuid → v2_hosts.id
  createdAt, updatedAt
  unique(projectId, hostId)
}
```

One row per (project, host) pair that backs it. Host-service mutations:
- `project.create` / `project.setup` → upsert
- `project.remove` → delete the row for (projectId, currentHostId)

Both mutations go through `ctx.api` to a new cloud `v2HostProjects` router (authorized against the caller's `v2_users_hosts` membership).

### Client responsibilities

Native pickers (`dialog.showOpenDialog`) stay in the client — host-service has no UI. Client collects the path, passes it into `project.create` / `project.setup`.

---

## Existing types — reuse, don't redeclare

| Need | Source |
| --- | --- |
| Cloud project row | `typeof v2Projects.$inferSelect` (`packages/db/src/schema/schema.ts:380`) |
| Cloud project + clone URL | `v2Projects.get` output (`packages/trpc/src/router/v2-project/v2-project.ts:82`) |
| Cloud project creation | `v2Projects.create` (L113) — takes `{ name, slug, githubRepositoryId }` |
| Workspace (cloud) | `typeof v2Workspaces.$inferSelect` (has `projectId`, `hostId`) |
| Host (cloud) | `typeof v2Hosts.$inferSelect` (has `machineId`, `isOnline`) |
| Host backing (cloud, new) | `typeof v2HostProjects.$inferSelect` (see above) |
| Host-service project row | `typeof projects.$inferSelect` |
| Host-service workspace row | `typeof workspaces.$inferSelect` |
| Current host identity | `useLocalHostService().machineId` + `activeHostUrl` |
| Pinned-in-sidebar rows | `v2SidebarProjects` / `v2WorkspaceLocalState` (localStorage) |

---

## Sidebar integration

### Visibility rule

**Pin alone.** A pinned project (`v2SidebarProjects` row) always renders. Backing health shows as row state, never as a filter. Users don't lose their place when a host goes offline. Pin-management (auto-pin, cross-device pin sync, unpin UX) is tuned separately — pin is a binary input to this design.

### Backing derivation (client-side)

Two sources, combined in `useDashboardSidebarData`. Nothing new gets synced.

**Local backing** — authoritative, lag-free. Calls the local daemon:

```ts
const { data: localBacked } = useQuery({
  queryKey: ["project", "list"],
  queryFn: () => activeHostClient.project.list.query(),
})
// Map<projectId, { repoPath }>
```

**Remote backing** — Electric-derived from `v2_host_projects`, tolerates sync lag:

```ts
const { data: remoteBacked } = useLiveQuery(q => q
  .from({ hp: collections.v2HostProjects })
  .innerJoin({ h: collections.v2Hosts }, ({ hp, h }) => eq(hp.hostId, h.id))
  .where(({ h }) => ne(h.machineId, currentMachineId))
)
// → derived into Map<projectId, { online: Set<hostId>; offline: Set<hostId> }>
//   partitioned by h.isOnline
```

Both online and offline remote backings are surfaced — offline is what drives the "Host offline" row state. Direct signal, no workspace-count dependency.

> ⚠️ **Implementation-time validation.** The two-source split (host-service tRPC for local, Electric live query for remote) is structurally motivated — `pathStatus` needs filesystem access, Electric gives push-based reactivity for remote changes. In practice, the combined hook may surface friction (ordering, invalidation timing, empty-state flashes). Revisit if the split causes pain during wiring.

### Row state (per pinned project)

| Row state | Condition | CTA |
| --- | --- | --- |
| Normal | local backing exists, or any `remoteBacked.online` host | open / new workspace |
| Host offline | no local backing, no online remote backing, but `remoteBacked.offline` non-empty | passive; reconnect restores |
| Not set up here | no local backing, no remote backing at all | "Set up here" inline (→ `project.setup`) |

Phase 4 adds a fourth **Stale path** state, triggered by proactive `statSync` of `repoPath`. Phase 1 doesn't distinguish healthy-on-disk from missing-on-disk — operations fail lazily if the path is gone.

### Workspace row

- **Host chip** — `current-host | remote-device | cloud`, from the existing `hostType` derivation (`v2Hosts.machineId === machineId`).
- **New workspace action** — local backing → creates directly; otherwise → inline setup-then-create (see companion doc).
- **Remote-device workspace click** — workspaces are bound to the host they were created on. Opening requires being on that host. Click lands on a "switch host or set up here" stub page (Phase 3; companion doc).

---

## Available — discovery inside the workspaces tab

Not a separate sidebar surface. Lives as a section inside the existing workspaces tab, alongside the pinned workspaces.

- **D7.1.** Lists cloud projects in the user's org that aren't pinned locally (`v2_projects` ∖ `v2SidebarProjects`). No backing filter — pinned-and-unbacked stays in the sidebar, not here.
- **D7.2.** Two entry points:
  - **"+ New project"** → `project.create`
  - **"Pin & set up"** on a row → adds pin + runs `project.setup`
- **D7.3.** Pins never drop back into Available. Once pinned, a project lives in the sidebar forever (or until user unpins — separate gesture, out of scope).
- **D7.4.** No row-state decoration here (Normal / Stale path / Host offline / Not set up here are sidebar concerns). Available lists cloud projects as candidates only.
- **D7.5. Folder-first entry: "Import existing folder."** Alongside "+ New project." User picks a folder; if its git remote matches an existing cloud project, we bind to that project via `project.setup`. If multiple projects match (two cloud projects share a GitHub repo across orgs, etc.), show a picker. If none match, offer to create instead via `project.create` with `mode: importLocal`.

### Folder-first import — picker flow

1. User clicks "Import existing folder" → native picker (client).
2. Client calls new host-service `project.findByPath({ repoPath }) → { candidates: Array<{ id, name, slug, organizationId, organizationName }> }`.
3. Host-service validates `repoPath` is a git root, reads the remote URL, forwards to new cloud `v2Projects.findByRemote({ repoCloneUrl })` via `ctx.api`.
4. Cloud filters to projects in orgs the user belongs to, returns matches.
5. Client branches on `candidates.length`:
   - **0** → modal offers "No match — create as new project" (pivots to `project.create` `importLocal`).
   - **1** → auto-advance to `project.setup({ projectId, mode: { kind: "import", repoPath } })`.
   - **>1** → picker modal lists candidates (name + org); user picks; then `project.setup`.

Decisions baked in:
- **D7.6.** Picker only appears when ambiguity is real (≥2 matches). One match auto-advances. No match offers creation.
- **D7.7.** Candidate list scoped to the user's accessible orgs, not global — respects v2 auth scope.
- **D7.8.** New host-service endpoint `project.findByPath` handles the remote-read + cloud-query in one call (client doesn't fan out).
- **D7.9.** New cloud endpoint `v2Projects.findByRemote` — dedicated matcher, not a `v2Projects.list` filter, so auth is explicit and intent is clear.

---

## User journeys

**Legend:** laptop + desktop, both connected unless noted. "Pin" = localStorage, per-device.

### 1. New user, new org — first project

| Step | Host-service | Cloud `v2_projects` | Cloud `v2_host_projects` | Pin | Sidebar | Available |
| --- | --- | --- | --- | --- | --- | --- |
| start | — | — | — | — | empty | empty |
| "+ New project" → `project.create` | row | row | row | pinned | project, Normal, no workspaces | — |

Project exists and is backed; user creates workspaces explicitly from the sidebar.

### 2. Join an org with existing projects

| Step | Host-service | `v2_host_projects` (this user's hosts) | Pin | Sidebar | Available |
| --- | --- | --- | --- | --- | --- |
| start | — | — | — | empty | every teammate project |
| "Pin & set up" → `project.setup` | row | + row for current host | pinned | the project, Normal, no workspaces | rest |

Teammates' `v2_host_projects` rows exist but their hosts are in their own `v2_users_hosts`, so they don't contribute remote backing for this user. Available is the path in.

### 3. Adding a second host

| Step | Laptop host-svc | Desktop host-svc | Desktop pins | Desktop sidebar | Desktop Available |
| --- | --- | --- | --- | --- | --- |
| before (user on laptop) | A, B | — | — | — | — |
| log into desktop | unchanged | — | — | empty | A, B |
| "Pin & set up" A on desktop | unchanged | A | A | A, Normal | B |

Desktop starts empty (no pins on this device). Cross-device pin sync is pin-tuning.

### 4. Same project backed on both hosts

| Event | `v2_host_projects` | `v2_workspaces` | Laptop sidebar (project P) | Desktop sidebar (project P) |
| --- | --- | --- | --- | --- |
| both backed, no workspaces yet | (P,L), (P,D) | — | Normal, empty | Normal, empty |
| laptop creates α | unchanged | + α (hostId = L) | + α (local) | + α (remote) |
| desktop creates β | unchanged | + β (hostId = D) | + β (remote) | + β (local) |

Backing is independent of workspaces. Workspaces bind to their creating host. Remote-device rows open the "switch host or set up here" stub, not the workspace directly.

### 5. A host goes offline

User on desktop, project pinned there. Laptop is the other host.

| State | Laptop online | Desktop backs it | Row state |
| --- | --- | --- | --- |
| both backed, both online | ✓ | ✓ | Normal |
| laptop offline, desktop backs it | — | ✓ | Normal |
| laptop offline, desktop doesn't | — | — | Host offline |
| neither host ever backed it | — | — | Not set up here |

Row state surfaces the problem; the pin stays.

---

## Flow summary

| Transition | RPC | Entry point | Row state flips |
| --- | --- | --- | --- |
| nothing → cell 2 | `project.create` | Available "+ New project" | Normal immediately |
| cell 1 → cell 2 | `project.setup` | Workspaces-tab Available "Pin & set up", sidebar "Set up here" CTA | Normal immediately |
| cell 3 → cell 2 | `project.setup` (`acknowledgeWorkspaceInvalidation: true`) | Phase 4 Stale-path Repair CTA (or lazy on operation error in Phase 1) | Normal immediately |
| workspace-create on unbacked host | workspace.create throw → inline `project.setup` → retry | New Workspace modal | Normal immediately |

---

## Open questions

1. ~~**Disambiguation on import.**~~ **Resolved:** Phase 1 ships a folder-first entry point ("Import existing folder") with a picker. See the dedicated section below.
2. **GitHub auth for repo creation.** Likely cloud-side (GitHub App installation), fetched via `ctx.api`. Org-picker UX is a separate design.
3. **Template source.** Cloud records, curated registry, or user-provided? Mode exists in the RPC shape; implementation stubbed until decided.
4. **Mid-flow failure visibility.** With no rollback, a cloud row can exist without any host-service row. Available surfaces this naturally — decide whether the originating client also shows an inline "setup unfinished" recovery path.

Pin behavior (auto-pin on create/setup, cross-device pin sync, unpin UX) is out of scope here.

---

## Phasing

Moved to [`plans/20260417-v2-project-create-import-impl.md`](../../plans/20260417-v2-project-create-import-impl.md) — Phase 1 punch list + Phases 2–4 sequencing + deferred/out-of-scope notes.