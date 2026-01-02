# Remote Workspace Agent

> Full Superset functionality on remote machines via SSH

## Summary

**Goal**: Users can connect to remote machines and use all Superset features (terminals, git, workspaces, change inspection) as if working locally.

**Key Design Principle**: Write operations once, transport is invisible.

```typescript
// Feature code is transport-agnostic
const ops = getOperations(projectId);
await ops.git.status(repoPath);  // Works locally AND remotely
```

**Effort**: ~2-3 weeks total, with Phases 1-2 shippable independently as code quality improvements.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SUPERSET DESKTOP                                  │
│                                                                             │
│   getOperations(projectId)                                                  │
│         │                                                                   │
│         ├── Local project? ──► LocalGitOperations (simple-git)              │
│         │                                                                   │
│         └── Remote project? ──► RpcProxy ──► SSH Tunnel ──┐                 │
│                                                           │                 │
└───────────────────────────────────────────────────────────┼─────────────────┘
                                                            │
                                               SSH (encrypted)
                                                            │
┌───────────────────────────────────────────────────────────┼─────────────────┐
│                         REMOTE MACHINE                    │                 │
│                                                           ▼                 │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    @superset/remote-agent                           │   │
│   │                                                                     │   │
│   │   RpcServer.registerOperations('git', localGitOperations)           │   │
│   │   RpcServer.registerOperations('files', localFileOperations)        │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key insight**: The agent uses the exact same `localGitOperations` as the desktop app. The only difference is the transport layer.

---

## Package Structure

```
packages/
  core/                          # NEW: Shared operations + RPC
    src/
      operations/
        git/
          types.ts               # IGitOperations interface
          local.ts               # LocalGitOperations class
          index.ts
        files/
          types.ts               # IFileOperations interface
          local.ts               # LocalFileOperations class
          index.ts
        workspace/
          types.ts               # IWorkspaceOperations interface
          local.ts               # LocalWorkspaceOperations class
          index.ts
        index.ts
      rpc/
        types.ts                 # RpcMessage, RpcResponse
        proxy.ts                 # createRpcProxy<T>() - auto-generates RPC client
        server.ts                # RpcServer class - auto-registers operations
        index.ts
      index.ts
    package.json

  remote-agent/                  # NEW: Standalone binary for remote machines
    src/
      index.ts                   # TCP server + RPC handler
      terminal-manager.ts        # PTY management for remote terminals
    build.ts                     # Multi-platform build script
    package.json

apps/
  desktop/
    src/main/lib/
      operations/
        provider.ts              # getOperations(projectId) - returns local or remote
        terminal/
          local.ts               # Local PTY (node-pty)
          ssh.ts                 # Remote PTY (SSH channel)
      ssh/
        connection-manager.ts    # SSH lifecycle, reconnection
        rpc-client.ts            # RPC over SSH tunnel
        agent-deployer.ts        # Auto-install agent on remote
```

### Package Dependencies

```
@superset/core
├── simple-git
├── (no electron, no node-pty)
└── Used by: desktop, remote-agent

@superset/remote-agent
├── @superset/core
├── node-pty
└── Standalone binary

apps/desktop
├── @superset/core
├── ssh2
├── node-pty
└── electron
```

---

## Key Abstractions

### 1. Operation Interfaces

```typescript
// packages/core/src/operations/git/types.ts
export interface IGitOperations {
  status(repoPath: string): Promise<GitStatus>;
  diff(repoPath: string, options?: DiffOptions): Promise<string>;
  stage(repoPath: string, files: string[]): Promise<void>;
  unstage(repoPath: string, files: string[]): Promise<void>;
  commit(repoPath: string, message: string): Promise<{ hash: string }>;
  push(repoPath: string, options?: PushOptions): Promise<void>;
  pull(repoPath: string): Promise<void>;
  branches(repoPath: string, options?: BranchOptions): Promise<BranchInfo[]>;
  checkout(repoPath: string, branch: string): Promise<void>;
  createWorktree(params: CreateWorktreeParams): Promise<{ path: string }>;
  removeWorktree(repoPath: string, worktreePath: string): Promise<void>;
}

// packages/core/src/operations/files/types.ts
export interface IFileOperations {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(path: string): Promise<FileInfo[]>;
  stat(path: string): Promise<FileStat>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  remove(path: string, options?: { recursive?: boolean }): Promise<void>;
}

// packages/core/src/operations/workspace/types.ts
export interface IWorkspaceOperations {
  createWorktree(params: CreateWorktreeParams): Promise<WorktreeInfo>;
  removeWorktree(repoPath: string, worktreePath: string): Promise<void>;
  listWorktrees(repoPath: string): Promise<WorktreeInfo[]>;
  getDefaultBranch(repoPath: string): Promise<string>;
}
```

