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
cleanup() { pkill -f "stand-in-host.ts online --seconds [0-9]* --id $HOST_ID" || true; host delete || true; }
trap cleanup EXIT

HOST_NAME="E2E Mac mini"
host register --name "$HOST_NAME"
maestro test -e HOST_NAME="$HOST_NAME" "$FLOWS/never-connected.yml"

host online --seconds 20 &
maestro test "$FLOWS/online.yml"
wait

maestro test "$FLOWS/offline.yml"

host online --seconds 30 &
sleep 2
maestro test "$FLOWS/try-again.yml"
wait
echo "host states: all passed"
