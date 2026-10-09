#!/usr/bin/env bash
# Brings up the mobile dev-client on an EAS cloud iOS simulator, from a
# machine with no local Xcode (a cloud sandbox), connected to this machine's
# Metro and API.
#
# The simulator installs a finished EAS simulator build whose native
# fingerprint matches this checkout. One is built only when none exists: the
# first time, or after a native change. JS/TS changes ship through Metro.
#
# Usage:
#   apps/mobile/scripts/eas-dev.sh             # reuse this checkout's running session, else start one
#   apps/mobile/scripts/eas-dev.sh --new       # stop the running session and start a fresh one
#   MOBILE_EAS_BUILD_ID=<id> apps/mobile/scripts/eas-dev.sh   # install this build, skip the lookup
#
# Requires: EXPO_TOKEN (or `eas login`), this repo's .env already written
# (.superset/setup.sh or setup.cloud.sh), and local egress enabled on the Expo
# account.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

NEW=0
for arg in "$@"; do
	case "$arg" in
	--new) NEW=1 ;;
	*)
		echo "Unknown argument: $arg" >&2
		exit 1
		;;
	esac
done

if [ ! -f .env ]; then
	echo "No .env here — run .superset/setup.sh or .superset/setup.cloud.sh first." >&2
	exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

METRO_PORT=8081
API_PORT="${API_PORT:?API_PORT is missing from .env}"
BUILD_PROFILE=development-simulator
IDLE_MINUTES="${MOBILE_EAS_IDLE_MINUTES:-15}"
SESSION_FILE=apps/mobile/.env.eas-simulator
EGRESS_LOG=/tmp/superset-eas-egress.log
METRO_LOG=/tmp/superset-metro.log

cd apps/mobile

DEV_CLIENT_URL="superset://expo-development-client/?url=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "http://localhost:$METRO_PORT")"

# The runtime version is a fingerprint of the app config. EAS resolves it
# without this machine's dev values, so the build and its lookup must too.
without_dev_env() {
	local unset_args=() name
	for name in $(compgen -v EXPO_PUBLIC_) MOBILE_SIGNED_UPDATES; do unset_args+=(-u "$name"); done
	env "${unset_args[@]}" "$@"
}

json() {
	node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s.slice(s.search(/[\[{]/)));console.log(eval(process.argv[1])??"")})' "$1"
}

session_id() {
	[ -f "$ROOT_DIR/$SESSION_FILE" ] || return 0
	sed -n "s/^EAS_SIMULATOR_SESSION_ID='\(.*\)'$/\1/p" "$ROOT_DIR/$SESSION_FILE"
}

session_running() {
	local id
	id="$(session_id)"
	[ -n "$id" ] || return 1
	[ "$(eas simulator:get --id "$id" --json --non-interactive 2>/dev/null | json 'j.status')" = "IN_PROGRESS" ]
}

if ! curl -s "http://127.0.0.1:$METRO_PORT/status" 2>/dev/null | grep -q "packager-status:running"; then
	echo "==> Starting Metro"
	nohup bunx expo start --dev-client --port "$METRO_PORT" >"$METRO_LOG" 2>&1 </dev/null &
	for _ in $(seq 1 30); do
		curl -s "http://127.0.0.1:$METRO_PORT/status" 2>/dev/null | grep -q "packager-status:running" && break
		sleep 2
	done
fi

if [ "$NEW" = "1" ] && session_running; then
	echo "==> Stopping session $(session_id)"
	eas simulator:stop --id "$(session_id)" --non-interactive >/dev/null
fi

if session_running; then
	echo "==> Reusing session $(session_id)"
else
	BUILD_ID="${MOBILE_EAS_BUILD_ID:-}"
	if [ -z "$BUILD_ID" ]; then
		HASH="$(without_dev_env eas fingerprint:generate -p ios --build-profile "$BUILD_PROFILE" --json --non-interactive | json 'j.hash')"
		BUILD_ID="$(eas build:list -p ios --build-profile "$BUILD_PROFILE" --status finished --fingerprint-hash "$HASH" --limit 1 --json --non-interactive | json 'j[0]?.id')"
		if [ -z "$BUILD_ID" ]; then
			echo "==> No simulator build has fingerprint ${HASH:0:12} — building one (about 15 minutes)"
			BUILD_ID="$(without_dev_env eas build -p ios --profile "$BUILD_PROFILE" --non-interactive --wait --json | json 'j[0].id')"
		fi
	fi
	echo "==> Build $BUILD_ID"

	EGRESS_PORTS=("$METRO_PORT" "$API_PORT")
	[ -n "${REALTIME_PORT:-}" ] && EGRESS_PORTS+=("$REALTIME_PORT")
	[ -n "${RELAY_PORT:-}" ] && EGRESS_PORTS+=("$RELAY_PORT")
	ALLOW=()
	for port in "${EGRESS_PORTS[@]}"; do ALLOW+=(--egress-allow "localhost:$port"); done
	TAGS=()
	[ -n "${SUPERSET_SANDBOX_WORKSPACE_ID:-}" ] && TAGS+=(--tag "$SUPERSET_SANDBOX_WORKSPACE_ID")

	echo "==> Simulator (egress ports ${EGRESS_PORTS[*]})"
	eas simulator -p ios --type agent-device --build-id "$BUILD_ID" \
		--open-url "$DEV_CLIENT_URL" \
		--egress local "${ALLOW[@]}" "${TAGS[@]}" \
		--max-idle-time-minutes "$IDLE_MINUTES" \
		--out-config-type dotenv --non-interactive --force
fi

agent_device() {
	if command -v agent-device >/dev/null 2>&1; then
		(
			set -a
			# shellcheck disable=SC1090
			source "$ROOT_DIR/$SESSION_FILE"
			set +a
			agent-device "$@"
		)
	else
		eas simulator:exec npx -y agent-device "$@"
	fi
}

# The simulator reaches this machine only while the egress client runs, and
# the client needs the session, so the app's first load at session start
# always fails. Load it again once the tunnel is up.
if ! pgrep -f "eas simulator:egress" >/dev/null 2>&1; then
	echo "==> Egress"
	nohup eas simulator:egress >"$EGRESS_LOG" 2>&1 </dev/null &
	for _ in $(seq 1 30); do
		grep -q "Egress tunnel connected" "$EGRESS_LOG" 2>/dev/null && break
		sleep 1
	done
	echo "==> Loading the app from Metro"
	agent_device open "$DEV_CLIENT_URL" >/dev/null 2>&1 || true
	agent_device alert accept >/dev/null 2>&1 || true
fi

SESSION_ID="$(session_id)"
PREVIEW_URL="$(eas simulator:get --id "$SESSION_ID" --json --non-interactive 2>/dev/null | json 'j.remoteConfig?.webPreviewUrl')"

cat <<SUMMARY

Ready.
  Session:     $SESSION_ID
  Preview:     $PREVIEW_URL
  Drive it:    (cd apps/mobile && set -a && . ./.env.eas-simulator && set +a && agent-device snapshot -i)
               needs "npm install -g agent-device"; through npx each command takes about 25 s
  Stop it:     (cd apps/mobile && eas simulator:stop --id $SESSION_ID)
  Metro log:   $METRO_LOG
  Egress log:  $EGRESS_LOG

The relay and realtime ports are forwarded, but this starts neither service:
run "bun dev:realtime" for live cloud rows, and the relay for host presence.
See apps/mobile/AGENTS.md.
SUMMARY
