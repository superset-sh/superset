#!/usr/bin/env bash
#
# End-to-end test for the update supervisor without needing a real GitHub
# release. Builds the supervisor, stubs `superset` + `superset-host`,
# spawns a fake "old daemon," runs the supervisor, asserts the expected
# state transitions.
#
# Usage:
#   bun run packages/cli/scripts/test-supervisor.sh
#
# Or directly:
#   bash packages/cli/scripts/test-supervisor.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CLI_DIR="$REPO_ROOT/packages/cli"
TEST_HOME="$(mktemp -d -t supervisor-test-XXXXX)"
TEST_INSTALL_ROOT="$TEST_HOME/install"
TEST_SUPERSET_HOME="$TEST_HOME/.superset"
ORG_ID="test-org-$(date +%s)"
ORG_DIR="$TEST_SUPERSET_HOME/host/$ORG_ID"

# Detect platform for bun --target
case "$(uname -sm)" in
  "Darwin arm64") BUN_TARGET="bun-darwin-arm64" ;;
  "Darwin x86_64") BUN_TARGET="bun-darwin-x64" ;;
  "Linux x86_64") BUN_TARGET="bun-linux-x64" ;;
  "Linux aarch64") BUN_TARGET="bun-linux-arm64" ;;
  *) echo "Unsupported platform: $(uname -sm)"; exit 1 ;;
esac

KEEP_ON_FAIL="${KEEP_ON_FAIL:-1}"
cleanup() {
  local rc=$?
  if [ -n "${OLD_DAEMON_PID:-}" ] && kill -0 "$OLD_DAEMON_PID" 2>/dev/null; then
    kill "$OLD_DAEMON_PID" 2>/dev/null || true
  fi
  if [ -n "${FAKE_NEW_DAEMON_PID:-}" ] && kill -0 "$FAKE_NEW_DAEMON_PID" 2>/dev/null; then
    kill "$FAKE_NEW_DAEMON_PID" 2>/dev/null || true
  fi
  if [ "$rc" != "0" ] && [ "$KEEP_ON_FAIL" = "1" ]; then
    echo ""
    echo "Test failed. Keeping artifacts at: $TEST_HOME"
    echo "Set KEEP_ON_FAIL=0 to auto-clean."
  else
    rm -rf "$TEST_HOME"
  fi
}
trap cleanup EXIT

step() { printf "\n\033[1m▸ %s\033[0m\n" "$*"; }
ok() { printf "  \033[32m✓\033[0m %s\n" "$*"; }
fail() { printf "  \033[31m✗ FAIL:\033[0m %s\n" "$*"; exit 1; }

step "Building supervisor binary ($BUN_TARGET)"
mkdir -p "$TEST_INSTALL_ROOT/bin"
cd "$CLI_DIR"
bun build \
  --compile \
  --target="$BUN_TARGET" \
  --outfile "$TEST_INSTALL_ROOT/bin/superset-host-supervisor" \
  src/supervisor/main.ts >/dev/null
ok "supervisor built at $TEST_INSTALL_ROOT/bin/superset-host-supervisor"

step "Writing stub binaries"
mkdir -p "$ORG_DIR"

