# Cursor Cloud Agent VM — Operational Environment

How the VM actually works at runtime: filesystem persistence, git authentication, secret injection, network topology, resource limits, Chrome/computerUse, and the git hooks safety net.

---

## 1. Filesystem & Persistence

### Overlay Filesystem

The entire root filesystem is a Docker **overlay2** mount:
- **26 lower layers** (read-only) — the base container image layers
- **1 upper layer** (read-write) — all changes made during the session
- Changes in the upper layer persist until the container is destroyed

```
/ (overlay)
├── Lower layers (read-only): base Ubuntu + all pre-installed software
└── Upper layer (read-write): everything installed/modified during session
```

### Key Paths

| Path | Persistence | Notes |
|---|---|---|
| `/workspace/` | **Part of overlay** — persists within session, included in snapshots | Your git repo (cloned at VM creation) |
| `/home/ubuntu/` | **Part of overlay** — persists within session | User home, `.bashrc`, `.nvm/`, `.bun/`, `.cursor/` |
| `/opt/cursor/artifacts/` | **Part of overlay** — auto-uploaded to cloud storage | Agent output (screenshots, videos, docs) |
| `/tmp/` | **tmpfs or overlay** — ephemeral | VNC state, Chrome temp, signing keys |
| `/exec-daemon/` | **Part of overlay** — immutable in practice | Injected at container start |
| `/etc/resolv.conf`, `/etc/hosts`, `/etc/hostname` | **Bind-mounted from host** (`/dev/vda` ext4) | Docker-managed |

### What Survives a Snapshot

When Cursor takes a VM snapshot (for `SetupVmEnvironment`):
- Installed packages (apt, bun, etc.) — **yes**
- Files in `/workspace/` — **yes**
- Files in `/home/ubuntu/` — **yes**
- Running processes — **no** (restarted on next boot)
- Contents of `/tmp/` — **unclear** (likely no)

---

## 2. Git Authentication

Git uses **HTTPS with a GitHub access token** — not SSH. The token is injected via git's `insteadOf` URL rewriting.

### How It Works

```
git config url."https://x-access-token:<TOKEN>@github.com/".insteadOf "https://github.com/"
git config url."https://x-access-token:<TOKEN>@github.com/".insteadOf "git@github.com:"
git config url."https://x-access-token:<TOKEN>@github.com/".insteadOf "ssh://git@github.com/"
```

This means:
- `git push origin main` → rewrites to `https://x-access-token:<TOKEN>@github.com/<repo>` 
- `git clone git@github.com:org/repo` → also rewrites to HTTPS with the token
- SSH agent (`SSH_AUTH_SOCK`) is **empty** — SSH is not used for git
- The SSH agent socket at `/run/host-services/ssh-auth.sock` exists but is only used for **commit signing**, not for git transport

### Commit Signing

All commits are **GPG-signed using SSH keys** via a custom helper:

```
gpg.format = ssh
gpg.ssh.program = /home/ubuntu/.cursor/bin/cursor-git-ssh-keygen
commit.gpgsign = true
user.signingkey = ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA...
```

The helper (`cursor-git-ssh-keygen`) wraps `ssh-keygen` and sets `SSH_AUTH_SOCK=/run/host-services/ssh-auth.sock` — the vsock-forwarded agent from the host VM that has the signing key.

### Git Identity

```
user.name = Cursor Agent
user.email = cursoragent@cursor.com
```

### Token Refresh

The `ControlService.RefreshGithubAccessToken` RPC refreshes the token when it expires. The `gh` CLI is also authenticated separately (`gh auth status` works).

---

## 3. Git Hooks (Safety Net)

Cursor installs custom git hooks that prevent secrets from leaking into commits.

### Hook Architecture

```
~/.cursor/agent-hooks/L3dvcmtzcGFjZQ/     (base64 of "/workspace")
├── .dispatcher              # Universal hook dispatcher
├── .cursor-original-hooks-path  # Points to /workspace/.git/hooks
├── pre-commit.cursor        # Secret scanner for staged files
├── commit-msg.cursor        # Secret scanner for commit messages
└── commit-msg.cursor.co-author  # Adds human co-author to commits
```

The `.dispatcher` script:
1. Runs the **original** repo hooks (from `/workspace/.git/hooks`)
2. Then runs all `*.cursor*` hooks for that hook type

### Secret Scanning (pre-commit)

