# Cloud Workspace Implementation Plan

> **Status**: Planning
> **Created**: 2026-01-10
> **Last Updated**: 2026-01-10

---

## Table of Contents

1. [High-Level Overview](#high-level-overview)
   - [Vision](#vision)
   - [Architecture](#architecture)
   - [User Flows](#user-flows)
   - [Key Decisions](#key-decisions)
2. [Low-Level Implementation](#low-level-implementation)
   - [Database Schema](#database-schema)
   - [API Routes](#api-routes)
   - [File Structure](#file-structure)
   - [Implementation Phases](#implementation-phases)
   - [Code Examples](#code-examples)

---

# High-Level Overview

## Vision

Cloud Workspaces enable developers to create and interact with remote development environments that can be accessed from any device. The cloud becomes the source of truth for active development work, while GitHub remains the persistent storage for code.

### Core Capabilities

| Capability | Description |
|------------|-------------|
| **Remote Development** | Full development environment on cloud VMs (Freestyle.dev) |
| **Multi-Device Access** | Access from desktop, web, or mobile simultaneously |
| **Persistent Sessions** | Terminal sessions survive disconnections (tmux) |
| **Seamless Handoff** | Switch between devices without losing work |
| **Optional Local Sync** | Desktop users can sync files locally for IDE editing |

---

## Architecture

```
                         ┌─────────────────────────────────────┐
                         │           GitHub                     │
                         │    (Persistent Code Storage)         │
                         └────────────────┬────────────────────┘
                                          │
                                     git clone
                                     git push
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLOUD WORKSPACE                                │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                       Freestyle VM                                 │  │
│  │                                                                     │  │
│  │   /workspace                    tmux session                        │  │
│  │   ├── .git                      ├── window 0: shell                │  │
│  │   ├── src/                      └── window 1: dev server           │  │
│  │   └── ...                                                           │  │
│  │                                                                     │  │
│  │   SOURCE OF TRUTH for active development                           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                     │
│                               SSH Access                                 │
│                                    │                                     │
└────────────────────────────────────┼─────────────────────────────────────┘
                                     │
            ┌────────────────────────┼────────────────────────┐
            │                        │                        │
       ┌────┴────┐              ┌────┴────┐              ┌────┴────┐
       │ Desktop │              │   Web   │              │  Phone  │
       │         │              │         │              │         │
       │ SSH term│              │ xterm.js│              │ Command │
       │ +local  │              │ via WS  │              │   API   │
       │  sync?  │              │         │              │         │
       └─────────┘              └─────────┘              └─────────┘
```

### Cloud is Source of Truth

- **Files live on cloud VM** - Edits happen directly on the VM
- **GitHub is persistent storage** - Code is pushed/pulled via standard git
- **Clients connect to cloud** - No local file copies required (optional for desktop)

### Client Capabilities

| Client | Terminal | File Edit | Sync |
|--------|----------|-----------|------|
| **Desktop** | SSH (node-pty) | Cloud or Local+Sync | Optional |
| **Web** | xterm.js → WebSocket → SSH | Cloud (vim/nano) | N/A |
| **Phone** | View-only | None | N/A |
| **API** | Send commands | None | N/A |

---

## User Flows

### Flow 1: Create Cloud Workspace from Desktop

```
1. User clicks "New Cloud Workspace" in sidebar
2. Selects repository and branch
3. System creates Freestyle VM, clones from GitHub
4. VM initializes (install deps, start tmux)
5. Desktop connects via SSH, shows terminal
6. User works directly on cloud
```

### Flow 2: Access from Web

```
1. User opens web app, sees cloud workspace in list
2. Clicks workspace to open
3. Web terminal (xterm.js) connects via WebSocket to API
4. API proxies to SSH on Freestyle VM
5. User has full terminal access in browser
```

### Flow 3: Send Command from Phone

```
1. User opens mobile app (or uses API/chat)
2. Sees list of running cloud workspaces
3. Sends command: "npm test"
4. API executes on VM, returns output
5. User sees test results
```

### Flow 4: Handoff (Laptop → Phone → Web)

```
[Laptop]
1. Working on cloud workspace via desktop app
2. Close laptop, walk away
3. Cloud workspace continues running (or pauses after timeout)

[Phone]
4. Open app, see workspace status
5. Send command: /run "git status"
6. Chat with AI: "Fix the failing test"
7. AI edits files on cloud, pushes to GitHub

[Web - later]
8. Open web app on another computer
9. Connect to same cloud workspace
10. See all changes made via phone/AI
11. Continue working
```

### Flow 5: Desktop with Local Sync (for IDE users)

```
1. Create cloud workspace
2. Click "Sync to Local" in desktop app
3. System creates local worktree, clones from GitHub
4. Edit files in VS Code/Cursor locally
5. Commit + push to GitHub
6. Cloud VM auto-pulls (or manual trigger)
7. Terminal on cloud sees updated files
```

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Cloud Provider** | Freestyle.dev | Sub-second VM startup, built-in Git, SSH support |
| **Source of Truth** | Cloud VM | Simplifies multi-device access, no sync conflicts |
| **Persistent Storage** | GitHub | Standard git workflow, PRs, code review |
| **Sync Mechanism** | Git push/pull | No new tools, familiar workflow |
| **Desktop Local Sync** | Optional | For IDE users who prefer local editing |
| **Multi-device Model** | Shared access | Multiple clients can connect simultaneously |
| **Terminal Persistence** | tmux | Sessions survive disconnections |
| **Web Terminal** | xterm.js + WebSocket | Standard, well-supported |

### Rejected Alternatives

| Alternative | Why Rejected |
|-------------|--------------|
| **Mutagen file sync** | Added complexity, not needed with cloud-centric model |
| **CRDT collaboration** | Overkill for file-based editing, complex integration |
| **Freestyle Git** | GitHub already serves as source of truth |
| **Handoff model (one writer)** | Shared access is more flexible |

---

# Low-Level Implementation

## Database Schema

### New Tables in PostgreSQL

**File: `packages/db/src/schema/cloud-workspace.ts`**

```typescript
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  boolean,
  pgEnum
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { organizations } from './auth';
import { repositories } from './schema';
import { users } from './auth';

// Enums
export const cloudWorkspaceStatusEnum = pgEnum('cloud_workspace_status', [
  'provisioning',  // VM being created
  'running',       // VM active
  'paused',        // VM paused (Freestyle ~100ms resume)
  'stopped',       // VM stopped (needs full restart)
  'error'          // Creation/runtime error
]);

export const clientTypeEnum = pgEnum('client_type', [
  'desktop',
  'web',
  'mobile',
  'api'
]);

// Main cloud workspace table
export const cloudWorkspaces = pgTable('cloud_workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  repositoryId: uuid('repository_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),

  // Identity
  name: varchar('name', { length: 255 }).notNull(),
  branch: varchar('branch', { length: 255 }).notNull(),

  // Freestyle resources
  freestyleVmId: varchar('freestyle_vm_id', { length: 255 }),

  // State
  status: cloudWorkspaceStatusEnum('status').default('provisioning').notNull(),
  statusMessage: varchar('status_message', { length: 500 }),
  lastCommitSha: varchar('last_commit_sha', { length: 40 }),

  // Settings
  autoStopMinutes: integer('auto_stop_minutes').default(30),

  // Ownership
  creatorId: uuid('creator_id')
    .notNull()
    .references(() => users.id),

  // Lifecycle
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastActiveAt: timestamp('last_active_at').defaultNow(),
});

// Active client sessions
export const cloudWorkspaceSessions = pgTable('cloud_workspace_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => cloudWorkspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Client info
  clientType: clientTypeEnum('client_type').notNull(),
  clientInfo: varchar('client_info', { length: 255 }), // e.g., "Desktop v1.2.3"

  // Desktop local sync (optional)
  localWorktreePath: varchar('local_worktree_path', { length: 500 }),
  localSyncEnabled: boolean('local_sync_enabled').default(false),

  // Connection tracking
  connectedAt: timestamp('connected_at').defaultNow().notNull(),
  lastHeartbeatAt: timestamp('last_heartbeat_at').defaultNow(),
});

// Relations
export const cloudWorkspacesRelations = relations(cloudWorkspaces, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [cloudWorkspaces.organizationId],
    references: [organizations.id],
  }),
  repository: one(repositories, {
    fields: [cloudWorkspaces.repositoryId],
    references: [repositories.id],
  }),
  creator: one(users, {
    fields: [cloudWorkspaces.creatorId],
    references: [users.id],
  }),
  sessions: many(cloudWorkspaceSessions),
}));

export const cloudWorkspaceSessionsRelations = relations(cloudWorkspaceSessions, ({ one }) => ({
  workspace: one(cloudWorkspaces, {
    fields: [cloudWorkspaceSessions.workspaceId],
    references: [cloudWorkspaces.id],
  }),
  user: one(users, {
    fields: [cloudWorkspaceSessions.userId],
    references: [users.id],
  }),
}));
```

### Desktop Local DB Addition

**File: `packages/local-db/src/schema/schema.ts`** (modification)

```typescript
// Add to existing workspaces table
export const workspaces = sqliteTable('workspaces', {
  // ... existing fields ...

  // NEW: Link to cloud workspace
  cloudWorkspaceId: text('cloud_workspace_id'),  // UUID from cloud DB
  cloudSyncEnabled: integer('cloud_sync_enabled', { mode: 'boolean' }).default(false),
  cloudLastSyncedAt: integer('cloud_last_synced_at', { mode: 'timestamp' }),
});
```

---

## API Routes

### tRPC Router Structure

**File: `packages/trpc/src/router/cloud-workspace/cloud-workspace.ts`**

```typescript
import { router } from '../../trpc';
import { lifecycleProcedures } from './procedures/lifecycle';
import { queryProcedures } from './procedures/query';
import { sessionProcedures } from './procedures/session';
import { terminalProcedures } from './procedures/terminal';
import { commandProcedures } from './procedures/command';

export const cloudWorkspaceRouter = router({
  // Lifecycle: create, pause, resume, stop, delete
  ...lifecycleProcedures,

  // Queries: get, list, getByRepo
  ...queryProcedures,

  // Sessions: join, leave, heartbeat, getSessions
  ...sessionProcedures,

  // Terminal: getSSHCredentials, createTerminalWindow
  ...terminalProcedures,

  // Commands: exec (for mobile/API)
  ...commandProcedures,
});
```

### Procedure Signatures

```typescript
// Lifecycle
create: { organizationId, repositoryId, branch, name? } → CloudWorkspace
pause: { workspaceId } → void
resume: { workspaceId } → void
stop: { workspaceId } → void
delete: { workspaceId } → void

// Queries
get: { workspaceId } → CloudWorkspace + sessions
list: { organizationId, repositoryId? } → CloudWorkspace[]
getActive: { organizationId } → CloudWorkspace[]

// Sessions
join: { workspaceId, clientType, localWorktreePath? } → { sessionId, sshCredentials }
leave: { sessionId } → void
heartbeat: { sessionId } → void
getSessions: { workspaceId } → Session[]

// Terminal
getSSHCredentials: { workspaceId } → { host, token, connectionString }
createTerminalWindow: { workspaceId, name } → { windowId }

// Commands
exec: { workspaceId, command } → { stdout, stderr, exitCode }
```

### WebSocket Terminal Endpoint

**File: `apps/api/src/app/api/cloud-workspace/terminal/route.ts`**

```typescript
// WebSocket upgrade handler
// Authenticates user, gets SSH credentials, proxies xterm.js ↔ SSH

import { auth } from '@superset/auth';
import { freestyleService } from '@superset/trpc/lib/freestyle';

export async function GET(request: Request) {
  // 1. Authenticate user
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  // 2. Get workspace ID from query params
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get('workspaceId');

  // 3. Get SSH credentials from Freestyle
  const workspace = await db.query.cloudWorkspaces.findFirst({
    where: eq(cloudWorkspaces.id, workspaceId),
  });

  const sshCredentials = await freestyleService.getSSHCredentials(
    workspace.freestyleVmId
  );

  // 4. Upgrade to WebSocket, proxy to SSH
  // (Implementation using ws + ssh2)
}
```

---

## File Structure

```
packages/
├── db/src/schema/
│   ├── cloud-workspace.ts          # NEW: Cloud workspace tables
│   ├── index.ts                    # Export new schema
│   └── relations.ts                # Add relations
│
├── trpc/src/
│   ├── router/
│   │   ├── cloud-workspace/        # NEW: Cloud workspace router
│   │   │   ├── cloud-workspace.ts  # Router composition
│   │   │   └── procedures/
│   │   │       ├── lifecycle.ts    # create, pause, resume, stop, delete
│   │   │       ├── query.ts        # get, list
│   │   │       ├── session.ts      # join, leave, heartbeat
│   │   │       ├── terminal.ts     # SSH credentials
│   │   │       └── command.ts      # exec
│   │   └── index.ts                # Export router
│   │
│   ├── lib/
│   │   └── freestyle/              # NEW: Freestyle SDK wrapper
│   │       ├── client.ts           # API client
│   │       └── types.ts            # Type definitions
│   │
│   └── root.ts                     # Add cloudWorkspace router
│
├── local-db/src/schema/
│   └── schema.ts                   # Add cloudWorkspaceId to workspaces
│
apps/
├── api/src/app/api/
│   └── cloud-workspace/            # NEW: REST/WebSocket endpoints
│       ├── terminal/route.ts       # WebSocket terminal proxy
│       └── command/route.ts        # REST command execution
│
├── web/src/
│   ├── components/
│   │   └── CloudTerminal/          # NEW: xterm.js terminal
│   │       ├── CloudTerminal.tsx
│   │       ├── useCloudTerminal.ts
│   │       └── index.ts
│   │
│   └── app/(dashboard)/
│       └── workspace/
│           └── [id]/               # NEW: Cloud workspace page
│               ├── page.tsx
│               └── components/
│
└── desktop/src/
    ├── main/lib/
    │   ├── ssh-terminal.ts         # NEW: SSH terminal spawner
    │   └── cloud-sync.ts           # NEW: Git sync to local
    │
    ├── shared/
    │   └── ipc-channels.ts         # Add cloud workspace channels
    │
    ├── lib/trpc/routers/workspaces/procedures/
    │   └── cloud.ts                # NEW: Cloud workspace procedures
    │
    └── renderer/screens/main/components/
        ├── WorkspaceSidebar/       # UPDATE: Show cloud workspaces
        ├── NewCloudWorkspace/      # NEW: Creation dialog
        └── CloudWorkspaceView/     # NEW: Cloud workspace terminal view
```

---

## Implementation Phases

### Phase 1: Foundation

**Goal:** API can create and manage cloud workspaces

| # | Task | Files |
|---|------|-------|
| 1.1 | Create database schema | `packages/db/src/schema/cloud-workspace.ts` |
| 1.2 | Add Freestyle API key to env | `.env`, `apps/api/.env` |
| 1.3 | Create Freestyle client wrapper | `packages/trpc/src/lib/freestyle/client.ts` |
| 1.4 | Implement lifecycle procedures | `packages/trpc/.../procedures/lifecycle.ts` |
| 1.5 | Implement query procedures | `packages/trpc/.../procedures/query.ts` |
| 1.6 | Add router to root | `packages/trpc/src/root.ts` |
| 1.7 | Run migration | `bun run db:push` |
| 1.8 | Manual testing via tRPC playground | - |

**Verification:** Can create cloud workspace via API, VM starts on Freestyle

---

### Phase 2: Web Terminal

**Goal:** Web app can connect to cloud workspace terminal

| # | Task | Files |
|---|------|-------|
| 2.1 | Implement session procedures | `packages/trpc/.../procedures/session.ts` |
| 2.2 | Create WebSocket terminal endpoint | `apps/api/.../terminal/route.ts` |
| 2.3 | Create CloudTerminal component | `apps/web/src/components/CloudTerminal/` |
| 2.4 | Create workspace page | `apps/web/src/app/(dashboard)/workspace/[id]/` |
| 2.5 | Add workspace list to dashboard | `apps/web/src/app/(dashboard)/` |

**Verification:** Can open cloud workspace in browser, type commands in terminal

---

### Phase 3: Desktop Integration

**Goal:** Desktop app shows and connects to cloud workspaces

| # | Task | Files |
|---|------|-------|
| 3.1 | Add Electric SQL sync for cloudWorkspaces | Config files |
| 3.2 | Add cloudWorkspaceId to local schema | `packages/local-db/src/schema/schema.ts` |
| 3.3 | Create SSH terminal spawner | `apps/desktop/src/main/lib/ssh-terminal.ts` |
| 3.4 | Add IPC channels for cloud workspaces | `apps/desktop/src/shared/ipc-channels.ts` |
| 3.5 | Update WorkspaceSidebar to show cloud | `apps/desktop/.../WorkspaceSidebar/` |
| 3.6 | Create cloud workspace terminal handler | Desktop terminal logic |

**Verification:** Cloud workspaces appear in sidebar, can connect via SSH

---

### Phase 4: Desktop Local Sync

**Goal:** Desktop can sync cloud workspace to local for IDE editing

| # | Task | Files |
|---|------|-------|
| 4.1 | Create git sync utility | `apps/desktop/src/main/lib/cloud-sync.ts` |
| 4.2 | Add "Sync to Local" dialog | UI components |
| 4.3 | Implement sync procedures | `apps/desktop/.../procedures/sync.ts` |
| 4.4 | Add GitHub webhook for push notifications | `apps/api/.../webhook/` |
| 4.5 | Auto-pull on cloud when GitHub pushed | Freestyle webhook trigger |

**Verification:** Can edit locally in VS Code, push to GitHub, cloud VM sees changes

---

### Phase 5: Command API

**Goal:** Commands can be sent via API (for mobile, integrations)

| # | Task | Files |
|---|------|-------|
| 5.1 | Implement command procedure | `packages/trpc/.../procedures/command.ts` |
| 5.2 | Create REST endpoint | `apps/api/.../command/route.ts` |
| 5.3 | Add authentication for API access | Auth middleware |

**Verification:** Can POST command, receive output in response

---

### Phase 6: Session Management

**Goal:** Multi-device presence, auto-pause, robust reconnection

| # | Task | Files |
|---|------|-------|
| 6.1 | Implement heartbeat system | Background job |
| 6.2 | Add presence subscription | tRPC subscription |
| 6.3 | Implement auto-pause on inactivity | Cron job |
| 6.4 | Handle tmux session reconnection | Terminal logic |
| 6.5 | Add presence UI indicators | UI components |

**Verification:** Multiple devices see each other, workspace auto-pauses, sessions survive disconnects

---

## Code Examples

### Creating a Cloud Workspace

```typescript
// From web or desktop
const workspace = await trpc.cloudWorkspace.create.mutate({
  organizationId: org.id,
  repositoryId: repo.id,
  branch: 'feature-payments',
  name: 'Feature Payments',
});

// workspace.status will be 'provisioning' initially
// Poll or subscribe for status updates
```

### Connecting Terminal (Desktop)

```typescript
// Desktop: spawn SSH process
import { spawn } from 'node-pty';

async function connectCloudTerminal(workspaceId: string) {
  const { connectionString } = await trpc.cloudWorkspace.getSSHCredentials.query({
    workspaceId,
  });

  // connectionString = "vmId:token@vm-ssh.freestyle.sh"
  const pty = spawn('ssh', ['-t', connectionString], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
  });

  return pty;
}
```

### Connecting Terminal (Web)

```typescript
// Web: xterm.js + WebSocket
import { Terminal } from 'xterm';
import { AttachAddon } from 'xterm-addon-attach';

function CloudTerminal({ workspaceId }: { workspaceId: string }) {
  const termRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ws = new WebSocket(
      `wss://api.superset.sh/api/cloud-workspace/terminal?workspaceId=${workspaceId}`
    );

    const term = new Terminal();
    const attachAddon = new AttachAddon(ws);

    term.loadAddon(attachAddon);
    term.open(termRef.current!);

    return () => {
      ws.close();
      term.dispose();
    };
  }, [workspaceId]);

  return <div ref={termRef} />;
}
```

### Executing Command (Mobile/API)

```typescript
// POST /api/cloud-workspace/command
const response = await fetch('/api/cloud-workspace/command', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({
    workspaceId: 'uuid',
    command: 'npm test',
  }),
});

const { stdout, stderr, exitCode } = await response.json();
```

### Freestyle Client Wrapper

```typescript
// packages/trpc/src/lib/freestyle/client.ts
import Freestyle from 'freestyle-sandboxes';

const freestyle = new Freestyle({
  apiKey: process.env.FREESTYLE_API_KEY,
});

export const freestyleService = {
  async createVM({ repoUrl, branch }: { repoUrl: string; branch: string }) {
    const { vm } = await freestyle.vms.create({
      git: { url: repoUrl, branch },
    });

    // Initialize tmux for persistent sessions
    await vm.exec('tmux new-session -d -s main');

    return { vmId: vm.id };
  },

  async pauseVM(vmId: string) {
    await freestyle.vms.pause(vmId);
  },

  async resumeVM(vmId: string) {
    await freestyle.vms.resume(vmId);
  },

  async getSSHCredentials(vmId: string) {
    const { identity } = await freestyle.identities.create();
    await identity.permissions.vms.grant({ vmId, permission: 'ssh' });
    const { token } = await identity.tokens.create();

    return {
      host: 'vm-ssh.freestyle.sh',
      token,
      connectionString: `${vmId}:${token}@vm-ssh.freestyle.sh`,
    };
  },

  async exec(vmId: string, command: string) {
    const { vm } = await freestyle.vms.get(vmId);
    return vm.exec(command);
  },
};
```

---

## Dependencies to Add

```bash
# For API (WebSocket terminal proxy)
bun add ws ssh2 @types/ws @types/ssh2

# For web (terminal)
bun add xterm xterm-addon-fit xterm-addon-attach

# For Freestyle SDK
bun add freestyle-sandboxes
```

---

## Environment Variables

```bash
# .env (root)
FREESTYLE_API_KEY=fs_...

# apps/api/.env
FREESTYLE_API_KEY=fs_...
```

---

## Open Questions for Implementation

1. **VM Templates**: Should we create Freestyle VM templates for common setups (Node, Python, etc.)?
2. **Cost Tracking**: How to track/display VM usage per workspace?
3. **Limits**: Max concurrent cloud workspaces per org?
4. **Cleanup**: How long to keep stopped VMs before deleting?
5. **Secrets**: How to handle environment variables/secrets in cloud workspaces?

---

## References

- [Freestyle.dev Documentation](https://docs.freestyle.sh/)
- [Freestyle SDK](https://docs.freestyle.sh/getting-started)
- [xterm.js Documentation](https://xtermjs.org/)
- [node-pty](https://github.com/microsoft/node-pty)
