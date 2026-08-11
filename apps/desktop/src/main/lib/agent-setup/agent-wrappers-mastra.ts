import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	getManagedNotifyHookCommand,
	isManagedNotifyCommand,
} from "./agent-wrappers-common";
import {
	ensureManagedJsonHooks,
	getManagedJsonHooksContent,
	type ManagedJsonHooksSpec,
	removeManagedJsonHooks,
} from "./managed-json-hooks";
import { getNotifyScriptPath } from "./notify-hook";

interface MastraHookDefinition {
	type: "command";
	command: string;
	[key: string]: unknown;
}

export function getMastraGlobalHooksJsonPath(): string {
	return path.join(os.homedir(), ".mastracode", "hooks.json");
}

export function createMastraWrapper(): void {
	const script = buildWrapperScript("mastracode", `exec "$REAL_BIN" "$@"`, {
		agentId: "mastracode",
	});
	createWrapper("mastracode", script);
}

// Session lifecycle drives the pane icon binding; per-prompt drives status.
const MASTRA_MANAGED_EVENTS = [
	"SessionStart",
	"SessionEnd",
	"UserPromptSubmit",
	"Stop",
	"PostToolUse",
] as const;

function mastraHooksSpec(
	notifyScriptPath: string,
): ManagedJsonHooksSpec<MastraHookDefinition> {
	// Guarded on SUPERSET_HOME_DIR so the hook is a no-op in mastracode
	// sessions launched outside Superset terminals (hooks.json is global).
	const notifyCommand = getManagedNotifyHookCommand("mastracode");
	return {
		fileLabel: "Mastra hooks.json",
		agentLabel: "Mastra",
		getFilePath: getMastraGlobalHooksJsonPath,
		// Mastra's hooks.json maps event names at the root, with flat entries:
		//   { EventName: [{ type, command }] }
		eventsContainerKey: null,
		desiredEntriesByEvent: Object.fromEntries(
			MASTRA_MANAGED_EVENTS.map((eventName) => [
				eventName,
				[{ type: "command" as const, command: notifyCommand }],
			]),
		),
		cleanEntry: (entry) =>
			isManagedNotifyCommand(entry.command, notifyScriptPath) ? null : entry,
	};
}

/**
 * Reads existing ~/.mastracode/hooks.json, merges our hook entries (identified
 * by notify script path), and preserves any user-defined hooks.
 */
export function getMastraHooksJsonContent(
	notifyScriptPath: string,
): string | null {
	return getManagedJsonHooksContent(mastraHooksSpec(notifyScriptPath));
}

/**
 * Removes Superset-managed hook entries from ~/.mastracode/hooks.json,
 * preserving user hooks. No-op when the file does not exist.
 */
export function removeMastraManagedHooks(): void {
	removeManagedJsonHooks(mastraHooksSpec(getNotifyScriptPath()));
}

export function createMastraHooksJson(): void {
	ensureManagedJsonHooks(mastraHooksSpec(getNotifyScriptPath()));
}
