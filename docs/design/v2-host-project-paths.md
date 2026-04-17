# V2 Host Project Paths

## Problem

The v2 architecture has **no per-host project path mapping**. When a workspace is created on a host, the system either:

1. Finds the project in the host-service local SQLite and reuses its `repoPath`
2. Or auto-clones to a hardcoded path: `~/.superset/repos/{projectId}`

A user who already has `~/work/my-project` checked out locally gets a **duplicate clone**. There's no way to say "use my existing checkout."

### Current State

| Layer | What it knows | What's missing |
|-------|--------------|----------------|
| **Cloud** (`v2_projects`) | Project name, slug, GitHub repo | Where it lives on any machine |
| **Cloud** (`v2_workspaces`) | Which project + which host + branch | The filesystem path on that host |
| **Cloud** (`v2_hosts`) | Machine ID, name, online status | Which projects are set up locally |
| **Host-service local DB** | `projects.repoPath` per project | No import flow; auto-clones to fixed path |

### Relevant Files

| File | Purpose |
|------|---------|
| `packages/db/src/schema/schema.ts` (L380-547) | Cloud schema: `v2_projects`, `v2_hosts`, `v2_workspaces` |
| `packages/host-service/src/db/schema.ts` | Host-service local SQLite: `projects` (has `repoPath`), `workspaces` |
| `packages/host-service/src/trpc/router/workspace/workspace.ts` | Workspace creation — auto-clones to `~/.superset/repos/{projectId}` if missing |
| `packages/host-service/src/trpc/router/project/project.ts` | Project removal (local cleanup) |
| `packages/trpc/src/router/v2-project/v2-project.ts` | Cloud v2 project CRUD |
| `packages/trpc/src/router/v2-workspace/v2-workspace.ts` | Cloud v2 workspace CRUD |
| `packages/trpc/src/router/device/device.ts` | Host/device registration (`ensureV2Host`, `ensureV2Client`) |
| `packages/shared/src/device-info.ts` | Machine ID derivation (platform-specific) |
| `apps/desktop/.../CollectionsProvider/collections.ts` | Electric SQL shape subscriptions (cloud → desktop sync) |
| `apps/desktop/.../DashboardNewWorkspaceModal/` | V2 workspace creation UI |
| `apps/desktop/.../v2-workspaces/hooks/useAccessibleV2Workspaces/` | Discovery page query logic |

---

## Decision: Local-Only Storage

**The project path mapping lives in the host-service local SQLite DB only — no new cloud table.**

The host-service already has a `projects` table with `repoPath`. The path is inherently machine-local: other devices can't act on knowing `~/work/my-project` exists on your MacBook. The cloud already knows *which* host a workspace is on (via `v2_workspaces.hostId`), which is sufficient for the discovery page to show "this project has workspaces on your device."

What changes is the **flow for populating** the local `projects.repoPath` — allowing import of existing repos instead of only auto-cloning.

### What stays the same

```
host-service local SQLite
└── projects
    ├── id          text PK (matches cloud v2_projects.id)
    ├── repoPath    text NOT NULL   ← this is the path mapping
    ├── repoProvider, repoOwner, repoName, repoUrl, remoteName
    └── createdAt
```

No new tables. No cloud migration. The local `projects` table is the single source of truth for "where does this project live on this machine."

---

## Decision: Throw-on-Create, Not Check-First

**`workspace.create` throws `PROJECT_NOT_SETUP` or `PROJECT_PATH_MISSING` when the project isn't ready. The client catches these and prompts the user to import or clone. No separate preflight check endpoint for the creation flow.**

### Why throw-on-create wins

1. **Setup is a one-time event.** A project gets set up once per machine. After that, every `workspace.create` is a single call with no preflight overhead. A check-first approach pays the cost of a status query on every creation — even though setup is already done 99% of the time.

2. **Handles drift naturally.** If a path vanishes between sessions (user moves/deletes the repo), the next `workspace.create` catches it at the exact moment it matters. No stale "ready" status sitting in the UI from a check that ran minutes ago.

3. **Single source of truth.** The create call itself is the authoritative answer to "can I create a workspace right now." No possibility of a check and create disagreeing due to a race condition.

4. **Project creation is a separate flow.** Users create projects in a dedicated flow (cloud-only, no local path). By the time they're creating workspaces, the project exists — the only question is local setup. The throw is a natural redirect, not an unexpected error.

### The flow

```
User opens "new workspace" modal
  → selects project, fills branch/name, submits
  → client calls host-service: workspace.create(projectId, name, branch)
  → SUCCESS: workspace created ✓
  → throws PROJECT_NOT_SETUP or PROJECT_PATH_MISSING:
      → client catches, shows setup UI (import/clone)
      → user completes setup via project.setup
      → client retries workspace.create
      → done — every subsequent create is 1 call
```

---

## New Host-Service Procedures

### `project.setup`

```typescript
project.setup({
  projectId: string,
  mode: "import" | "clone",
  localPath: string,       // import: existing repo path; clone: parent dir
})
→ { repoPath: string }
```