### 2. RPC Proxy (Zero-boilerplate remote calls)

```typescript
// packages/core/src/rpc/proxy.ts
export function createRpcProxy<T extends object>(rpcClient: RpcClient, namespace: string): T {
  return new Proxy({} as T, {
    get(_, method: string) {
      return async (...args: unknown[]) => rpcClient.call(`${namespace}.${method}`, args);
    },
  });
}

// Usage: automatically mirrors the interface
const git = createRpcProxy<IGitOperations>(rpcClient, 'git');
await git.status('/path');  // → rpcClient.call('git.status', ['/path'])
```

### 3. RPC Server (Zero-boilerplate registration)

```typescript
// packages/core/src/rpc/server.ts
export class RpcServer {
  registerOperations<T extends object>(namespace: string, operations: T): void {
    // Auto-registers all methods from the operations object
  }
  
  async handle(message: string): Promise<string> {
    // Parses JSON-RPC, invokes handler, returns response
  }
}

// Usage in agent:
rpcServer.registerOperations('git', localGitOperations);
rpcServer.registerOperations('files', localFileOperations);
```

### 4. Operations Provider

```typescript
// apps/desktop/src/main/lib/operations/provider.ts
export function getOperations(projectId: string): Operations {
  const project = getProject(projectId);
  
  if (!project.remoteConfig) {
    return { git: localGitOperations, files: localFileOperations, ... };
  }
  
  const rpcClient = sshConnectionManager.getRpcClient(projectId);
  return {
    git: createRpcProxy<IGitOperations>(rpcClient, 'git'),
    files: createRpcProxy<IFileOperations>(rpcClient, 'files'),
    ...
  };
}
```

---

## Developer Workflow

When adding new operations, developers only need to:

### Step 1: Add to interface
```typescript
// packages/core/src/operations/git/types.ts
export interface IGitOperations {
  cherryPick(repoPath: string, commit: string): Promise<void>;  // NEW
}
```

### Step 2: Implement locally
```typescript
// packages/core/src/operations/git/local.ts
async cherryPick(repoPath: string, commit: string): Promise<void> {
  await simpleGit(repoPath).raw(['cherry-pick', commit]);
}
```

### Step 3: Use it
```typescript
const ops = getOperations(projectId);
await ops.git.cherryPick(repoPath, hash);  // Works local + remote!
```

**No additional code needed.** The RPC proxy auto-generates remote calls from the interface.

---

## Agent Installation

**Strategy**: Auto-deploy on first connection, with manual fallback.

```
SSH Connect
    │
    ▼
Agent running? ──Yes──► Connected
    │
   No
    │
    ▼
Binary exists? ──Yes──► Start agent ──► Connected
    │
   No
    │
    ▼
Auto-deploy binary via SFTP
    │
    ├── Success ──► Start agent ──► Connected
    │
    └── Failed ──► Show manual install dialog
```

**Manual install** (fallback):
```bash
curl -fsSL https://superset.sh/install-agent | bash
```

**Bundled binaries**: `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`

---

## Data Model Changes

### Projects table
```typescript
// Add to existing projects schema
remoteConfig: {
  host: string;
  port: number;
  username: string;
  sshKeyId: string;      // Reference to ssh_keys table
  agentPort: number;     // Default: 19999
  remotePath: string;    // e.g., /home/user/projects/myapp
} | null
```

### New: SSH Keys table
```typescript
{
  id: string;
  name: string;                    // User-friendly name
  encryptedPrivateKey: Buffer;     // Encrypted via Electron safeStorage
  publicKey: string;
  fingerprint: string;
  createdAt: Date;
}
```

---

## Implementation Phases

### Phase 1: Core Package (2-3 days) ✅ Ships independently

**Create `packages/core` with operation interfaces and local implementations.**

Deliverables:
- [ ] `packages/core/package.json` with dependencies (simple-git)
- [ ] Operation interfaces: `IGitOperations`, `IFileOperations`, `IWorkspaceOperations`
- [ ] Local implementations: `LocalGitOperations`, `LocalFileOperations`, `LocalWorkspaceOperations`
- [ ] RPC infrastructure: `RpcServer`, `createRpcProxy`, types
- [ ] Unit tests for local operations
- [ ] Export barrel files

