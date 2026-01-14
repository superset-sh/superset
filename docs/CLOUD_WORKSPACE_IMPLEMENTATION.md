# Cloud Workspace Implementation Plan

> **Status**: Ready for Implementation
> **Last Updated**: 2026-01-13

## Overview

Enable developers to work on remote VMs accessible from any device. Cloud VM is source of truth, GitHub is persistent storage. V1 Goal: Desktop app can create and connect to cloud-enabled worktrees.

### Key Decisions
- **Provider**: Freestyle.dev (real implementation)
- **Git Sync**: Polling-based (cloud VM polls GitHub periodically)
- **Local Sync**: Electric SQL for real-time cloud workspace visibility in desktop

### Environment Variables Required
```
FREESTYLE_API_KEY=your_api_key
```

---

## Phase 1: Database Schema

### 1.1 Add enums to `packages/db/src/schema/enums.ts`

```typescript
// Cloud workspace status
export const cloudWorkspaceStatusValues = ["provisioning", "running", "paused", "stopped", "error"] as const;
export const cloudWorkspaceStatusEnum = z.enum(cloudWorkspaceStatusValues);
export type CloudWorkspaceStatus = z.infer<typeof cloudWorkspaceStatusEnum>;

// Cloud provider type
export const cloudProviderTypeValues = ["freestyle", "fly"] as const;
export const cloudProviderTypeEnum = z.enum(cloudProviderTypeValues);
export type CloudProviderType = z.infer<typeof cloudProviderTypeEnum>;

// Client type for sessions
export const cloudClientTypeValues = ["desktop", "web"] as const;
export const cloudClientTypeEnum = z.enum(cloudClientTypeValues);
export type CloudClientType = z.infer<typeof cloudClientTypeEnum>;
```

### 1.2 Create `packages/db/src/schema/cloud-workspace.ts`

**CloudWorkspaces table:**
- `id` (uuid, pk)
- `organizationId` (uuid, fk → organizations, cascade)
- `repositoryId` (uuid, fk → repositories, cascade)
- `name` (text)
- `branch` (text)
- `providerType` (enum: freestyle, fly)
- `providerVmId` (text, nullable)
- `status` (enum: provisioning, running, paused, stopped, error)
- `statusMessage` (text, nullable)
- `creatorId` (uuid, fk → users, cascade)
- `autoStopMinutes` (int, default 30)
- `lastActiveAt` (timestamp)
- `createdAt`, `updatedAt` (timestamps)

**CloudWorkspaceSessions table:**
- `id` (uuid, pk)
- `workspaceId` (uuid, fk → cloudWorkspaces, cascade)
- `userId` (uuid, fk → users, cascade)
- `clientType` (enum: desktop, web)
- `connectedAt`, `lastHeartbeatAt` (timestamps)

### 1.3 Update relations in `packages/db/src/schema/relations.ts`

Add relations for cloudWorkspaces and cloudWorkspaceSessions.

### 1.4 Export from `packages/db/src/schema/index.ts`

### Files to modify:
- `packages/db/src/schema/enums.ts`
- `packages/db/src/schema/cloud-workspace.ts` (new)
- `packages/db/src/schema/relations.ts`
- `packages/db/src/schema/index.ts`

---

## Phase 2: Cloud Provider Interface + Freestyle

### 2.1 Create `packages/trpc/src/lib/cloud-providers/types.ts`

```typescript
export interface SSHCredentials {
  host: string;
  port: number;
  username: string;
  privateKey?: string;
  token?: string;
}

export interface CreateVMParams {
  repoUrl: string;
  branch: string;
  workspaceName: string;
  workdir?: string;
  idleTimeoutSeconds?: number;
}

export interface VMStatus {
  status: CloudWorkspaceStatus;
  message?: string;
}

export interface CloudProviderInterface {
  readonly type: CloudProviderType;
  createVM(params: CreateVMParams): Promise<{ vmId: string; status: CloudWorkspaceStatus }>;
  pauseVM(vmId: string): Promise<VMStatus>;
  resumeVM(vmId: string): Promise<VMStatus>;
  stopVM(vmId: string): Promise<VMStatus>;
  deleteVM(vmId: string): Promise<void>;
  getVMStatus(vmId: string): Promise<VMStatus>;
  getSSHCredentials(vmId: string): Promise<SSHCredentials>;
}
```

### 2.2 Create `packages/trpc/src/lib/cloud-providers/freestyle-provider.ts`

Freestyle.dev SDK integration using their v2 API:

