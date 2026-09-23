#!/bin/bash
# Walks one stand-in host through never connected → online → offline → Try
# again on the booted simulator. Expects the local API, relay and Metro up, the
# app signed in (.maestro/flows/sign-in.yml) with an English locale, and no
# other host in the dev org. See .agents/skills/mobile-sim-verification.
set -euo pipefail
cd "$(dirname "$0")/../.."

HOST_ID="e2e-$(date +%s)"
FLOWS=.maestro/flows/host-states
host() { bun --env-file=../../.env scripts/e2e/stand-in-host.ts "$@" --id "$HOST_ID"; }
# Local `wrangler dev` restarts whenever a client aborts a request, which every
# app relaunch does. Connecting during that window fails the run for no reason.
relay_ready() {
	local url
	url="$(grep -E '^EXPO_PUBLIC_RELAY_URL=' ../../.env | tail -1 | cut -d= -f2- | tr -d '"')"
	for _ in $(seq 1 30); do
		curl -s -m 2 -o /dev/null "$url/presence" && return 0
		sleep 1
	done
	echo "relay did not come back at $url" >&2
	return 1
}
cleanup() { pkill -f "stand-in-host.ts online --seconds [0-9]* --id $HOST_ID" || true; host delete || true; }
trap cleanup EXIT

HOST_NAME="E2E Mac mini"
host register --name "$HOST_NAME"
maestro test -e HOST_NAME="$HOST_NAME" "$FLOWS/never-connected.yml"

relay_ready
host online --seconds 20 &
maestro test "$FLOWS/online.yml"
wait

maestro test "$FLOWS/offline.yml"

relay_ready
host online --seconds 30 &
sleep 2
maestro test "$FLOWS/try-again.yml"
wait
echo "host states: all passed"
