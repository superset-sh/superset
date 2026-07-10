#!/usr/bin/env bash
#
# Smoke-tests a built CLI distribution. Single source of truth shared by
# CI (.github/workflows/build-cli.yml) and the local Docker reproduction
# (build-dist-linux-docker.sh) so the two can't drift.
#
# Usage: smoke-test.sh <dist-dir> <target>
#   <dist-dir>  extracted distribution root (contains bin/, lib/, share/)
#   <target>    darwin-arm64 | linux-x64 | linux-arm64
#
# The decisive check is "boot the host service": a missing or unshippable
# module (@mastra/core, @xterm/headless, anything reached via createRequire)
# crashes the boot, so reaching a healthy listening state proves the whole
# host-service module graph is satisfiable. The require() probes above it
# only load individual native addons — they never load host-service.js.
set -euo pipefail

DIST="$(cd "${1:?usage: smoke-test.sh <dist-dir> <target>}" && pwd)"
TARGET="${2:?usage: smoke-test.sh <dist-dir> <target>}"
echo "[smoke] dist=$DIST target=$TARGET"

"$DIST/bin/superset" --version
"$DIST/bin/superset" --help | head -5
"$DIST/lib/node" --version
test -f "$DIST/lib/host-service.js" || { echo "[smoke] missing host-service.js" >&2; exit 1; }
test -f "$DIST/lib/pty-daemon.js" || { echo "[smoke] missing pty-daemon.js" >&2; exit 1; }

if [[ "$TARGET" == darwin-* ]]; then
	HELPER="$DIST/lib/node_modules/node-pty/prebuilds/darwin-${TARGET#darwin-}/spawn-helper"
	test -x "$HELPER" || { echo "[smoke] spawn-helper not executable: $HELPER" >&2; exit 1; }
fi

# Native addon require() probes. Run from /tmp so Node's module resolution
# doesn't walk up into a host repo's node_modules and shadow the bundle.
( cd /tmp && NODE_PATH="$DIST/lib/node_modules" "$DIST/lib/node" -e '
	for (const m of ["better-sqlite3", "node-pty", "@parcel/watcher", "libsql"]) {
		require(m);
		console.log("[smoke]", m, "OK");
	}
' )

# node-pty must resolve from the bundled tree (not a leaked host copy), and a
# real PTY spawn must work against the bundled Node + prebuild.
( cd /tmp && NODE_PATH="$DIST/lib/node_modules" DIST="$DIST" "$DIST/lib/node" -e '
	const resolved = require.resolve("node-pty/lib/unixTerminal");
	if (!resolved.startsWith(process.env.DIST)) {
		console.error("[smoke] node-pty leaked from non-bundled tree:", resolved);
		process.exit(1);
	}
	const pty = require("node-pty");
	const term = pty.spawn("/bin/sh", ["-c", "echo SPAWN_OK"], {
		name: "xterm", cols: 80, rows: 24,
		cwd: process.cwd(), env: process.env,
	});
	let got = "";
	let exited = null;
	const check = () => {
		if (got.includes("SPAWN_OK") && exited && exited.exitCode === 0) {
			console.log("[smoke] pty spawn OK"); process.exit(0);
		}
		console.error("[smoke] pty spawn FAIL exit=" + (exited && exited.exitCode) + " got=" + JSON.stringify(got));
		process.exit(1);
	};
	term.onData((d) => { got += d.toString(); });
	term.onExit((e) => { exited = e; setTimeout(check, 100); });
	setTimeout(() => { console.error("[smoke] pty spawn timeout"); process.exit(1); }, 5000);
' )

# Boot the host service. RELAY_URL is omitted (no tunnel); a throwaway org,
# token, secret and sqlite DB keep it fully isolated. Reaching health.check
# means host-service.js and its entire module graph loaded.
echo "[smoke] booting host service"
HSDIR="$(mktemp -d)"
HSPID=""
cleanup_host() {
	if [[ -n "$HSPID" ]]; then
		kill "$HSPID" 2>/dev/null || true
		wait "$HSPID" 2>/dev/null || true
	fi
	pkill -f "$DIST/lib/pty-daemon" 2>/dev/null || true
	rm -rf "$HSDIR"
}
trap cleanup_host EXIT

HSORG="00000000-0000-4000-8000-0000000000aa"
HSPORT="$("$DIST/lib/node" -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"

env ORGANIZATION_ID="$HSORG" \
	AUTH_TOKEN="smoke-test-token" \
	SUPERSET_API_URL="https://api.superset.sh" \
	PORT="$HSPORT" HOST_SERVICE_PORT="$HSPORT" \
	HOST_SERVICE_SECRET="smoke-test-secret" \
	HOST_DB_PATH="$HSDIR/host.db" \
	HOST_MIGRATIONS_FOLDER="$DIST/share/migrations" \
		"$DIST/bin/superset-host" > "$HSDIR/host.log" 2>&1 &
HSPID=$!

healthy=0
for _ in $(seq 1 120); do
	if curl -fsS -m 2 "http://127.0.0.1:$HSPORT/trpc/health.check" >/dev/null 2>&1; then
		healthy=1
		break
	fi
	kill -0 "$HSPID" 2>/dev/null || break
	sleep 0.5
done

if [[ "$healthy" != 1 ]]; then
	echo "[smoke] FAIL — host service never reached a healthy listening state" >&2
	echo "----- host.log -----" >&2
	cat "$HSDIR/host.log" >&2
	exit 1
fi
echo "[smoke] host service boot OK"
echo "[smoke] all checks passed"
