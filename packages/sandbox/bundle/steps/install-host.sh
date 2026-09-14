#!/usr/bin/env bash
# Unpacks the host-service runtime sync-assets staged into
# /opt/superset/host/<sha>/ and flips `current`. The previous runtime stays
# for a rollback; older ones go. Refuses to flip when the tarball was built
# against another Node major than the image's: node-pty and better-sqlite3
# are native, and a mismatch is a crash on the first terminal, not a warning.
set -euo pipefail
. /etc/superset/contract.sh
# The tarball this bundle declares, by hash: an earlier build's can still be
# staged beside it, and which one `ls` lists first is chance.
archive=""
for candidate in "${SUPERSET_MEDIA_DIR}"/host-service-*.tar.gz; do
	[ -f "${candidate}.hash" ] || continue
	if grep -qF "$(tr -d '\n\r' < "${candidate}.hash")" "${SUPERSET_BUNDLE_DIR}/assets.tsv"; then
		archive="$candidate"
	fi
done
[ -n "$archive" ] || { echo "no host-service tarball of this bundle under ${SUPERSET_MEDIA_DIR}" >&2; exit 1; }
sha="$(tr -d '\n\r' < "${archive}.hash")"
target="${SUPERSET_HOST_ROOT}/${sha}"
if [ ! -f "${target}/host-service.js" ]; then
	rm -rf "$target"
	mkdir -p "$target"
	tar -xzf "$archive" -C "$target"
fi
built_for="$(sed -n 's/^node=\(.*\)$/\1/p' "${target}/RUNTIME")"
have="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$built_for" != "$have" ]; then
	echo "host-service ${sha:0:12} was built for Node ${built_for}; this image runs Node ${have}" >&2
	rm -rf "$target"
	exit 1
fi
previous="$(readlink "${SUPERSET_HOST_ROOT}/current" 2>/dev/null || true)"
ln -sfn "$target" "${SUPERSET_HOST_ROOT}/current.tmp"
mv -T "${SUPERSET_HOST_ROOT}/current.tmp" "${SUPERSET_HOST_ROOT}/current"
sed -n 's/^version=\(.*\)$/\1/p' "${target}/RUNTIME" > "${SUPERSET_HOST_ROOT}/current.version"
# Keep current and the one before it; anything older is garbage. Only
# hash-named directories: the glob also matches the current symlink.
for dir in "${SUPERSET_HOST_ROOT}"/*/; do
	dir="${dir%/}"
	[ -L "$dir" ] && continue
	[ "$dir" = "$target" ] && continue
	[ "$dir" = "$previous" ] && continue
	rm -rf "$dir"
done
