#!/usr/bin/env bash
# The macOS-style GTK, icon and cursor themes, prebuilt once and shipped as
# tarballs (the source build needs sassc and several minutes). The tarballs
# unpack straight into /usr/share/themes and /usr/share/icons.
set -euo pipefail
. /etc/superset/contract.sh
for archive in "${SUPERSET_MEDIA_DIR}"/whitesur-*.tar.gz; do
	[ -f "$archive" ] || { echo "theme archives missing under ${SUPERSET_MEDIA_DIR}" >&2; exit 1; }
	tar -xzf "$archive" -C /
done
gtk-update-icon-cache -f -q /usr/share/icons/WhiteSur 2>/dev/null || true
gtk-update-icon-cache -f -q /usr/share/icons/hicolor 2>/dev/null || true
