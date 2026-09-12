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

interface MuseHookDefinition {
	matcher?: string;
	hooks?: Array<{ type: "command"; command: string; [key: string]: unknown }>;
	[key: string]: unknown;
}

/** Muse Code reads its user settings from `$XDG_CONFIG_HOME/muse/settings.json`
 * (`~/.config/muse/settings.json` by default). */
export function getMuseSettingsJsonPath(): string {
	const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
	const configHome = xdgConfigHome?.length
		? xdgConfigHome
		: path.join(os.homedir(), ".config");
	return path.join(configHome, "muse", "settings.json");
}

// Muse's user hooks are Claude Code's contract — the same event names, the
// same nested `{ hooks: { Event: [{ hooks: [{ type, command }] }] } }` layout
// under the settings `hooks` key, and a stdin payload carrying
// `hook_event_name`, `session_id` and `cwd` (verified against Muse Code 1.1.1:
// a flat `{id, event, command}` list is its plugin manifest shape and is
// rejected as malformed in settings).
const MUSE_MANAGED_EVENTS: Record<string, { matcher?: string }> = {
	SessionStart: {},
	SessionEnd: {},
	UserPromptSubmit: {},
	Stop: {},
	PostToolUse: {},
	PermissionRequest: {},
};

function museHooksSpec(
	notifyScriptPath: string,
): ManagedJsonHooksSpec<MuseHookDefinition> {
	return {
		fileLabel: "Muse settings.json",
		agentLabel: "Muse Code",
		getFilePath: getMuseSettingsJsonPath,
		eventsContainerKey: "hooks",
		desiredEntriesByEvent: buildNestedDesiredEntries(
			MUSE_MANAGED_EVENTS,
			getManagedNotifyHookCommand("muse"),
		),
		cleanEntry: (definition) =>
			cleanNestedHookDefinition(definition, (command) =>
				isManagedNotifyCommand(command, notifyScriptPath),
			),
		// Muse refuses to start on a settings file without its schema version.
		applyRootDefaults: (root) => {
			if (!root.schema_version) root.schema_version = 1;
		},
		dropEmptyContainerOnRemove: true,
	};
}

export function getMuseSettingsJsonContent(
	notifyScriptPath: string,
): string | null {
	return getManagedJsonHooksContent(museHooksSpec(notifyScriptPath));
}

export function createMuseSettingsJson(): void {
	ensureManagedJsonHooks(museHooksSpec(getNotifyScriptPath()));
}

export function removeMuseManagedHooks(): void {
	removeManagedJsonHooks(museHooksSpec(getNotifyScriptPath()));
}

/** Forwards SUPERSET_* env into the agent process tree; hooks live in
 * settings.json (createMuseSettingsJson). */
export function createMuseWrapper(): void {
	const script = buildWrapperScript("muse", 'exec "$REAL_BIN" "$@"', {
		agentId: "muse",
	});
	createWrapper("muse", script);
}
