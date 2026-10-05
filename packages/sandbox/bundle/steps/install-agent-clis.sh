#!/usr/bin/env bash
# Puts the pinned `claude` and `codex` on PATH. Both are rows in assets.json,
# so a version bump is a row change and every box picks it up on its next
# boot. Codex unpacks into /opt/codex/<sha>/: its binary finds the bundled
# rg, bwrap and code-mode host through the codex-package.json beside it.
set -euo pipefail
. /etc/superset/contract.sh

staged() {
	local pattern="$1" found=""
	for candidate in "${SUPERSET_MEDIA_DIR}"/${pattern}; do
		[ -f "${candidate}.hash" ] || continue
		if grep -qF "$(tr -d '\n\r' < "${candidate}.hash")" "${SUPERSET_BUNDLE_DIR}/assets.tsv"; then
			found="$candidate"
		fi
	done
	[ -n "$found" ] || { echo "no ${pattern} of this bundle under ${SUPERSET_MEDIA_DIR}" >&2; exit 1; }
	printf '%s' "$found"
}

link() {
	ln -sfn "$2" "$1.tmp"
	mv -T "$1.tmp" "$1"
}

# Images before this step installed both with npm; its links and packages go.
rm -rf /usr/local/lib/node_modules/@anthropic-ai/claude-code /usr/local/lib/node_modules/@openai/codex

claude="$(staged 'claude-*')"
chmod 0755 "$claude"
link /usr/local/bin/claude "$claude"

archive="$(staged 'codex-*.tar.gz')"
sha="$(tr -d '\n\r' < "${archive}.hash")"
target="/opt/codex/${sha}"
if [ ! -x "${target}/bin/codex" ]; then
	rm -rf "$target" "${target}.partial"
	mkdir -p "${target}.partial"
	tar -xzf "$archive" -C "${target}.partial"
	mv -T "${target}.partial" "$target"
fi
link /usr/local/bin/codex "${target}/bin/codex"
for dir in /opt/codex/*/; do
	dir="${dir%/}"
	[ "$dir" = "$target" ] || rm -rf "$dir"
done

claude --version
codex --version
