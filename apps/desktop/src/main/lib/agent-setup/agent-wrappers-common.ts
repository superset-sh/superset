import fs from "node:fs";
import path from "node:path";
import { BIN_DIR } from "./paths";

export const WRAPPER_MARKER = "# Superset agent-wrapper v1";
export const SUPERSET_MANAGED_BINARIES = [
	"claude",
	"codex",
	"droid",
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

export function escapeForSingleQuotedShell(value: string): string {
	return value.replaceAll("'", `'"'"'`);
}

function buildRelayBrokerResolutionShell(): string {
	const brokerPath = resolveRelayBrokerPath();
	const brokerFallback = brokerPath
		? `'${escapeForSingleQuotedShell(brokerPath)}'`
		: "''";

	return `_RELAY_BROKER="$(command -v agent-relay-broker 2>/dev/null || printf '%s\\n' ${brokerFallback})"`;
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

/**
 * Resolve the agent-relay-broker binary path at wrapper generation time.
 * Returns the absolute path if found, or null if not installed.
 */
export function resolveRelayBrokerPath(): string | null {
	try {
		const sdkEntry = require.resolve("@agent-relay/sdk");
		const binDir = path.join(path.dirname(sdkEntry), "..", "bin");

		// Try exact name first
		const exact = path.join(binDir, "agent-relay-broker");
		if (fs.existsSync(exact)) return exact;

		// Try platform-specific binary (bun installs as agent-relay-broker-darwin-arm64 etc.)
		const platform =
			process.platform === "win32" ? "windows" : process.platform;
		const arch = process.arch === "x64" ? "x64" : "arm64";
		const platformBin = path.join(
			binDir,
			`agent-relay-broker-${platform}-${arch}`,
		);
		if (fs.existsSync(platformBin)) return platformBin;
	} catch {}

	// Check PATH
	try {
		const { execSync } = require("node:child_process");
		const result = execSync("command -v agent-relay-broker", {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
		if (result) return result;
	} catch {}

	return null;
}

/**
 * Build the relay broker wrapper block for a given CLI name.
 * If the broker is not found, returns a plain exec of $REAL_BIN.
 */
export function buildRelayWrapExecLine(
	cliName: string,
	execFallback: string,
): string {
	return `${buildRelayBrokerResolutionShell()}
if [ -n "$_RELAY_BROKER" ] && [ -x "$_RELAY_BROKER" ]; then
  export RELAY_AGENT_NAME="\${RELAY_AGENT_NAME:-\${SUPERSET_TAB_ID:-${cliName}-$$}}"
  export RELAY_CHANNELS="general"
  export RUST_LOG="\${RUST_LOG:-error}"
  export RELAY_SKIP_PROMPT=1
  exec "$_RELAY_BROKER" wrap "$REAL_BIN" -- "$@"
else
  ${execFallback}
fi`;
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
REAL_BIN="$(find_real_binary "${binaryName}")"
if [ -z "$REAL_BIN" ]; then
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