```typescript
import Freestyle from "freestyle-sh";

const freestyle = new Freestyle(); // Uses FREESTYLE_API_KEY env var

export class FreestyleProvider implements CloudProviderInterface {
  readonly type = "freestyle" as const;

  async createVM(params: CreateVMParams) {
    // Freestyle v2 API: create VM with git repo cloning
    const { vmId, vm } = await freestyle.vms.create({
      gitRepos: [{ repo: params.repoUrl, path: "/workspace", branch: params.branch }],
      workdir: "/workspace",
      idleTimeoutSeconds: params.idleTimeoutSeconds ?? 1800, // 30 min default
      with: {
        js: new VmNodeJs(), // Enable Node.js runtime
      },
    });
    return { vmId, status: "running" as const };
  }

  async pauseVM(vmId: string) {
    // Freestyle: suspend_vm
    await freestyle.vms.suspend({ vmId });
    return { status: "paused" as const };
  }

  async resumeVM(vmId: string) {
    // Freestyle: start_vm (resumes from suspended)
    await freestyle.vms.start({ vmId });
    return { status: "running" as const };
  }

  async stopVM(vmId: string) {
    // Freestyle: stop_vm (graceful shutdown)
    await freestyle.vms.stop({ vmId });
    return { status: "stopped" as const };
  }

  async deleteVM(vmId: string) {
    // Freestyle: delete_vm
    await freestyle.vms.delete({ vmId });
  }

  async getVMStatus(vmId: string) {
    // Freestyle: get_vm
    const vm = await freestyle.vms.get({ vmId });
    return {
      status: this.mapFreestyleStatus(vm.status),
      message: vm.statusMessage,
    };
  }

  async getSSHCredentials(vmId: string) {
    // Freestyle terminal/SSH access
    const terminals = await freestyle.vms.listTerminals({ vmId });
    // Return SSH connection info from Freestyle
    return {
      host: terminals[0]?.host ?? "",
      port: terminals[0]?.port ?? 22,
      username: "dev",
      token: terminals[0]?.accessToken,
    };
  }

  private mapFreestyleStatus(status: string): CloudWorkspaceStatus {
    const statusMap: Record<string, CloudWorkspaceStatus> = {
      "running": "running",
      "suspended": "paused",
      "stopped": "stopped",
      "starting": "provisioning",
      "error": "error",
    };
    return statusMap[status] ?? "error";
  }
}
```

**Key Freestyle v2 SDK methods used:**
- `freestyle.vms.create()` - Create VM with git repo cloning
- `freestyle.vms.suspend()` - Pause VM (preserves state)
- `freestyle.vms.start()` - Resume suspended VM
- `freestyle.vms.stop()` - Graceful shutdown
- `freestyle.vms.delete()` - Delete VM permanently
- `freestyle.vms.get()` - Get VM status
- `freestyle.vms.listTerminals()` - Get SSH/terminal access info

### 2.3 Create `packages/trpc/src/lib/cloud-providers/index.ts`

Factory function to get provider by type.

```typescript
import type { CloudProviderType } from "@superset/db/enums";
import { FreestyleProvider } from "./freestyle-provider";
import type { CloudProviderInterface } from "./types";

export function getCloudProvider(type: CloudProviderType): CloudProviderInterface {
  switch (type) {
    case "freestyle":
      return new FreestyleProvider();
    case "fly":
      throw new Error("Fly provider not yet implemented");
    default:
      throw new Error(`Unknown provider: ${type}`);
  }
}

export * from "./types";
export { FreestyleProvider } from "./freestyle-provider";
```

### 2.4 Install Freestyle SDK

```bash
bun add freestyle-sh
```

### Files to create:
- `packages/trpc/src/lib/cloud-providers/types.ts`
- `packages/trpc/src/lib/cloud-providers/freestyle-provider.ts`
- `packages/trpc/src/lib/cloud-providers/index.ts`

---

## Phase 3: tRPC Router

### 3.1 Create `packages/trpc/src/router/cloud-workspace/schema.ts`

Zod schemas for:
- `createCloudWorkspaceSchema` (organizationId, repositoryId, name, branch, providerType, autoStopMinutes)
- `cloudWorkspaceIdSchema` (workspaceId)
- `joinSessionSchema` (workspaceId, clientType)
- `heartbeatSchema` (sessionId)

### 3.2 Create `packages/trpc/src/router/cloud-workspace/cloud-workspace.ts`

**Query procedures:**
- `list` - List cloud workspaces for org
- `get` - Get single workspace with relations
- `getSSHCredentials` - Get SSH connection info

**Mutation procedures:**
- `create` - Create workspace, start async provisioning
- `pause` / `resume` / `stop` / `delete` - Lifecycle operations
- `join` / `leave` / `heartbeat` - Session management

### 3.3 Register in `packages/trpc/src/root.ts`

Add `cloudWorkspace: cloudWorkspaceRouter` to appRouter.

### Files to create/modify:
- `packages/trpc/src/router/cloud-workspace/schema.ts` (new)
- `packages/trpc/src/router/cloud-workspace/cloud-workspace.ts` (new)
- `packages/trpc/src/router/cloud-workspace/index.ts` (new)
- `packages/trpc/src/root.ts` (add router)

---

## Phase 4: Local DB + Electric SQL Sync

### 4.1 Add synced table to `packages/local-db/src/schema/schema.ts`

Add `cloudWorkspaces` table (synced via Electric SQL):
```typescript
export const cloudWorkspaces = sqliteTable("cloud_workspaces", {
  id: text("id").primaryKey(),
  organization_id: text("organization_id").notNull(),
  repository_id: text("repository_id").notNull(),
  name: text("name").notNull(),
  branch: text("branch").notNull(),
  provider_type: text("provider_type").notNull(),
  provider_vm_id: text("provider_vm_id"),
  status: text("status").notNull(),
  status_message: text("status_message"),
  creator_id: text("creator_id").notNull(),
  auto_stop_minutes: integer("auto_stop_minutes").notNull(),
  last_active_at: text("last_active_at"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});
```

