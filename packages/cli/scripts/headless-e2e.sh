#!/usr/bin/env bash
#
# Headless-host end-to-end test for a built CLI distribution (Linux only).
# Simulates the #6254 deployment class — a systemd/CLI-launched host on a
# machine that never ran the desktop app — and verifies the full agent-hook
# chain the desktop otherwise provides:
#
#   1. First boot provisions ~/.superset (notify.sh, bin wrappers, zsh/bash
#      bootstrap) and every agent's managed hook config from the tarball's
#      lib/agent-templates — with NO SUPERSET_HOME_DIR in the environment,
#      so the ~/.superset fallback is what's under test.
#   2. The provisioned notify.sh delivers a lifecycle event to
#      notifications.hook and a row lands in terminal_agent_bindings.
#      Unknown terminal ids are accepted (200) but recorded nowhere.
#   3. The login-shell env merge picks up PATH entries only a login shell
#      exports (the host is launched with a stripped systemd-like PATH),
#      while runtime-altering vars like NODE_ENV are never imported.
#   4. A restart is idempotent: no file rewrites, no duplicated hook entries.
#   5. Real zsh/bash login flows through the provisioned wrappers put
#      ~/.superset/bin on PATH and register the shell-ready marker.
#   6. SUPERSET_DISABLED_AGENT_HOOKS and the shared agent-hooks.json mirror
#      tear down (and re-enabling restores) per-agent hook configs.
#   7. Two hosts provisioning concurrently leave valid, deduplicated configs.
#
# DESTRUCTIVE: wipes $HOME/.superset, ~/.claude, ~/.agents, ~/.codex,
# ~/.gemini and appends to the login-shell profile. Only runs when
# SUPERSET_HEADLESS_E2E=1 — set by build-dist-linux-docker.sh (throwaway
# container) and by the Linux jobs in .github/workflows/build-cli.yml
# (ephemeral runners), both after the smoke test.
#
# Usage: headless-e2e.sh <dist-dir>
#   <dist-dir>  extracted distribution root (contains bin/, lib/, share/)
set -euxo pipefail

DIST="$(cd "${1:?usage: headless-e2e.sh <dist-dir>}" && pwd)"

if [[ "${SUPERSET_HEADLESS_E2E:-}" != "1" ]]; then
  echo "[e2e] refusing to run: wipes \$HOME agent configs. Set SUPERSET_HEADLESS_E2E=1 inside a disposable container." >&2
  exit 1
fi
if [[ "$(uname -s)" != "Linux" ]]; then
  echo "[e2e] linux only (stat -c, systemd-like env simulation)" >&2
  exit 1
fi

# ── Fixture: a fresh home with login-shell-only env additions ────────────
rm -rf "$HOME/.superset" "$HOME/.claude" "$HOME/.agents" "$HOME/.codex" "$HOME/.gemini"
FAKE_TOOLS_DIR="${TMPDIR:-/tmp}/superset-e2e-fake-tools/bin"
mkdir -p "$FAKE_TOOLS_DIR"
# bash login shells read .bash_profile and ignore .profile when both exist.
PROFILE="$HOME/.profile"
[[ -f "$HOME/.bash_profile" ]] && PROFILE="$HOME/.bash_profile"
grep -q superset-e2e-fake-tools "$PROFILE" 2>/dev/null || \
  echo "export PATH=\"$FAKE_TOOLS_DIR:\$PATH\"" >> "$PROFILE"
# Runtime-altering var a dotfile might export; the merge must never import it
# (it would flip the host into dev-mode shutdown, killing PTYs on restart).
grep -q "NODE_ENV=development" "$PROFILE" 2>/dev/null || \
  echo 'export NODE_ENV=development' >> "$PROFILE"

HSDIR="$(mktemp -d)"
HSPID=""
HSPID2=""

cleanup() {
  [[ -n "$HSPID" ]] && kill "$HSPID" 2>/dev/null || true
  [[ -n "$HSPID2" ]] && kill "$HSPID2" 2>/dev/null || true
  pkill -f "$DIST/lib/pty-daemon" 2>/dev/null || true
  rm -rf "$HSDIR"
}
trap cleanup EXIT

new_port() {
  "$DIST/lib/node" -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}

