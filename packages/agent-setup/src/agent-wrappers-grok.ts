import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	getManagedNotifyHookCommand,
	removeOwnedFileIfMarked,
	writeFileIfChanged,
} from "./agent-wrappers-common";
import {
	ensureManagedTomlBlock,
	getManagedTomlContent,
	type ManagedTomlBlockSpec,
	removeManagedTomlBlock,
} from "./managed-toml-block";

export const GROK_COMPAT_MARKER_START =
	"# >>> superset-managed-grok-compat v1 (do not edit) >>>";
export const GROK_COMPAT_MARKER_END =
	"# <<< superset-managed-grok-compat v1 <<<";

export const GROK_HOOKS_FILE = "superset-notify.json";

// Grok's hook config uses Claude Code's event names; the wire payload it pipes
// to the command is camelCase (`hookEventName`) with snake_case values, which
// the notify script and mapEventType both handle. PreToolUse is deliberately
// absent: it is a blocking hook in Grok and would add latency to every tool
// call for no signal we use.
const GROK_MANAGED_HOOK_EVENTS = [
	"SessionStart",
	"SessionEnd",
	"UserPromptSubmit",
	"PostToolUse",
	"PostToolUseFailure",
	"Stop",
	"StopFailure",
	"Notification",
] as const;

// Grok Notification subtypes where the agent is blocked waiting on the user:
// tool and plan approvals both arrive as permission_prompt; ask_user_question
// arrives as elicitation_dialog. notify-hook.template.sh filters on the same
// list — a test asserts the two stay in sync.
export const GROK_BLOCKING_NOTIFICATION_TYPES = [
	"permission_prompt",
	"elicitation_dialog",
] as const;

const GROK_MANAGED_HOOK_COMMAND = getManagedNotifyHookCommand("grok");

// Vendor hook configs Superset also manages. Grok replays them in compat mode
// with their inlined SUPERSET_AGENT_ID (claude/cursor-agent), which would
// misattribute grok sessions; disable replay and register native hooks instead.
const GROK_COMPAT_HOOK_VENDORS = ["claude", "cursor"] as const;

function getGrokHomeDir(): string {
	return path.join(os.homedir(), ".grok");
}

export function getGrokHooksJsonPath(): string {
	return path.join(getGrokHomeDir(), "hooks", GROK_HOOKS_FILE);
}

export function getGrokConfigTomlPath(): string {
	return path.join(getGrokHomeDir(), "config.toml");
}

/**
 * Grok merges every `*.json` under `~/.grok/hooks/`, so Superset owns this
 * file outright — no merge with user config needed.
 */
export function getGrokHooksJsonContent(): string {
	const hooks = Object.fromEntries(
		GROK_MANAGED_HOOK_EVENTS.map((event) => [
			event,
			[
				{
					...(event === "Notification"
						? {
								matcher: `^(${GROK_BLOCKING_NOTIFICATION_TYPES.join("|")})$`,
							}
						: {}),
					hooks: [{ type: "command", command: GROK_MANAGED_HOOK_COMMAND }],
				},
			],
		]),
	);
	return `${JSON.stringify({ hooks }, null, 2)}\n`;
}

export function createGrokHooksJson(): void {
	const hooksPath = getGrokHooksJsonPath();
	fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
	const changed = writeFileIfChanged(
		hooksPath,
		getGrokHooksJsonContent(),
		0o644,
	);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Grok hooks json`,
	);
}

function isManagedCompatTable(lines: string[]): boolean {
	const vendor = lines[0]?.match(/^\s*\[compat\.([a-z-]+)\]\s*$/)?.[1];
	return (
		vendor !== undefined &&
		(GROK_COMPAT_HOOK_VENDORS as readonly string[]).includes(vendor)
	);
}

/**
 * A vendor table the user already defines outside the block is skipped — TOML
 * rejects duplicate table headers, and the user's setting should win anyway.
 * When every vendor is user-defined the block is omitted entirely.
 */
function buildGrokCompatBlock(base: string): string {
	const vendors = GROK_COMPAT_HOOK_VENDORS.filter(
		(vendor) => !new RegExp(`^\\s*\\[compat\\.${vendor}\\]`, "m").test(base),
	);
	if (vendors.length === 0) return "";

	const body = [
		GROK_COMPAT_MARKER_START,
		"# Superset registers its own Grok hooks; replaying Superset-managed",
		"# Claude/Cursor hook configs here would mislabel grok sessions.",
		...vendors.flatMap((vendor) => [`[compat.${vendor}]`, "hooks = false", ""]),
	]
		.join("\n")
		.trimEnd();

	return `${body}\n${GROK_COMPAT_MARKER_END}`;
}

const GROK_TOML_SPEC: ManagedTomlBlockSpec = {
	markerStart: GROK_COMPAT_MARKER_START,
	markerEnd: GROK_COMPAT_MARKER_END,
	getFilePath: getGrokConfigTomlPath,
	fileLabel: "Grok config.toml",
	removeLabel: "Grok compat block",
	fileMode: 0o600,
	isManagedTable: isManagedCompatTable,
	buildBlock: buildGrokCompatBlock,
};

/**
 * Preserve user config while replacing Superset's marker-owned compat block.
 */
export function getGrokConfigTomlContent(existing: string): string {
	return getManagedTomlContent(GROK_TOML_SPEC, existing);
}

/**
 * Removes Superset's Grok footprint: the wholly-owned hooks file and the
 * marker-owned compat block in config.toml. No-op when neither exists.
 */
export function removeGrokManagedHooks(): void {
	removeOwnedFileIfMarked(
		getGrokHooksJsonPath(),
		"SUPERSET_AGENT_ID=grok",
		"Grok hooks json",
	);
	removeManagedTomlBlock(GROK_TOML_SPEC);
}

export function createGrokConfigToml(): void {
	ensureManagedTomlBlock(GROK_TOML_SPEC);
}

export function getGrokWrapperScript(): string {
	return buildWrapperScript("grok", 'exec "$REAL_BIN" "$@"', {
		agentId: "grok",
	});
}

export function createGrokWrapper(): void {
	createWrapper("grok", getGrokWrapperScript());
}
