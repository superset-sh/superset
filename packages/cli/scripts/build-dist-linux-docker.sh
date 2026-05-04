#!/usr/bin/env bash
#
# Reproduce the GitHub Actions Linux CLI build inside a Docker container.
# Mirrors `.github/workflows/build-cli.yml` so we can validate the full
# install + build + smoke-test flow without cutting a release.
#
# Usage:
#   packages/cli/scripts/build-dist-linux-docker.sh [linux-x64|linux-arm64]
#
# Outputs the tarball at packages/cli/dist/superset-<target>.tar.gz inside
# the container's copy of the repo and runs the same require() smoke test
# the CI workflow runs.
set -euo pipefail

TARGET="${1:-linux-x64}"
case "$TARGET" in
  linux-x64) PLATFORM="linux/amd64"; NODE_ARCH="x64" ;;
  linux-arm64) PLATFORM="linux/arm64"; NODE_ARCH="arm64" ;;
  *) echo "Usage: $0 [linux-x64|linux-arm64]" >&2; exit 1 ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BUN_VERSION="$(cat "$REPO_ROOT/.bun-version")"
NODE_VERSION="22.22.2"

echo "[docker-build] target=$TARGET platform=$PLATFORM bun=$BUN_VERSION node=$NODE_VERSION"
echo "[docker-build] repo: $REPO_ROOT"

# Mount the repo read-only and copy it into a writable workdir inside the
# container so the host's darwin-arm64 node_modules don't bleed in. The
# container does its own `bun install` against the lockfile.
docker run --rm --platform "$PLATFORM" \
  -v "$REPO_ROOT:/host:ro" \
  -e TARGET="$TARGET" \
  -e NODE_ARCH="$NODE_ARCH" \
  -e NODE_VERSION="$NODE_VERSION" \
  -e RELAY_URL="${RELAY_URL:-https://relay.superset.sh}" \
  -e SUPERSET_API_URL="${SUPERSET_API_URL:-https://api.superset.sh}" \
  -e SUPERSET_WEB_URL="${SUPERSET_WEB_URL:-https://app.superset.sh}" \
  "oven/bun:${BUN_VERSION}" bash -euxc '
    apt-get update -qq
    apt-get install -y --no-install-recommends \
      curl python3 make g++ ca-certificates xz-utils rsync >/dev/null

    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
      | tar -xJ -C /usr/local --strip-components=1
    node --version
    bun --version

    rsync -a --exclude=node_modules --exclude=dist --exclude=.next /host/ /work/
    cd /work

    # Mirrors `.github/workflows/build-cli.yml` Linux install step.
    # Bun occasionally hits transient integrity-check failures on cold caches
    # in Docker, retry once before giving up.
    bun install --frozen --ignore-scripts || \
      (rm -rf ~/.bun/install/cache && bun install --frozen --ignore-scripts)
    PTY_DIR=$(ls -d node_modules/.bun/node-pty@*/node_modules/node-pty)
    (cd "$PTY_DIR" && npx --yes node-gyp rebuild)
    npm rebuild @parcel/watcher

    cd packages/cli
    bun run build:dist --target="$TARGET"

    DIST="$(pwd)/dist/superset-${TARGET}"
    "$DIST/bin/superset" --version
    "$DIST/bin/superset" --help | head -5
    "$DIST/lib/node" --version
    test -f "$DIST/lib/host-service.js" || (echo "missing host-service.js" >&2; exit 1)
    test -f "$DIST/lib/pty-daemon.js" || (echo "missing pty-daemon.js" >&2; exit 1)
    # Run from /tmp so Node module resolution does not walk up into the
    # repo and leak into a non-bundled node-pty (host-tree shadowing).
    cd /tmp
    NODE_PATH="$DIST/lib/node_modules" "$DIST/lib/node" -e "
      for (const m of [\"better-sqlite3\", \"node-pty\", \"@parcel/watcher\", \"libsql\"]) {
        require(m);
        console.log(m, \"OK\");
      }
    "
    NODE_PATH="$DIST/lib/node_modules" DIST="$DIST" "$DIST/lib/node" -e "
      const resolved = require.resolve(\"node-pty/lib/unixTerminal\");
      if (!resolved.startsWith(process.env.DIST)) {
        console.error(\"node-pty leaked from non-bundled tree:\", resolved);
        process.exit(1);
      }
      const pty = require(\"node-pty\");
      const term = pty.spawn(\"/bin/sh\", [\"-c\", \"echo SPAWN_OK\"], {
        name: \"xterm\", cols: 80, rows: 24,
        cwd: process.env.HOME || \"/\", env: process.env,
      });
      let got = \"\";
      let exited = null;
      const check = () => {
        if (got.includes(\"SPAWN_OK\") && exited && exited.exitCode === 0) {
          console.log(\"pty spawn OK\"); process.exit(0);
        }
        console.error(\"pty spawn FAIL exit=\" + (exited && exited.exitCode) + \" got=\" + JSON.stringify(got));
        process.exit(1);
      };
      term.onData((d) => { got += d.toString(); });
      // onExit can fire before the final onData chunk is delivered (SIGCHLD
      // and EOF on the pty master are independent events). Defer the
      // assertion one tick so any in-flight onData callback runs first.
      term.onExit((e) => { exited = e; setTimeout(check, 100); });
      setTimeout(() => { console.error(\"pty spawn timeout\"); process.exit(1); }, 5000);
    "
    echo "[docker-build] tarball: $(ls -la "$DIST.tar.gz")"
  '
