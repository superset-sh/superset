import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	getManagedNotifyHookCommand,
	writeFileIfChanged,
} from "./agent-wrappers-common";

export const GROK_HOOKS_FILE_NAME = "superset.json";

// These event names are transported unchanged. Their Superset lifecycle
// meaning—especially Notification and PermissionDenied—belongs to the
// agent-aware event mapping, not the instrumentation adapter.
export const GROK_MANAGED_HOOK_EVENTS = [
	"SessionStart",
	"SessionEnd",
	"UserPromptSubmit",
	"PostToolUse",
	"PostToolUseFailure",
	"PermissionDenied",
	"Stop",
	"StopFailure",
	"Notification",
] as const;

const GROK_HOOK_TIMEOUT_SECONDS = 10;

export interface GrokPathOptions {
	env?: NodeJS.ProcessEnv;
	homeDir?: string;
}

/** Returns the configuration root used by Grok for personal hooks. */
export function getGrokHome({
	env = process.env,
	homeDir = os.homedir(),
}: GrokPathOptions = {}): string {
	const configuredHome = env.GROK_HOME?.trim();
	return configuredHome?.length ? configuredHome : path.join(homeDir, ".grok");
}

export function getGrokHooksJsonPath(options: GrokPathOptions = {}): string {
	return path.join(getGrokHome(options), "hooks", GROK_HOOKS_FILE_NAME);
}

/**
 * Grok merges personal hook files, so Superset owns one isolated file instead
 * of modifying user configuration. PreToolUse is intentionally absent: it is
 * Grok's only blocking hook and participates in tool authorization.
 */
export function getGrokHooksJsonContent(): string {
	const command = getManagedNotifyHookCommand("grok");
	const hook = {
		type: "command",
		command,
		timeout: GROK_HOOK_TIMEOUT_SECONDS,
	};

	return JSON.stringify(
		{
			hooks: Object.fromEntries(
				GROK_MANAGED_HOOK_EVENTS.map((eventName) => [
					eventName,
					[{ hooks: [hook] }],
				]),
			),
		},
		null,
		2,
	);
}

function writeGrokHooksJson(hooksPath: string): boolean {
	fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
	return writeFileIfChanged(hooksPath, getGrokHooksJsonContent(), 0o644);
}

/** Install the native hook for the Grok home visible to the desktop process. */
export function createGrokHooksJson(options: GrokPathOptions = {}): void {
	const hooksPath = getGrokHooksJsonPath(options);
	try {
		const changed = writeGrokHooksJson(hooksPath);
		console.log(
			`[agent-setup] ${changed ? "Updated" : "Verified"} Grok ${GROK_HOOKS_FILE_NAME}`,
		);
	} catch (error) {
		// Hook installation is best-effort and must never prevent desktop startup.
		console.warn("[agent-setup] Could not install Grok hooks:", error);
	}
}

function quoteForSingleQuotedShellString(value: string): string {
	return value.replaceAll("'", "'\\''");
}

export function buildGrokWrapperExecLine(): string {
	const hooksJson = quoteForSingleQuotedShellString(getGrokHooksJsonContent());

	return `# GROK_HOME may be loaded from the user's shell after Electron startup.
# Refresh Superset's isolated hook file at launch so Grok and Superset resolve
# the same configuration root. Failure is non-fatal: Grok must still launch.
GROK_CONFIG_HOME="\${GROK_HOME:-$HOME/.grok}"
GROK_HOOKS_DIR="$GROK_CONFIG_HOME/hooks"
GROK_HOOKS_FILE="$GROK_HOOKS_DIR/${GROK_HOOKS_FILE_NAME}"
GROK_HOOKS_TEMP="$GROK_HOOKS_FILE.tmp.$$"

if mkdir -p "$GROK_HOOKS_DIR" 2>/dev/null &&
  printf '%s' '${hooksJson}' > "$GROK_HOOKS_TEMP" 2>/dev/null; then
  if [ -f "$GROK_HOOKS_FILE" ] && cmp -s "$GROK_HOOKS_TEMP" "$GROK_HOOKS_FILE"; then
    rm -f "$GROK_HOOKS_TEMP"
  elif ! mv -f "$GROK_HOOKS_TEMP" "$GROK_HOOKS_FILE" 2>/dev/null; then
    rm -f "$GROK_HOOKS_TEMP"
  fi
else
  rm -f "$GROK_HOOKS_TEMP" 2>/dev/null
fi

exec "$REAL_BIN" "$@"`;
}

export function getGrokWrapperScript(): string {
	return buildWrapperScript("grok", buildGrokWrapperExecLine(), {
		agentId: "grok",
	});
}

export function createGrokWrapper(): void {
	createWrapper("grok", getGrokWrapperScript());
}
