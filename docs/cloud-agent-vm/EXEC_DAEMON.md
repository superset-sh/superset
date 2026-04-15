# exec-daemon — The Cloud Agent's Brain

The exec-daemon is the Node.js service that receives all instructions from Cursor's cloud orchestrator and executes them inside the VM. Every tool call you see in a cloud agent session (Shell, Read, Write, Grep, Glob, etc.) is ultimately an RPC to this daemon.

---

## Quick Facts

| Property | Value |
|---|---|
| Binary | `/exec-daemon/node /exec-daemon/index.js serve` |
| Package | `@anysphere/exec-daemon-runtime` |
| Runtime | Dedicated Node.js binary (125 MB, not from nvm) |
| Framework | ConnectRPC (Buf's Connect protocol, gRPC-compatible) |
| Source | 405,507-line webpack bundle (`index.js`, 16 MB) |
| Built | 2026-04-15T17:09:49Z |
| Protocol | Protobuf (`@bufbuild/protobuf` v1.10.0) |
| Tracing | OpenTelemetry (OTLP exporter) |

---

## Ports

| Port | Protocol | Purpose |
|---|---|---|
| **26053** | HTTP (ConnectRPC) | Main API — all tool calls arrive here |
| **26054** | WebSocket | PTY streaming — real-time terminal I/O |

---

## Startup Command

```
/exec-daemon/node /exec-daemon/index.js serve \
    --port 26053 \
    --pty-websocket-port 26054 \
    --auth-token <64-char hex token> \
    --rg-path /exec-daemon/rg \
    --pty-auth-token <26-char hex token>
```

Both tokens are required for every request — this prevents unauthorized processes inside the VM from calling the daemon.

---

## RPC Services

The daemon exposes **5 gRPC/ConnectRPC services** across 2 protobuf packages:

### 1. `agent.v1.ControlService` — Primary API (18 methods)

This is the main service. Most tool calls map to methods here.

| Method | Kind | Description |
|---|---|---|
| **`Ping`** | Unary | Health check |
| **`GetCapabilities`** | Unary | Reports VM capabilities (e.g. computer-use support, available tools) |
| **`Exec`** | Server-streaming | Spawns a process and streams output. Used by the **Shell** tool. Server-streaming means the daemon sends back a stream of output chunks as the command runs. |
| **`ListDirectory`** | Unary | Lists files/dirs at a path. Used by the **Glob** tool for directory browsing. |
| **`ReadTextFile`** | Unary | Reads a file as UTF-8 text. Used by the **Read** tool. |
| **`WriteTextFile`** | Unary | Writes text to a file. Used by the **Write** and **StrReplace** tools. |
| **`ReadBinaryFile`** | Unary | Reads a file as raw bytes (for images, PDFs, etc.). |
| **`WriteBinaryFile`** | Unary | Writes raw bytes to a file. |
| **`GetDiff`** | Unary | Runs `git diff` and returns structured diff output. |
| **`GetWorkspaceChangesHash`** | Unary | Hash of uncommitted workspace changes (for cache invalidation). |
| **`RefreshGithubAccessToken`** | Unary | Refreshes the GitHub token used by `gh` CLI. |
| **`WarmRemoteAccessServer`** | Unary | Pre-starts the Cursor remote access server for faster Desktop pane connections. |
| **`ListArtifacts`** | Unary | Lists files in `/opt/cursor/artifacts/` and their upload status. |
| **`UploadArtifacts`** | Unary | Triggers upload of artifacts to Cursor cloud storage. |
| **`GetMcpRefreshTokens`** | Unary | Gets OAuth refresh tokens for MCP (Model Context Protocol) servers. |
| **`DownloadCursorServer`** | Unary | Pre-downloads the Cursor server binary for a specific commit (speeds up remote access). |
| **`UpdateEnvironmentVariables`** | Unary | Updates env vars for subsequent process spawns (does NOT affect running processes). |
| **`ReloadAgentSkills`** | Unary | Reloads skill files from `~/.cursor/skills/` and workspace skills so the next agent turn sees them. |
| **`ReloadPlugins`** | Unary | Reloads plugin-backed skills/subagents after plugin files are materialized on disk. |

### 2. `agent.v1.ExecService` — Streaming Execution (1 method)

A separate service dedicated to bidirectional execution streams.

| Method | Kind | Description |
|---|---|---|
| **`Exec`** | Server-streaming | Accepts an `ExecServerMessage` and streams back `ExecStreamElement` messages. Each element is either an `ExecClientMessage` (stdout/stderr output) or an `ExecClientControlMessage` (exit code, signal). This is the lower-level execution primitive — `ControlService.Exec` likely delegates to this. |

### 3. `agent.v1.PtyHostService` — Terminal Management (6 methods)

Manages pseudo-terminal (PTY) instances — the live shell sessions.

| Method | Kind | Description |
|---|---|---|
| **`SpawnPty`** | Unary | Creates a new PTY (pseudo-terminal) process. Allocates a PTY via the native `pty.node` addon's `fork()` function, which calls `forkpty()` + `execvp()`. |
| **`AttachPty`** | Server-streaming | Attaches to an existing PTY and streams its output as `PtyEvent` messages. This is how the terminal pane in the Cursor UI gets live output. |
| **`SendInput`** | Unary | Sends keystrokes/input to a PTY instance. When you type in the Desktop pane terminal, it goes through here. |
| **`ResizePty`** | Unary | Resizes a PTY (sends `SIGWINCH` to update terminal dimensions). |
| **`ListPtys`** | Unary | Lists all active PTY instances and their metadata. |
| **`TerminatePty`** | Unary | Kills a PTY process and cleans up resources. |

### 4. `agent.v1.TmuxSessionService` — tmux Session Management (4 methods)

Manages tmux sessions that persist across tool calls.

| Method | Kind | Description |
|---|---|---|
| **`CreateSession`** | Unary | Creates a new tmux session with a given name and working directory. Uses the bundled tmux at `/exec-daemon/tmux-root/bin/tmux`. |
| **`ListSessions`** | Unary | Lists all active tmux sessions. |
| **`KillSession`** | Unary | Terminates a tmux session by name. |
| **`AttachSession`** | Unary | Attaches to an existing tmux session (for resuming long-running processes). |

### 5. `aiserver.v1.DashboardService` — Cursor Dashboard API (client, not served)

This service is a **client** definition (not served by the exec-daemon) — the daemon calls this service on Cursor's cloud backend. It's used for organization/team management in the Cursor dashboard. Methods include `GetTeams`, `GetMe`, `GetUserOrganizations`, `GetOrganizationMembers`, etc.

---

## Bundled Binaries

The exec-daemon ships with its own copies of key tools to avoid depending on system-installed versions:

| Binary | Size | Purpose |
|---|---|---|
| `node` | 125 MB | Dedicated Node.js runtime (independent of nvm) |
| `gh` | 55 MB | GitHub CLI (statically linked, independent of system `gh`) |
| `rg` | 5.4 MB | ripgrep (passed via `--rg-path` flag, used for **Grep** tool) |
| `ssh-keygen` | 453 KB | SSH key generation |
| `cursorsandbox` | 4.7 MB | Process sandbox (see [CURSORSANDBOX.md](./CURSORSANDBOX.md)) |
| `polished-renderer.node` | 5.9 MB | Video compositor (see [POLISHED_RENDERER.md](./POLISHED_RENDERER.md)) |
| `pty.node` | 73 KB | PTY allocator (see [PTY_NODE.md](./PTY_NODE.md)) |

---

## Bundled tmux

The exec-daemon includes a **self-contained tmux build** at `/exec-daemon/tmux-root/`:

```
tmux-root/
├── bin/tmux          # tmux binary (940 KB)
├── lib/              # Bundled shared libraries
│   ├── libevent-2.1.so.7
│   ├── libncursesw.so.6
│   ├── libtinfow.so.6
│   └── ... (15 libraries total)
└── share/terminfo/   # Terminal info database
```

The wrapper script at `/exec-daemon/tmux` sets `LD_LIBRARY_PATH` and `TERMINFO_DIRS` to use these bundled libraries, making it portable across different Linux distributions.

tmux config (`tmux.portal.conf`):
- `history-limit 10000` — 10K lines of scrollback per pane
- `mouse on` — Mouse support enabled (but all drag bindings unbound)
- `status off` — Status bar hidden (agents don't need it)
- `default-terminal "tmux-256color"` — Full color support

---

## Artifact Upload Pipeline

The exec-daemon automatically watches `/opt/cursor/artifacts/` for new files and uploads them:

1. **Detection** — Filesystem watcher detects new/modified file
2. **Upload** — Streams file to Cursor cloud storage with retry logic
3. **Tracking** — Updates `/opt/cursor/artifacts/.cursor/exec-daemon-artifacts.json`:
   - `status: 3` = uploaded successfully
   - `bytesUploaded`, `uploadAttempts`, `uploadId`
   - `lastStartedAtUnixMs`, `lastFinishedAtUnixMs`
4. **Access** — File becomes available in the Cursor web app for inline display in chat, PR descriptions, etc.

---

## How Tool Calls Map to RPCs

| Agent Tool | RPC Method | Notes |
|---|---|---|
| `Shell` | `ControlService.Exec` | Server-streaming; output arrives in chunks |
| `Read` | `ControlService.ReadTextFile` | Returns file content as UTF-8 string |
| `Write` | `ControlService.WriteTextFile` | Overwrites file content |
| `StrReplace` | `ControlService.ReadTextFile` + `WriteTextFile` | Read, modify in memory, write back |
| `Grep` | External `rg` via `ControlService.Exec` | Runs ripgrep as subprocess |
| `Glob` | `ControlService.ListDirectory` (likely) | Directory traversal with pattern matching |
| `Delete` | `ControlService.WriteTextFile` or `Exec` | File deletion |
| `RecordScreen` | Coordinates with `polished-renderer.node` | See [POLISHED_RENDERER.md](./POLISHED_RENDERER.md) |
| `ManagePullRequest` | `ControlService.Exec` (runs `gh`) | Uses bundled GitHub CLI |
| `Task` (subagent) | Orchestrated by cloud backend | Not directly an exec-daemon RPC |