# Use a quoted heredoc so $-substitutions defer to stub-run time. We
# inject the test paths via sed to avoid mixing literal/dynamic in one
# heredoc.
cat > "$TEST_INSTALL_ROOT/bin/superset" <<'STUB'
#!/usr/bin/env bash
# Stub superset binary. Honors:
#   superset update [--version X]   → write a marker, exit 0
#   superset start --daemon         → write a fresh manifest with the new
#                                     version + spawn a long-lived child so
#                                     the supervisor's PID-alive check passes
echo "[stub superset] $@" >> "__TEST_HOME__/superset-stub.log"
case "$1" in
  update)
    touch "__TEST_HOME__/update-was-run"
    if [ "$2" = "--version" ] && [ -n "$3" ]; then
      echo "$3" > "__TEST_HOME__/installed-version"
    else
      echo "latest-stub" > "__TEST_HOME__/installed-version"
    fi
    exit 0
    ;;
  start)
    INSTALLED_VERSION=$(cat "__TEST_HOME__/installed-version" 2>/dev/null || echo unknown)
    nohup sleep 60 >/dev/null 2>&1 &
    NEW_PID=$!
    disown $NEW_PID 2>/dev/null || true
    NOW_MS=$(($(date +%s) * 1000))
    cat > "__ORG_DIR__/manifest.json" <<MANIFEST
{"pid":$NEW_PID,"endpoint":"http://127.0.0.1:9999","authToken":"fake","startedAt":$NOW_MS,"organizationId":"__ORG_ID__","version":"$INSTALLED_VERSION"}
MANIFEST
    echo "$NEW_PID" > "__TEST_HOME__/new-daemon-pid"
    exit 0
    ;;
esac
exit 1
STUB
# Substitute test-specific paths (no $-interpolation gotchas)
sed -i.bak \
  -e "s|__TEST_HOME__|$TEST_HOME|g" \
  -e "s|__ORG_DIR__|$ORG_DIR|g" \
  -e "s|__ORG_ID__|$ORG_ID|g" \
  "$TEST_INSTALL_ROOT/bin/superset"
rm "$TEST_INSTALL_ROOT/bin/superset.bak"
chmod +x "$TEST_INSTALL_ROOT/bin/superset"
ok "stub superset written"

step "Spawning fake old daemon"
# A trapped sleep that exits cleanly on SIGTERM — mirrors real daemon
# behavior of "I get SIGTERM → I exit."
(
  trap 'exit 0' TERM
  while sleep 1; do :; done
) &
OLD_DAEMON_PID=$!
disown $OLD_DAEMON_PID 2>/dev/null || true
sleep 0.2
if ! kill -0 "$OLD_DAEMON_PID" 2>/dev/null; then
  fail "fake old daemon didn't start"
fi
ok "old daemon pid=$OLD_DAEMON_PID"

# Pre-create a stale manifest pointing at the old daemon, so pollNewDaemon
# can detect the manifest has been refreshed.
cat > "$ORG_DIR/manifest.json" <<MANIFEST
{"pid":$OLD_DAEMON_PID,"endpoint":"http://127.0.0.1:1111","authToken":"fake","startedAt":1000,"organizationId":"$ORG_ID","version":"0.2.7"}
MANIFEST

step "Running supervisor"
SUPERSET_HOME_DIR="$TEST_SUPERSET_HOME" \
SUPERSET_INSTALL_ROOT="$TEST_INSTALL_ROOT" \
SUPERSET_UPDATE_ORG_ID="$ORG_ID" \
SUPERSET_UPDATE_OLD_PID="$OLD_DAEMON_PID" \
SUPERSET_UPDATE_TARGET_VERSION="0.2.8" \
PATH="$PATH" \
HOME="$HOME" \
"$TEST_INSTALL_ROOT/bin/superset-host-supervisor" || {
  echo "Supervisor exited non-zero. Log:"
  cat "$ORG_DIR/update.log" 2>/dev/null || echo "(no log)"
  fail "supervisor failed"
}
ok "supervisor exited 0"

step "Assertions"

if kill -0 "$OLD_DAEMON_PID" 2>/dev/null; then
  fail "old daemon is still alive"
fi
ok "old daemon was killed"

[ -f "$TEST_HOME/update-was-run" ] || fail "stub superset update was not invoked"
ok "superset update ran"

INSTALLED=$(cat "$TEST_HOME/installed-version" 2>/dev/null || echo "")
[ "$INSTALLED" = "0.2.8" ] || fail "installed version was '$INSTALLED', expected 0.2.8"
ok "stub installed correct version (0.2.8)"

[ -f "$ORG_DIR/update.log" ] || fail "update.log not written"
ok "update.log written"

