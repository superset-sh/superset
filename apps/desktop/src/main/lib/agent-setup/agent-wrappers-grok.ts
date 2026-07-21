import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	getManagedNotifyHookCommand,
	writeFileIfChanged,
} from "./agent-wrappers-common";

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
			[{ hooks: [{ type: "command", command: GROK_MANAGED_HOOK_COMMAND }] }],
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

function isTomlTableHeader(line: string): boolean {
	return /^\s*\[/.test(line);
}

function isManagedCompatTable(lines: string[]): boolean {
	const header = lines[0]?.match(/^\s*\[compat\.([a-z-]+)\]\s*$/);
	return (
		!!header &&
		(GROK_COMPAT_HOOK_VENDORS as readonly string[]).includes(header[1])
	);
}

/**
 * Recover from an interrupted write whose end marker is missing. Managed
 * compat tables are removed, while a later user-owned table and its leading
 * comments are retained.
 */
function stripOrphanedManagedBlock(base: string, start: number): string {
	const before = base.slice(0, start);
	const lines = base.slice(start).split("\n");
	let cut = lines.length;

	for (let index = 1; index < lines.length; index++) {
		if (!isTomlTableHeader(lines[index])) continue;
		let end = index + 1;
		while (end < lines.length && !isTomlTableHeader(lines[end])) end++;
		if (isManagedCompatTable(lines.slice(index, end))) {
			index = end - 1;
			continue;
		}

		cut = index;
		break;
	}

	while (
		cut > 1 &&
		(lines[cut - 1].trim() === "" || lines[cut - 1].trimStart().startsWith("#"))
	) {
		cut--;
	}

	return before + lines.slice(cut).join("\n");
}

/**
 * Preserve user config while replacing Superset's marker-owned compat block.
 * A vendor table the user already defines outside the block is skipped — TOML
 * rejects duplicate table headers, and the user's setting should win anyway.
 */
export function getGrokConfigTomlContent(existing: string): string {
	let base = existing;
	const start = base.indexOf(GROK_COMPAT_MARKER_START);
	if (start !== -1) {
		const end = base.indexOf(GROK_COMPAT_MARKER_END, start);
		base =
			end !== -1
				? base.slice(0, start) + base.slice(end + GROK_COMPAT_MARKER_END.length)
				: stripOrphanedManagedBlock(base, start);
	}

	base = base.replace(/\s+$/, "");
	const vendors = GROK_COMPAT_HOOK_VENDORS.filter(
		(vendor) => !new RegExp(`^\\s*\\[compat\\.${vendor}\\]`, "m").test(base),
	);
	if (vendors.length === 0) {
		return base.length > 0 ? `${base}\n` : "";
	}

	const block = [
		GROK_COMPAT_MARKER_START,
		"# Superset registers its own Grok hooks; replaying Superset-managed",
		"# Claude/Cursor hook configs here would mislabel grok sessions.",
		...vendors.flatMap((vendor) => [`[compat.${vendor}]`, "hooks = false", ""]),
	]
		.join("\n")
		.trimEnd();

	return base.length > 0
		? `${base}\n\n${block}\n${GROK_COMPAT_MARKER_END}\n`
		: `${block}\n${GROK_COMPAT_MARKER_END}\n`;
}

export function createGrokConfigToml(): void {
	const configPath = getGrokConfigTomlPath();
	const existing = fs.existsSync(configPath)
		? fs.readFileSync(configPath, "utf-8")
		: "";
	const content = getGrokConfigTomlContent(existing);
	if (content === "") return;
	fs.mkdirSync(path.dirname(configPath), { recursive: true });
	const changed = writeFileIfChanged(configPath, content, 0o600);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Grok config.toml`,
	);
}

export function getGrokWrapperScript(): string {
	return buildWrapperScript("grok", 'exec "$REAL_BIN" "$@"', {
		agentId: "grok",
	});
}

export function createGrokWrapper(): void {
	createWrapper("grok", getGrokWrapperScript());
}
