import fs from "node:fs";
import path from "node:path";
import { SUPERSET_MANAGED_BINARIES } from "./desktop-agent-capabilities";
import { BIN_DIR } from "./paths";

export const WRAPPER_MARKER = "# Superset agent-wrapper v3";
export { SUPERSET_MANAGED_BINARIES };

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

function quoteShellPath(filePath: string): string {
	return `'${filePath.replaceAll("'", "'\\''")}'`;
}

function quoteCmdPath(filePath: string): string {
	return `"${filePath.replaceAll('"', '""')}"`;
}

export function buildNotifyHookCommand(
	agentId: string,
	notifyScriptPath: string,
	platform: NodeJS.Platform = process.platform,
): string {
	if (platform === "win32") {
		return `set "SUPERSET_AGENT_ID=${quoteCmdSetValue(agentId)}" && ${quoteCmdPath(notifyScriptPath)}`;
	}
	return `SUPERSET_AGENT_ID=${agentId} ${quoteShellPath(notifyScriptPath)}`;
}

export function getWrapperPath(binaryName: string): string {
	return path.join(BIN_DIR, binaryName);
}

export function getWindowsWrapperPath(binaryName: string): string {
	return path.join(BIN_DIR, `${binaryName}.cmd`);
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

function quoteCmdSetValue(value: string): string {
	return value.replaceAll('"', '""').replaceAll("\r", "").replaceAll("\n", "");
}

export function buildWindowsWrapperScript(
	binaryName: string,
	options: BuildWrapperScriptOptions = {},
): string {
	const agentEnv = options.agentId
		? `set "SUPERSET_AGENT_ID=${quoteCmdSetValue(options.agentId)}"\r\n`
		: "";
	return `@echo off\r\nrem ${WRAPPER_MARKER}\r\nsetlocal EnableExtensions EnableDelayedExpansion\r\nset "_superset_bin_dir=%~dp0"\r\nif "!_superset_bin_dir:~-1!"=="\\" set "_superset_bin_dir=!_superset_bin_dir:~0,-1!"\r\n${agentEnv}for %%D in ("%PATH:;=" "%") do (\r\n  if not "%%~fD"=="" if /I not "%%~fD"=="!_superset_bin_dir!" (\r\n    for %%E in (.exe .cmd .bat .com) do (\r\n      if exist "%%~fD\\${binaryName}%%~E" if not exist "%%~fD\\${binaryName}%%~E\\" (\r\n        call "%%~fD\\${binaryName}%%~E" %*\r\n        exit /b !ERRORLEVEL!\r\n      )\r\n    )\r\n  )\r\n)\r\necho ${getMissingBinaryMessage(binaryName)} 1>&2\r\nexit /b 127\r\n`;
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

export interface CreateWrapperOptions extends BuildWrapperScriptOptions {
	platform?: NodeJS.Platform;
}

export function createWrapper(
	binaryName: string,
	script: string,
	options: CreateWrapperOptions = {},
): void {
	const platform = options.platform ?? process.platform;
	const unixWrapperPath = getWrapperPath(binaryName);
	fs.mkdirSync(path.dirname(unixWrapperPath), { recursive: true });
	const changed = writeFileIfChanged(unixWrapperPath, script, 0o755);
	const changedWindows =
		platform === "win32"
			? writeFileIfChanged(
					getWindowsWrapperPath(binaryName),
					buildWindowsWrapperScript(binaryName, options),
					0o644,
				)
			: false;
	console.log(
		`[agent-setup] ${changed || changedWindows ? "Updated" : "Verified"} ${binaryName} wrapper`,
	);
}
