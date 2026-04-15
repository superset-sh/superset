# Cursor Cloud Agent Infrastructure — Deep Dive

**Generated:** 2026-04-15

This document explains how the Cursor Cloud Agent VM works internally — the custom binaries, the exec-daemon, the sandbox, the desktop rendering pipeline, the artifact system, and how everything is provisioned.

---

## 1. VM Architecture (Nesting Model)

```
┌───────────────────────────────────────────────────────────────────────┐
│  Firecracker microVM                                                  │
│  Kernel: 6.12.58+ (custom, SMP PREEMPT_DYNAMIC)                     │
│  Hardware: 4 vCPU, 16 GB RAM, 126 GB overlay disk                   │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │ Docker Engine 29.1.4                                          │   │
│  │ containerd v2.2.1, runc 1.3.4                                 │   │
│  │ API: tcp://0.0.0.0:2375 (no TLS)                             │   │
│  │ Socket: /run/docker.sock                                      │   │
│  │                                                               │   │
│  │  ┌──────────────────────────────────────────────────────┐    │   │
│  │  │  Our Container                                        │    │   │
│  │  │  Image: public.ecr.aws/k0i0n2g5/                     │    │   │
│  │  │         cursorenvironments/universal:default-c9299ab  │    │   │
│  │  │  PID 1: /pod-daemon                                   │    │   │
│  │  │                                                       │    │   │
│  │  │  Everything below runs inside this container.         │    │   │
│  │  └──────────────────────────────────────────────────────┘    │   │
│  └───────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

**Key insight:** Docker is available from inside the container (API on port 2375, socket at `/run/docker.sock`), but the `docker` CLI is not installed. You can install it with `sudo apt-get install -y docker-ce-cli` and set `DOCKER_HOST=tcp://localhost:2375`.

---

## 2. PID 1: `/pod-daemon`

| Property | Value |
|---|---|
| Binary | `/pod-daemon` (8.3 MB, statically-compiled Go) |
| Invocation | `/pod-daemon --ssh-auth-sock-path /run/host-services/ssh-auth.sock --ssh-auth-vsock-port 52` |
| Role | Container init process, SSH agent forwarding |

The pod-daemon is Cursor's custom init process. It:
- Manages the container lifecycle
- Forwards SSH agent authentication from the host VM via a vsock (virtual socket) connection on port 52 to `/run/host-services/ssh-auth.sock` inside the container — this is how `git push` works with your SSH keys
- Serves as PID 1 (reaps orphaned processes, handles signals)

It is a stripped Go binary with embedded Hyper (Rust HTTP library) and Tokio async runtime strings, suggesting it may proxy HTTP traffic or handle health checks.

---

## 3. The exec-daemon (`/exec-daemon/`)

The exec-daemon is the **brain of the cloud agent** — the Node.js service that receives instructions from Cursor's cloud orchestrator and executes them inside the VM.

### 3.1 Components

| File | Size | Type | Purpose |
|---|---|---|---|
| `index.js` | 16 MB, 405,507 lines | Webpack bundle | Main application (ConnectRPC + gRPC server) |
| `node` | 125 MB | ELF binary | Dedicated Node.js runtime (not from nvm) |
| `cursorsandbox` | 4.7 MB | Static-pie ELF | Bubblewrap-based sandbox for process isolation |
| `polished-renderer.node` | 5.9 MB | Native addon (.node) | Rust-based video compositor for screen recordings |
| `pty.node` | 73 KB | Native addon (.node) | PTY (pseudo-terminal) allocation using `forkpty()` |
| `gh` | 55 MB | Static ELF | Dedicated GitHub CLI binary |
| `rg` | 5.4 MB | Static-pie ELF | Dedicated ripgrep binary |
| `ssh-keygen` | 453 KB | ELF binary | SSH key generation |
| `tmux` | Shell script | Wrapper | Launches bundled tmux from `tmux-root/` |
| `tmux-root/` | Directory | Portable tmux build | Self-contained tmux with bundled libevent + ncurses |
| `exec-daemon` | Shell script | Wrapper | Launches `node index.js` |
| `tmux.portal.conf` | Config | tmux config | 10K history, mouse on, status bar off, 256-color |
| `252/407/511/953/980.index.js` | Small JS chunks | Webpack chunks | Lazy-loaded modules |
| `97f64a4d8eca9a2e35bb.mp4` | 63 KB | H.264 video | 1.5-second placeholder video (498×544, 25fps) |
| `package.json` | 140 bytes | Metadata | `@anysphere/exec-daemon-runtime`, built 2026-04-15 |
| `exec_daemon_version` | 165 bytes | URL | S3 download URL for this exec-daemon build |

