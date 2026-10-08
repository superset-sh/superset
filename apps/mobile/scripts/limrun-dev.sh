#!/usr/bin/env bash
# Brings up the mobile dev-client on a Limrun cloud iOS simulator, from a
# machine with no local Xcode (a cloud sandbox). One command instead of the
# ~10-step manual sequence — see this repo's apps/mobile/AGENTS.md
# ("Verifying in the real app") for *why* each of these steps exists.
#
# Builds are shared, not redone per sandbox: the built app is uploaded to
# Limrun's asset storage under a name keyed by bundle id + branch, and by
# default this script installs that asset directly (no Xcode, no build,
# seconds not minutes) when one already exists. A full Xcode build is only
# needed the first time on a branch, or again after a *native* change
# (new native module, Info.plist/entitlements, native config) — pure JS/TS
# changes ship through Metro against the same installed native shell.
#
# Usage:
#   apps/mobile/scripts/limrun-dev.sh               # install the shared asset if one exists, else build
#   apps/mobile/scripts/limrun-dev.sh --rebuild      # native dep/config changed: go through Xcode (incremental)
#   apps/mobile/scripts/limrun-dev.sh --force-prebuild   # also regenerate ios/ (an --env-level native value changed)
#   MOBILE_LIMRUN_ASSET=<name> apps/mobile/scripts/limrun-dev.sh   # JS-only branch: reuse another branch's build
#
# Requires: lim CLI authenticated (LIM_API_KEY in .env), this repo's .env
# already written (.superset/setup.sh or setup.cloud.sh), and port 8081 free.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

REBUILD=0
FORCE_PREBUILD=0
for arg in "$@"; do
	case "$arg" in
	--rebuild) REBUILD=1 ;;
	--force-prebuild)
		REBUILD=1
		FORCE_PREBUILD=1
		;;
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
BRANCH="$(git branch --show-current 2>/dev/null || echo main)"
SNAPSHOT_KEY="mobile-${BRANCH//\//-}"
ASSET_NAME="${MOBILE_LIMRUN_ASSET:-sh.superset.mobile/${BRANCH//\//-}-debug.zip}"
# A snapshot restore never carries this; .env itself never reaches the
# remote build at all (it's gitignored, so Limrun's sync drops it) — forward
# whatever this box actually has, real secret or the committed placeholder.
SENTRY_DSN="${EXPO_PUBLIC_SENTRY_DSN_MOBILE:-https://fake@o0.ingest.sentry.io/0}"

asset_exists() {
	lim asset list --name-prefix "$ASSET_NAME" --json 2>/dev/null |
		node -e '
			let d = "";
			process.stdin.on("data", (c) => (d += c));
			process.stdin.on("end", () => {
				let rows;
				try {
					rows = JSON.parse(d);
				} catch {
					process.exit(1);
				}
				process.exit(
					Array.isArray(rows) && rows.some((r) => r.name === process.argv[1]) ? 0 : 1,
				);
			});
		' "$ASSET_NAME"
}

IOS_ID=""
if [ "$REBUILD" = "0" ] && asset_exists; then
	echo "==> Reusing shared asset $ASSET_NAME (no build, no Xcode sandbox)"
	IOS_ID="$(lim ios create --install-asset "$ASSET_NAME" --reuse-if-exists --no-open \
		--label repo=superset --label app=mobile --quiet)"
else
	if [ "$REBUILD" = "1" ]; then
		echo "==> --rebuild requested — going through Xcode"
	else
		echo "==> No shared asset yet for this branch — building once"
	fi

	echo "==> Xcode sandbox (snapshot key: $SNAPSHOT_KEY)"
	XCODE_ID="$(lim xcode create --reuse-if-exists --snapshot-restore-keys "$SNAPSHOT_KEY" \
		--snapshot-key "$SNAPSHOT_KEY" --label repo=superset --label app=mobile --quiet)"
	echo "    $XCODE_ID"

	echo "==> Re-applying the SPM package-manifest sandbox fix (per-instance; a snapshot restore does not carry it — verified 2026-10-02)"
	lim xcode run --id "$XCODE_ID" -- \
		'defaults write com.apple.dt.Xcode IDEPackageSupportDisableManifestSandbox -bool YES && defaults write com.apple.dt.Xcode IDEPackageSupportDisablePluginExecutionSandbox -bool YES' \
		>/dev/null

	BUILD_ARGS=(. --expo-app-dir apps/mobile --configuration Debug
		--env "EXPO_PUBLIC_SENTRY_DSN_MOBILE=$SENTRY_DSN"
		--upload "$ASSET_NAME" --id "$XCODE_ID")
	if [ "$FORCE_PREBUILD" = "1" ]; then
		BUILD_ARGS+=(--expo-force-prebuild)
		echo "==> Building (forced fresh prebuild)"
	else
		echo "==> Building"
	fi
	lim xcode build "${BUILD_ARGS[@]}"

	echo "==> Simulator"
	IOS_ID="$(lim ios create --attach "$XCODE_ID" --reuse-if-exists --no-open \
		--label repo=superset --label app=mobile --quiet)"
fi
echo "    $IOS_ID"

# One selector per port the app calls; selector sets can't change later.
TUNNEL_PORTS=("$METRO_PORT" "$API_PORT")
[ -n "${REALTIME_PORT:-}" ] && TUNNEL_PORTS+=("$REALTIME_PORT")
[ -n "${RELAY_PORT:-}" ] && TUNNEL_PORTS+=("$RELAY_PORT")
SELECTORS=()
for port in "${TUNNEL_PORTS[@]}"; do SELECTORS+=(--selector "localhost:$port"); done
echo "==> Tunnel (ports ${TUNNEL_PORTS[*]})"
lim ios tunnel stop --id "$IOS_ID" >/dev/null 2>&1 || true
lim ios tunnel "${SELECTORS[@]}" --detach --id "$IOS_ID"

if ! curl -s "http://127.0.0.1:$METRO_PORT/status" 2>/dev/null | grep -q "packager-status:running"; then
	echo "==> Starting Metro"
	(cd apps/mobile && CI=1 nohup bunx expo start --dev-client --port "$METRO_PORT" \
		>/tmp/superset-metro.log 2>&1 &)
	for _ in $(seq 1 30); do
		curl -s "http://127.0.0.1:$METRO_PORT/status" 2>/dev/null | grep -q "packager-status:running" && break
		sleep 2
	done
fi

ENCODED_URL="$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "http://localhost:$METRO_PORT")"
lim ios open-url --id "$IOS_ID" "superset://expo-development-client/?url=${ENCODED_URL}"

cat <<SUMMARY

Ready.
  iOS simulator:  $IOS_ID
  Stream:         https://console.limrun.com/stream/$IOS_ID
  Metro log:      /tmp/superset-metro.log

The relay and realtime ports are tunnelled, but this starts neither service:
run "bun dev:realtime" for live cloud rows, and the relay for host presence.
See apps/mobile/AGENTS.md.
SUMMARY
