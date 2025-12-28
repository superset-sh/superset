# Electric SQL Architecture

Real-time sync between Postgres and the Desktop app.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                 CLOUD                                       │
│                                                                             │
│  ┌─────────────┐         ┌─────────────────────────────────────────────┐    │
│  │   Linear    │────────▶│                 Postgres                    │    │
│  │   GitHub    │         │                                             │    │
│  └─────────────┘         │  organizations ─┬─▶ repositories            │    │
│                          │                 ├─▶ tasks                   │    │
│                          │                 └─▶ workspaces              │    │
│                          └──────────────────────────┬──────────────────┘    │
│                                                     │                       │
│                                                     │ Logical Replication   │
│                                                     ▼                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Electric Cloud                               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                     │                       │
│  ┌──────────────────────────────────────────────────┴────────────────────┐  │
│  │                    API Proxy (/api/electric/*)                        │  │
│  │                                                                       │  │
│  │  • Validates JWT                                                      │  │
│  │  • Sets WHERE clause based on user's org memberships                  │  │
│  │  • Forwards to Electric Cloud                                         │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTPS
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DESKTOP APP                                    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                          MAIN PROCESS                                 │  │
│  │                                                                       │  │
│  │   Electric Sync ───▶ SQLite ◀─── tRPC Router                          │  │
│  │                                                                       │  │
│  │   Synced tables:              Local tables:                           │  │
│  │   • organizations             • local_repos (path ↔ repo link)        │  │
│  │   • users                     • settings                              │  │
│  │   • organization_members      • electric_sync_state                   │  │
│  │   • repositories                                                      │  │
│  │   • tasks                                                             │  │
│  │   • workspaces                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                      │                                      │
│                                      │ IPC                                  │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        RENDERER PROCESS                               │  │
│  │                                                                       │  │
│  │   React ──▶ tRPC ──▶ SQLite (instant) + subscriptions (updates)       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Synced Tables (Postgres → Electric → SQLite)

These are team-shared data, synced in real-time to all connected desktops.

#### organizations

Teams that users belong to.

```sql
organizations
├── id
├── name
├── slug
├── avatar_url
├── created_at
└── updated_at
```

#### users

Team members. Synced so desktop can show names/avatars for assignees and workspace owners.

```sql
users
├── id
├── email
├── name
├── avatar_url
├── created_at
└── updated_at
```

#### organization_members

Links users to orgs (many-to-many).

```sql
organization_members
├── id
├── organization_id   → organizations.id
├── user_id           → users.id
├── role              -- "owner" | "admin" | "member"
├── created_at
└── updated_at
```

**Note:** The proxy uses this table to determine which orgs a user can access. Only users/members for the current user's orgs are synced.

#### repositories

Git repositories connected to the organization. Created via GitHub/Linear integrations.

```sql
repositories
├── id
├── organization_id   → organizations.id
├── name              -- "superset"
├── slug              -- "superset"
├── url               -- "https://github.com/anthropics/superset"
├── default_branch    -- "main"
├── github_id         -- for sync
├── created_at
└── updated_at
```

#### tasks

Work items from Linear or created locally.

```sql
tasks
├── id
├── organization_id   → organizations.id
├── repository_id     → repositories.id (nullable, suggested repo from Linear)
├── title
├── description
├── status            -- flexible text, e.g. "In Progress"
├── status_color      -- hex color from Linear
├── priority          -- "urgent" | "high" | "medium" | "low" | "none"
├── assignee_id       → users.id (nullable)
├── external_provider -- "linear" | "github" | null
├── external_id       -- provider's ID
├── external_key      -- "SUPER-123"
├── external_url
├── branch            -- suggested git branch name
├── labels            -- JSON array
├── due_date
├── created_at
├── updated_at
└── deleted_at
```

**Note on `repository_id`:** This is the *suggested* repo from Linear (based on the branch name), not a hard link. Actual work happens in workspaces, which have their own `repository_id`. A task can spawn multiple workspaces across different repos.

#### workspaces

Active work sessions. Visible to the whole team for awareness.

```sql
workspaces
├── id
├── organization_id   → organizations.id
├── task_id           → tasks.id (nullable - exploratory work allowed)
├── repository_id     → repositories.id
├── owner_id          → users.id
├── type              -- "local" | "cloud"
├── device_name       -- "Sarah's MacBook" | "Cloud Sandbox #3"
├── status            -- "active" | "idle" | "archived"
├── git_branch
├── git_status        -- JSON: { uncommitted: 3, ahead: 1, behind: 0 }
├── pr_url            -- "https://github.com/org/repo/pull/123"
├── pr_number         -- 123
├── pr_status         -- "draft" | "open" | "merged" | "closed" | null
├── last_activity_at  -- presence indicator
├── created_at
└── updated_at
```

**PR Tracking:** PRs live on workspaces, not tasks. A workspace = a branch, and a PR is created from that branch. One task can have multiple PRs across different workspaces (different repos, or multiple attempts).

**Visibility:** Everyone on the team sees all workspaces in their org.

**Example view:**
```
SUPER-123: Add login
├── Sarah's MacBook (local) - active 2m ago, PR #42 open
└── Cloud Sandbox (agent) - idle, PR #43 draft

SUPER-456: Fix bug
└── Mike's MacBook (local) - active now, 3 uncommitted

(no task)
└── Sarah's MacBook (local) - exploratory work
```

---

### Local Tables (SQLite only)

Device-specific data that doesn't sync to the team.

#### local_repos

Links a local folder to an org repository.

```sql
local_repos
├── id
├── repository_id     → synced repositories.id (nullable if unlinked)
├── local_path        -- "/Users/sarah/code/superset"
├── device_id         -- unique ID for this machine
├── color             -- UI preference
├── last_opened_at
└── created_at
```

**How linking works:**

1. User opens a folder
2. Desktop reads git remote URL (`git remote get-url origin`)
3. Normalize URL: `git@github.com:org/repo.git` → `github.com/org/repo`
4. Match against synced `repositories.url`
5. If match found → auto-link (or prompt to confirm)
6. If no match → stays unlinked (local-only project)

#### settings

User preferences for this device.

```sql
settings
├── id                        -- always 1
├── active_organization_id    → organizations.id
├── last_active_workspace_id
├── theme
├── terminal_presets          -- JSON
└── ...
```

#### electric_sync_state

Bookkeeping for resuming sync after app restart.

```sql
electric_sync_state
├── table             -- "tasks", "workspaces", etc.
├── handle            -- Electric sync handle
├── offset            -- last synced offset
└── last_synced_at
```

**TODO: Investigate if needed.** Electric's ShapeStream may handle offset/resume internally. If so, this table is unnecessary and we can let Electric manage sync state.

---

## Relationships

```
Organization
├── Members (N:M via organization_members)
│   └── user_id → User
│   └── role: owner | admin | member
│
├── Repositories (1:N) ──────────────────────────┐
│   └── comes from GitHub/Linear integration    │
│                                                │
├── Tasks (1:N)                                  │
│   ├── repository_id → Repository (optional)   │  ← suggested repo only
│   ├── assignee_id → User                      │
│   └── comes from Linear or created locally    │
│                                                │
└── Workspaces (1:N)                             │
    ├── task_id → Task (optional)               │
    ├── repository_id → Repository ◀────────────┘  ← actual work happens here
    ├── owner_id → User
    ├── pr_url, pr_status                       ← PR tracked per workspace
    └── represents active work session


User
├── Can belong to multiple orgs (via organization_members)
├── Can be assigned to tasks (assignee_id)
└── Can own workspaces (owner_id)


Task → Workspace → PR flow:
├── One task can have many workspaces (different repos, different attempts)
├── Each workspace has exactly one repository
├── Each workspace can have one PR (created from that workspace's branch)
└── A task's "PR status" = aggregate of its workspaces' PRs


Local Repo (device-only)
├── repository_id → Repository (links local folder to org repo)
└── local_path (where it lives on this machine)
```

---

## Data Flow

### Reads (real-time sync)

```
Postgres change
    ↓
Electric Cloud (CDC)
    ↓
API Proxy (validates JWT, enforces org access)
    ↓
Desktop Main Process (ShapeStream)
    ↓
SQLite (persisted)
    ↓
tRPC subscription → Renderer re-renders
```

### Writes

```
User action in Renderer
    ↓
tRPC mutation
    ↓
Main Process → API (HTTP)
    ↓
Postgres updated
    ↓
Electric syncs back to all desktops
```

---

## tRPC Integration

### Subscriptions (Change Notifications)

The subscription doesn't stream data - it signals "something changed". Actual data comes from queries reading SQLite.

**Main Process (observable pattern required for trpc-electron):**

```typescript
import { observable } from "@trpc/server/observable";

export const createElectricRouter = () => {
  return router({
    tasks: router({
      list: publicProcedure
        .input(z.object({ organizationId: z.string() }))
        .query(async ({ input }) => {
          return db
            .select()
            .from(tasks)
            .where(eq(tasks.organization_id, input.organizationId))
            .all();
        }),
    }),

    // Push change events to renderer
    onChange: publicProcedure.subscription(() => {
      return observable<{ table: string }>((emit) => {
        const handler = (table: string) => emit.next({ table });

        electricEmitter.on("sync", handler);
        return () => electricEmitter.off("sync", handler);
      });
    }),
  });
};
```

**Renderer (subscribe + invalidate):**

```typescript
function useElectricSync() {
  const utils = trpc.useUtils();

  trpc.electric.onChange.useSubscription(undefined, {
    onData: ({ table }) => {
      if (table === "tasks") utils.tasks.list.invalidate();
      if (table === "workspaces") utils.workspaces.list.invalidate();
      if (table === "repositories") utils.repositories.list.invalidate();
    },
  });
}

// Mount once at app root
function App() {
  useElectricSync();
  return <Router />;
}
```

### Optimistic Updates

Use React Query's built-in optimistic update pattern:

```typescript
const utils = trpc.useUtils();

const createWorkspace = trpc.workspaces.create.useMutation({
  onMutate: async (input) => {
    // Cancel in-flight queries
    await utils.workspaces.list.cancel();

    // Snapshot for rollback
    const previous = utils.workspaces.list.getData();

    // Optimistically add to cache
    utils.workspaces.list.setData(undefined, (old) => [
      ...(old ?? []),
      { ...input, id: crypto.randomUUID(), status: "creating..." },
    ]);

    return { previous };
  },

  onError: (_err, _input, context) => {
    // Rollback on failure
    utils.workspaces.list.setData(undefined, context?.previous);
  },

  onSettled: () => {
    // Refetch real data (Electric will have synced by now)
    utils.workspaces.list.invalidate();
  },
});
```

The flow:
1. `onMutate` - show optimistic state immediately
2. API call runs in background
3. `onError` - rollback if it fails
4. `onSettled` - invalidate triggers refetch from SQLite (now has Electric-synced data)

---

## Security

### API Proxy Authorization

The client cannot specify which data to sync. The API proxy:

1. Validates JWT
2. Looks up user's org memberships
3. Sets WHERE clause server-side
4. Forwards to Electric Cloud

```typescript
// Client only sends auth token
const stream = new ShapeStream({
  url: "https://api.superset.sh/electric/tasks",
  headers: { Authorization: `Bearer ${token}` },
});

// Server sets the filter
originUrl.searchParams.set("table", "tasks");
originUrl.searchParams.set("where", `organization_id IN (${userOrgIds})`);
```

### Why not RLS?

Electric uses Postgres logical replication, which bypasses Row-Level Security.
Authorization must happen at the proxy layer.

---

## Key Properties

| Property              | How                                                          |
| --------------------- | ------------------------------------------------------------ |
| **Instant startup**   | Load from SQLite immediately, sync updates in background     |
| **Real-time updates** | Electric pushes changes, tRPC subscription notifies renderer |
| **Offline support**   | SQLite has last-known state, syncs when back online          |
| **Team visibility**   | Workspaces visible to whole team via org filter              |
| **Secure**            | Proxy enforces org access, client can't override             |

---

## Implementation Checklist

### API Proxy
- [ ] Create `/api/electric/[table]/route.ts`
- [ ] Validate JWT on each request
- [ ] Look up user's org memberships
- [ ] Set table + WHERE clause server-side
- [ ] Forward only safe params (offset, handle, cursor)
- [ ] Add Electric credentials (source_id, source_secret)

### Desktop - Main Process
- [ ] Electric sync service (ShapeStream per table)
- [ ] Write to SQLite on sync messages
- [ ] Emit events on changes
- [ ] Resume from stored offset on restart
- [ ] tRPC router with list/get/onChange per table

### Desktop - Renderer
- [ ] React hooks using tRPC queries + subscriptions
- [ ] Invalidate queries on subscription events
- [ ] UI components for tasks, workspaces, repos

### Local Repo Linking
- [ ] Detect git remote URL when opening folder
- [ ] Normalize URL for matching
- [ ] Auto-link or prompt user
- [ ] Store link in local_repos table

### Database
- [ ] Add `workspaces` table to Postgres schema
- [ ] Ensure `repositories` has `url` field for matching
- [ ] Add indexes on `organization_id` columns

---

## Example: Task + Workspace + PR Flow

```
1. Linear webhook creates Task in Postgres
   └── organization_id, repository_id (suggested), title, assignee_id, etc.

2. Electric syncs Task to all team desktops
   └── Each desktop's SQLite now has the task

3. Sarah opens her local clone of the repo
   └── Desktop detects git remote, links to repository

4. Sarah starts working on the task
   └── Desktop creates Workspace in Postgres via API
       ├── task_id → the task
       ├── repository_id → the repo
       ├── owner_id → Sarah
       ├── type: "local"
       ├── device_name: "Sarah's MacBook"
       └── status: "active"

5. Electric syncs Workspace to all team desktops
   └── Mike sees "Sarah is working on SUPER-123"

6. Sarah makes git commits
   └── Desktop updates Workspace.git_status via API
       └── { uncommitted: 0, ahead: 2, behind: 0 }

7. Sarah creates a PR
   └── Desktop updates Workspace via API
       ├── pr_url: "https://github.com/org/repo/pull/42"
       ├── pr_number: 42
       └── pr_status: "open"
   └── Mike sees "Sarah's MacBook - PR #42 open"

8. Sarah goes to lunch
   └── Desktop updates Workspace.last_activity_at
       └── Mike sees "Sarah's MacBook - idle 15m ago"

9. PR gets merged (GitHub webhook)
   └── API updates Workspace.pr_status → "merged"
   └── Linear webhook updates Task.status → "Done"
   └── Electric syncs to all desktops
```

---

## GitHub Integration

### How Repositories Get Created

Repositories are org-level resources, imported via GitHub integration:

```
1. User connects GitHub to their org
   └── OAuth flow → we store access token

2. We fetch repos the user has access to
   └── GitHub API: /user/repos or /orgs/{org}/repos

3. User selects which repos to import
   └── UI: checkboxes, "Import selected"

4. We create `repositories` entries
   └── organization_id, github_id, url, name, default_branch

5. Repos are now available for:
   └── Tasks to reference (repository_id)
   └── Workspaces to reference (repository_id)
   └── Local clones to link against
```

### Matching Local Clones to Org Repos

When a user opens a folder in the desktop app:

```
1. Read git remote
   └── git remote get-url origin
   └── "git@github.com:anthropics/superset.git"

2. Normalize URL
   └── Strip protocol, auth, .git suffix
   └── "github.com/anthropics/superset"

3. Match against repositories in user's orgs
   └── SELECT * FROM repositories
       WHERE normalize(url) = ?
       AND organization_id IN (user's orgs)

4a. Match found
    └── Create local_repos entry: { repository_id, local_path }
    └── Desktop now knows this folder = that org repo

4b. No match
    └── Prompt: "Connect to an org repo?"
    └── Or keep as unlinked local project (repository_id = null)
```

### URL Normalization

```typescript
function normalizeGitUrl(url: string): string {
  return url
    .replace(/^(https?:\/\/|git@)/, '')  // Remove protocol
    .replace(/:/g, '/')                   // git@github.com:org → github.com/org
    .replace(/\.git$/, '')                // Remove .git suffix
    .toLowerCase();
}

// Examples:
// "git@github.com:anthropics/superset.git" → "github.com/anthropics/superset"
// "https://github.com/anthropics/superset" → "github.com/anthropics/superset"
// "https://github.com/anthropics/superset.git" → "github.com/anthropics/superset"
```

### GitHub Webhooks (PR Status Sync)

GitHub webhooks keep PR status in sync across all desktops:

```
1. Set up GitHub App or org webhook
   └── POST https://api.superset.sh/webhooks/github

2. Subscribe to events:
   └── pull_request (opened, closed, merged, converted_to_draft)
   └── pull_request_review (approved, changes_requested)

3. Webhook handler:
   └── Find workspace by pr_url or (repository_id + git_branch)
   └── Update workspace.pr_status in Postgres

4. Electric syncs to all desktops
   └── Team sees "PR #42 merged" in real-time
```

**Webhook handler example:**

```typescript
// apps/api/src/app/webhooks/github/route.ts
export async function POST(req: Request) {
  const event = req.headers.get("x-github-event");
  const payload = await req.json();

  if (event === "pull_request") {
    const { action, pull_request, repository } = payload;

    // Map GitHub action to our status
    const statusMap = {
      opened: "open",
      closed: pull_request.merged ? "merged" : "closed",
      converted_to_draft: "draft",
    };

    // Find and update workspace
    await db
      .update(workspaces)
      .set({ pr_status: statusMap[action] })
      .where(eq(workspaces.pr_url, pull_request.html_url));
  }

  return new Response("ok");
}
```

---

## Multi-Org & Account Switching

### Multiple Organizations

Users can belong to multiple orgs. The proxy handles this automatically:

```typescript
// Proxy sets WHERE clause for ALL user's orgs
originUrl.searchParams.set("where", `organization_id IN (${userOrgIds})`);
```

- All orgs' data syncs to SQLite
- `settings.active_organization_id` controls which org is shown in UI
- Switching orgs is instant (local filter, no re-sync)

### Sign Out / Sign In

Synced data belongs to the *user*, not the device. On account change:

```
Sign Out:
├── Clear synced tables (tasks, workspaces, repositories, organizations)
├── Clear electric_sync_state (reset sync position)
├── Keep local_repos (folder → path mappings are device-specific)
└── Clear active_organization_id, keep device prefs (theme)

Sign In (new user):
├── Fresh sync for new user's org memberships
├── Re-match local_repos against new user's repositories
│   ├── Match found → auto-link (repository_id set)
│   └── No match → stays unlinked (repository_id = null)
└── User can manually link unlinked repos to their orgs
```

### Edge Cases

| Scenario                               | Handling                                                 |
| -------------------------------------- | -------------------------------------------------------- |
| Removed from org while offline         | Next sync removes that org's data                        |
| local_repo points to inaccessible repo | Treat as unlinked, prompt to re-link                     |
| Same folder, different org             | Re-links to new user's matching repo (by git remote URL) |

---

## Local Development (Multi-Worktree Setup)

For developing Superset itself, each worktree needs its own Electric instance pointing at its own Neon branch.

### How It Works

```
Worktree A (feature-login)          Worktree B (fix-bug)
├── Neon branch: feature-login      ├── Neon branch: fix-bug
├── Electric container: electric-   ├── Electric container: electric-
│   feature-login (port 54321)      │   fix-bug (port 54322)
└── .env: ELECTRIC_URL=:54321       └── .env: ELECTRIC_URL=:54322
```

Each worktree is fully isolated - its own database, its own sync.

### Setup Script Changes

Add to `.superset/setup.sh` after Neon branch creation:

```bash
# Start Electric SQL container for this workspace
if command -v docker &> /dev/null && docker info &> /dev/null 2>&1; then
  echo "⚡ Starting Electric SQL..."
  ELECTRIC_CONTAINER="electric-${WORKSPACE_NAME}"

  # Remove existing container if any
  docker rm -f "$ELECTRIC_CONTAINER" 2>/dev/null || true

  # Start Electric pointing at the Neon branch (use unpooled for logical replication)
  docker run -d \
    --name "$ELECTRIC_CONTAINER" \
    -e "DATABASE_URL=${DIRECT_URL}" \
    -e "ELECTRIC_INSECURE=true" \
    -p 0:3000 \
    electricsql/electric:latest > /dev/null

  # Wait for container to be ready
  sleep 2

  # Get assigned port
  ELECTRIC_PORT=$(docker port "$ELECTRIC_CONTAINER" 3000 | cut -d: -f2)

  # Append to .env
  cat >> .env << EOF

# Electric SQL
ELECTRIC_CONTAINER=$ELECTRIC_CONTAINER
ELECTRIC_URL=http://localhost:${ELECTRIC_PORT}
EOF

  success "Electric SQL running on port $ELECTRIC_PORT"
else
  echo "⚠️  Docker not available, skipping Electric SQL"
fi
```

### Teardown Script Changes

Add to `.superset/teardown.sh` before Neon branch deletion:

```bash
# Stop Electric SQL container
ELECTRIC_CONTAINER="${ELECTRIC_CONTAINER:-electric-${WORKSPACE_NAME}}"
if command -v docker &> /dev/null; then
  echo "⚡ Stopping Electric SQL..."
  if docker rm -f "$ELECTRIC_CONTAINER" 2>/dev/null; then
    success "Electric SQL container removed"
  else
    echo "⚠️  Electric container not found or already removed"
  fi
fi
```

### Key Details

| Aspect | Implementation |
|--------|----------------|
| Connection | Uses `DIRECT_URL` (unpooled) - Electric needs direct connection for logical replication |
| Port assignment | `-p 0:3000` assigns random free port (no conflicts between worktrees) |
| Container naming | `electric-${WORKSPACE_NAME}` for easy identification |
| Fallback | Graceful skip if Docker isn't running |
| Teardown order | Stop Electric first, then delete Neon branch |

### Resource Usage

Electric is lightweight (~50-150MB RAM per instance in dev). Running 10 instances on a MacBook is fine. The main constraints are:
- Docker must be running
- Each instance needs a Neon branch (check your Neon plan limits)
- Disk space for Electric's shape cache (minimal for dev data)

---

## Future Considerations

### Cloud Sandboxes
When ready, add to `workspaces` with `type: "cloud"`:
- `sandbox_url` - URL to access the sandbox
- `sandbox_status` - provisioning state

### Agent Runs
New table for AI agent executions:
```sql
agent_runs
├── workspace_id
├── task_id
├── prompt
├── status
├── output
├── diff_url
└── ...
```

### Offline Conflict Resolution
Currently writes fail if offline. Future options:
- Queue writes locally, replay when online
- Optimistic updates with conflict detection
- Use CRDT-based solution (PowerSync, CR-SQLite)
