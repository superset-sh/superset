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

interface QoderHookConfig {
	type: "command";
	command: string;
	[key: string]: unknown;
}

interface QoderHookDefinition {
	hooks?: QoderHookConfig[];
	[key: string]: unknown;
}

interface QoderSettingsJson {
	hooks?: Record<string, QoderHookDefinition[]>;
	[key: string]: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isManagedHookCommand(
	command: string | undefined,
	notifyScriptPath: string,
): boolean {
	return (
		command?.includes(notifyScriptPath) ||
		isSupersetManagedHookCommand(command, NOTIFY_SCRIPT_NAME)
	);
}

function readExistingQoderSettings(
	globalPath: string,
): QoderSettingsJson | null {
	if (!fs.existsSync(globalPath)) {
		return {};
	}

	try {
		const parsed = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
		if (!isPlainObject(parsed)) {
			console.warn(
				"[agent-setup] Expected ~/.qoder/settings.json to contain a JSON object; skipping Qoder hook merge",
			);
			return null;
		}
		return parsed;
	} catch (error) {
		console.warn(
			"[agent-setup] Could not parse existing ~/.qoder/settings.json; skipping Qoder hook merge:",
			error,
		);
		return null;
	}
}

function removeManagedHooksFromDefinition(
	definition: QoderHookDefinition,
	notifyScriptPath: string,
): QoderHookDefinition | null {
	if (!Array.isArray(definition.hooks)) {
		return definition;
	}

	const filteredHooks = definition.hooks.filter(
		(hook) => !isManagedHookCommand(hook.command, notifyScriptPath),
	);

	if (filteredHooks.length === definition.hooks.length) {
		return definition;
	}

	if (filteredHooks.length === 0) {
		return null;
	}

	return {
		...definition,
		hooks: filteredHooks,
	};
}

export function getQoderSettingsJsonPath(): string {
	return path.join(os.homedir(), ".qoder", "settings.json");
}

export function createQoderWrapper(): void {
	const script = buildWrapperScript("qodercli", `exec "$REAL_BIN" "$@"`);
	createWrapper("qodercli", script);
}

/**
 * Reads existing ~/.qoder/settings.json, merges our Notification hook
 * definition (identified by notify script path), and preserves any user-defined
 * hooks.
 *
 * Qoder CLI currently supports Notification hooks only:
 *   { hooks: { Notification: [{ hooks: [{ type, command }] }] } }
 */
export function getQoderSettingsJsonContent(
	notifyScriptPath: string,
): string | null {
	const globalPath = getQoderSettingsJsonPath();
	const existing = readExistingQoderSettings(globalPath);
	if (!existing) return null;

	if (!existing.hooks || typeof existing.hooks !== "object") {
		existing.hooks = {};
	}

	const current = existing.hooks.Notification;
	const definition: QoderHookDefinition = {
		hooks: [{ type: "command", command: notifyScriptPath }],
	};

	if (Array.isArray(current)) {
		const filtered = current.flatMap((entry: QoderHookDefinition) => {
			const cleaned = removeManagedHooksFromDefinition(entry, notifyScriptPath);
			return cleaned ? [cleaned] : [];
		});
		filtered.push(definition);
		existing.hooks.Notification = filtered;
	} else {
		existing.hooks.Notification = [definition];
	}

	return JSON.stringify(existing, null, 2);
}

export function createQoderSettingsJson(): void {
	const notifyScriptPath = getNotifyScriptPath();
	const globalPath = getQoderSettingsJsonPath();
	const content = getQoderSettingsJsonContent(notifyScriptPath);
	if (content === null) return;

	const dir = path.dirname(globalPath);
	fs.mkdirSync(dir, { recursive: true });
	const changed = writeFileIfChanged(globalPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Qoder settings.json`,
	);
}
