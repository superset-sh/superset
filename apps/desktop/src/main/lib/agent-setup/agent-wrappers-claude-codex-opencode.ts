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
import { OPENCODE_CONFIG_DIR, OPENCODE_PLUGIN_DIR } from "./paths";

export const OPENCODE_PLUGIN_FILE = "superset-notify.js";

const OPENCODE_PLUGIN_SIGNATURE = "// Superset opencode plugin";
const OPENCODE_PLUGIN_VERSION = "v8";
export const OPENCODE_PLUGIN_MARKER = `${OPENCODE_PLUGIN_SIGNATURE} ${OPENCODE_PLUGIN_VERSION}`;

const OPENCODE_PLUGIN_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"opencode-plugin.template.js",
);
const CODEX_WRAPPER_EXEC_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"codex-wrapper-exec.template.sh",
);

export function getOpenCodePluginPath(): string {
	return path.join(OPENCODE_PLUGIN_DIR, OPENCODE_PLUGIN_FILE);
}

/** @see https://opencode.ai/docs/plugins */
export function getOpenCodeGlobalPluginPath(): string {
	const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
	const configHome = xdgConfigHome?.length
		? xdgConfigHome
		: path.join(os.homedir(), ".config");
	return path.join(configHome, "opencode", "plugin", OPENCODE_PLUGIN_FILE);
}

// ---------------------------------------------------------------------------
// Claude ~/.claude/settings.json direct merge (no wrapper needed)
// ---------------------------------------------------------------------------

interface ClaudeHookConfig {
	type: "command";
	command: string;
	timeout?: number;
	[key: string]: unknown;
}

interface ClaudeHookDefinition {
	matcher?: string;
	hooks?: ClaudeHookConfig[];
	[key: string]: unknown;
}

