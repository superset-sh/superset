#!/usr/bin/env bash
# Liveness for the review host. The failure that strands a reviewer is not a
# crash — systemd restarts those — but a live process the relay no longer routes
# to: the app shows "No projects on an online host" while every local signal is
# green.
#
# Asking host-service is useless for this. /trpc/health.check returns 200
# unconditionally, and the cloudRegistered flag in its body is written once at
# boot (packages/host-service/src/tunnel/connect.ts) and never updated. So ask
# the relay whether it can see us — the same authority host.list reads.
#
# Re-reads the token from config.json each pass, so a broken OAuth refresh trips
# this too rather than silently stranding the box when the session expires.
set -uo pipefail

CONFIG=/root/.superset/config.json
ORG="${REVIEW_ORG_ID:?}"
RELAY_URL="${RELAY_URL:-https://relay.superset.sh}"
HEALTH_SECRET="review-host-watchdog"
HOST_URL="http://127.0.0.1:48800"

# The workspace carrying acme-demo#1, which check.sh asserts a Claude session on.
RESIDENT_WORKSPACE_NAME="Fix input overflow handling"
CLAUDE_CONFIG=/root/.claude.json
HOST_DB="/root/.superset/host/$ORG/host.db"
# sha256 of the key suffix a session was last relaunched for. A hash, so the
# key itself is not written anywhere new.
APPROVED_KEY_STATE=/opt/review-host/.approved-key

relay_sees_us() {
  local host_id token
  host_id=$(curl -sf -m 5 -H "Authorization: Bearer $HEALTH_SECRET" \
    "$HOST_URL/trpc/host.info" 2>/dev/null \
    | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["data"]["json"]["hostId"])' 2>/dev/null)
  token=$(python3 -c "import json;print(json.load(open('$CONFIG'))['auth']['accessToken'])" 2>/dev/null)
  [ -n "$host_id" ] && [ -n "$token" ] || return 1
  curl -sf -m 10 -H "Authorization: Bearer $token" \
    "$RELAY_URL/presence?hostIds=$ORG:$host_id" 2>/dev/null \
    | python3 -c 'import json,sys;h=json.load(sys.stdin)["hosts"];sys.exit(0 if any(v.get("online") for v in h.values()) else 1)' 2>/dev/null
}

# The pull-request chip renders only while a terminal is open
# (`showComposer = activeTerminalId !== null`), so a box with no session shows a
# reviewer no pull request anywhere — the diff the store listing sells is then
# reachable only by guessing. Every restart takes the session with it: an
# update.sh bump, the restart below, a reboot. Nothing put it back, so a release
# landing at 3am left the box chipless until someone read a check.sh FAIL up to
# six hours later. This is that restore, in the one place that already watches
# steady state continuously.
#
# Prints the terminal id of the live Claude session on the resident workspace.
# 0 = present (id on stdout), 1 = absent, 2 = could not tell. Only 1 acts: a
# probe that did not answer must not be read as "no session" or this spawns
# duplicates, which is its own check.sh failure.
resident_terminal_id() {
  local workspace_id="$1" sessions agents
  sessions=$(curl -sf -m 10 -G -H "Authorization: Bearer $HEALTH_SECRET" \
    --data-urlencode 'input={"json":{}}' "$HOST_URL/trpc/terminal.list" 2>/dev/null) || return 2
  agents=$(curl -sf -m 10 -G -H "Authorization: Bearer $HEALTH_SECRET" \
    --data-urlencode 'input={"json":{}}' "$HOST_URL/trpc/terminalAgents.list" 2>/dev/null) || return 2
  printf '%s\n---\n%s\n---\n%s' "$sessions" "$agents" "$workspace_id" | python3 -c '
import json, sys
raw = sys.stdin.read().split("\n---\n")
try:
    live = [t for t in json.loads(raw[0])["result"]["data"]["json"]["sessions"] if not t.get("exited")]
    agents = {a["terminalId"]: a.get("agentId") for a in json.loads(raw[1])["result"]["data"]["json"]}
except Exception:
    sys.exit(2)
workspace_id = raw[2].strip()
here = [t for t in live if t["workspaceId"] == workspace_id and agents.get(t["terminalId"]) == "claude"]
if not here:
    sys.exit(1)
print(here[0]["terminalId"])
' 2>/dev/null
}

resident_workspace_id() {
  curl -sf -m 10 -H "Authorization: Bearer $HEALTH_SECRET" \
    "$HOST_URL/trpc/workspace.list" 2>/dev/null \
    | python3 -c 'import json,sys
d = json.load(sys.stdin)["result"]["data"]["json"]
print(next((w["id"] for w in d if w.get("name") == sys.argv[1]), ""))' "$RESIDENT_WORKSPACE_NAME" 2>/dev/null
}

