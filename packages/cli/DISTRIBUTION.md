# CLI + Host Service Distribution

How we ship `superset` as a standalone, downloadable bundle.

## Goals

1. User downloads a single tarball for their platform
2. `superset auth login` authenticates via browser (works headless too)
3. `superset start` runs the host service, connects to relay
4. The host machine is now accessible from any Superset client (web, mobile, desktop)

## Architecture

Two-binary bundle: the CLI is a Bun-compiled binary (pure JS), the host service runs on Node.js with native addons.

```
superset-darwin-arm64/
  bin/
    superset                # Bun-compiled CLI (single binary, no deps)
    superset-host           # Shell wrapper → exec node ../lib/host-service.js "$@"
  lib/
    node                    # Standalone Node.js 22 binary (~40MB)
    host-service.js         # esbuild-bundled host service (single file)
    native/
      better_sqlite3.node   # Native SQLite binding
      pty.node              # Native PTY binding
      spawn-helper          # node-pty helper (darwin only)
  share/
    migrations/             # Drizzle SQL migration files

superset-win32-x64/
  bin/
    superset.exe            # Bun-compiled Windows CLI
    superset-host.cmd       # cmd wrapper → node.exe ..\lib\host-service.js %*
  lib/
    node.exe                # Standalone Node.js 22 binary
    host-service.js
    native/
      better_sqlite3.node
      pty.node
  share/
    migrations/
```

### Why two runtimes?

- **CLI** (`superset`): Pure JS — tRPC client, OAuth flow, config management. No native deps. Bun's `--compile` produces a single ~50MB binary.
- **Host service** (`superset-host`): Depends on `better-sqlite3` (C++ SQLite) and `node-pty` (C++ PTY). These are native Node.js addons that don't work in Bun. Must run on Node.

### How `start` works

```
superset start
  └─ reads ~/.superset/config.json (auth token, org ID, API URL)
  └─ resolves superset-host binary (sibling in bin/)
  └─ spawns: superset-host (which runs: lib/node lib/host-service.js)
  └─ passes env: AUTH_TOKEN, SUPERSET_API_URL, HOST_DB_PATH, RELAY_URL, etc.
  └─ polls GET /trpc/health.check until ready
  └─ host service connects to relay via WebSocket tunnel
  └─ prints "Host service running on port XXXXX"

superset start --daemon
  └─ same but detached, writes manifest to ~/.superset/host/<orgId>/manifest.json
  └─ manifest: { pid, port, secret, startedAt }
```

## Build Process

### Per-platform build (runs on native CI runner or local machine)

```bash
bun run --cwd packages/cli build:dist -- --target=darwin-arm64
bun run --cwd packages/cli build:dist -- --target=linux-x64
bun run --cwd packages/cli build:dist -- --target=win32-x64
```

`packages/cli/scripts/build-dist.ts` handles CLI compilation, host-service
bundling, standalone Node download, native addon staging, wrapper generation,
migration copying, and archive creation for each target.

### Native addon availability

| Package | darwin-arm64 | linux-x64 | win32-x64 |
|---------|-------------|-----------|-----------|
| better-sqlite3 | prebuild | prebuild | staged Windows prebuild/native package |
| node-pty | prebuild (in npm pkg) | **compile from source** | staged Windows prebuild/native package |

Linux CI runners (Ubuntu) have gcc/make/python, so `node-pty` compiles during `npm install`.

## CI: GitHub Actions Build Matrix

```yaml
name: Build CLI Distribution
on:
  push:
    tags: ['cli-v*']

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-14
            target: darwin-arm64
            bun-target: bun-darwin-arm64
          - os: macos-13
            target: darwin-x64
            bun-target: bun-darwin-x64
          - os: ubuntu-latest
            target: linux-x64
            bun-target: bun-linux-x64
          - os: windows-2022
            target: win32-x64
            bun-target: bun-windows-x64

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: bun install
      - run: bun run packages/cli/scripts/build-dist.ts --target=${{ matrix.target }}
      - uses: actions/upload-artifact@v4
        with:
          name: superset-${{ matrix.target }}
          path: packages/cli/dist/superset-${{ matrix.target }}.tar.gz
```

