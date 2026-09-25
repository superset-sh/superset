#!/usr/bin/env bash
# Puts `superset` on PATH for everything in the box. The binary sync-assets
# staged is named by version; the link is what terminals and agents find.
set -euo pipefail
. /etc/superset/contract.sh

binary=""
for candidate in "${SUPERSET_MEDIA_DIR}"/superset-*; do
	[ -f "${candidate}.hash" ] || continue
	if grep -qF "$(tr -d '\n\r' < "${candidate}.hash")" "${SUPERSET_BUNDLE_DIR}/assets.tsv"; then
		binary="$candidate"
	fi
done
[ -n "$binary" ] || { echo "no superset binary of this bundle under ${SUPERSET_MEDIA_DIR}" >&2; exit 1; }

chmod 0755 "$binary"
install -d /usr/local/bin
ln -sfn "$binary" /usr/local/bin/superset.tmp
mv -T /usr/local/bin/superset.tmp /usr/local/bin/superset
