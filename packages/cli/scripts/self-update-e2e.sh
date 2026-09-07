#!/usr/bin/env bash
#
# End-to-end test of the host-service self-update (system.update) against a
# built CLI distribution. Two scenarios, each on its own copy of the dist:
#
#   rollback  The successor cannot come up (a decoy holds the port and answers
#             503), so the updater must restore the previous tree, leave a
#             "rolled-back" marker and exit non-zero.
#   success   The successor answers; the old process exits, the manifest pid
#             points at the successor, the backup is gone, and the running
#             build is the requested release (downloaded from GitHub).
#
# Neither scenario touches the cloud or the relay: RELAY_URL is unset so the
# host never registers, HOME is a scratch dir so agent provisioning never
# writes to the real profile, and the loopback PSK is the only auth used.
#
# Usage: self-update-e2e.sh <dist-dir> <target-version>
#   <dist-dir>        extracted distribution root (bin/, lib/, share/)
#   <target-version>  a published cli-v<version> release, e.g. 1.27.0
set -euo pipefail

DIST="$(cd "${1:?usage: self-update-e2e.sh <dist-dir> <target-version>}" && pwd)"
TARGET="${2:?usage: self-update-e2e.sh <dist-dir> <target-version>}"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/superset-self-update-e2e.XXXXXX")"
TEST_HOME="$SCRATCH/home"
mkdir -p "$TEST_HOME"
ORG="00000000-0000-4000-8000-0000000000aa"
SECRET="e2e-secret"
HSPID=""
DECOY=""

log() { echo "[self-update-e2e] $*" >&2; }
fail() { log "FAIL: $*"; exit 1; }

cleanup() {
  [[ -n "$DECOY" ]] && kill "$DECOY" 2>/dev/null || true
  pkill -f "$SCRATCH" 2>/dev/null || true
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

new_port() {
  "$DIST/lib/node" -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}

# boot_host <root> <state-dir> <port> <logfile>
boot_host() {
  local root="$1" state="$2" port="$3" logfile="$4"
  mkdir -p "$state"
  env -i \
    PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    HOME="$TEST_HOME" SHELL=/bin/bash \
    ORGANIZATION_ID="$ORG" AUTH_TOKEN="e2e-token" \
    SUPERSET_API_URL="https://api.superset.sh" \
    PORT="$port" HOST_SERVICE_PORT="$port" HOST_SERVICE_SECRET="$SECRET" \
    HOST_DB_PATH="$state/host.db" \
    HOST_MIGRATIONS_FOLDER="$root/share/migrations" \
    SUPERSET_HOST_INSTALL_SOURCE=cli \
    SUPERSET_HOME_DIR="$TEST_HOME/.superset" \
    "$root/bin/superset-host" >"$logfile" 2>&1 &
  HSPID=$!
  # What `superset start --daemon` would have written.
  cat >"$state/manifest.json" <<JSON
{"pid":$HSPID,"endpoint":"http://127.0.0.1:$port","authToken":"$SECRET","startedAt":$(date +%s)000,"organizationId":"$ORG"}
JSON
}

health() { curl -fsS -m 2 -H "Authorization: Bearer $SECRET" "http://127.0.0.1:$1/trpc/health.check" 2>/dev/null; }
json_field() { "$DIST/lib/node" -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);const v=process.argv[1].split(".").reduce((o,k)=>o?.[k],j);console.log(v===undefined?"":typeof v==="object"?JSON.stringify(v):v)})' "$1"; }

await_healthy() {
  for _ in $(seq 1 120); do
    if health "$1" >/dev/null; then return 0; fi
    sleep 0.5
  done
  return 1
}

start_update() {
  curl -fsS -m 10 -X POST -H "Authorization: Bearer $SECRET" -H "content-type: application/json" \
    "http://127.0.0.1:$1/trpc/system.update" -d "{\"json\":{\"version\":\"$TARGET\",\"force\":true}}"
}

update_status() { curl -fsS -m 2 -H "Authorization: Bearer $SECRET" "http://127.0.0.1:$1/trpc/system.updateStatus" 2>/dev/null; }

# Wait for the old process to stop answering updateStatus (it closed its
# listener) or to report a failure before the swap.
await_download_done() {
  local port="$1"
  for _ in $(seq 1 600); do
    local body
    if ! body="$(update_status "$port")"; then return 0; fi
    local phase; phase="$(printf '%s' "$body" | json_field result.data.json.phase)"
    if [[ "$phase" == "failed" ]]; then
      fail "update failed before the swap: $(printf '%s' "$body" | json_field result.data.json.error)"
    fi
    sleep 1
  done
  fail "download never finished"
}

hash_tree() { (cd "$1" && find lib bin -type f | sort | xargs shasum | shasum | cut -c1-16); }