interface ClaudeSettingsJson {
	hooks?: Record<string, ClaudeHookDefinition[]>;
	[key: string]: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isManagedClaudeHookCommand(
	command: string | undefined,
	notifyScriptPath: string,
): boolean {
	return (
		command?.includes(notifyScriptPath) ||
		isSupersetManagedHookCommand(command, NOTIFY_SCRIPT_NAME)
	);
}

function readExistingClaudeSettings(
	globalPath: string,
): ClaudeSettingsJson | null {
	if (!fs.existsSync(globalPath)) {
		return {};
	}

	try {
		const parsed = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
		if (!isPlainObject(parsed)) {
			console.warn(
				"[agent-setup] Expected ~/.claude/settings.json to contain a JSON object; skipping Claude hook merge",
			);
			return null;
		}
		return parsed;
	} catch (error) {
		console.warn(
			"[agent-setup] Could not parse existing ~/.claude/settings.json; skipping Claude hook merge:",
			error,
		);
		return null;
	}
}

function removeManagedClaudeHooksFromDefinition(
	definition: ClaudeHookDefinition,
	notifyScriptPath: string,
): ClaudeHookDefinition | null {
	if (!Array.isArray(definition.hooks)) {
		return definition;
	}

	const filteredHooks = definition.hooks.filter(
		(hook) => !isManagedClaudeHookCommand(hook.command, notifyScriptPath),
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

export function getClaudeGlobalSettingsJsonPath(): string {
	return path.join(os.homedir(), ".claude", "settings.json");
}

/**
 * Reads existing ~/.claude/settings.json, merges our hook definitions
 * (identified by notify script path), and preserves any user-defined hooks
 * and all non-hook settings.
 *
 * Claude Code uses the same nested hook structure as Droid:
 *   { hooks: { EventName: [{ matcher?, hooks: [{ type, command }] }] } }
 */
export function getClaudeGlobalSettingsJsonContent(
	notifyScriptPath: string,
): string | null {
	const globalPath = getClaudeGlobalSettingsJsonPath();
	const existing = readExistingClaudeSettings(globalPath);
	if (!existing) return null;

	if (!existing.hooks || typeof existing.hooks !== "object") {
		existing.hooks = {};
	}

	const managedEvents: Array<{
		eventName:
			| "UserPromptSubmit"
			| "Stop"
			| "PostToolUse"
			| "PostToolUseFailure"
			| "PermissionRequest";
		definition: ClaudeHookDefinition;
	}> = [
		{
			eventName: "UserPromptSubmit",
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
		{
			eventName: "PostToolUseFailure",
			definition: {
				matcher: "*",
				hooks: [{ type: "command", command: notifyScriptPath }],
			},
		},
		{
			eventName: "PermissionRequest",
			definition: {
				matcher: "*",
				hooks: [{ type: "command", command: notifyScriptPath }],
			},
		},
	];

	for (const { eventName, definition } of managedEvents) {
		const current = existing.hooks[eventName];
		if (Array.isArray(current)) {
			const filtered = current.flatMap((def: ClaudeHookDefinition) => {
				const cleaned = removeManagedClaudeHooksFromDefinition(
					def,
					notifyScriptPath,
				);
				return cleaned ? [cleaned] : [];
			});
			filtered.push(definition);
			existing.hooks[eventName] = filtered;
		} else {
			existing.hooks[eventName] = [definition];
		}
	}

	return JSON.stringify(existing, null, 2);
}

/**
 * Writes Superset hook definitions directly into ~/.claude/settings.json.
 * This ensures hooks work regardless of whether the binary wrapper is in PATH,
 * matching the approach used for Cursor, Gemini, Droid, and Mastra.
 */
export function createClaudeSettingsJson(): void {
	const notifyScriptPath = getNotifyScriptPath();
	const globalPath = getClaudeGlobalSettingsJsonPath();
	const content = getClaudeGlobalSettingsJsonContent(notifyScriptPath);
	if (content === null) return;

	const dir = path.dirname(globalPath);
	fs.mkdirSync(dir, { recursive: true });
	const changed = writeFileIfChanged(globalPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Claude settings.json`,
	);
}

export function getOpenCodePluginContent(notifyPath: string): string {
	const template = fs.readFileSync(OPENCODE_PLUGIN_TEMPLATE_PATH, "utf-8");
	return template
		.replace("{{MARKER}}", OPENCODE_PLUGIN_MARKER)
		.replace("{{NOTIFY_PATH}}", notifyPath);
}

export function createClaudeWrapper(): void {
	// Hooks are now written directly to ~/.claude/settings.json via
	// createClaudeSettingsJson(), so the wrapper is a plain pass-through.
	// We still create the wrapper so SUPERSET_* env vars flow through
	// and the notify script can identify the Superset terminal context.
	const script = buildWrapperScript("claude", `exec "$REAL_BIN" "$@"`);
	createWrapper("claude", script);
}

export function createCodexWrapper(): void {
	const notifyPath = getNotifyScriptPath();
	const script = buildWrapperScript(
		"codex",
		buildCodexWrapperExecLine(notifyPath),
	);
	createWrapper("codex", script);
}

export function buildCodexWrapperExecLine(notifyPath: string): string {
	const template = fs.readFileSync(CODEX_WRAPPER_EXEC_TEMPLATE_PATH, "utf-8");
	return template.replaceAll("{{NOTIFY_PATH}}", notifyPath);
}

// ---------------------------------------------------------------------------
// Codex ~/.codex/hooks.json direct merge
// ---------------------------------------------------------------------------

/** Codex hooks.json uses the same nested structure as Claude/Droid settings.json */
type CodexHooksJson = ClaudeSettingsJson;

function readExistingCodexHooks(globalPath: string): CodexHooksJson | null {
	if (!fs.existsSync(globalPath)) {
		return {};
	}

	try {
		const parsed = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
		if (!isPlainObject(parsed)) {
			console.warn(
				"[agent-setup] Expected ~/.codex/hooks.json to contain a JSON object; skipping Codex hook merge",
			);
			return null;
		}
		return parsed;
	} catch (error) {
		console.warn(
			"[agent-setup] Could not parse existing ~/.codex/hooks.json; skipping Codex hook merge:",
			error,
		);
		return null;
	}
}

export function getCodexGlobalHooksJsonPath(): string {
	return path.join(os.homedir(), ".codex", "hooks.json");
}

/**
 * Reads existing ~/.codex/hooks.json, merges our hook definitions
 * (identified by notify script path), and preserves any user-defined hooks.
 *
 * Codex hooks.json uses the same nested structure as Claude/Droid:
 *   { hooks: { EventName: [{ matcher?, hooks: [{ type, command }] }] } }
 *
 * Superset intentionally keeps this native Codex hook registration narrow.
 * The primary integration path is still the wrapper + notify/session-log
 * watcher, which works inside Superset-managed terminal sessions and covers
 * richer lifecycle events like per-turn Start and PermissionRequest.
 *
 * This hooks.json merge is only a fallback for cases where the wrapper is
 * bypassed, so we only register the minimal SessionStart + Stop notifications
 * here rather than trying to mirror Codex's full native hook surface.
 */
export function getCodexGlobalHooksJsonContent(
	notifyScriptPath: string,
): string | null {
	const globalPath = getCodexGlobalHooksJsonPath();
	const existing = readExistingCodexHooks(globalPath);
	if (!existing) return null;

	if (!existing.hooks || typeof existing.hooks !== "object") {
		existing.hooks = {};
	}

	const managedEvents: Array<{
		eventName: "SessionStart" | "Stop";
		definition: ClaudeHookDefinition;
	}> = [
		{
			eventName: "SessionStart",
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
	];

	for (const { eventName, definition } of managedEvents) {
		const current = existing.hooks[eventName];
		if (Array.isArray(current)) {
			const filtered = current.flatMap((def: ClaudeHookDefinition) => {
				const cleaned = removeManagedClaudeHooksFromDefinition(
					def,
					notifyScriptPath,
				);
				return cleaned ? [cleaned] : [];
			});
			filtered.push(definition);
			existing.hooks[eventName] = filtered;
		} else {
			existing.hooks[eventName] = [definition];
		}
	}

	return JSON.stringify(existing, null, 2);
}

/**
 * Writes Superset hook definitions directly into ~/.codex/hooks.json.
 * This provides a fallback notification path that works even when the
 * binary wrapper is not in PATH (e.g. user runs codex from outside
 * a Superset terminal).
 *
 * The wrapper remains the primary integration path for Superset-managed
 * terminals because it can synthesize richer lifecycle events from Codex's
 * notify callback and session log (task_started, approval_request,
 * exec_command_begin) without mutating project-local CODEX_HOME state.
 */
export function createCodexHooksJson(): void {
	const notifyScriptPath = getNotifyScriptPath();
	const globalPath = getCodexGlobalHooksJsonPath();
	const content = getCodexGlobalHooksJsonContent(notifyScriptPath);
	if (content === null) return;

	const dir = path.dirname(globalPath);
	fs.mkdirSync(dir, { recursive: true });
	const changed = writeFileIfChanged(globalPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Codex hooks.json`,
	);
}

/**
 * Writes to environment-specific path only, NOT the global path.
 * Global path causes dev/prod conflicts when both are running.
 */
export function createOpenCodePlugin(): void {
	const pluginPath = getOpenCodePluginPath();
	const notifyPath = getNotifyScriptPath();
	const content = getOpenCodePluginContent(notifyPath);
	const changed = writeFileIfChanged(pluginPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} OpenCode plugin`,
	);
}

/**
 * Removes stale global plugin written by older versions.
 * Only removes if the file contains our signature to avoid deleting user plugins.
 */
export function cleanupGlobalOpenCodePlugin(): void {
	try {
		const globalPluginPath = getOpenCodeGlobalPluginPath();
		if (!fs.existsSync(globalPluginPath)) return;

		const content = fs.readFileSync(globalPluginPath, "utf-8");
		if (content.includes(OPENCODE_PLUGIN_SIGNATURE)) {
			fs.unlinkSync(globalPluginPath);
			console.log(
				"[agent-setup] Removed stale global OpenCode plugin to prevent dev/prod conflicts",
			);
		}
	} catch (error) {
		console.warn(
			"[agent-setup] Failed to cleanup global OpenCode plugin:",
			error,
		);
	}
}

export function createOpenCodeWrapper(): void {
	const script = buildWrapperScript(
		"opencode",
		`export OPENCODE_CONFIG_DIR="${OPENCODE_CONFIG_DIR}"\nexec "$REAL_BIN" "$@"`,
	);
	createWrapper("opencode", script);
}