The `pre-commit.cursor` hook:
- Reads `CLOUD_AGENT_INJECTED_SECRET_NAMES` (comma-separated list)
- For each secret name, gets its value from the environment (`${!SECRET_NAME}`)
- Skips secrets shorter than 8 characters
- Scans only **added lines** in the diff (not existing code)
- Case-insensitive matching
- Supports multiline secret values
- **Allowlist**: Lines with `// pragma: allowlist secret` are skipped
- Blocks the commit with `CURSOR_SECRET_SCAN_BLOCKED=1` if a match is found

### Secret Scanning (commit-msg)

The `commit-msg.cursor` hook does the same but scans the **commit message** instead of staged files.

### Co-author Hook

The `commit-msg.cursor.co-author` hook appends:
```
Co-authored-by: <Human User> <email>
```
to every commit message, attributing the human who launched the agent session.

---

## 4. Secret Injection

### Mechanism

Secrets configured in the Cursor web UI are injected as **environment variables** into the exec-daemon process. They are then passed to spawned subprocesses.

### Tracking

The env var `CLOUD_AGENT_INJECTED_SECRET_NAMES` contains a comma-separated list of all injected secret names. This is used by the git hooks to know which values to scan for.

### Current State

In this session, no user secrets are configured:
- `CLOUD_AGENT_INJECTED_SECRET_NAMES` — not set
- All `.env` values are empty (copied from `.env.example`)

### Agent-specific Env Vars

| Variable | Value | Purpose |
|---|---|---|
| `CURSOR_AGENT` | `1` | Identifies this as an agent environment |
| `HOSTNAME` | `cursor` | Container hostname |
| `DISPLAY` | `:1` | X11 display for VNC |
| `VNC_RESOLUTION` | `1920x1200x24` | Desktop resolution |
| `VNC_DPI` | `96` | Display DPI |
| `FORCE_COLOR` | (set) | Forces color output in terminals |
| `NO_COLOR` | (set) | Also set — tools should check both |
| `GIT_DISCOVERY_ACROSS_FILESYSTEM` | (set) | Allows git to find repos across mount points |
| `GIT_LFS_SKIP_SMUDGE` | (set) | Skips LFS file download during clone (faster) |
| `CARGO_HOME` | `/usr/local/cargo` | Rust package directory |
| `RUSTUP_HOME` | `/usr/local/rustup` | Rust toolchain directory |
| `NVM_DIR` | `/home/ubuntu/.nvm` | Node version manager |

---

## 5. Network Topology

### Interfaces

| Interface | IP | Subnet | Role |
|---|---|---|---|
| `eth0` | 172.30.0.2 | /24 | Container's primary interface |
| `docker0` | 172.18.0.1 | /16 | Docker bridge (for nested containers) |
| `lo` | 127.0.0.1 | /8 | Loopback |

### Routing

```
Default gateway: 172.30.0.1 via eth0
Docker bridge:   172.18.0.0/16 via docker0
Container net:   172.30.0.0/24 via eth0
```

### DNS

Single nameserver: `10.0.0.2` (Docker-provided, resolves to Firecracker VM host).

### Special Hosts

```
127.0.0.1    cursor              # Container hostname
172.18.0.1   host.docker.internal  # Access to Docker host from container
```

### Outbound Connectivity

**Full internet access** — HTTPS to google.com, github.com, neon.tech, etc. all work. No egress firewall restrictions detected.

---

## 6. Resource Limits

### cgroups v2

| Resource | Limit | Notes |
|---|---|---|
| **Memory** | 16 GB (`17179869184` bytes) | ~16 GB total, matches `/proc/meminfo` |
| **CPU** | 4 vCPUs (`400000/100000` = 4.0x quota) | 400ms per 100ms period = 4 full cores |
| **PIDs** | 19,215 max | Generous; ~150 currently in use |
| **Swap** | 0 (disabled) | No swap space |

### ulimits

| Limit | Value | Notes |
|---|---|---|
| Open files | 524,288 | Very generous |
| Max user processes | unlimited | |
| Stack size | 8 MB | Standard |
| Core file size | unlimited | Core dumps enabled |
| File size | unlimited | |
| Virtual memory | unlimited | |

---

## 7. Chrome & computerUse

### Chrome Flags

The `computerUse` subagent launches Chrome with:

