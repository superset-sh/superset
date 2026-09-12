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

interface DevinHookDefinition {
	matcher?: string;
	hooks?: Array<{ type: "command"; command: string; [key: string]: unknown }>;
	[key: string]: unknown;
}

/**
 * Devin CLI reads its user config from `$XDG_CONFIG_HOME/devin/config.json`
 * (`~/.config/devin/config.json` by default); `--config` can point elsewhere
 * but Superset launches never pass it.
 */
export function getDevinConfigJsonPath(): string {
	const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
	const configHome = xdgConfigHome?.length
		? xdgConfigHome
		: path.join(os.homedir(), ".config");
	return path.join(configHome, "devin", "config.json");
}

// Devin's hooks are Claude Code's contract: the same event names, the same
// `{ hooks: { Event: [{ hooks: [{ type, command }] }] } }` layout, and a JSON
// payload with `hook_event_name` and `session_id` on stdin (verified against
// Devin CLI 3000.10.21, in print mode too). It accepts only these events
// plus PreToolUse and PostCompaction; an unknown event name makes it drop
// the whole `hooks` block.
const DEVIN_MANAGED_EVENTS: Record<string, { matcher?: string }> = {
	SessionStart: {},
	SessionEnd: {},
	UserPromptSubmit: {},
	Stop: {},
	PostToolUse: {},
	PermissionRequest: {},
};

function devinHooksSpec(
	notifyScriptPath: string,
): ManagedJsonHooksSpec<DevinHookDefinition> {
	return {
		fileLabel: "Devin config.json",
		agentLabel: "Devin",
		getFilePath: getDevinConfigJsonPath,
		eventsContainerKey: "hooks",
		desiredEntriesByEvent: buildNestedDesiredEntries(
			DEVIN_MANAGED_EVENTS,
			getManagedNotifyHookCommand("devin"),
		),
		cleanEntry: (definition) =>
			cleanNestedHookDefinition(definition, (command) =>
				isManagedNotifyCommand(command, notifyScriptPath),
			),
		// Devin refuses a config without its schema version.
		applyRootDefaults: (root) => {
			if (!root.version) root.version = 1;
		},
		dropEmptyContainerOnRemove: true,
	};
}

export function getDevinConfigJsonContent(
	notifyScriptPath: string,
): string | null {
	return getManagedJsonHooksContent(devinHooksSpec(notifyScriptPath));
}

export function createDevinConfigJson(): void {
	ensureManagedJsonHooks(devinHooksSpec(getNotifyScriptPath()));
}

export function removeDevinManagedHooks(): void {
	removeManagedJsonHooks(devinHooksSpec(getNotifyScriptPath()));
}

/** Forwards SUPERSET_* env into the agent process tree; hooks live in
 * config.json (createDevinConfigJson). */
export function createDevinWrapper(): void {
	const script = buildWrapperScript("devin", 'exec "$REAL_BIN" "$@"', {
		agentId: "devin",
	});
	createWrapper("devin", script);
}