**Import mode:**
1. Validate `localPath` exists and is a directory
2. Find git root (`git rev-parse --show-toplevel`)
3. Run `git remote -v` → extract remote URLs
4. Fetch project's GitHub repo info from cloud (`v2Project.get` → `repoCloneUrl`)
5. Compare — check all remotes, not just `origin`
6. If match → upsert local `projects` row with `repoPath = gitRoot`
7. If mismatch → return error with expected vs. actual remote details

**Clone mode:**
1. Fetch repo clone URL from cloud (`v2Project.get`)
2. Clone to `{localPath}/{repoName}`
3. Upsert local `projects` row with resulting path

---

## Updated Workspace Creation Flow (Deferred)

Changes to `workspace.create` are **deferred** — other workspace create updates need to land first. The auto-clone logic stays for now.

### Current (`workspace.ts:29-133`)

```
workspace.create(projectId, name, branch)
  → local project exists? → YES → create worktree from repoPath
                           → NO  → auto-clone to ~/.superset/repos/{projectId}
                                    → insert local project row
                                    → create worktree
```

### Future (after workspace create refactor lands)

```
workspace.create(projectId, name, branch)
  → local project exists?
      → YES → path exists on disk?
               → YES → create worktree from repoPath ✓
               → NO  → throw PROJECT_PATH_MISSING
      → NO  → throw PROJECT_NOT_SETUP
```

Auto-clone is removed. The setup responsibility moves to `project.setup`, triggered by the client when it catches a throw. `workspace.create` assumes setup is done and fails fast if not.

---

## Desktop UI Changes

### New Workspace Modal — Setup Redirect on Throw

The normal flow is: user selects project, fills branch/name, submits. If `workspace.create` throws `PROJECT_NOT_SETUP` or `PROJECT_PATH_MISSING`, the modal catches it and shows the setup step:

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

On submit, the client calls `project.setup`, then retries `workspace.create` automatically. The user sees a single flow — setup + workspace creation feels like one action.

**Validation for "Use existing directory":**
- Path exists and is a directory
- Resolves to a git repository via `git rev-parse --show-toplevel`
- A git remote URL matches the project's GitHub repository
- Show green checkmark or red X with mismatch details

---

## Data Flow

```
Desktop ──► host-service: workspace.create(projectId, name, branch)
              │
              ├─ local project exists + path valid → create worktree, upsert cloud v2_workspace ✓
              │
              └─ throws PROJECT_NOT_SETUP or PROJECT_PATH_MISSING
                    │
                    ▼
              Client shows setup UI (import/clone)
                    │
                    ▼
Desktop ──► host-service: project.setup(projectId, mode, path)
              │ validates git remote
              │ clones if needed
              ▼
              projects.repoPath stored in local SQLite
                    │
                    ▼
Desktop ──► host-service: workspace.create(projectId, name, branch)  [retry]
              → succeeds ✓
```

No Electric sync needed for paths. The desktop talks to the local host-service for path operations and talks to the cloud (via Electric) for project/workspace metadata.

---

## Implementation Checklist

### Phase 1: Project Setup Endpoint (now)

- [ ] `packages/host-service/src/trpc/router/project/utils/git-remote.ts` — New file: git remote extraction, URL normalization (SSH/HTTPS → `owner/repo`), matching utility
- [ ] `packages/host-service/src/trpc/router/project/project.ts` — Add `setup` mutation (import + clone modes; upserts, so re-running with import mode handles re-pointing)

### Phase 2: Workspace Create Throws (after workspace create refactor)

- [ ] `packages/host-service/src/trpc/router/workspace/workspace.ts` — Remove auto-clone logic
- [ ] `packages/host-service/src/trpc/router/workspace/workspace.ts` — Throw `PROJECT_NOT_SETUP` if no local project entry
- [ ] `packages/host-service/src/trpc/router/workspace/workspace.ts` — Throw `PROJECT_PATH_MISSING` if path exists in DB but gone from disk

### Phase 3: Desktop UI (after phase 2)

- [ ] `useCreateDashboardWorkspace` — Catch `PROJECT_NOT_SETUP` / `PROJECT_PATH_MISSING` from `workspace.create`
- [ ] New setup step component (import/clone radio, path picker, git remote validation feedback)
- [ ] On setup complete: call `project.setup`, then automatically retry `workspace.create`

---

## Edge Cases

### Path becomes stale
User moves or deletes the local repo after setup. Next `workspace.create` throws `PROJECT_PATH_MISSING`. Client catches it and shows the setup UI again — same flow as first-time setup.

### Multiple remotes
A local repo may have multiple git remotes (origin, upstream, fork). Import validation should check **all** remotes for a match, not just `origin`. The match logic compares the GitHub `owner/repo` slug extracted from the URL.

### Repo at different path on same machine
User re-clones to a new location. They re-run `project.setup` with import mode pointing at the new path. The upsert overwrites the existing `projects` row (keyed by `projectId`).

### Host not yet registered
If the current machine hasn't called `ensureV2Host` yet, `workspace.create` already handles this. The setup flow doesn't need the cloud host — it only touches the local SQLite DB.

### SSH vs HTTPS clone URLs
When validating git remotes, normalize URLs before comparing. `git@github.com:org/repo.git` and `https://github.com/org/repo.git` should both match a project linked to `org/repo`.