# boot_host <org> <db> <logfile> <port> [EXTRA=env ...]
# systemd-like environment: stripped PATH, no SUPERSET_HOME_DIR.
boot_host() {
  local org="$1" db="$2" log="$3" port="$4"
  shift 4
  env -i \
    PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    HOME="$HOME" \
    SHELL=/bin/bash \
    ORGANIZATION_ID="$org" \
    AUTH_TOKEN="e2e-token" \
    SUPERSET_API_URL="https://api.superset.sh" \
    PORT="$port" HOST_SERVICE_PORT="$port" \
    HOST_SERVICE_SECRET="e2e-secret" \
    HOST_DB_PATH="$db" \
    HOST_MIGRATIONS_FOLDER="$DIST/share/migrations" \
    "$@" \
    "$DIST/bin/superset-host" > "$log" 2>&1 &
  HSPID=$!
}

# await_healthy <logfile> <port>
await_healthy() {
  local ok=0
  for _ in $(seq 1 120); do
    if curl -fsS -m 2 "http://127.0.0.1:$2/trpc/health.check" >/dev/null 2>&1; then ok=1; break; fi
    kill -0 "$HSPID" 2>/dev/null || break
    sleep 0.5
  done
  if [[ "$ok" != 1 ]]; then
    echo "[e2e] FAIL host never healthy" >&2
    cat "$1" >&2
    exit 1
  fi
}

stop_host() {
  kill "$HSPID" 2>/dev/null || true
  wait "$HSPID" 2>/dev/null || true
  HSPID=""
}

claude_stop_hook_count() {
  "$DIST/lib/node" -e '
    try {
      const hooks = JSON.parse(require("fs").readFileSync(`${process.env.HOME}/.claude/settings.json`, "utf8")).hooks ?? {};
      console.log((hooks.Stop ?? []).length);
    } catch { console.log(0); }
  '
}

ORG="00000000-0000-4000-8000-0000000000bb"
PORT="$(new_port)"
boot_host "$ORG" "$HSDIR/host.db" "$HSDIR/host.log" "$PORT"
await_healthy "$HSDIR/host.log" "$PORT"
# The login-shell probe may take up to 8s after the server is listening; wait
# for its merge log line (asserted again below) instead of a fixed sleep.
for _ in $(seq 1 30); do
  grep -q "login-shell PATH entries into process env" "$HSDIR/host.log" && break
  sleep 0.5
done
sleep 1  # managed-skills provisioning is async fire-and-forget

echo "[e2e] === assert: provisioning artifacts ==="
test -x "$HOME/.superset/hooks/notify.sh"
grep -q "Superset agent notification hook" "$HOME/.superset/hooks/notify.sh"
test -f "$HOME/.superset/zsh/.zshrc"
grep -q "133;A" "$HOME/.superset/zsh/.zlogin"
test -f "$HOME/.superset/bash/rcfile"
WRAPPERS=$(ls "$HOME/.superset/bin" | wc -l)
[[ "$WRAPPERS" -ge 12 ]] || { echo "[e2e] FAIL wrappers=$WRAPPERS"; exit 1; }

echo "[e2e] === assert: managed hook configs ==="
"$DIST/lib/node" -e '
  const s = require("fs").readFileSync(`${process.env.HOME}/.claude/settings.json`, "utf8");
  const hooks = JSON.parse(s).hooks;
  const want = ["SessionStart","SessionEnd","UserPromptSubmit","Stop","StopFailure","PostToolUse","PostToolUseFailure","PermissionRequest"];
  const missing = want.filter((k) => !(k in hooks));
  if (missing.length) { console.error("missing:", missing); process.exit(1); }
  const cmd = hooks.Stop[0].hooks[0].command;
  if (!cmd.includes("$SUPERSET_HOME_DIR/hooks/notify.sh")) { console.error("bad cmd:", cmd); process.exit(1); }
  console.log("[e2e] claude hook groups OK");
'
test -f "$HOME/.codex/hooks.json"
test -f "$HOME/.gemini/settings.json"

echo "[e2e] === assert: managed skills from bundled templates ==="
test -f "$HOME/.claude/skills/superset/skills/doctor/SKILL.md"
ls "$HOME/.agents/skills" | grep -q "superset-doctor"

echo "[e2e] === assert: login-shell PATH merge ==="
grep -q "login-shell PATH entries into process env" "$HSDIR/host.log"

