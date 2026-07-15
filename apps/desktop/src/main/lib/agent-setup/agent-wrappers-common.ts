import fs from "node:fs";
import path from "node:path";
import { SUPERSET_MANAGED_BINARIES } from "./desktop-agent-capabilities";
import { NOTIFY_SCRIPT_NAME } from "./notify-hook";
import { BIN_DIR } from "./paths";

export const WRAPPER_MARKER = "# Superset agent-wrapper v3";
export { SUPERSET_MANAGED_BINARIES };

/** Path (under SUPERSET_HOME_DIR) of the runtime notify hook script. */
export const MANAGED_NOTIFY_RELATIVE_PATH = `hooks/${NOTIFY_SCRIPT_NAME}`;

/**
 * Shell command written into an agent's global hook config. The notify path is
 * resolved at runtime from SUPERSET_HOME_DIR so one shared config works for both
 * dev and prod installs, and `SUPERSET_AGENT_ID` is inlined so the v2 hook
 * payload carries wrapper-level identity even when the agent is launched outside
 * the Superset wrapper (system PATH resolves the real binary directly).
 */
export function getManagedNotifyHookCommand(agentId: string): string {
	return `[ -n "$SUPERSET_HOME_DIR" ] && [ -x "$SUPERSET_HOME_DIR/${MANAGED_NOTIFY_RELATIVE_PATH}" ] && SUPERSET_AGENT_ID=${agentId} "$SUPERSET_HOME_DIR/${MANAGED_NOTIFY_RELATIVE_PATH}" || true`;
}

// Dev setup (.superset/lib/setup/steps.sh) points SUPERSET_HOME_DIR at
// $PWD/superset-dev-data — without a leading dot — so we must recognize that
// variant to reap stale notify.sh paths from deleted worktrees.
const SUPERSET_MANAGED_HOOK_PATH_PATTERN =
	/\/(?:\.superset(?:-[^/'"\s\\]+)?|superset-dev-data)\//;

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

interface ReconcileManagedEntriesOptions<T> {
	current: T[] | undefined;
	desired: T[];
	isManaged: (entry: T) => boolean;
	isEquivalent: (entry: T, desiredEntry: T) => boolean;
}

interface ReconcileManagedEntriesResult<T> {
	entries: T[];
	replacedManagedEntries: T[];
}

export function reconcileManagedEntries<T>({
	current,
	desired,
	isManaged,
	isEquivalent,
}: ReconcileManagedEntriesOptions<T>): ReconcileManagedEntriesResult<T> {
	const existing = Array.isArray(current) ? current : [];
	const entries: T[] = [];
	const replacedManagedEntries: T[] = [];

	for (const entry of existing) {
		if (!isManaged(entry)) {
			entries.push(entry);
			continue;
		}

		if (!desired.some((desiredEntry) => isEquivalent(entry, desiredEntry))) {
			replacedManagedEntries.push(entry);
		}
	}

	entries.push(...desired);

	return { entries, replacedManagedEntries };
}

function buildRealBinaryResolver(): string {
	return `find_real_binary() {
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
      return 0
    fi
  done
  return 1
}
`;
}

function getMissingBinaryMessage(name: string): string {
	return `Superset: ${name} not found in PATH. Install it and ensure it is on PATH, then retry.`;
}

export function getWrapperPath(binaryName: string): string {
	return path.join(BIN_DIR, binaryName);
}

export interface BuildWrapperScriptOptions {
	/**
	 * `BuiltinAgentId` for the wrapped binary (e.g. "claude", "codex"). When
	 * set, the wrapper exports `SUPERSET_AGENT_ID` so the agent process and
	 * any hook subprocess it spawns inherit the wrapper-level identity. The
	 * notify-hook script forwards this into the v2 hook payload.
	 */
	agentId?: string;
}

export function buildWrapperScript(
	binaryName: string,
	execLine: string,
	options: BuildWrapperScriptOptions = {},
): string {
	const exportAgentId = options.agentId
		? `export SUPERSET_AGENT_ID="${options.agentId}"\n\n`
		: "";
	return `#!/bin/bash
${WRAPPER_MARKER}
# Superset wrapper for ${binaryName}

${buildRealBinaryResolver()}
REAL_BIN="$(find_real_binary "${binaryName}")"
if [ -z "$REAL_BIN" ]; then
  echo "${getMissingBinaryMessage(binaryName)}" >&2
  exit 127
fi

${exportAgentId}${execLine}
`;
}

export function createWrapper(binaryName: string, script: string): void {
	const changed = writeFileIfChanged(getWrapperPath(binaryName), script, 0o755);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} ${binaryName} wrapper`,
	);
}
