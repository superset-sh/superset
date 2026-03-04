import fs from "node:fs";
import path from "node:path";
import { BIN_DIR } from "./paths";

export const WRAPPER_MARKER = "# Superset agent-wrapper v1";
export const SUPERSET_MANAGED_BINARIES = [
	"claude",
	"codex",
	"opencode",
	"gemini",
	"copilot",
	"mastracode",
] as const;

const SUPERSET_MANAGED_HOOK_PATH_PATTERN = /\/\.superset(?:-[^/'"\s\\]+)?\//;

export function writeFileIfChanged(
	filePath: string,
	content: string,
	mode: number,
): boolean {
	const existing = fs.existsSync(filePath)
		? fs.readFileSync(filePath, "utf-8")
		: null;
	if (existing === content) {
		try {
			fs.chmodSync(filePath, mode);
		} catch {
			// Best effort.
		}
		return false;
	}

	fs.writeFileSync(filePath, content, { mode });
	return true;
}

export function isSupersetManagedHookCommand(
	command: string | undefined,
	scriptName: string,
): boolean {
	if (!command) return false;
	const normalized = command.replaceAll("\\", "/");
	if (!normalized.includes(`/hooks/${scriptName}`)) return false;
	return SUPERSET_MANAGED_HOOK_PATH_PATTERN.test(normalized);
}

function buildRealBinaryResolver(): string {
	return `list_binary_candidates() {
  local name="$1"
  local IFS=:
  for dir in $PATH; do
    [ -z "$dir" ] && continue
    dir="\${dir%/}"
    case "$dir" in
      "${BIN_DIR}"|"$HOME"/.superset/bin|"$HOME"/.superset-*/bin) continue ;;
    esac
    if [ -x "$dir/$name" ] && [ ! -d "$dir/$name" ]; then
      printf "%s\\n" "$dir/$name"
    fi
  done
}

is_probable_shim() {
  local candidate="$1"
  local home_prefix="$HOME/"
  case "$candidate" in
    "$home_prefix".*"/bin/"*) return 0 ;;
  esac
  [ -L "$candidate" ]
}

resolve_binary_chain() {
  local name="$1"
  local candidate=""
  local selected=""
  local root=""

  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    if [ -z "$selected" ]; then
      selected="$candidate"
      continue
    fi
    if [ "$candidate" = "$selected" ]; then
      continue
    fi
    root="$candidate"
    break
  done <<EOF
\$(list_binary_candidates "$name")
EOF

  if [ -z "$selected" ]; then
    return 1
  fi

  if [ -z "$root" ]; then
    root="$selected"
  fi

  if ! is_probable_shim "$selected"; then
    root="$selected"
  fi

  REAL_BIN="$selected"
  REAL_BIN_ROOT="$root"
}
`;
}

function getMissingBinaryMessage(name: string): string {
	return `Superset: ${name} not found in PATH. Install it and ensure it is on PATH, then retry.`;
}

export function getWrapperPath(binaryName: string): string {
	return path.join(BIN_DIR, binaryName);
}

export function buildWrapperScript(
	binaryName: string,
	execLine: string,
): string {
	return `#!/bin/bash
${WRAPPER_MARKER}
# Superset wrapper for ${binaryName}

${buildRealBinaryResolver()}
REAL_BIN=""
REAL_BIN_ROOT=""
if ! resolve_binary_chain "${binaryName}"; then
  echo "${getMissingBinaryMessage(binaryName)}" >&2
  exit 127
fi

${execLine}
`;
}

export function createWrapper(binaryName: string, script: string): void {
	const changed = writeFileIfChanged(getWrapperPath(binaryName), script, 0o755);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} ${binaryName} wrapper`,
	);
}