echo "[e2e] === assert: real shell login flows through the wrappers ==="
BASH_PROBE=$(env -i HOME="$HOME" TERM=dumb PATH=/usr/bin:/bin \
  bash -c "source \"$HOME/.superset/bash/rcfile\"; echo \"PATH=\$PATH\"; declare -F __superset_prompt_mark")
echo "$BASH_PROBE" | grep -q "$HOME/.superset/bin"
echo "$BASH_PROBE" | grep -q "__superset_prompt_mark"
if command -v zsh >/dev/null 2>&1; then
  ZSH_PROBE=$(env -i HOME="$HOME" TERM=dumb PATH=/usr/bin:/bin \
    SUPERSET_ORIG_ZDOTDIR="$HOME" ZDOTDIR="$HOME/.superset/zsh" \
    zsh -ilc 'print -r -- "PATH=$PATH"; whence -w __superset_prompt_mark' 2>/dev/null)
  echo "$ZSH_PROBE" | grep -q "$HOME/.superset/bin"
  echo "$ZSH_PROBE" | grep -q "__superset_prompt_mark: function"
else
  echo "[e2e] zsh not installed — skipping zsh wrapper-chain check"
fi

echo "[e2e] === assert: notify.sh -> notifications.hook -> host DB ==="
# Seed a real workspace + terminal session; the hook deliberately ignores
# unknown terminal ids (it is unauthenticated), which we also assert below.
NODE_PATH="$DIST/lib/node_modules" HOST_DB="$HSDIR/host.db" "$DIST/lib/node" -e '
  const db = require("better-sqlite3")(process.env.HOST_DB);
  db.prepare("insert into workspaces (id, worktree_path, branch, type, created_at, updated_at) values (?,?,?,?,?,?)")
    .run("e2e-ws-1", "/tmp/e2e-ws", "main", "worktree", Date.now(), 0);
  db.prepare("insert into terminal_sessions (id, origin_workspace_id, status, created_at) values (?,?,?,?)")
    .run("e2e-terminal-1", "e2e-ws-1", "active", Date.now());
'

fire_hook() {
  echo '{"hook_event_name":"Stop","session_id":"e2e-session-1"}' | \
    env SUPERSET_TERMINAL_ID="$1" \
        SUPERSET_AGENT_ID="claude" \
        SUPERSET_DEBUG_HOOKS=1 \
        SUPERSET_HOST_AGENT_HOOK_URL="http://127.0.0.1:$PORT/trpc/notifications.hook" \
        bash "$HOME/.superset/hooks/notify.sh" 2>&1 || true
}

STATUS=$(fire_hook "e2e-unknown-terminal")
echo "$STATUS" | grep -q "host-service dispatched status=200"
STATUS=$(fire_hook "e2e-terminal-1")
echo "$STATUS"
echo "$STATUS" | grep -q "host-service dispatched status=200"

