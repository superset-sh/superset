# Cloud Workspace Plan

> **Status**: Ready for Implementation
> **Last Updated**: 2026-01-13
> **Implementation Details**: See [CLOUD_WORKSPACE_IMPLEMENTATION.md](./CLOUD_WORKSPACE_IMPLEMENTATION.md)

---

## Vision

Cloud Workspaces enable developers to work on remote VMs that can be accessed from any device. The cloud VM is the source of truth for active development, while GitHub remains persistent storage.

**V1 Goal**: Desktop app can create and connect to cloud-enabled worktrees.

---

## Architecture

```
                         ┌─────────────────────────────────────┐
                         │           GitHub                     │
                         │    (Persistent Code Storage)         │
                         └────────────────┬────────────────────┘
                                          │
                                     git push/pull
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLOUD WORKSPACE                                │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     Cloud VM (via Provider)                        │  │
│  │   /workspace/.git, src/, ...                                      │  │
│  │   SOURCE OF TRUTH for active development                          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                     │
│                               SSH Access                                 │
│                                    │                                     │
└────────────────────────────────────┼─────────────────────────────────────┘
                                     │
                                     ▼
                               ┌──────────┐
                               │ Desktop  │
                               │ SSH via  │
                               │ node-pty │
                               │ + local  │
                               │ sync     │
                               └──────────┘
```

### Cloud Provider Abstraction

The system uses an abstraction layer so providers can be swapped:

```
CloudWorkspace API
       │
       ▼
CloudProviderInterface
  - createVM(repo, branch) → vmId
  - pauseVM(vmId)
  - resumeVM(vmId)
  - stopVM(vmId)
  - deleteVM(vmId)
  - getSSHCredentials(vmId) → { host, token }
       │
       ├── FreestyleProvider (initial)
       ├── FlyProvider (future)
       └── ...
```

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Cloud Provider** | Freestyle.dev (initial) | Sub-second VM startup, SSH support |
| **Provider Abstraction** | Yes | Swap providers without changing app code |
| **Source of Truth** | Cloud VM | Simplifies multi-device, no sync conflicts |
| **Persistent Storage** | GitHub | Standard git workflow |
| **Local Sync** | Git push/pull | Familiar workflow, no new tools |
| **Real-time Updates** | Electric SQL | Already implemented in codebase |
| **Access Control** | Org members | Any org member can access org workspaces |

---

## Data Model

### CloudWorkspace Table

| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| organizationId | uuid | FK to organization |
| repositoryId | uuid | FK to repository |
| name | string | User-defined name |
| branch | string | Git branch |
| providerType | enum | 'freestyle', 'fly', etc. |
| providerVmId | string | Provider's VM identifier |
| status | enum | provisioning, running, paused, stopped, error |
| statusMessage | string | Error details if status=error |
| creatorId | uuid | FK to user who created |
| autoStopMinutes | int | Idle timeout (default 30) |
| lastActiveAt | timestamp | Last activity |

### CloudWorkspaceSession Table

Tracks connected clients for presence and activity.

| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| workspaceId | uuid | FK to workspace |
| userId | uuid | FK to user |
| clientType | enum | 'desktop', 'web' |
| connectedAt | timestamp | When connected |
| lastHeartbeatAt | timestamp | Last heartbeat |

### Desktop Local DB

Add to existing `workspaces` table:
- `cloudWorkspaceId` - Link to cloud workspace (null if local-only)
- `cloudSyncEnabled` - Whether syncing to cloud

---

## State Machine

```
                    create()
                        │
                        ▼
               ┌──────────────┐
               │ PROVISIONING │──────────┐
               └──────┬───────┘          │ failure
                      │ success          ▼
                      ▼            ┌──────────┐
               ┌──────────┐       │  ERROR   │
        ┌─────▶│ RUNNING  │       └────┬─────┘
        │      └────┬─────┘            │ retry()
        │           │ pause()/timeout  │
        │           ▼                  │
        │      ┌──────────┐            │
        └──────│  PAUSED  │◀───────────┘
  resume()/    └────┬─────┘
  connect()         │ stop()
                    ▼
               ┌──────────┐
               │ STOPPED  │
               └────┬─────┘
                    │ delete()
                    ▼
                (removed)
```

**Key behaviors:**
- Auto-resume on connect to paused workspace
- Auto-pause after 30min idle
- Stopped workspaces persist until deleted

---

## V1: Desktop Integration

### User Flows

**Flow 1: Convert Existing Worktree to Cloud**
1. User right-clicks existing worktree in sidebar
2. Selects "Enable Cloud Workspace"
3. System creates cloud VM, clones repo/branch
4. Worktree now has cloud terminal available
5. User can work locally (IDE) or on cloud (terminal)
6. Git push/pull syncs between local and cloud

**Flow 2: Create New Cloud Worktree**
1. User clicks "New Workspace" → "Cloud Workspace"
2. Selects repository and branch
3. System creates cloud VM and local worktree
4. Both are linked and synced via git

**Flow 3: Connect to Cloud Terminal**
1. User opens cloud-enabled worktree
2. Terminal pane shows cloud terminal (SSH)
3. Commands run on cloud VM
4. File edits happen locally, push to sync

### Implementation Tasks

**Database**
- Add `cloudWorkspaces` and `cloudWorkspaceSessions` tables
- Add `cloudWorkspaceId` to local workspaces table
- Set up Electric SQL sync for cloud workspace tables

**Cloud Provider**
- Create `CloudProviderInterface`
- Implement `FreestyleProvider`
- Handle VM lifecycle (create, pause, resume, stop, delete)
- Handle SSH credential generation

**tRPC Procedures**
- `cloudWorkspace.create` - Create cloud workspace
- `cloudWorkspace.get` / `list` - Query workspaces
- `cloudWorkspace.pause` / `resume` / `stop` / `delete` - Lifecycle
- `cloudWorkspace.getSSHCredentials` - Get connection info
- `cloudWorkspace.join` / `leave` / `heartbeat` - Session tracking

**Desktop App**
- Use existing tRPC client for cloud workspace operations
- SSH terminal spawner using node-pty
- UI for "Enable Cloud" on existing worktree
- UI for "New Cloud Workspace"
- Cloud terminal view in workspace

---

## Local Sync Workflow

For users who want to edit locally with their IDE:

```
Local (IDE)          GitHub             Cloud VM
    │                   │                   │
    │ ── git push ───▶  │                   │
    │                   │ ◀── auto-pull ─── │ (webhook or poll)
    │                   │                   │
    │ ◀── git pull ───  │ ── git push ───▶  │
```

- Local edits: commit, push to GitHub
- Cloud VM: auto-pulls on webhook or manual trigger
- Cloud edits: commit, push to GitHub
- Local: pull to get cloud changes

---

## Future Work

Items deferred from V1:

- **Web Terminal** - xterm.js via WebSocket proxy to SSH
- **Command API** - REST endpoint for running commands (mobile, integrations)
- **Advanced Session Management** - Presence UI, multi-user indicators
- **VM Templates** - Pre-configured environments (Node, Python, etc.)
- **Cost Tracking** - Usage metrics per workspace
- **Workspace Limits** - Max concurrent per org

---

## Resolved Decisions

| Question | Decision |
|----------|----------|
| What triggers auto-pull on cloud VM? | **Polling** - VM polls GitHub periodically (webhooks deferred to V2) |
| Default VM specs? | Use Freestyle defaults (configurable via `idleTimeoutSeconds`) |

## Open Questions

1. How to handle environment variables/secrets in cloud workspaces? (Deferred to V2)
