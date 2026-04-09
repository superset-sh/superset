# SSH Workspaces

SSH workspaces connect Superset's terminal to a remote devcontainer via SSH. All terminals run on the remote machine with session persistence via [zmx](https://zmx.sh).

## Architecture

```
xterm.js (renderer)
    ↕ tRPC stream subscription (IPC)
node-pty (main process, local PTY)
    ↕ SIGWINCH for resize
ssh -tt (ControlMaster multiplexed)
    ↕ remote PTY
zmx attach <session-name> (session persistence)
    ↕ zmx-managed PTY
$SHELL (user's login shell)
```

### Key Design Decisions

- **node-pty** wraps SSH in a real local PTY. This gives native resize (SIGWINCH forwarding) and proper terminal behavior.
- **zmx** (not tmux) handles session persistence. zmx is transparent — no rendering layer, no escape sequence interference, native scrollback. tmux was tried first but caused resize/rendering conflicts with xterm.js.
- **SSH ControlMaster** multiplexes all connections per workspace over a single TCP connection. One master, many channels.
- **`stty intr undef quit undef susp undef`** before `exec ssh` — disables local signal character mapping so Ctrl+C/Z/\ pass through to the remote shell instead of killing the local SSH process.
- **Direct SSH shell** — the user's shell runs inside zmx on the remote. On app restart, `zmx attach` reattaches to the existing session with full state restoration.

## File Structure

```
apps/desktop/src/main/lib/ssh/
├── types.ts                    # SshConnectionConfig, DevcontainerScriptInput/Output
├── connection-manager.ts       # SSH ControlMaster lifecycle (start/stop/exec/spawnPty)
├── zmx-manager.ts              # zmx session operations (hasSession/killSession/listSessions)
├── ssh-terminal-manager.ts     # Core terminal runtime (createOrAttach/write/resize/kill/detach)
├── script-executor.ts          # Devcontainer/teardown script execution
├── reconnection.ts             # App startup cleanup (stale sockets, orphaned workspaces)
├── *.test.ts                   # Unit tests for each module
│
apps/desktop/src/main/lib/workspace-runtime/
├── ssh.ts                      # SshWorkspaceRuntime (wires connection + zmx + terminal managers)
├── registry.ts                 # WorkspaceRuntimeRegistry (dispatches SSH vs local per workspace)
├── types.ts                    # TerminalRuntime interface (added removeRuntime)
│
apps/desktop/src/lib/trpc/routers/
├── terminal/terminal.ts        # Terminal router (paneWorkspaceMap for SSH routing)
├── workspaces/procedures/
│   ├── create.ts               # SSH workspace creation (devcontainer script execution)
│   ├── delete.ts               # SSH workspace deletion (teardown + cleanup)
│   └── git-status.ts           # getWorktreeInfo returns sshConfig for SSH workspaces
├── settings/index.ts           # devcontainerScript/teardownScript settings procedures
│
apps/desktop/src/renderer/
├── components/NewWorkspaceModal/
│   └── PromptGroup.tsx         # SSH toggle checkbox in creation modal
├── screens/main/components/
│   ├── WorkspaceSidebar/WorkspaceListItem/
│   │   ├── WorkspaceIcon.tsx   # Cloud icon for SSH workspaces
│   │   └── WorkspaceListItem.tsx
│   └── WorkspaceView/RightSidebar/
│       └── SshConfigPanel/     # SSH config view/edit tab
├── routes/_authenticated/settings/terminal/
│   └── TerminalSettings/components/SshSection/  # Devcontainer/teardown script settings
│
packages/local-db/src/schema/
├── schema.ts                   # sshConfig column on workspaces, script columns on settings
├── zod.ts                      # sshWorkspaceConfigSchema, "ssh" in workspaceTypeSchema
│
packages/local-db/drizzle/
└── 0039_add_ssh_workspace_columns.sql  # Migration for new columns
```

## How It Works

### Creating an SSH Workspace

1. User opens New Workspace modal, toggles "SSH" checkbox
2. User fills in workspace name and branch (branch is passed to the devcontainer script)
3. On submit, the `create` tRPC procedure:
   - Reads the devcontainer script from global settings
   - Resolves the repo URL via `git remote get-url origin`
   - Runs the script via `sh -lc` (login shell, inherits user PATH)
   - Script receives env vars: `SUPERSET_REPO_URL`, `SUPERSET_BRANCH`, `SUPERSET_BRANCH_NO_PREFIX`, `SUPERSET_NEW_BRANCH`, `SUPERSET_WORKSPACE_NAME`, `SUPERSET_WORKSPACE_ID`
   - Script must print JSON to stdout: `{ host, port, user, workDir, identityFile?, containerName? }`
   - JSON is validated against `sshWorkspaceConfigSchema`
   - Workspace record created with `type: "ssh"`, `sshConfig: <parsed config>`

