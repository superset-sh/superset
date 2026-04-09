# CLI + Host Service Distribution

How we ship `superset` as a standalone, downloadable bundle.

## Goals

1. User downloads a single tarball for their platform
2. `superset auth login` authenticates via browser (works headless too)
3. `superset host start` runs the host service, connects to relay
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
```

### Why two runtimes?

- **CLI** (`superset`): Pure JS — tRPC client, OAuth flow, config management. No native deps. Bun's `--compile` produces a single ~50MB binary.
- **Host service** (`superset-host`): Depends on `better-sqlite3` (C++ SQLite) and `node-pty` (C++ PTY). These are native Node.js addons that don't work in Bun. Must run on Node.

### How `host start` works

```
superset host start
  └─ reads ~/.superset/config.json (auth token, org ID, API URL)
  └─ resolves superset-host binary (sibling in bin/)
  └─ spawns: superset-host (which runs: lib/node lib/host-service.js)
  └─ passes env: AUTH_TOKEN, CLOUD_API_URL, HOST_DB_PATH, RELAY_URL, etc.
  └─ polls GET /trpc/health.check until ready
  └─ host service connects to relay via WebSocket tunnel
  └─ prints "Host service running on port XXXXX"

superset host start --daemon
  └─ same but detached, writes manifest to ~/.superset/host/<orgId>/manifest.json
  └─ manifest: { pid, port, secret, startedAt }
```

## Build Process

### Per-platform build (runs on native CI runner or local machine)

```bash
# 1. Build CLI binary
bun build --compile --target=bun-darwin-arm64 src/bin.ts --outfile dist/bin/superset

# 2. Bundle host service JS (single file, native deps external)
esbuild packages/host-service/src/serve.ts \
  --bundle --platform=node --format=esm \
  --external:better-sqlite3 --external:node-pty \
  --outfile dist/lib/host-service.js

# 3. Download standalone Node.js binary
curl -O https://nodejs.org/dist/v22.x.x/node-v22.x.x-darwin-arm64.tar.gz
# extract bin/node → dist/lib/node

# 4. Copy native .node files from node_modules prebuilds
cp node_modules/node-pty/prebuilds/darwin-arm64/pty.node dist/lib/native/
cp node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper dist/lib/native/
# better-sqlite3 prebuilds downloaded by prebuild-install during npm install
cp node_modules/better-sqlite3/prebuilds/darwin-arm64/better_sqlite3.node dist/lib/native/

# 5. Copy migrations
cp -r packages/host-service/drizzle/ dist/share/migrations/

# 6. Write superset-host wrapper
cat > dist/bin/superset-host << 'EOF'
#!/bin/sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/../lib/node" "$SCRIPT_DIR/../lib/host-service.js" "$@"
EOF
chmod +x dist/bin/superset-host

# 7. Package
tar -czf superset-darwin-arm64.tar.gz -C dist .
```

### Native addon availability

| Package | darwin-arm64 | darwin-x64 | linux-x64 |
|---------|-------------|-----------|-----------|
| better-sqlite3 | prebuild | prebuild | prebuild |
| node-pty | prebuild (in npm pkg) | prebuild (in npm pkg) | **compile from source** |

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

### curl | sh (planned)

```bash
curl -fsSL https://get.superset.sh | sh
```

Detects platform/arch, downloads tarball from GitHub Releases, extracts to `~/.superset/bin/`, prints PATH instructions.

### Manual

```bash
# Download
curl -LO https://github.com/user/superset/releases/latest/download/superset-darwin-arm64.tar.gz

# Extract
mkdir -p ~/.superset/bin
tar -xzf superset-darwin-arm64.tar.gz -C ~/.superset/bin

# Add to PATH
export PATH="$HOME/.superset/bin/bin:$PATH"

# Login
superset auth login

# Start host service
superset host start --daemon
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

- [x] CLI binary cross-compilation (`bun build --compile` for 3 targets)
- [x] CLI auth flow (OAuth 2.0 Device Authorization, works headless)
- [x] CLI commands: auth login/logout/whoami, org list/switch, tasks CRUD
- [x] Host service standalone entry point (`packages/host-service/src/serve.ts`)
- [x] Host service core: filesystem, git, chat, terminals, workspaces, PRs
- [x] Relay tunnel client (connects to relay, forwards HTTP/WS)
- [x] Relay server (deployed on Fly.io, JWT auth, access control)
- [x] Device identity on all platforms (no Electron deps)

### To Build

- [ ] esbuild config for host service bundle (`packages/host-service/build.ts`)
- [ ] Build/assembly script (`packages/cli/scripts/build-dist.ts`)
- [ ] `host start` command — spawn host service, pass env, health check
- [ ] `host stop` command — read manifest, SIGTERM, cleanup
- [ ] `host status` command — read manifest, check PID, health check port
- [ ] Manifest write/read in standalone host service mode
- [ ] Wire active org ID from CLI config → host service env
- [ ] Native addon path resolution (host-service.js must find `.node` files in `../lib/native/`)
- [ ] GitHub Actions workflow (`.github/workflows/build-cli.yml`)
- [ ] Install script (`curl | sh`)
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
