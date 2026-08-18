import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	isSupersetManagedHookCommand,
	writeFileIfChanged,
} from "./agent-wrappers-common";
import { getTemplatePath, getV1NotificationsPort } from "./config";
import {
	ensureManagedJsonHooks,
	getManagedJsonHooksContent,
	type ManagedJsonHooksSpec,
	removeManagedJsonHooks,
} from "./managed-json-hooks";
import { getHooksDir } from "./paths";

export const GEMINI_HOOK_SCRIPT_NAME = "gemini-hook.sh";

const GEMINI_HOOK_SIGNATURE = "# Superset gemini hook";
const GEMINI_HOOK_VERSION = "v6";
export const GEMINI_HOOK_MARKER = `${GEMINI_HOOK_SIGNATURE} ${GEMINI_HOOK_VERSION}`;

interface GeminiHookDefinition {
	matcher?: string;
	command?: string;
	hooks?: Array<{ type: string; command: string; [key: string]: unknown }>;
	[key: string]: unknown;
}

export function getGeminiHookScriptPath(): string {
	return path.join(getHooksDir(), GEMINI_HOOK_SCRIPT_NAME);
}

export function getGeminiSettingsJsonPath(): string {
	return path.join(os.homedir(), ".gemini", "settings.json");
}

export function getGeminiHookScriptContent(): string {
	const template = fs.readFileSync(
		getTemplatePath("gemini-hook.template.sh"),
		"utf-8",
	);
	return template
		.replace("{{MARKER}}", GEMINI_HOOK_MARKER)
		.replaceAll("{{DEFAULT_PORT}}", String(getV1NotificationsPort()));
}

// HookEventName values from gemini-cli's packages/core/src/hooks/types.ts.
const GEMINI_MANAGED_EVENTS = [
	"SessionStart",
	"SessionEnd",
	"BeforeAgent",
	"AfterAgent",
	"AfterTool",
] as const;

function geminiHooksSpec(
	hookScriptPath: string,
): ManagedJsonHooksSpec<GeminiHookDefinition> {
	const isManagedCommand = (command: string | undefined) =>
		command?.includes(hookScriptPath) ||
		isSupersetManagedHookCommand(command, GEMINI_HOOK_SCRIPT_NAME);
	return {
		fileLabel: "Gemini settings.json",
		agentLabel: "Gemini",
		getFilePath: getGeminiSettingsJsonPath,
		eventsContainerKey: "hooks",
		desiredEntriesByEvent: Object.fromEntries(
			GEMINI_MANAGED_EVENTS.map((eventName) => [
				eventName,
				[{ hooks: [{ type: "command", command: hookScriptPath }] }],
			]),
		),
		// A definition is dropped whole when it carries our command either as a
		// legacy flat `command` or inside its nested hooks — Superset never
		// shares a definition with user hooks in Gemini's config.
		cleanEntry: (definition) =>
			isSupersetManagedHookCommand(
				definition.command,
				GEMINI_HOOK_SCRIPT_NAME,
			) || definition.hooks?.some((hook) => isManagedCommand(hook.command))
				? null
				: definition,
		dropEmptyContainerOnRemove: true,
	};
}

/**
 * Reads existing ~/.gemini/settings.json, merges our hook definitions (identified by
 * hook script path), and preserves any user-defined settings/hooks.
 *
 * Gemini CLI uses a two-level nesting format:
 *   { hooks: { EventName: [{ matcher?, hooks: [{ type, command }] }] } }
 */
export function getGeminiSettingsJsonContent(
	hookScriptPath: string,
): string | null {
	return getManagedJsonHooksContent(geminiHooksSpec(hookScriptPath));
}

export function createGeminiHookScript(): void {
	const scriptPath = getGeminiHookScriptPath();
	const content = getGeminiHookScriptContent();
	const changed = writeFileIfChanged(scriptPath, content, 0o755);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Gemini hook script`,
	);
}

export function createGeminiWrapper(): void {
	const script = buildWrapperScript("gemini", `exec "$REAL_BIN" "$@"`, {
		agentId: "gemini",
	});
	createWrapper("gemini", script);
}

/**
 * Removes Superset-managed hook definitions from ~/.gemini/settings.json,
 * preserving user hooks and non-hook settings. No-op when the file does not
 * exist.
 */
export function removeGeminiManagedHooks(): void {
	removeManagedJsonHooks(geminiHooksSpec(getGeminiHookScriptPath()));
}

export function createGeminiSettingsJson(): void {
	ensureManagedJsonHooks(geminiHooksSpec(getGeminiHookScriptPath()));
}
