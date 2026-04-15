# cursorsandbox — Process Isolation Sandbox

`cursorsandbox` is a Bubblewrap-based process isolation tool that wraps commands executed by the cloud agent. It restricts filesystem access, network connectivity, and system calls to prevent agent-executed code from escaping its intended boundaries.

---

## Quick Facts

| Property | Value |
|---|---|
| Binary | `/exec-daemon/cursorsandbox` (4.7 MB) |
| Type | Static-pie ELF (no external library dependencies) |
| Language | Rust (compiled with `x86_64-unknown-linux-gnu` target) |
| Foundation | Bubblewrap (Linux namespace-based sandboxing) |
| Self-description | "Sandboxing helper for Everysphere shell-exec" |

---

## Usage

```
cursorsandbox [OPTIONS] [COMMAND]...

Arguments:
  [COMMAND]...  Command to execute under sandbox (everything after --)

Options:
  --policy <POLICY>    Path to the unified policy file (JSON)
  --preflight-only     Only perform sandbox preflight (no exec);
                       exits 0 on success, 2 if unsupported
  -h, --help           Print help
```

### Example

```bash
cursorsandbox --policy /tmp/sandbox-policy.json -- /bin/bash -c "echo hello"
```

---

## Policy File

The `--policy` flag points to a JSON file that contains three sections:

1. **Filesystem policy** — Which paths to allow read, write, or deny access to
2. **Network filtering policy** — Which network connections to allow or block
3. **Network-strict flag** — Whether to fully block all network access

---

## 7-Stage Isolation Pipeline

When `cursorsandbox` executes a command, it applies security layers in this order:

### Stage 1–2: User Namespace Setup
- Creates a **user namespace** (unprivileged container isolation)
- Maps UID/GID using `newuidmap` / `newgidmap`
- Falls back gracefully if user namespace support is limited

### Stage 3: Mount Namespace
- Remounts filesystem as `MS_PRIVATE` (mount events don't propagate)
- Can create read-only "blackhole" mounts to block access to sensitive paths

### Stage 4: Loopback Network Setup
- Sets up isolated loopback networking within the namespace

### Stage 5: Seccomp — Dangerous Syscall Block
- Applies a BPF (Berkeley Packet Filter) seccomp filter
- Blocks dangerous system calls that could escape the sandbox
- Reports error if the filter has too many BPF instructions

### Stage 6: Seccomp — Network Block + Capability Drop
- Optionally blocks network-related syscalls (for network-strict mode)
- Drops all elevated Linux capabilities

### Stage 7: Working Directory
- Changes to the specified working directory before executing the command

---

## Isolation Mechanisms

### Filesystem (Landlock LSM)

[Landlock](https://landlock.io/) is a Linux Security Module that restricts filesystem access:

- `restrict_self()` — Applies the Landlock ruleset to the current process
- **File-suffix rules** — Pre-discovered allow/deny rules based on file extensions
- **Glob-based denies** — Pattern matching for file access control
- Status reported via `CURSOR_SANDBOX_LANDLOCK_STATUS` environment variable

### Network (Socket Isolation)

- **Socket directory isolation** — Mounts custom socket directories to control UNIX socket access
- **CONNECT filtering** — Logs and optionally blocks outgoing TCP connections per target
- **Network blackhole** — Can mount a blackhole directory to completely block network access
- Decision logging: `sandbox: network decision log unavailable (label=...)`

### Syscall Filtering (Seccomp)

Two seccomp filter stages:
1. **Dangerous syscall block** — Prevents process escape (e.g., `ptrace`, namespace manipulation)
2. **Network syscall block** — Optionally blocks `socket()`, `connect()`, `bind()`, etc.

Both use BPF programs loaded via the seccomp system call. The sandbox reports when filter synchronization fails across threads.

---

## Decision Logging

The sandbox logs its enforcement decisions for debugging:

```
sandbox: socket directory isolation applied, mounts=3
sandbox: file-suffix rules (pre-discovered) applied=12
sandbox: glob denies (pre-discovered) applied_total=5
sandbox: landlock: ruleset fully enforced (effective: ...)
sandbox: CONNECT target connection failed (session=...)
sandbox: network decision log unavailable (label=...)
```

---

## Failure Modes

The sandbox is designed to fail safely:

| Error | Behavior |
|---|---|
| User namespace unsupported | Falls back to reduced isolation |
| Mount `MS_PRIVATE` fails | Reports error with errno, may continue |
| Seccomp filter too large | Reports "too many BPF instructions" |
| Landlock unsupported | Reports status, continues without filesystem isolation |
| UID/GID mapping fails | Falls back, warns about `gid_map` and `setgroups` |

### Preflight Check

```bash
cursorsandbox --preflight-only
# Exit 0 = sandbox supported
# Exit 2 = sandbox unsupported on this kernel
```

---

## When It's Used

The exec-daemon wraps commands in `cursorsandbox` when:
- The cloud orchestrator requests sandboxed execution
- The policy file specifies filesystem or network restrictions
- The agent is executing untrusted or user-provided code

Not all Shell commands go through the sandbox — simple commands like `git status` or `ls` may execute directly for performance.