## Installation

### Install scripts

```bash
curl -fsSL https://superset.sh/cli/install.sh | sh
```

```powershell
irm https://superset.sh/cli/install.ps1 | iex
```

Detects platform/arch, downloads tarball from GitHub Releases, extracts to `~/.superset/bin/`, prints PATH instructions.

### Manual

```bash
# Download
curl -LO https://github.com/user/superset/releases/latest/download/superset-darwin-arm64.tar.gz
# Windows archive name: superset-win32-x64.tar.gz

# Extract
mkdir -p ~/.superset/bin
tar -xzf superset-darwin-arm64.tar.gz -C ~/.superset/bin

# Add to PATH
export PATH="$HOME/.superset/bin/bin:$PATH"

# Login
superset auth login

# Start host service
superset start --daemon
```

### apt-get (stretch goal)

Publish `.deb` packages to a PPA for `apt-get install superset`.

### systemd / launchd (stretch goal)

```bash
superset host install   # writes systemd unit or launchd plist
                        # enables + starts the service
                        # host service runs on boot
```

## Current State

### Done

- [x] CLI binary cross-compilation (`bun build --compile` for macOS, Linux, and Windows targets)
- [x] CLI auth flow (OAuth 2.0 Device Authorization, works headless)
- [x] CLI commands: auth login/logout/whoami, org list/switch, tasks CRUD
- [x] Host service standalone entry point (`packages/host-service/src/serve.ts`)
- [x] Host service core: filesystem, git, chat, terminals, workspaces, PRs
- [x] Relay tunnel client (connects to relay, forwards HTTP/WS)
- [x] Relay server (deployed on Fly.io, JWT auth, access control)
- [x] Device identity on all platforms (no Electron deps)

### To Build

- [ ] esbuild config for host service bundle (`packages/host-service/build.ts`)
- [x] Build/assembly script (`packages/cli/scripts/build-dist.ts`)
- [ ] `start` command — spawn host service, pass env, health check
- [ ] `stop` command — read manifest, SIGTERM, cleanup
- [ ] `status` command — read manifest, check PID, health check port
- [ ] Manifest write/read in standalone host service mode
- [ ] Wire active org ID from CLI config → host service env
- [x] Native addon path resolution (host-service.js must find `.node` files in `../lib/native/`)
- [ ] GitHub Actions workflow (`.github/workflows/build-cli.yml`)
- [x] POSIX and Windows install scripts
- [ ] `host install` — systemd unit / launchd plist (stretch)
- [ ] Headless login polish — detect missing display, always print URL prominently

## Key Files

| File | Role |
|------|------|
| `packages/cli/src/commands/host/start/command.ts` | Host start command (stub) |
| `packages/cli/src/commands/host/stop/command.ts` | Host stop command (stub) |
| `packages/cli/src/commands/host/status/command.ts` | Host status command (stub) |
| `packages/cli/src/commands/host/install/command.ts` | Host install command (stub) |
| `packages/cli/src/lib/auth.ts` | OAuth device flow |
| `packages/cli/src/lib/config.ts` | ~/.superset/config.json read/write |
| `packages/cli/package.json` | Build scripts, cross-compile targets |
| `packages/host-service/src/serve.ts` | Standalone host service entry point |
| `packages/host-service/src/app.ts` | createApp() — core setup |
| `packages/host-service/src/db/db.ts` | SQLite/Drizzle (better-sqlite3) |
| `packages/host-service/src/terminal/terminal.ts` | PTY sessions (node-pty) |
| `packages/host-service/src/tunnel/connect.ts` | Relay tunnel connection |
| `packages/host-service/src/device-info.ts` | Machine ID (cross-platform) |
| `apps/desktop/src/lib/trpc/routers/host-service-manager/index.ts` | Desktop spawn logic (reference) |