# ── Scenario 1: rollback ────────────────────────────────────────────────
log "=== scenario: rollback ==="
ROOT_A="$SCRATCH/a/superset"; mkdir -p "$SCRATCH/a"; cp -R "$DIST" "$ROOT_A"
STATE_A="$SCRATCH/a/state"; PORT_A="$(new_port)"
ORIGINAL_HASH="$(hash_tree "$ROOT_A")"
boot_host "$ROOT_A" "$STATE_A" "$PORT_A" "$SCRATCH/a/host.log"
await_healthy "$PORT_A" || { cat "$SCRATCH/a/host.log" >&2; fail "host A never healthy"; }
log "host A healthy on $PORT_A (pid $HSPID), version $(health "$PORT_A" | json_field result.data.json.version), installSource $(health "$PORT_A" | json_field result.data.json.installSource)"

# The decoy grabs the port the moment the old process releases it, so the
# successor can start but never bind; the updater sees only 503s.
"$DIST/lib/node" -e '
  const port = Number(process.argv[1]);
  const http = require("http");
  const tryListen = () => {
    const s = http.createServer((_, res) => { res.statusCode = 503; res.end("decoy"); });
    s.on("error", () => setTimeout(tryListen, 50));
    s.listen(port, "127.0.0.1");
  };
  tryListen();
  setTimeout(() => process.exit(0), 400_000);
' "$PORT_A" &
DECOY=$!

log "starting update (expect rollback)…"
start_update "$PORT_A" | json_field result.data.json.phase | grep -q downloading || fail "update did not start"
await_download_done "$PORT_A"
log "old listener closed; waiting for the updater to give up on the successor (up to ~3 min)"
for _ in $(seq 1 240); do
  kill -0 "$HSPID" 2>/dev/null || break
  sleep 1
done
kill -0 "$HSPID" 2>/dev/null && fail "updater process still alive after rollback window"
kill "$DECOY" 2>/dev/null || true; DECOY=""
grep -q "rolling back" "$SCRATCH/a/host.log" || { tail -30 "$SCRATCH/a/host.log" >&2; fail "no rollback logged"; }
[[ "$(json_field outcome <"$STATE_A/host-update.json")" == "rolled-back" ]] || fail "marker is not rolled-back: $(cat "$STATE_A/host-update.json")"
[[ -e "$ROOT_A.bak" ]] && fail "backup left behind after rollback"
[[ -e "$ROOT_A.failed" ]] && fail "failed tree left behind after rollback"
[[ "$(hash_tree "$ROOT_A")" == "$ORIGINAL_HASH" ]] || fail "install root was not restored to the original tree"
pkill -f "$ROOT_A" 2>/dev/null || true
log "rollback OK: tree restored, marker rolled-back"

# ── Scenario 2: success ─────────────────────────────────────────────────
log "=== scenario: success ==="
ROOT_B="$SCRATCH/b/superset"; mkdir -p "$SCRATCH/b"; cp -R "$DIST" "$ROOT_B"
STATE_B="$SCRATCH/b/state"; PORT_B="$(new_port)"
boot_host "$ROOT_B" "$STATE_B" "$PORT_B" "$SCRATCH/b/host.log"
await_healthy "$PORT_B" || { cat "$SCRATCH/b/host.log" >&2; fail "host B never healthy"; }
OLD_PID="$HSPID"
BEFORE="$(health "$PORT_B")"
log "host B healthy on $PORT_B (pid $OLD_PID), version $(printf '%s' "$BEFORE" | json_field result.data.json.version), installSource $(printf '%s' "$BEFORE" | json_field result.data.json.installSource)"

log "starting update to ${TARGET}…"
start_update "$PORT_B" | json_field result.data.json.phase | grep -q downloading || fail "update did not start"
await_download_done "$PORT_B"
log "old listener closed; waiting for the successor"
await_healthy "$PORT_B" || { tail -40 "$SCRATCH/b/host.log" >&2; fail "successor never healthy"; }
AFTER="$(health "$PORT_B")"
NEW_VERSION="$(printf '%s' "$AFTER" | json_field result.data.json.version)"
[[ "$NEW_VERSION" == "$TARGET" ]] || fail "successor reports $NEW_VERSION, wanted $TARGET"
for _ in $(seq 1 60); do kill -0 "$OLD_PID" 2>/dev/null || break; sleep 0.5; done
kill -0 "$OLD_PID" 2>/dev/null && fail "old process $OLD_PID still alive"
[[ "$(json_field outcome <"$STATE_B/host-update.json")" == "updated" ]] || fail "marker is not updated: $(cat "$STATE_B/host-update.json")"
MANIFEST_PID="$(json_field pid <"$STATE_B/manifest.json")"
[[ "$MANIFEST_PID" != "$OLD_PID" ]] || fail "manifest still points at the old pid"
kill -0 "$MANIFEST_PID" 2>/dev/null || fail "manifest pid $MANIFEST_PID is not alive"
[[ "$(json_field authToken <"$STATE_B/manifest.json")" == "$SECRET" ]] || fail "manifest lost its token"
[[ -e "$ROOT_B.bak" ]] && fail "backup left behind after a successful update"
"$ROOT_B/bin/superset" --version | grep -q "$TARGET" || fail "bin/superset is not $TARGET"
log "success OK: $(printf '%s' "$BEFORE" | json_field result.data.json.version) → $NEW_VERSION, manifest pid $MANIFEST_PID, backup removed"
log "successor health: $AFTER"
kill "$MANIFEST_PID" 2>/dev/null || true
log "ALL PASSED"