```
/opt/google/chrome/chrome
  --no-sandbox                    # Required inside container
  --test-type                     # Suppresses "unsupported flag" warnings
  --disable-dev-shm-usage         # Uses /tmp instead of /dev/shm
  --use-gl=angle                  # ANGLE for GL
  --use-angle=swiftshader-webgl   # Software WebGL (no GPU)
  --password-store=basic          # Simple password storage
  --no-first-run                  # Skip first-run wizard
  --no-default-browser-check      # Skip default browser prompt
  --remote-debugging-port=9222    # Chrome DevTools Protocol
  --user-data-dir=/home/ubuntu/.config/google-chrome
  --class=google-chrome
  --window-size=1820,1100         # Fits within 1920x1200 with margins
  --window-position=50,50         # Offset from top-left
```

### Remote Debugging (CDP)

Chrome DevTools Protocol on port **9222**. This is how the `computerUse` subagent controls the browser — taking screenshots, clicking, typing, navigating.

Note: Port 9222 didn't show as LISTEN in `netstat` — Chrome may bind it lazily or only on internal connections.

### Rendering

Software rendering throughout (no GPU):
- `LIBGL_ALWAYS_SOFTWARE=1` — Mesa software rasterizer
- `GALLIUM_DRIVER=llvmpipe` — Mesa's CPU-based GL driver
- `--use-angle=swiftshader-webgl` — Google's SwiftShader for WebGL

---

## 8. Ephemeral State in `/tmp/`

| Path | Purpose |
|---|---|
| `.git_signing_key_tmp*` | Temporary SSH signing keys (created per git operation, ~80 bytes each) |
| `container-init.log` | AnyOS desktop init log |
| `dbus-*` | D-Bus session socket |
| `anyos-xstartup` | VNC X startup script |
| `vnc-desktop-user-env` | Captured VNC user/home for desktop init |
| `tigervnc.*` | VNC server temp files |
| `tmux-1000/` | tmux server socket directory |
| `.X11-unix/` | X11 display socket |
| `com.google.Chrome.*` | Chrome singleton socket |
| `superset-agent-wrappers-*` | Agent command wrapper directories |
| `superset-workspace-fs-locks/` | Filesystem operation locks |
| `bunx-1000-*` | Bun execution caches |
| `node-compile-cache/` | Node.js compile cache |
| `hsperfdata_*` | JVM performance data (from Java tools) |

---

## 9. Cursor State in `~/.cursor/`

| Path | Purpose |
|---|---|
| `bin/cursor-git-ssh-keygen` | Git signing helper (wraps ssh-keygen with vsock agent) |
| `agent-hooks/L3dvcmtzcGFjZQ/` | Git hooks for `/workspace` (base64-encoded path) |
| `projects/workspace/agent-tools/` | Cached tool outputs (terminal captures, large command results) |
| `projects/workspace/terminals/` | Terminal session state files |

---

## 10. The Full Request Flow

Here's how a single tool call (e.g., the `Shell` tool running `ls -la`) flows through the entire system:

```
1. You (Cursor web app) → Send message "run ls -la"

2. Cursor Cloud Backend (ai server)
   → LLM generates tool call: Shell(command="ls -la")
   → Routes to VM orchestrator

3. VM Orchestrator (port 26500/50052 on Firecracker host)
   → Forwards tool call to exec-daemon

4. exec-daemon (port 26053 inside container)
   → Receives ConnectRPC request: ControlService.Exec
   → Auth check: validates --auth-token header
   → Optionally wraps in cursorsandbox (if policy requires)
   → Creates/reuses tmux session via TmuxSessionService
   → Allocates PTY via pty.node fork()
   → Spawns: /bin/bash -c "ls -la"

5. Process runs
   → stdout/stderr flow through PTY → exec-daemon
   → exec-daemon streams ExecResponse chunks back via ConnectRPC

6. exec-daemon → VM Orchestrator → Cursor Cloud Backend
   → Streams output back to LLM
   → LLM sees result, continues reasoning

7. If the agent writes to /opt/cursor/artifacts/:
   → exec-daemon filesystem watcher detects new file
   → Uploads to Cursor cloud storage
   → File appears in web UI

8. If the agent commits:
   → git hook dispatcher runs
   → pre-commit.cursor scans staged files for secrets
   → commit-msg.cursor scans message for secrets
   → commit-msg.cursor.co-author appends human co-author
   → cursor-git-ssh-keygen signs commit via vsock SSH agent
   → git pushes via HTTPS with x-access-token
```
