import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	isSupersetManagedHookCommand,
	writeFileIfChanged,
} from "./agent-wrappers-common";
import { getNotifyScriptPath, NOTIFY_SCRIPT_NAME } from "./notify-hook";

interface MastraCodeHookEntry {
	type: "command";
	command: string;
	matcher?: {
		tool_name?: string;
	};
	timeout?: number;
	description?: string;
	[key: string]: unknown;
}

interface MastraCodeHooksJson {
	PreToolUse?: MastraCodeHookEntry[];
	PostToolUse?: MastraCodeHookEntry[];
	UserPromptSubmit?: MastraCodeHookEntry[];
	Stop?: MastraCodeHookEntry[];
	SessionStart?: MastraCodeHookEntry[];
	SessionEnd?: MastraCodeHookEntry[];
	[key: string]: unknown;
}

const MASTRA_CODE_MANAGED_EVENT_NAMES = [
	"PreToolUse",
	"PostToolUse",
	"UserPromptSubmit",
	"Stop",
	"SessionStart",
	"SessionEnd",
] as const;
const MASTRA_CODE_TARGET_EVENT_NAMES = ["UserPromptSubmit", "Stop"] as const;

export function getMastraCodeHooksJsonPath(): string {
	return path.join(os.homedir(), ".mastracode", "hooks.json");
}

function isSupersetManagedMastraCodeHook(
	entry: MastraCodeHookEntry,
	notifyPath: string,
): boolean {
	return (
		entry.command.includes(notifyPath) ||
		isSupersetManagedHookCommand(entry.command, NOTIFY_SCRIPT_NAME)
	);
}

/**
 * Reads existing ~/.mastracode/hooks.json, merges our lifecycle hooks, and
 * preserves any user-defined hooks.
 */
export function getMastraCodeHooksJsonContent(notifyPath: string): string {
	const globalPath = getMastraCodeHooksJsonPath();

	let existing: MastraCodeHooksJson = {};
	try {
		if (fs.existsSync(globalPath)) {
			const parsed = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				existing = parsed as MastraCodeHooksJson;
			}
		}
	} catch {
		console.warn(
			"[agent-setup] Could not parse existing ~/.mastracode/hooks.json, merging carefully",
		);
	}

	// Remove stale Superset-managed hooks across all managed events first.
	for (const eventName of MASTRA_CODE_MANAGED_EVENT_NAMES) {
		const current = existing[eventName];
		if (!Array.isArray(current)) continue;
		const filtered = current.filter((entry: unknown) => {
			if (!entry || typeof entry !== "object") return true;
			const typedEntry = entry as MastraCodeHookEntry;
			if (typeof typedEntry.command !== "string") return true;
			return !isSupersetManagedMastraCodeHook(typedEntry, notifyPath);
		});
		if (filtered.length > 0) {
			existing[eventName] = filtered;
		} else {
			delete existing[eventName];
		}
	}

	// Register only Start/Stop lifecycle hooks for Mastra Code.
	for (const eventName of MASTRA_CODE_TARGET_EVENT_NAMES) {
		const current = existing[eventName];
		const supersetHook: MastraCodeHookEntry = {
			type: "command",
			command: notifyPath,
		};

		if (Array.isArray(current)) {
			current.push(supersetHook);
		} else {
			existing[eventName] = [supersetHook];
		}
	}

	return JSON.stringify(existing, null, 2);
}

export function createMastraCodeHooksJson(): void {
	const notifyPath = getNotifyScriptPath();
	const globalPath = getMastraCodeHooksJsonPath();
	const content = getMastraCodeHooksJsonContent(notifyPath);

	const dir = path.dirname(globalPath);
	fs.mkdirSync(dir, { recursive: true });
	const changed = writeFileIfChanged(globalPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Mastra Code hooks.json`,
	);
}

export function createMastraCodeWrapper(): void {
	const script = buildWrapperScript("mastracode", `exec "$REAL_BIN" "$@"`);
	createWrapper("mastracode", script);
}