if grep -q "supervisor done" "$ORG_DIR/update.log"; then
  ok "log shows supervisor completed"
else
  fail "log doesn't show 'supervisor done':\n$(cat "$ORG_DIR/update.log")"
fi

[ -f "$ORG_DIR/last-update.json" ] || fail "last-update.json not written"
RESULT=$(cat "$ORG_DIR/last-update.json")
case "$RESULT" in
  *'"succeeded":true'*) ok "last-update.json shows succeeded: true" ;;
  *) fail "last-update.json shows wrong outcome: $RESULT" ;;
esac
case "$RESULT" in
  *'"finalVersion":"0.2.8"'*) ok "last-update.json captured finalVersion=0.2.8" ;;
  *) fail "last-update.json missing or wrong finalVersion: $RESULT" ;;
esac

[ ! -f "$ORG_DIR/update.lock" ] || fail "update.lock was not cleaned up"
ok "update.lock cleared"

NEW_DAEMON_PID=$(cat "$TEST_HOME/new-daemon-pid" 2>/dev/null || echo "")
if [ -n "$NEW_DAEMON_PID" ] && kill -0 "$NEW_DAEMON_PID" 2>/dev/null; then
  ok "new daemon pid=$NEW_DAEMON_PID is alive"
  FAKE_NEW_DAEMON_PID="$NEW_DAEMON_PID"  # for cleanup
fi

step "Failure mode: bad version"
# Reset state and run again with a target that will make the stub fail
mkdir -p "$ORG_DIR"
rm -f "$ORG_DIR/last-update.json" "$ORG_DIR/update.log" "$TEST_HOME/update-was-run"

# Make the stub's `update` command reject one specific version
cat > "$TEST_INSTALL_ROOT/bin/superset" <<EOF
#!/usr/bin/env bash
case "\$1" in
  update)
    if [ "\$3" = "99.99.99" ]; then
      echo "stub: download failed (404)" >&2
      exit 1
    fi
    touch "$TEST_HOME/update-was-run"
    exit 0
    ;;
  start)
    exit 0
    ;;
esac
exit 1
EOF
chmod +x "$TEST_INSTALL_ROOT/bin/superset"

# Spawn a new fake daemon
(
  trap 'exit 0' TERM
  while sleep 1; do :; done
) &
OLD_DAEMON_PID=$!
disown $OLD_DAEMON_PID 2>/dev/null || true
sleep 0.2

set +e
SUPERSET_HOME_DIR="$TEST_SUPERSET_HOME" \
SUPERSET_INSTALL_ROOT="$TEST_INSTALL_ROOT" \
SUPERSET_UPDATE_ORG_ID="$ORG_ID" \
SUPERSET_UPDATE_OLD_PID="$OLD_DAEMON_PID" \
SUPERSET_UPDATE_TARGET_VERSION="99.99.99" \
PATH="$PATH" \
HOME="$HOME" \
"$TEST_INSTALL_ROOT/bin/superset-host-supervisor"
SUPERVISOR_EXIT=$?
set -e

[ "$SUPERVISOR_EXIT" = "1" ] || fail "supervisor should have exited 1 on bad version, got $SUPERVISOR_EXIT"
ok "supervisor exited 1 on bad version"

[ -f "$ORG_DIR/last-update.json" ] || fail "last-update.json not written on failure"
RESULT=$(cat "$ORG_DIR/last-update.json")
case "$RESULT" in
  *'"succeeded":false'*) ok "last-update.json shows succeeded: false" ;;
  *) fail "last-update.json shows wrong outcome: $RESULT" ;;
esac
case "$RESULT" in
  *'"error":'*) ok "last-update.json captured error message" ;;
  *) fail "last-update.json missing error: $RESULT" ;;
esac

[ ! -f "$ORG_DIR/update.lock" ] || fail "update.lock was not cleaned up after failure"
ok "update.lock cleared even on failure"

printf "\n\033[1;32mAll assertions passed.\033[0m\n"