### Opening a Terminal

1. Terminal component mounts → `createOrAttach` tRPC mutation
2. Terminal router resolves `getTerminalForWorkspace(workspaceId)` → gets `SshWorkspaceRuntime`
3. `SshTerminalManager.createOrAttach()`:
   - `connectionManager.ensureAlive()` — starts ControlMaster if not running
   - `connectionManager.spawnPty()` — spawns `ssh -tt ... zmx attach <session-name>` inside node-pty
   - zmx creates a new session (if first time) or reattaches (if existing)
   - `pty.onData()` emits `data:${paneId}` events → stream subscription → renderer
4. User types → renderer calls `write` → `pty.write(data)` → SSH → remote shell

### Resize

1. xterm.js fit addon detects container size change
2. Renderer calls `resize` mutation with new cols/rows
3. `SshTerminalManager.resize()` calls `pty.resize(cols, rows)`
4. node-pty sends SIGWINCH to SSH process
5. SSH forwards window-change request to remote
6. Remote PTY resizes → zmx adjusts → shell redraws

### Workspace Switch (detach/reattach)

1. User switches to another workspace → Terminal component unmounts
2. `detach()` sets `session.detached = true` — PTY stays alive, output keeps buffering
3. User switches back → Terminal component mounts → `createOrAttach` called
4. Finds existing alive session → `reattach()` — reconnects event listeners, provides buffered output as scrollback

### App Restart

1. App quits → all local PTY processes die, but remote zmx sessions stay alive
2. App restarts → `reconcileOnStartup()` cleans stale ControlMaster sockets and orphaned workspace records
3. User opens SSH workspace → `createOrAttach` runs
4. `ensureAlive()` establishes new ControlMaster connection
5. `spawnPty("zmx attach <session>")` — zmx reattaches to existing remote session
6. Full terminal state restored (scrollback, running processes, cwd)

### Closing a Terminal Tab

1. `kill()` called → kills local PTY + calls `zmxManager.killSession()` to destroy remote session
2. Emits `exit:${paneId}` event → renderer removes the tab

### Deleting an SSH Workspace

1. `delete` tRPC procedure detects `type === "ssh"`
2. Kills all active terminal sessions (local PTYs + remote zmx sessions)
3. Runs teardown script if configured (receives `SUPERSET_CONTAINER_NAME`, `SUPERSET_HOST`)
4. `registry.removeRuntime(workspaceId)` — stops ControlMaster, cleans cache
5. Deletes workspace record from DB

## SSH Connection Details

### ControlMaster

- Socket path: `/tmp/superset-ssh/ctl-<12-char-workspace-id>` (short path to avoid Unix socket 104-byte limit)
- Started with: `ssh -fN -o ControlMaster=auto -o ControlPath=... -o ServerAliveInterval=60 -o ServerAliveCountMax=3 -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new`
- All subsequent SSH commands (exec, spawnPty) multiplex over this master

### Ctrl+C Forwarding

The local PTY's line discipline would normally interpret `\x03` as SIGINT and kill SSH. We disable this by running `stty intr undef quit undef susp undef` before `exec ssh`. This undefines the signal characters themselves (not just ISIG flag) — SSH can re-enable ISIG but can't restore undefined characters.

### zmx

- Installed at `~/.local/bin/zmx` on the remote
- Session names: `superset-<sanitized-pane-id>`
- `zmx attach <name>` — upsert: creates if new, reattaches if exists
- `zmx kill <name>` — destroys session
- `zmx list --short` — lists session names

## Terminal Router Integration

The terminal router (`terminal.ts`) needed significant changes to support per-workspace terminal routing:

### paneWorkspaceMap

A `Map<string, string>` (paneId → workspaceId) tracks which workspace owns each terminal pane. This enables routing pane-scoped operations (write, resize, kill) to the correct terminal runtime.

- **Set before** `createOrAttach` await (not after) to avoid race conditions with cancellation
- **Cleaned on failure** — if createOrAttach fails, the mapping is removed
- **Cleaned on exit/disconnect** — stream subscription handlers remove entries
- **`forgetWorkspace(workspaceId)`** — bulk cleanup when workspace is deleted/closed

### Stream Subscription

