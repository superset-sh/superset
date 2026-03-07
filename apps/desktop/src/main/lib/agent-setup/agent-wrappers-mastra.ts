import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	isSupersetManagedHookCommand,
	reconcileManagedEntries,
	writeFileIfChanged,
} from "./agent-wrappers-common";
import { getNotifyScriptPath, NOTIFY_SCRIPT_NAME } from "./notify-hook";

interface MastraHookMatcher {
	tool_name?: string;
	[key: string]: unknown;
}

interface MastraHookDefinition {
	type: "command";
	command: string;
	matcher?: MastraHookMatcher;
	timeout?: number;
	description?: string;
	[key: string]: unknown;
}

interface MastraHooksJson {
	PreToolUse?: MastraHookDefinition[];
	PostToolUse?: MastraHookDefinition[];
	Stop?: MastraHookDefinition[];
	UserPromptSubmit?: MastraHookDefinition[];
	SessionStart?: MastraHookDefinition[];
	SessionEnd?: MastraHookDefinition[];
	Notification?: MastraHookDefinition[];
	[key: string]: unknown;
}

function quoteShellPath(filePath: string): string {
	return `'${filePath.replaceAll("'", "'\\''")}'`;
}

export function getMastraGlobalHooksJsonPath(): string {
	return path.join(os.homedir(), ".mastracode", "hooks.json");
}

export function createMastraWrapper(): void {
	const script = buildWrapperScript("mastracode", `exec "$REAL_BIN" "$@"`);
	createWrapper("mastracode", script);
}

/**
 * Reads existing ~/.mastracode/hooks.json, merges our hook entries (identified
 * by notify script path), and preserves any user-defined hooks.
 */
export function getMastraHooksJsonContent(notifyScriptPath: string): string {
	const globalPath = getMastraGlobalHooksJsonPath();

	let existing: MastraHooksJson = {};
	try {
		if (fs.existsSync(globalPath)) {
			existing = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
		}
	} catch {
		console.warn(
			"[agent-setup] Could not parse existing ~/.mastracode/hooks.json, merging carefully",
		);
	}

	const notifyCommand = `bash ${quoteShellPath(notifyScriptPath)}`;
	const managedEvents = ["UserPromptSubmit", "Stop", "PostToolUse"] as const;

	for (const eventName of managedEvents) {
		const current = existing[eventName];
		const { entries } = reconcileManagedEntries({
			current,
			desired: [{ type: "command", command: notifyCommand }],
			isManaged: (entry: MastraHookDefinition) =>
				entry.command?.includes(notifyScriptPath) ||
				isSupersetManagedHookCommand(entry.command, NOTIFY_SCRIPT_NAME),
			isEquivalent: (
				entry: MastraHookDefinition,
				desiredEntry: MastraHookDefinition,
			) => entry.command === desiredEntry.command,
		});
		existing[eventName] = entries;
	}

	return JSON.stringify(existing, null, 2);
}

export function createMastraHooksJson(): void {
	const notifyScriptPath = getNotifyScriptPath();
	const globalPath = getMastraGlobalHooksJsonPath();
	const content = getMastraHooksJsonContent(notifyScriptPath);

	const dir = path.dirname(globalPath);
	fs.mkdirSync(dir, { recursive: true });
	const changed = writeFileIfChanged(globalPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Mastra hooks.json`,
	);
}
