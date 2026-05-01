#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

while IFS= read -r package_json; do
	if ! grep -q '"typecheck"' "$package_json"; then
		continue
	fi

	workspace_dir="$(dirname "$package_json")"
	echo "typecheck: $workspace_dir"
	(
		cd "$workspace_dir"
		bun run typecheck
	)
done < <(find "$ROOT_DIR/apps" "$ROOT_DIR/packages" "$ROOT_DIR/tooling" -mindepth 2 -maxdepth 2 -name package.json | sort)