Exit criteria: `bun test` passes, package builds cleanly.

---

### Phase 2: Router Refactor (2-3 days) ✅ Ships independently

**Refactor existing tRPC routers to use `getOperations()` pattern.**

Deliverables:
- [ ] Create `apps/desktop/src/main/lib/operations/provider.ts`
- [ ] Refactor `changes/` routers to use `getOperations(projectId).git.*`
- [ ] Refactor `workspaces/` routers to use `getOperations(projectId).workspace.*`
- [ ] Refactor file-related operations to use `getOperations(projectId).files.*`
- [ ] All existing tests pass (behavior unchanged)

Exit criteria: App works identically to before, but uses new abstraction.

---

### Phase 3: Remote Agent (2-3 days)

**Create `packages/remote-agent` standalone binary.**

Deliverables:
- [ ] `packages/remote-agent/package.json` with dependencies (node-pty)
- [ ] TCP server listening on `127.0.0.1:19999`
- [ ] RPC handler using `RpcServer` from `@superset/core`
- [ ] Terminal manager for remote PTY sessions
- [ ] Build script producing binaries for 4 platforms
- [ ] Integration tests (spawn agent, send RPC, verify response)

Exit criteria: Can run agent locally, send RPC commands, get responses.

---

### Phase 4: SSH Transport (2-3 days)

**Add SSH connection management to desktop app.**

Deliverables:
- [ ] `ssh/connection-manager.ts` - SSH lifecycle, status tracking, auto-reconnect
- [ ] `ssh/rpc-client.ts` - RPC over SSH port-forwarded tunnel
- [ ] `ssh/agent-deployer.ts` - Binary upload and agent startup
- [ ] Update `getOperations()` to return RPC proxies for remote projects
- [ ] SSH key storage with Electron `safeStorage` encryption

Exit criteria: Can connect to remote, execute git operations via RPC.

---

### Phase 5: Terminal over SSH (1-2 days)

**Remote terminal sessions via SSH PTY channels.**

Deliverables:
- [ ] `operations/terminal/ssh.ts` - Terminal via SSH shell channel
- [ ] Wire up to existing terminal UI
- [ ] Handle resize, input, output streaming

Exit criteria: Can open terminal in remote workspace, run commands.

---

### Phase 6: Database + Migration (1 day)

**Schema updates for remote projects.**

Deliverables:
- [ ] Add `remoteConfig` column to projects table
- [ ] Create `ssh_keys` table
- [ ] Migration script
- [ ] Update project queries to handle remote config

Exit criteria: Can store and retrieve remote project configuration.

---

### Phase 7: UI - Add Remote Project (2 days)

**Dialog for adding remote projects.**

Deliverables:
- [ ] "Add Remote Project" dialog component
- [ ] SSH connection form (host, port, username, key selection)
- [ ] Remote path browser
- [ ] Connection test button
- [ ] SSH key management (import, generate)

Exit criteria: User can add a remote project through UI.

---

### Phase 8: UI - Connection Status (1 day)

**Visual indicators for remote connection state.**

Deliverables:
- [ ] Connection status indicator in workspace header
- [ ] Reconnection UI (toast/banner when reconnecting)
- [ ] Error state handling

Exit criteria: User can see connection status at a glance.

---

### Phase 9: Testing + Polish (2-3 days)

**End-to-end testing and edge cases.**

Deliverables:
- [ ] E2E tests: connect, create workspace, terminal, git operations
- [ ] Error handling: connection drops, agent crashes, permission errors
- [ ] Performance: verify acceptable latency
- [ ] Documentation updates

Exit criteria: Feature is production-ready.

---

## Security

| Concern | Mitigation |
|---------|------------|
| SSH keys at rest | Encrypted with Electron `safeStorage` (OS keychain) |
| Agent exposure | Binds to `127.0.0.1` only, accessed via SSH tunnel |
| Transport | All data over SSH (encrypted) |
| Path traversal | Agent validates paths stay within allowed directories |

---

## Open Questions

1. **Worktree location on remote**: Use `~/.superset/worktrees/` (same as local) or configurable per-project?

2. **Agent versioning**: How to handle version mismatch between desktop and agent? Auto-update on connect?

3. **SSH config import**: Should we read `~/.ssh/config` for host aliases and settings?

---

## Not In Scope (Future)

- Multi-hop SSH (jump hosts)
- Port forwarding for dev servers
- File sync for offline work
- Windows remote support
