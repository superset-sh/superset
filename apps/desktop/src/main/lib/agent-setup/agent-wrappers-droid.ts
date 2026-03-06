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

interface DroidHookConfig {
	type: "command";
	command: string;
	timeout?: number;
	[key: string]: unknown;
}

interface DroidHookDefinition {
	matcher?: string;
	hooks?: DroidHookConfig[];
	[key: string]: unknown;
}

interface DroidSettingsJson {
	hooks?: Record<string, DroidHookDefinition[]>;
	[key: string]: unknown;
}

export function getDroidSettingsJsonPath(): string {
	return path.join(os.homedir(), ".factory", "settings.json");
}

export function createDroidWrapper(): void {
	const script = buildWrapperScript("droid", `exec "$REAL_BIN" "$@"`);
	createWrapper("droid", script);
}

/**
 * Reads existing ~/.factory/settings.json, merges our hook definitions
 * (identified by notify script path), and preserves any user-defined hooks.
 *
 * Factory Droid uses the same nested hook structure as Claude:
 *   { hooks: { EventName: [{ matcher?, hooks: [{ type, command }] }] } }
 */
export function getDroidSettingsJsonContent(notifyScriptPath: string): string {
	const globalPath = getDroidSettingsJsonPath();

	let existing: DroidSettingsJson = {};
	try {
		if (fs.existsSync(globalPath)) {
			existing = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
		}
	} catch {
		console.warn(
			"[agent-setup] Could not parse existing ~/.factory/settings.json, merging carefully",
		);
	}

	if (!existing.hooks || typeof existing.hooks !== "object") {
		existing.hooks = {};
	}

	const managedEvents: Array<{
		eventName: "UserPromptSubmit" | "Notification" | "Stop" | "PostToolUse";
		definition: DroidHookDefinition;
	}> = [
		{
			eventName: "UserPromptSubmit",
			definition: {
				hooks: [{ type: "command", command: notifyScriptPath }],
			},
		},
		{
			eventName: "Notification",
			definition: {
				hooks: [{ type: "command", command: notifyScriptPath }],
			},
		},
		{
			eventName: "Stop",
			definition: {
				hooks: [{ type: "command", command: notifyScriptPath }],
			},
		},
		{
			eventName: "PostToolUse",
			definition: {
				matcher: "*",
				hooks: [{ type: "command", command: notifyScriptPath }],
			},
		},
	];

	for (const { eventName, definition } of managedEvents) {
		const current = existing.hooks[eventName];
		if (Array.isArray(current)) {
			const filtered = current.filter(
				(def: DroidHookDefinition) =>
					!def.hooks?.some(
						(hook) =>
							hook.command?.includes(notifyScriptPath) ||
							isSupersetManagedHookCommand(hook.command, NOTIFY_SCRIPT_NAME),
					),
			);
			filtered.push(definition);
			existing.hooks[eventName] = filtered;
		} else {
			existing.hooks[eventName] = [definition];
		}
	}

	return JSON.stringify(existing, null, 2);
}

export function createDroidSettingsJson(): void {
	const notifyScriptPath = getNotifyScriptPath();
	const globalPath = getDroidSettingsJsonPath();
	const content = getDroidSettingsJsonContent(notifyScriptPath);

	const dir = path.dirname(globalPath);
	fs.mkdirSync(dir, { recursive: true });
	const changed = writeFileIfChanged(globalPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Droid settings.json`,
	);
}