### 3.2 How It Starts

```
PID 2352: /exec-daemon/node /exec-daemon/index.js serve \
    --port 26053 \
    --pty-websocket-port 26054 \
    --auth-token <token> \
    --rg-path /exec-daemon/rg \
    --pty-auth-token <token>
```

### 3.3 Network Endpoints

| Port | Protocol | Purpose |
|---|---|---|
| **26053** | HTTP (ConnectRPC/gRPC) | Main API — receives tool calls (Shell, Read, Write, Grep, etc.) from the cloud orchestrator |
| **26054** | WebSocket | PTY streaming — provides real-time terminal I/O for shell sessions |

### 3.4 Architecture

The exec-daemon is a **ConnectRPC** server (Buf's Connect protocol, compatible with gRPC) built with:
- `@connectrpc/connect` + `@connectrpc/connect-node` — RPC framework
- `@bufbuild/protobuf` — Protocol Buffers serialization
- `@grpc/grpc-js` — gRPC client for upstream communication
- `commander` — CLI argument parsing
- `@opentelemetry/*` — Distributed tracing (OTLP exporter)
- `rxjs` — Reactive streams for PTY output
- Custom `pty.node` native addon for pseudo-terminal management

It manages:
- **Shell sessions** via tmux + PTY allocation
- **File operations** (read, write, glob, grep via rg)
- **Process execution** with optional sandboxing via `cursorsandbox`
- **Artifact uploads** (screenshots, videos) to Cursor's cloud storage
- **Screen recording** coordination with `polished-renderer.node`

### 3.5 Version & Origin

```json
{
  "name": "@anysphere/exec-daemon-runtime",
  "private": true,
  "gitCommit": "unknown",
  "buildTimestamp": "2026-04-15T17:09:49.424Z"
}
```

Download URL: `https://public-asphr-vm-daemon-bucket.s3.us-east-1.amazonaws.com/exec-daemon/exec-daemon-x64-<hash>.tar.gz`

The `@anysphere` namespace confirms this is built by **Anysphere** (the company behind Cursor).

---

## 4. `cursorsandbox` — Process Isolation

A **Bubblewrap-based sandbox** (static-pie ELF, 4.7 MB) that provides:

### Isolation Mechanisms
- **User namespaces** — Unprivileged process isolation
- **Mount namespaces** — Filesystem isolation with remount `MS_PRIVATE`
- **Seccomp filters** — Syscall blocking (dangerous syscall block, network block)
- **Landlock LSM** — File access control (`restrict_self()`, rule enforcement)
- **Socket isolation** — Network connection control per-process
- **Capability dropping** — Removes elevated capabilities after setup

### Sandbox Steps (7-stage pipeline)
1. User namespace setup
2. UID/GID mapping via `newuidmap`/`newgidmap`
3. Mount namespace (`MS_PRIVATE`)
4. Loopback network setup
5. Seccomp dangerous syscall block
6. Seccomp network block + capability drop
7. Change to working directory

### Features
- **Blackhole network** — Can create a "blackhole" mount to block all network access
- **File-suffix rules** — Pre-discovered allow/deny by file extension
- **Glob-based denies** — Pattern matching for file access control
- **Decision logging** — Logs sandbox decisions for debugging

This is how Cursor ensures agent-executed code can't escape its sandbox — even if the agent runs arbitrary shell commands, they're wrapped in this security boundary.

---

## 5. `polished-renderer.node` — Video Compositor

A **Rust-compiled native Node.js addon** (5.9 MB) that handles screen recording and video processing.

### Capabilities
- **Video decoding** via ffmpeg/libav (`avcodec_find_decoder`, `av_read_frame`, `avcodec_receive_frame`)
- **SVG rendering** via `resvg` (Rust SVG library)
- **Image compositing** with `tiny_skia` (Rust 2D graphics)
- **Keystroke overlay rendering** — Draws keyboard shortcuts on video (uses system fonts: SF Pro, Helvetica Neue, DejaVu Sans, Noto Sans)
- **Proxy video generation** — Creates 1080p and full-resolution H.264 render proxies with all-I-frame encoding
- **Playback segment management** — Handles variable playback rates, segment stitching
- **JSON metadata** — Reads/writes `render-plan.json`, `render-proxies.json`, `recording-data.json`

### Recording Pipeline
1. Screen recording starts → raw frames captured from VNC/X11
2. `polished-renderer` creates render proxies (`recording_render_proxy_full.mp4`)
3. Encodes with `x264` (all I-frames for seeking: `keyint=1:min-keyint=1:scenecut=0:bframes=0`)
4. Generates 1080p scaled version via lanczos resampling
5. Composites keystroke overlays if needed
6. Outputs to `/opt/cursor/artifacts/` for upload

### Lock Files
Uses `render-proxies.lock` with stale-detection for concurrent safety.

---

## 6. `pty.node` — Pseudo-Terminal Management

A small native addon (73 KB) that wraps the POSIX `forkpty()` system call for creating pseudo-terminals. Used by the exec-daemon to allocate PTY sessions for shell commands.

Key symbols: `forkpty`, `execvp`, N-API bindings for Node.js integration.

---

## 7. `/opt/cursor/` — Cursor Runtime Directory

```
/opt/cursor/
├── ansible/                    # VM provisioning playbooks
│   ├── vnc-desktop.yml         # Main VNC desktop setup (528 lines)
│   └── files/                  # Provisioning scripts and assets
│       ├── desktop-init.sh     # AnyOS desktop bootstrap (381 lines)
│       ├── anyos.conf          # Display configuration
│       ├── anyos-setup.sh      # AnyOS setup orchestrator
│       ├── install-google-chrome.sh
│       ├── configure-google-chrome.sh
│       ├── install-vnc-desktop-apt-packages.sh
│       ├── vnc-desktop.Aptfile # List of apt packages for desktop
│       ├── install-fonts-and-fontconfig.sh
│       ├── install_and_configure_themes.sh
│       ├── install-remote-vnc-setup.sh
│       ├── configure_os_display.sh
│       ├── install-cursor-artifact-directories.sh
│       ├── install-hidpi-assets.sh
│       ├── install-locales.sh
│       ├── install-baked-cloud-agent-tools.py
│       ├── write-cloud-agent-media-hashes.sh
│       ├── write-cloud-agent-asset-hashes.sh
│       ├── anyos-setup.version
│       ├── cursor-logo.svg     # Cursor logo assets
│       ├── cursor-logo-24.png
│       ├── cursor-logo-dark.svg
│       ├── cursor-logo-dark-24.png
│       ├── fonts/              # Bundled fonts
│       │   ├── Inter-*.ttf     # Inter family (Regular, Bold, Italic, etc.)
│       │   ├── JetBrainsMono-*.ttf
│       │   ├── PublicSans-*.ttf
│       │   └── SourceSans3-Regular.ttf
│       └── xfce-config/        # XFCE desktop configuration
│           ├── .Xresources
│           ├── .Xmodmap
│           └── .config/
│               ├── gtk-3.0/    # GTK theme settings
│               ├── plank/      # Dock configuration
│               └── xfce4/      # Panel, terminal, window manager settings
│
├── cloud-agent-tools/          # Versioned tool bundles
│   ├── current -> baab2a50...  # Symlink to active version
│   ├── current.bundle-hash     # SHA-256 of current bundle
│   └── baab2a50.../            # Active bundle
│       ├── cloud-agent-setup   # Setup orchestrator script (601 lines)
│       ├── cloud-agent-tools.tsv  # Tool manifest (source → destination mapping)
│       ├── cloud-agent-assets.tsv # Asset manifest (fonts, icons, themes, wallpapers)
│       └── files/
│           ├── vnc/            # VNC setup scripts (copies of ansible/files/)
│           └── anyos/          # AnyOS config and setup
│
├── artifacts/                  # Output directory for agent artifacts
│   ├── .cursor/
│   │   └── exec-daemon-artifacts.json  # Upload tracking (status, bytes, attempts)
│   └── *.md, *.png, *.mp4, *.webm     # Agent-generated artifacts
│
├── recording-staging/          # Temp directory for in-progress screen recordings
├── logs/                       # Agent log files
└── .exec-daemon/               # exec-daemon runtime state
```

---

## 8. Cloud Agent Setup Pipeline

The `cloud-agent-setup` script (601 lines of bash) orchestrates VM provisioning on every boot:

### Subcommands
1. **`sync-assets <url> <name> <version>`** — Downloads fonts, icons, themes, wallpapers from S3 with SHA-256 integrity checks. Runs 16 parallel downloads via `xargs -P 16`.
2. **`run-step <step>`** — Executes a named provisioning step (versioned, idempotent).
3. **`wrap-vnc-step <idx> <total> <name> -- <step>`** — Wraps a step with failure tracking. After 3 consecutive failures, the step is permanently skipped (sentinel file: `/usr/local/share/vnc-setup-commands-failure.v5.env`).

### Provisioning Steps (in order)
1. `capture-vnc-user-env` — Capture user/home for VNC session
2. `install-vnc-desktop-apt-packages` — Install XFCE4, TigerVNC, noVNC deps
3. `install-google-chrome` — Install Chrome from Google's apt repo
4. `configure-google-chrome` — Set up Chrome defaults (no sandbox, SwiftShader)
5. `install-locales` — Set up UTF-8 locale
6. `cleanup-vnc-desktop-apt` — Clean apt cache
7. `install-fonts-and-fontconfig` — Install Inter, JetBrains Mono, Public Sans, etc.
8. `install-and-configure-themes` — WhiteSur macOS-style GTK/icon/cursor themes
9. `install-remote-vnc-setup` — Configure VNC server and noVNC
10. `configure-os-display` — Set resolution, DPI, scaling
11. `install-cursor-artifact-directories` — Create `/opt/cursor/artifacts/`, `/opt/cursor/logs/`, etc.

### Asset Manifests

**`cloud-agent-tools.tsv`** — Maps bundled scripts to destination paths:
```
<mode>  <sha256>  <base64-source-path>  <base64-dest-path>
```
Scripts are installed with `install -D -m <mode>` and tracked via `.hash` sidecar files for idempotency.

**`cloud-agent-assets.tsv`** — Maps downloadable assets (fonts, themes, wallpapers):
```
<mode>  <sha256>  <suffix>  <base64-dest-path>
```
Downloaded from an S3 base URL with integrity verification. Includes:
- 16 font files (Inter, JetBrains Mono, Public Sans, Source Sans)
- 4 Cursor logo files (SVG + PNG, light + dark)
- WhiteSur GTK theme, icon theme, cursor theme (as .tar.gz/.tar.xz)
- Cascadia Code font (for terminal)
- 3 desktop wallpapers + 1 macOS-style wallpaper
- noVNC 1.2.0 + websockify 0.10.0 (as .zip)

---

## 9. Ansible Provisioning (`vnc-desktop.yml`)

The full VNC desktop is set up by an Ansible playbook with these key tasks:

1. **apt packages** — Installs ~100 packages from `vnc-desktop.Aptfile`
2. **Google Chrome** — Installs from Google's stable apt repo
3. **Chrome configuration** — Sets `--no-sandbox`, `--use-gl=angle`, `--use-angle=swiftshader-webgl`, remote debugging on port 9222
4. **TigerVNC** — Configured for localhost-only, `SecurityTypes None`, 1920×1200
5. **noVNC** — Web-based VNC client on port 26058 with websockify proxy
6. **XFCE4** — Configured with:
   - WhiteSur-Light GTK theme (macOS-inspired)
   - WhiteSur icon theme
   - WhiteSur cursors
   - Plank dock (bottom, with Chrome/Terminal/Thunar launchers)
   - Custom panel (28px, Inter 11pt)
7. **Fonts** — Inter (UI), JetBrains Mono (terminal), Public Sans, Source Sans 3, Cascadia Code
8. **Display** — 1920×1200 @ 96 DPI, software rendering (LIBGL_ALWAYS_SOFTWARE=1, GALLIUM_DRIVER=llvmpipe)

---

## 10. Artifact Upload System

The exec-daemon watches `/opt/cursor/artifacts/` and automatically uploads files to Cursor's cloud storage.

### Tracking File
`/opt/cursor/artifacts/.cursor/exec-daemon-artifacts.json`:
```json
{
  "version": 1,
  "artifacts": {
    "/opt/cursor/artifacts/screenshot.png": {
      "status": 3,            // 3 = uploaded successfully
      "bytesUploaded": 23765,
      "uploadAttempts": 1,
      "lastError": "",
      "lastStartedAtUnixMs": 1776278645081,
      "uploadId": "d786861e-...",
      "uploadedFileMtimeMs": 1776278625791,
      "uploadedFileSizeBytes": 23765,
      "lastFinishedAtUnixMs": 1776278645464
    }
  }
}
```

### Upload Flow
1. Agent places file in `/opt/cursor/artifacts/`
2. exec-daemon detects new/changed file via filesystem watch
3. Uploads to Cursor cloud storage with retry logic
4. Updates `exec-daemon-artifacts.json` with status
5. File becomes accessible in Cursor web app / PR descriptions

### Screen Recording Flow
1. `RecordScreen` tool with `START_RECORDING` → begins ffmpeg capture of VNC display
2. Raw frames accumulate in `/opt/cursor/recording-staging/`
3. `RecordScreen` with `SAVE_RECORDING` → `polished-renderer.node` composites final video:
   - Generates full-resolution and 1080p H.264 proxies
   - Adds keystroke overlays if applicable
   - Outputs to `/opt/cursor/artifacts/<name>.mp4`
4. `DISCARD_RECORDING` → cleans up staging files

---

## 11. Desktop Boot Sequence

When the container starts, `/usr/local/share/desktop-init.sh` ("AnyOS") runs:

```
desktop-init.sh
  │
  ├── Phase 1: Load anyos.conf (resolution, DPI, scaling)
  ├── Phase 2: Start D-Bus daemon (required for XFCE)
  ├── Phase 3: Start TigerVNC + configure Plank (parallel)
  │   ├── VNC: tigervncserver :1 -geometry 1920x1200 -depth 24
  │   │        -rfbport 5901 -localhost -SecurityTypes None
  │   │        -xstartup /tmp/anyos-xstartup
  │   │   └── xstartup: exports scaling vars → exec startxfce4
  │   │       ├── xfwm4 (window manager)
  │   │       ├── xfce4-panel
  │   │       ├── xfdesktop
  │   │       └── Thunar --daemon
  │   └── Plank: dconf writes for dock config
  ├── Phase 4: Wait for X server ready (xdpyinfo, up to 60s)
  ├── Phase 5: Post-X setup
  │   ├── Start noVNC (websockify on port 26058 → VNC 5901)
  │   ├── Start Plank dock (respawn loop)
  │   └── Set random desktop wallpaper (xfconf-query)
  └── Done: "AnyOS desktop ready. Connect via noVNC on port 26058."
```

---

## 12. Host-Level Infrastructure (Opaque from Inside)

These services run at the Firecracker VM level, outside our container. We can see their ports but not their processes:

| Port | Likely Purpose |
|---|---|
| **2375** | Docker Engine API (confirmed via `/version` endpoint) |
| **26500** | Cursor cloud orchestrator / lifecycle manager (gRPC) |
| **50052** | Cursor agent communication service (gRPC) |

The orchestrator at port 26500/50052 likely:
- Manages exec-daemon lifecycle
- Routes tool calls from the Cursor web app to the exec-daemon
- Handles VM snapshots and environment persistence
- Manages agent session state

---

## 13. Security Model Summary

| Layer | Mechanism |
|---|---|
| **VM isolation** | Firecracker microVM (hardware-level) |
| **Container isolation** | Docker with containerd/runc |
| **Process isolation** | `cursorsandbox` (Bubblewrap + seccomp + Landlock) |
| **Network** | Full outbound internet; host ports proxied via Docker |
| **Auth** | exec-daemon requires `--auth-token` and `--pty-auth-token` |
| **SSH** | Agent forwarded via vsock from host VM |
| **VNC** | Localhost-only (`-localhost` flag), exposed only via noVNC WebSocket |
| **Docker API** | Unauthenticated on port 2375 (inside VM only) |
