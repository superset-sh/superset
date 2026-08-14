#!/usr/bin/env bash
# Pre-generates react-native-worklets Bundle Mode output so the real bundle
# step can resolve it.
#
# The worklets Babel plugin writes node_modules/react-native-worklets/.worklets/
# <hash>.js *during* transform and emits imports pointing at them. Metro
# snapshots its file map at startup, so a file created mid-transform isn't in
# that map and `getOrComputeSha1` throws:
#
#   Failed to get the SHA-1 for: .../react-native-worklets/.worklets/<hash>.js
#
# Locally the files survive in node_modules, so only the first run after a wipe
# is affected. EAS installs fresh every build, so its first bundle always loses
# the race and the build fails. Each pass writes more of the set and fails on
# the next missing one, so a few throwaway exports converge (measured: 3).
#
# Metro's transform cache suppresses the plugin on warm runs, hence --clear on
# the first pass; without it the plugin never runs and nothing is written.
set -u

ATTEMPTS=${WORKLETS_WARMUP_ATTEMPTS:-4}
OUT_DIR=$(mktemp -d)
trap 'rm -rf "$OUT_DIR"' EXIT

for i in $(seq 1 "$ATTEMPTS"); do
	CLEAR=""
	[ "$i" = "1" ] && CLEAR="--clear"
	# shellcheck disable=SC2086
	if npx expo export --platform ios --output-dir "$OUT_DIR/pass-$i" $CLEAR >/dev/null 2>&1; then
		echo "[warm-worklets] bundle succeeded on pass $i"
		exit 0
	fi
	echo "[warm-worklets] pass $i did not complete; retrying"
done

# Don't fail the build: the real bundle step reports the actual error, and this
# is only a warm-up. If it never converged, that step will say so.
echo "[warm-worklets] did not converge in $ATTEMPTS passes; continuing"
exit 0
