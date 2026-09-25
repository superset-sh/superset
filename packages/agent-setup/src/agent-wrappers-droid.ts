import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	getManagedNotifyHookCommand,
	isManagedNotifyCommand,
} from "./agent-wrappers-common";
import {
	buildNestedDesiredEntries,
	cleanNestedHookDefinition,
	ensureManagedJsonHooks,
	getManagedJsonHooksContent,
	type ManagedJsonHooksSpec,
	removeManagedJsonHooks,
} from "./managed-json-hooks";
import { getNotifyScriptPath } from "./notify-hook";

interface DroidHookDefinition {
	matcher?: string;
	hooks?: Array<{ type: "command"; command: string; [key: string]: unknown }>;
	[key: string]: unknown;
}

export function getDroidSettingsJsonPath(): string {
	return path.join(os.homedir(), ".factory", "settings.json");
}

export function createDroidWrapper(): void {
	const script = buildWrapperScript("droid", `exec "$REAL_BIN" "$@"`, {
		agentId: "droid",
	});
	createWrapper("droid", script);
}

const DROID_MANAGED_EVENTS: Record<string, { matcher?: string }> = {
	SessionStart: {},
	SessionEnd: {},
	UserPromptSubmit: {},
	Notification: {},
	Stop: {},
	PostToolUse: { matcher: "*" },
};

function droidHooksSpec(
	notifyScriptPath: string,
): ManagedJsonHooksSpec<DroidHookDefinition> {
	return {
		fileLabel: "Droid settings.json",
		agentLabel: "Droid",
		getFilePath: getDroidSettingsJsonPath,
		eventsContainerKey: "hooks",
		// Guarded on SUPERSET_HOME_DIR so the hook is a no-op in droid sessions
		// launched outside Superset terminals (~/.factory/settings.json is global).
		desiredEntriesByEvent: buildNestedDesiredEntries(
			DROID_MANAGED_EVENTS,
			getManagedNotifyHookCommand("droid"),
		),
		cleanEntry: (definition) =>
			cleanNestedHookDefinition(definition, (command) =>
				isManagedNotifyCommand(command, notifyScriptPath),
			),
		dropEmptyContainerOnRemove: true,
	};
}

/**
 * Reads existing ~/.factory/settings.json, merges our hook definitions
 * (identified by notify script path), and preserves any user-defined hooks.
 *
 * Factory Droid uses the same nested hook structure as Claude:
 *   { hooks: { EventName: [{ matcher?, hooks: [{ type, command }] }] } }
 */
export function getDroidSettingsJsonContent(
	notifyScriptPath: string,
): string | null {
	return getManagedJsonHooksContent(droidHooksSpec(notifyScriptPath));
}

/**
 * Removes Superset-managed hook entries from ~/.factory/settings.json,
 * preserving user hooks and non-hook settings. No-op when the file does not
 * exist — teardown must never create config files.
 */
export function removeDroidManagedHooks(): void {
	removeManagedJsonHooks(droidHooksSpec(getNotifyScriptPath()));
}

export function createDroidSettingsJson(): void {
	ensureManagedJsonHooks(droidHooksSpec(getNotifyScriptPath()));
}
