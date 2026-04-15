# Cursor Cloud Agent VM — Running Services & Port Map

**Generated:** 2026-04-15

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Firecracker microVM  (kernel 6.12.58+, 4 vCPU, 16 GB RAM)        │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Docker Engine 29.1.4  (containerd v2.2.1, runc 1.3.4)      │   │
│  │  Listening on tcp://0.0.0.0:2375 (no TLS, host-level)       │   │
│  │                                                              │   │
│  │  ┌────────────────────────────────────────────────────────┐  │   │
│  │  │  Container: pod-osnuon4l2zbb5nuirgpxsnd6oy-ef98dffd   │  │   │
│  │  │  Image: public.ecr.aws/.../universal:default-c9299ab   │  │   │
│  │  │  OS: Ubuntu 24.04.4 LTS                                │  │   │
│  │  │                                                        │  │   │
│  │  │  PID 1: /pod-daemon                                    │  │   │
│  │  │    ├── containerd (nested)                              │  │   │
│  │  │    ├── desktop-init.sh (AnyOS)                          │  │   │
│  │  │    │   ├── TigerVNC (Xtigervnc :1)                     │  │   │
│  │  │    │   │   └── XFCE4 desktop session                   │  │   │
│  │  │    │   │       ├── xfwm4 (window manager)              │  │   │
│  │  │    │   │       ├── xfce4-panel                          │  │   │
│  │  │    │   │       ├── xfdesktop                            │  │   │
│  │  │    │   │       └── Thunar (file manager daemon)         │  │   │
│  │  │    │   ├── noVNC (websockify → VNC)                     │  │   │
│  │  │    │   └── Plank dock                                   │  │   │
│  │  │    │                                                    │  │   │
│  │  │    ├── exec-daemon (Node.js)                            │  │   │
│  │  │    │   ├── HTTP API server                              │  │   │
│  │  │    │   ├── PTY WebSocket server                         │  │   │
│  │  │    │   └── tmux sessions (agent shells)                 │  │   │
│  │  │    │                                                    │  │   │
│  │  │    └── Google Chrome (headless-ish, for computerUse)    │  │   │
│  │  │        ├── GPU process (SwiftShader WebGL)              │  │   │
│  │  │        ├── Network service                              │  │   │
│  │  │        ├── Storage service                              │  │   │
│  │  │        └── Renderer processes (tabs)                    │  │   │
│  │  │                                                        │  │   │
│  │  │  User-started (from this session):                      │  │   │
│  │  │    ├── Next.js web dev server (port 3000)               │  │   │
│  │  │    └── Next.js API dev server (port 3001)               │  │   │
│  │  └────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Host-level services (PID shown as "-" from inside container):      │
│    ├── Docker Engine API (port 2375)                                │
│    ├── gRPC service (port 50052) — likely Cursor cloud orchestrator │
│    └── Unknown service (port 26500) — likely Cursor infrastructure  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## TCP Port Map

| Port | Protocol | Process | Bind Address | Purpose |
|------|----------|---------|--------------|---------|
| **2375** | HTTP (Docker API) | Docker Engine (host) | `0.0.0.0` | Docker remote API (unauthenticated). Allows `curl http://localhost:2375/...` for container management. The `docker` CLI is not installed, but the API is fully functional. |
| **3000** | HTTP | `next-server` (v16.2.1) | `::` (all interfaces) | **Superset web app** dev server (`apps/web`). Started during this session. |
| **3001** | HTTP | `next-server` (v16.2.1) | `::` (all interfaces) | **Superset API** dev server (`apps/api`). Started during this session. |
| **5901** | RFB (VNC) | `Xtigervnc` | `127.0.0.1` + `::1` | TigerVNC server — raw VNC protocol. Localhost-only (not directly exposed). The XFCE4 desktop renders here. |
| **26053** | HTTP | `exec-daemon` (Node.js) | `::` (all interfaces) | Cursor exec-daemon API — receives commands from the Cursor cloud agent orchestrator (tool calls, file operations, etc.) |
| **26054** | WebSocket | `exec-daemon` (Node.js) | `::` (all interfaces) | Cursor exec-daemon PTY WebSocket — streams terminal I/O for shell sessions. This is how the agent's tmux sessions are connected. |
| **26058** | HTTP (WebSocket upgrade) | `websockify` (Python) | `0.0.0.0` | **noVNC** — web-based VNC client. Proxies WebSocket connections to VNC port 5901. **This is how you see the desktop UI** in the Cursor web app's Desktop pane. |
| **26500** | gRPC (likely) | Host-level (PID `-`) | `0.0.0.0` | Cursor cloud infrastructure service (not accessible from container user space to inspect). Likely orchestration/lifecycle management. |
| **50052** | gRPC (likely) | Host-level (PID `-`) | `0.0.0.0` | Cursor cloud infrastructure service. Likely related to agent communication or VM management. |

### No UDP listeners

No UDP ports are in use.

---

## How You See the Desktop UI

The path from your browser to the desktop:

```
Your browser (Cursor web app)
  ↓ WebSocket over HTTPS (Cursor's cloud proxy)
  ↓
Port 26058: noVNC (websockify)
  ↓ Translates WebSocket → raw VNC protocol
  ↓
Port 5901: TigerVNC (Xtigervnc)
  ↓ Renders to virtual framebuffer
  ↓
DISPLAY=:1 (Xvfb-equivalent built into TigerVNC)
  ↓
XFCE4 desktop session
  ├── xfwm4 (window manager)
  ├── xfce4-panel (taskbar)
  ├── xfdesktop (desktop/wallpaper)
  ├── Plank (dock at bottom)
  └── Google Chrome (launched by computerUse agent)
```