The `stream` subscription accepts `{ paneId, workspaceId }` (not just `paneId`) so it can resolve the correct terminal runtime immediately, without depending on paneWorkspaceMap timing.

## Devcontainer Script Contract

### Creation Script

Shell command configured in Settings > Terminal > SSH Workspaces. Executed via login shell (`$SHELL -lc`).

**Environment variables:**
| Variable | Description |
|---|---|
| `SUPERSET_REPO_URL` | Git remote URL (e.g., `git@github.com:org/repo.git`) |
| `SUPERSET_BRANCH` | Full branch name (e.g., `kirankunigiri/feature-x`) |
| `SUPERSET_BRANCH_NO_PREFIX` | Branch without user prefix (e.g., `feature-x`) |
| `SUPERSET_NEW_BRANCH` | `"1"` if creating new branch, `"0"` if existing |
| `SUPERSET_WORKSPACE_NAME` | User-specified workspace name |
| `SUPERSET_WORKSPACE_ID` | UUID of the workspace |

**Required JSON output (stdout):**
```json
{
  "host": "192.168.1.100",
  "port": 22,
  "user": "developer",
  "workDir": "/home/dev/workspace",
  "identityFile": "/path/to/key",
  "containerName": "my-container-abc"
}
```

### Teardown Script

Shell command configured alongside the creation script. Runs on workspace deletion. Failures are non-fatal.

**Environment variables:** `SUPERSET_CONTAINER_NAME`, `SUPERSET_HOST`

## Database Schema

### `workspaces` table (local SQLite)
- `sshConfig` — `text("ssh_config", { mode: "json" })` — stores `SshWorkspaceConfig` JSON, nullable
- `type` — `text` column, now accepts `"worktree" | "branch" | "ssh"`

### `settings` table (local SQLite)
- `devcontainerScript` — `text` — creation shell command
- `teardownScript` — `text` — teardown shell command

## Known Limitations

- **zmx must be installed** on the remote at `~/.local/bin/zmx`. No auto-install mechanism.
- **No auto-reconnection** on SSH connection drop. If the connection dies mid-session, the terminal shows an error. User must close and reopen the terminal tab to reconnect.
- **`cancelCreateOrAttach` is a no-op** — SSH attaches can't be canceled mid-flight. zmx attach is atomic.
- **V1 is terminals only** — no remote file browser, diff viewer, or git integration.
- **`StrictHostKeyChecking=accept-new`** — first connection auto-trusts the host key without user confirmation.

## Adding New Features

### Adding a new SSH setting
1. Add column to `settings` table in `packages/local-db/src/schema/schema.ts`
2. Generate migration: `cd packages/local-db && bunx drizzle-kit generate --name="add_my_column"`
3. Add tRPC get/set procedures in `apps/desktop/src/lib/trpc/routers/settings/index.ts`
4. Add UI in `SshSection.tsx`

### Adding a new field to SSH config
1. Add to `SshConnectionConfig` in `types.ts`
2. Add to `sshWorkspaceConfigSchema` in `packages/local-db/src/schema/zod.ts`
3. Generate migration if the column shape changed
4. Update `SshConfigPanel` UI
5. Update `getWorktreeInfo` in `git-status.ts` to return the new field
6. Update `WorkspaceHoverCard` if it should show in the hover preview

### Supporting a different session persistence tool
Replace `zmx-manager.ts` with a new manager implementing the same interface:
- `hasSession(paneId): Promise<boolean>`
- `killSession(paneId): Promise<void>`
- `listSessions(): Promise<string[]>`
- `sanitizeSessionName(paneId): string`

Then update the `spawnPty` command in `ssh-terminal-manager.ts` to use the new tool's attach command.

## Troubleshooting

### Terminal shows "Connection lost. Reconnecting..."
- SSH connection failed. Check if the remote host is reachable.
- ControlMaster socket might be stale. Delete `/tmp/superset-ssh/ctl-*` and retry.

### Terminal connects but Ctrl+C kills the session
- The `stty intr undef` wrapper isn't working. Check `connection-manager.ts` `spawnPty` method.

### Terminal doesn't resize properly
- Resize goes through `node-pty → SIGWINCH → SSH → remote`. If SSH ControlMaster doesn't forward window-change, resize may not propagate.

### "zmx: command not found" on remote
- Install zmx: `curl -sL https://zmx.sh/a/zmx-0.4.2-linux-x86_64.tar.gz | tar xz -C ~/.local/bin`

### Devcontainer script fails with exit code 127
- The script command can't find a binary. The script runs via `$SHELL -lc` which sources your shell profile, but some PATH entries may not be available. Use full paths.