# Claude Code prompts once per custom key when ANTHROPIC_API_KEY is in the
# environment ("Detected a custom API key in your environment ... Do you want to
# use this API key?") and remembers the answer as the key's last 20 characters in
# customApiKeyResponses. The reviewer's box gets its key from the host agent
# config, so rotating that key leaves every new session sitting on that prompt
# with the agent unusable — check.sh counts sessions, not what the PTY shows, so
# it reports green throughout. This pre-seeds the same answer a human "Yes"
# writes. The key is read from the host database that already holds it and never
# written anywhere new; only a hash of its suffix is recorded.
#
# 10 = an approval was added and no session has been relaunched for this key yet,
# 0 = nothing to do, 1 = could not tell.
ensure_api_key_approved() {
  python3 - "$HOST_DB" "$CLAUDE_CONFIG" "$APPROVED_KEY_STATE" <<'PY_APPROVE'
import hashlib, json, os, sqlite3, sys, tempfile

db_path, config_path, state_path = sys.argv[1:4]


def read_key():
    if not os.path.exists(db_path):
        return None
    try:
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    except sqlite3.Error:
        return None
    try:
        rows = con.execute("select env_json from host_agent_configs").fetchall()
    except sqlite3.Error:
        return None
    finally:
        con.close()
    for (env_json,) in rows:
        try:
            env = json.loads(env_json) if env_json else {}
        except ValueError:
            continue
        if env.get("ANTHROPIC_API_KEY"):
            return env["ANTHROPIC_API_KEY"]
    return None


key = read_key()
if not key:
    # No custom key means no prompt to pre-answer.
    sys.exit(1)
suffix = key[-20:]
digest = hashlib.sha256(suffix.encode()).hexdigest()

try:
    with open(config_path) as fh:
        config = json.load(fh)
except (OSError, ValueError):
    sys.exit(1)

responses = config.setdefault("customApiKeyResponses", {})
approved = responses.setdefault("approved", [])
rejected = responses.setdefault("rejected", [])
changed = False
if suffix in rejected:
    rejected.remove(suffix)
    changed = True
if suffix not in approved:
    approved.append(suffix)
    changed = True

if changed:
    # Claude Code rewrites this file from its own in-memory copy, so write
    # atomically and expect to have to redo it; the state file below is what
    # keeps a rewrite from turning into a session-relaunch loop.
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(config_path) or ".")
    try:
        with os.fdopen(fd, "w") as fh:
            json.dump(config, fh, indent=2)
        os.chmod(tmp, 0o600)
        os.replace(tmp, config_path)
    except OSError:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        sys.exit(1)

previous = ""
if os.path.exists(state_path):
    try:
        with open(state_path) as fh:
            previous = fh.read().strip()
    except OSError:
        previous = ""
if previous != digest:
    try:
        with open(state_path, "w") as fh:
            fh.write(digest + "\n")
    except OSError:
        sys.exit(1)
    sys.exit(10)
sys.exit(0)
PY_APPROVE
}

# agents.run, not terminal.createSession: the latter gives a shell with no
# Claude avatar, which is not what the reviewer's first tap should land on.
restore_resident_session() {
  local workspace_id="$1"
  curl -sf -m 60 -X POST -H "Authorization: Bearer $HEALTH_SECRET" \
    -H "content-type: application/json" \
    --data "{\"json\":{\"workspaceId\":\"$workspace_id\",\"agent\":\"claude\",\"prompt\":\"\"}}" \
    "$HOST_URL/trpc/agents.run" >/dev/null 2>&1
}

kill_resident_session() {
  local terminal_id="$1" workspace_id="$2"
  curl -sf -m 30 -X POST -H "Authorization: Bearer $HEALTH_SECRET" \
    -H "content-type: application/json" \
    --data "{\"json\":{\"terminalId\":\"$terminal_id\",\"workspaceId\":\"$workspace_id\"}}" \
    "$HOST_URL/trpc/terminal.killSession" >/dev/null 2>&1
}

assert_resident_session() {
  local workspace_id terminal_id approval
  workspace_id=$(resident_workspace_id)
  if [ -z "$workspace_id" ]; then
    echo "[review-host] cannot find the '$RESIDENT_WORKSPACE_NAME' workspace; resident session unverified"
    return
  fi

  # Before the probe: a session started under an unapproved key is sitting on
  # the approval prompt, so it has to be replaced rather than counted as healthy.
  ensure_api_key_approved
  approval=$?

  terminal_id=$(resident_terminal_id "$workspace_id")
  case "$?" in
    2) echo "[review-host] could not read the session list; resident session unverified"; return ;;
    0)
      [ "$approval" = "10" ] || return
      echo "[review-host] approved a new custom API key; relaunching the resident session so it is not left on the prompt"
      kill_resident_session "$terminal_id" "$workspace_id"
      ;;
  esac

  echo "[review-host] no Claude session on '$RESIDENT_WORKSPACE_NAME' — restoring it"
  if restore_resident_session "$workspace_id"; then
    echo "[review-host] resident session restored"
  else
    echo "[review-host] could not restore the resident session; the pull-request chip will not render"
  fi
}

# Presence lags a cold boot by ~20s, so start late and require a sustained
# failure before acting.
sleep 120
fails=0
# A restore that is still starting must not be spawned twice, so back off a few
# passes after each attempt rather than re-probing 30s later.
session_cooldown=0
while true; do
  if relay_sees_us; then
    fails=0
    if [ "$session_cooldown" -gt 0 ]; then
      session_cooldown=$((session_cooldown - 1))
    else
      assert_resident_session
      session_cooldown=4
    fi
  else
    fails=$((fails + 1))
    echo "[review-host] relay does not see this host ($fails/10)"
    if [ "$fails" -ge 10 ]; then
      echo "[review-host] invisible to the relay for 5m — restarting host-service"
      systemctl restart superset-review-host
      fails=0
      sleep 120
    fi
  fi
  sleep 30
done