### 4.2 Add cloud link to workspaces table

Add fields to existing `workspaces` table:
- `cloudWorkspaceId` (text, nullable) - Link to cloud workspace
- `cloudSyncEnabled` (boolean, default false)

### 4.3 Create migration

`packages/local-db/drizzle/0008_add_cloud_workspace.sql`:
```sql
-- Add cloud_workspaces synced table
CREATE TABLE cloud_workspaces (...);

-- Add cloud fields to workspaces
ALTER TABLE workspaces ADD COLUMN cloud_workspace_id TEXT;
ALTER TABLE workspaces ADD COLUMN cloud_sync_enabled INTEGER DEFAULT 0;
```

### 4.4 Configure Electric SQL sync

Add cloud_workspaces to Electric SQL shape configuration.

### Files to modify:
- `packages/local-db/src/schema/schema.ts`
- `packages/local-db/drizzle/0008_add_cloud_workspace.sql` (new)
- Electric SQL config (location TBD based on existing setup)

---

## Phase 5: Desktop SSH Terminal

### 5.1 Create `apps/desktop/src/main/lib/ssh-terminal/ssh-manager.ts`

SSH session manager using node-pty:
- `createSSHSession(paneId, credentials)` - Spawn SSH process
- `write(paneId, data)` - Send input
- `resize(paneId, cols, rows)` - Resize terminal
- `kill(paneId)` - Terminate session
- Events: `data:${paneId}`, `exit:${paneId}`

### 5.2 Create `apps/desktop/src/lib/trpc/routers/cloud-terminal/index.ts`

tRPC router for cloud terminal:
- `createSSHSession` mutation
- `write` mutation
- `resize` mutation
- `kill` mutation
- `stream` subscription (observable pattern)

### 5.3 Register in desktop tRPC

Add cloud-terminal router to desktop app router.

### Files to create:
- `apps/desktop/src/main/lib/ssh-terminal/ssh-manager.ts`
- `apps/desktop/src/main/lib/ssh-terminal/index.ts`
- `apps/desktop/src/lib/trpc/routers/cloud-terminal/index.ts`

---

## Phase 6: Desktop UI Integration

### 6.1 Cloud workspace queries

Add hooks to query cloud workspaces from local DB:
- `useCloudWorkspaces(organizationId)`
- `useCloudWorkspace(workspaceId)`

### 6.2 "Enable Cloud" action

Add context menu action on existing worktrees:
1. Right-click worktree → "Enable Cloud Workspace"
2. Call `cloudWorkspace.create` via API client
3. Update local workspace with `cloudWorkspaceId`

### 6.3 "New Cloud Workspace" flow

Extend NewWorkspaceModal:
1. Add "Cloud" option to workspace type selector
2. Show cloud-specific options (auto-stop timer)
3. Create both local workspace and cloud workspace

### 6.4 Cloud terminal pane

When workspace has `cloudWorkspaceId`:
1. Terminal pane fetches SSH credentials via API
2. Creates SSH session instead of local PTY
3. Shows cloud indicator in terminal header

### 6.5 Status indicators

- Show cloud workspace status badge (running/paused/stopped)
- Show "Enable Cloud" button for local-only workspaces
- Show connected users count for cloud workspaces

### Files to modify:
- `apps/desktop/src/renderer/components/NewWorkspaceModal/`
- `apps/desktop/src/renderer/components/WorkspaceSidebar/` (context menu)
- `apps/desktop/src/renderer/components/Terminal/` (cloud terminal support)
- `apps/desktop/src/renderer/react-query/` (new hooks)

---

## Implementation Order

1. **Phase 1**: Database schema (foundation)
2. **Phase 2**: Cloud provider interface + Freestyle
3. **Phase 3**: tRPC router (API layer)
4. **Phase 4**: Local DB + Electric SQL sync
5. **Phase 5**: SSH terminal manager
6. **Phase 6**: Desktop UI integration

---

## Testing Checklist

- [ ] Create cloud workspace from UI
- [ ] View cloud workspace status updates
- [ ] Connect to cloud terminal (SSH)
- [ ] Pause/resume workspace lifecycle
- [ ] Delete cloud workspace
- [ ] Electric SQL syncs cloud workspaces to local DB
- [ ] Session heartbeat keeps workspace active

---

## Deferred to V2

- Web terminal (xterm.js + WebSocket)
- GitHub webhook auto-pull (replacing polling)
- Environment variables/secrets management
- Cost tracking and workspace limits
- Multi-user presence indicators
- Fly.io provider implementation

---

## Sources

- [Freestyle.dev Docs](https://docs.freestyle.sh/)
- [Freestyle VM Documentation](https://docs.freestyle.sh/v2/vms.md)
- [Freestyle SDK Patterns](https://docs.freestyle.sh/v2/sdk-patterns.md)