**Key details:**
- Resolution: **1920x1200** at **96 DPI** (no HiDPI scaling)
- Software rendering: `LIBGL_ALWAYS_SOFTWARE=1`, `GALLIUM_DRIVER=llvmpipe` (Mesa software rasterizer for WebGL)
- Chrome flags: `--no-sandbox --use-gl=angle --use-angle=swiftshader-webgl` (SwiftShader for GPU-less WebGL)
- noVNC version: 1.2.0 with websockify 0.10.0

---

## How the Agent Executes Commands

```
Cursor cloud orchestrator
  ↓ gRPC / internal protocol
  ↓
Port 26053: exec-daemon HTTP API
  ↓ Spawns shell processes via
  ↓
Port 26054: PTY WebSocket (terminal I/O streaming)
  ↓
tmux sessions (tmux 3.4, config: /exec-daemon/tmux.portal.conf)
  ├── tmux-fa57b4e60633 (main agent session)
  ├── web-dev (Next.js web server)
  └── api-dev (Next.js API server)
```

The exec-daemon uses:
- Its own bundled Node.js binary (`/exec-daemon/node`, 124 MB)
- Auth tokens for each session (passed via `--auth-token` and `--pty-auth-token`)
- `cursorsandbox` binary for sandboxed execution
- `polished-renderer.node` and `pty.node` native addons

---

## Process Tree Summary

| Category | Process | PID | CPU% | RSS |
|----------|---------|-----|------|-----|
| **Init** | `/pod-daemon` | 1 | 0.0% | 5 MB |
| **Agent** | exec-daemon (Node.js) | 2352 | 0.2% | 250 MB |
| **Desktop** | `desktop-init.sh` | 2823 | 0.0% | 4 MB |
| **VNC** | `Xtigervnc :1` | 2929 | 1.1% | 125 MB |
| **Desktop** | `xfce4-session` | 2933 | 0.0% | 83 MB |
| **Desktop** | `xfwm4` | 2984 | 0.1% | 120 MB |
| **Desktop** | `xfdesktop` | 3232 | 0.0% | 76 MB |
| **noVNC** | `websockify` (Python) | 3331 | 0.0% | 38 MB |
| **Desktop** | `plank` | 3337 | 0.0% | 40 MB |
| **Browser** | Chrome (main) | 18395 | 0.3% | 247 MB |
| **Browser** | Chrome GPU (SwiftShader) | 18433 | 0.6% | 102 MB |
| **Dev server** | `next-server` (web, :3000) | 17842 | 2.3% | 1.3 GB |
| **Dev server** | `next-server` (api, :3001) | 17843 | 1.7% | 1.1 GB |
| **Misc** | D-Bus, ssh-agent, gpg-agent, polkitd, gnome-keyring, at-spi, bamfdaemon | various | ~0% | small |

**Zombie processes:** ~60 defunct processes (old Chrome instances, esbuild, xclip from previous computerUse sessions). These are harmless — just not yet reaped by the init process.

---

## Docker Runtime (Available via API, No CLI)

Docker Engine **29.1.4** is running at the host level with the API exposed on port 2375. The `docker` CLI binary is not installed inside the container, but you can interact via:

```bash
# Direct API calls
curl http://localhost:2375/version
curl http://localhost:2375/containers/json

# Or install the docker CLI:
# sudo apt-get install -y docker-ce-cli
# export DOCKER_HOST=tcp://localhost:2375
```

Current containers:
- `pod-osnuon4l2zbb5nuirgpxsnd6oy-ef98dffd` — **this is us** (the agent's own container)
  - Image: `public.ecr.aws/k0i0n2g5/cursorenvironments/universal:default-c9299ab`
  - Status: running

---

## UNIX Domain Sockets (Key ones)

| Socket | Owner | Purpose |
|--------|-------|---------|
| `/run/dbus/system_bus_socket` | dbus-daemon | System D-Bus |
| `/tmp/dbus-q9b4BBh3iq` | dbus-daemon | Session D-Bus |
| `/run/docker.sock` | Docker Engine | Docker API (alternative to TCP 2375) |
| `/run/containerd/containerd.sock` | containerd | Container runtime |
| `/tmp/.X11-unix/X1` | Xtigervnc | X11 display socket |
| `/tmp/tmux-1000/default` | tmux | tmux server socket |
| `/run/host-services/ssh-auth.sock` | pod-daemon | SSH agent forwarding from host |
| `/home/ubuntu/.gnupg/S.gpg-agent` | gpg-agent | GPG operations |
| `/home/ubuntu/.cache/keyring-*/control` | gnome-keyring | Secret storage |
| `/home/ubuntu/.cache/at-spi/bus_1` | at-spi | Accessibility bus |

---

## Systemd Services (Enabled)

| Service | Purpose |
|---------|---------|
| `caddy.service` | Caddy web server (installed during this session, not actively serving) |
| `e2scrub_reap.service` | ext4 filesystem scrub cleanup |
| `getty@.service` | Virtual terminal login |
| `systemd-pstore.service` | Persistent storage for crash dumps |

Note: Most services in this container are started by `desktop-init.sh` and `pod-daemon` rather than systemd.