( cd /tmp && NODE_PATH="$DIST/lib/node_modules" HOST_DB="$HSDIR/host.db" "$DIST/lib/node" -e '
  const db = require("better-sqlite3")(process.env.HOST_DB);
  const rows = db.prepare("select terminal_id, agent_id, agent_session_id from terminal_agent_bindings").all();
  console.log("[e2e] terminal_agent_bindings:", JSON.stringify(rows));
  if (rows.length !== 1) { console.error("expected exactly 1 binding (unknown terminal must be ignored)"); process.exit(1); }
  if (!rows.some((r) => r.terminal_id === "e2e-terminal-1" && r.agent_id === "claude" && r.agent_session_id === "e2e-session-1")) process.exit(1);
' )

echo "[e2e] === assert: every agent's hook artifact delivers to the host ==="
# Per-agent matrix: dispatch through each agent's own registered command,
# hook script, or plugin (13 agents). Needs bun (bun:sqlite + TS plugin
# imports); both the docker image and CI runners have it.
if command -v bun >/dev/null 2>&1; then
  bun "$(dirname "$0")/agents-hook-matrix.ts" "$HOME" "$PORT" "$HSDIR/host.db"
else
  echo "[e2e] bun not available — skipping per-agent hook matrix"
fi

echo "[e2e] === assert: idempotent re-provisioning on restart ==="
stop_host
NOTIFY_MTIME1=$(stat -c %Y "$HOME/.superset/hooks/notify.sh")
PORT="$(new_port)"
boot_host "$ORG" "$HSDIR/host.db" "$HSDIR/host2.log" "$PORT"
await_healthy "$HSDIR/host2.log" "$PORT"
NOTIFY_MTIME2=$(stat -c %Y "$HOME/.superset/hooks/notify.sh")
[[ "$NOTIFY_MTIME1" == "$NOTIFY_MTIME2" ]] || { echo "[e2e] FAIL notify.sh rewritten on unchanged content"; exit 1; }
[[ "$(claude_stop_hook_count)" == "1" ]] || { echo "[e2e] FAIL duplicate hook entries after re-provision"; exit 1; }

echo "[e2e] === assert: NODE_ENV from dotfiles is never imported ==="
# The fixture .profile exports NODE_ENV=development. If the merge imported
# it, this SIGTERM would take the dev-mode shutdown path and log it.
stop_host
sleep 1
if grep -q "dev-mode" "$HSDIR/host.log" "$HSDIR/host2.log"; then
  echo "[e2e] FAIL host entered dev-mode from a dotfile NODE_ENV"; exit 1
fi

echo "[e2e] === assert: SUPERSET_DISABLED_AGENT_HOOKS tears down on boot ==="
PORT="$(new_port)"
boot_host "$ORG" "$HSDIR/host.db" "$HSDIR/host3.log" "$PORT" SUPERSET_DISABLED_AGENT_HOOKS=claude
await_healthy "$HSDIR/host3.log" "$PORT"
sleep 1
[[ "$(claude_stop_hook_count)" == "0" ]] || { echo "[e2e] FAIL claude hooks not torn down via env disable"; exit 1; }
test -f "$HOME/.gemini/settings.json"  # other agents untouched
stop_host

echo "[e2e] === assert: shared agent-hooks.json mirror is honored ==="
printf '{\n\t"disabledAgentIds": ["claude"]\n}\n' > "$HOME/.superset/agent-hooks.json"
PORT="$(new_port)"
boot_host "$ORG" "$HSDIR/host.db" "$HSDIR/host4.log" "$PORT"
await_healthy "$HSDIR/host4.log" "$PORT"
sleep 1
[[ "$(claude_stop_hook_count)" == "0" ]] || { echo "[e2e] FAIL claude hooks re-provisioned despite shared-file disable"; exit 1; }
stop_host

echo "[e2e] === assert: re-enabling restores the hooks ==="
rm -f "$HOME/.superset/agent-hooks.json"
PORT="$(new_port)"
boot_host "$ORG" "$HSDIR/host.db" "$HSDIR/host5.log" "$PORT"
await_healthy "$HSDIR/host5.log" "$PORT"
sleep 1
[[ "$(claude_stop_hook_count)" == "1" ]] || { echo "[e2e] FAIL claude hooks not restored after re-enable"; exit 1; }
stop_host

echo "[e2e] === assert: concurrent provisioners converge on valid configs ==="
rm -f "$HOME/.claude/settings.json"
PORT="$(new_port)"
PORT2="$(new_port)"
boot_host "00000000-0000-4000-8000-0000000000cc" "$HSDIR/host-c.db" "$HSDIR/host-c.log" "$PORT"
HSPID2=$HSPID
boot_host "00000000-0000-4000-8000-0000000000dd" "$HSDIR/host-d.db" "$HSDIR/host-d.log" "$PORT2"
await_healthy "$HSDIR/host-d.log" "$PORT2"
HSPID_D=$HSPID
HSPID=$HSPID2
await_healthy "$HSDIR/host-c.log" "$PORT"
sleep 1
"$DIST/lib/node" -e '
  const s = require("fs").readFileSync(`${process.env.HOME}/.claude/settings.json`, "utf8");
  const hooks = JSON.parse(s).hooks;   // throws on torn/invalid JSON
  if (hooks.Stop.length !== 1) { console.error("duplicated entries after concurrent provisioning:", hooks.Stop.length); process.exit(1); }
  console.log("[e2e] concurrent provisioning left valid, deduplicated config");
'
kill "$HSPID_D" 2>/dev/null || true
wait "$HSPID_D" 2>/dev/null || true
stop_host
HSPID2=""

echo "[e2e] ALL HEADLESS E2E CHECKS PASSED"
