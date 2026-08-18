import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	getManagedNotifyHookCommand,
	isManagedNotifyCommand,
	writeFileIfChanged,
} from "./agent-wrappers-common";
import { getTemplatePath } from "./config";
import {
	buildNestedDesiredEntries,
	cleanNestedHookDefinition,
	ensureManagedJsonHooks,
	getManagedJsonHooksContent,
	type ManagedJsonHooksSpec,
	removeManagedJsonHooks,
} from "./managed-json-hooks";
import { getNotifyScriptPath } from "./notify-hook";
import { getOpenCodeConfigDir, getOpenCodePluginDir } from "./paths";

export const OPENCODE_PLUGIN_FILE = "superset-notify.js";

const OPENCODE_PLUGIN_SIGNATURE = "// Superset opencode plugin";
const OPENCODE_PLUGIN_VERSION = "v8";
export const OPENCODE_PLUGIN_MARKER = `${OPENCODE_PLUGIN_SIGNATURE} ${OPENCODE_PLUGIN_VERSION}`;

/**
 * Returns the environment-scoped OpenCode plugin path under Superset home.
 */
export function getOpenCodePluginPath(): string {
	return path.join(getOpenCodePluginDir(), OPENCODE_PLUGIN_FILE);
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

interface ClaudeHookDefinition {
	matcher?: string;
	hooks?: Array<{ type: "command"; command: string; [key: string]: unknown }>;
	[key: string]: unknown;
}

/** Shell command written into Claude's global hook config. */
export function getClaudeManagedHookCommand(): string {
	return getManagedNotifyHookCommand("claude");
}

/**
 * Returns the global Claude settings path used for native hook registration.
 */
export function getClaudeGlobalSettingsJsonPath(): string {
	return path.join(os.homedir(), ".claude", "settings.json");
}

// StopFailure is the API-error hook; it fires while the session stays alive,
// unlike Stop.
const CLAUDE_MANAGED_EVENTS: Record<string, { matcher?: string }> = {
	SessionStart: {},
	SessionEnd: {},
	UserPromptSubmit: {},
	Stop: {},
	StopFailure: {},
	PostToolUse: { matcher: "*" },
	PostToolUseFailure: { matcher: "*" },
	PermissionRequest: { matcher: "*" },
};

function claudeHooksSpec(
	notifyScriptPath: string,
): ManagedJsonHooksSpec<ClaudeHookDefinition> {
	return {
		fileLabel: "Claude settings.json",
		agentLabel: "Claude",
		getFilePath: getClaudeGlobalSettingsJsonPath,
		eventsContainerKey: "hooks",
		desiredEntriesByEvent: buildNestedDesiredEntries(
			CLAUDE_MANAGED_EVENTS,
			getClaudeManagedHookCommand(),
		),
		cleanEntry: (definition) =>
			cleanNestedHookDefinition(definition, (command) =>
				isManagedNotifyCommand(command, notifyScriptPath),
			),
		dropEmptyContainerOnRemove: true,
	};
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
	return getManagedJsonHooksContent(claudeHooksSpec(notifyScriptPath));
}

/**
 * Writes Superset hook definitions directly into ~/.claude/settings.json.
 * This ensures hooks work regardless of whether the binary wrapper is in PATH,
 * matching the approach used for Cursor, Gemini, Droid, and Mastra.
 */
export function createClaudeSettingsJson(): void {
	ensureManagedJsonHooks(claudeHooksSpec(getNotifyScriptPath()));
}

/**
 * Removes Superset-managed hook entries from ~/.claude/settings.json,
 * preserving user hooks and all non-hook settings. No-op when the file does
 * not exist — teardown must never create config files.
 */
export function removeClaudeManagedHooks(): void {
	removeManagedJsonHooks(claudeHooksSpec(getNotifyScriptPath()));
}

/**
 * Merges Superset hooks into `<configDir>/settings.json` for a secondary
 * Claude profile (CLAUDE_CONFIG_DIR account). Without this, agents launched
 * on a non-default account would lose lifecycle/status hooks — Claude reads
 * settings exclusively from the active config dir.
 */
export function ensureClaudeManagedHooksAt(configDir: string): void {
	ensureManagedJsonHooks({
		...claudeHooksSpec(getNotifyScriptPath()),
		getFilePath: () => path.join(configDir, "settings.json"),
	});
}

// ---------------------------------------------------------------------------
// Codex ~/.codex/hooks.json direct merge
// ---------------------------------------------------------------------------

/**
 * Returns the global Codex hooks.json path used for fallback hook registration.
 */
export function getCodexGlobalHooksJsonPath(): string {
	return path.join(os.homedir(), ".codex", "hooks.json");
}

const CODEX_MANAGED_EVENTS: Record<string, { matcher?: string }> = {
	SessionStart: {},
	UserPromptSubmit: {},
	Stop: {},
};

function codexHooksSpec(
	notifyScriptPath: string,
): ManagedJsonHooksSpec<ClaudeHookDefinition> {
	return {
		fileLabel: "Codex hooks.json",
		agentLabel: "Codex",
		getFilePath: getCodexGlobalHooksJsonPath,
		eventsContainerKey: "hooks",
		// Guarded on SUPERSET_HOME_DIR so the hook is a no-op in codex sessions
		// launched outside Superset terminals. Superset terminals without the
		// PATH wrapper still export SUPERSET_HOME_DIR, so the outside-wrapper
		// fallback this file provides keeps working.
		desiredEntriesByEvent: buildNestedDesiredEntries(
			CODEX_MANAGED_EVENTS,
			getManagedNotifyHookCommand("codex"),
		),
		cleanEntry: (definition) =>
			cleanNestedHookDefinition(definition, (command) =>
				isManagedNotifyCommand(command, notifyScriptPath),
			),
		dropEmptyContainerOnRemove: true,
	};
}

/**
 * Reads existing ~/.codex/hooks.json, merges our hook definitions
 * (identified by notify script path), and preserves any user-defined hooks.
 * Stale Superset-managed commands are stripped from every event, including
 * events we no longer manage natively (e.g. from older builds).
 *
 * Codex hooks.json uses the same nested structure as Claude/Droid:
 *   { hooks: { EventName: [{ matcher?, hooks: [{ type, command }] }] } }
 *
 * Superset uses native Codex hooks as the durable lifecycle integration path.
 * Recent Codex builds no longer emit the older session-log shapes our wrapper
 * watcher depended on, so we register prompt/tool lifecycle hooks directly in
 * ~/.codex/hooks.json and treat the wrapper session-log watcher as best-effort
 * compatibility for older releases.
 */
export function getCodexGlobalHooksJsonContent(
	notifyScriptPath: string,
): string | null {
	return getManagedJsonHooksContent(codexHooksSpec(notifyScriptPath));
}

/**
 * Writes Superset hook definitions directly into ~/.codex/hooks.json.
 * This provides a fallback notification path that works even when the
 * binary wrapper is not in PATH (e.g. user runs codex from outside
 * a Superset terminal).
 */
export function createCodexHooksJson(): void {
	ensureManagedJsonHooks(codexHooksSpec(getNotifyScriptPath()));
}

/**
 * Removes Superset-managed hook entries from ~/.codex/hooks.json, preserving
 * user hooks. No-op when the file does not exist.
 */
export function removeCodexManagedHooks(): void {
	removeManagedJsonHooks(codexHooksSpec(getNotifyScriptPath()));
}

/**
 * Merges Superset hooks into `<codexHome>/hooks.json` for a secondary Codex
 * home (CODEX_HOME account) — same rationale as ensureClaudeManagedHooksAt.
 */
export function ensureCodexManagedHooksAt(codexHome: string): void {
	ensureManagedJsonHooks({
		...codexHooksSpec(getNotifyScriptPath()),
		getFilePath: () => path.join(codexHome, "hooks.json"),
	});
}

// ---------------------------------------------------------------------------
// Wrappers and OpenCode plugin
// ---------------------------------------------------------------------------

/**
 * Renders the OpenCode plugin file content with the current notify script path.
 */
export function getOpenCodePluginContent(notifyPath: string): string {
	const template = fs.readFileSync(
		getTemplatePath("opencode-plugin.template.js"),
		"utf-8",
	);
	return template
		.replace("{{MARKER}}", OPENCODE_PLUGIN_MARKER)
		.replace("{{NOTIFY_PATH}}", notifyPath);
}

/**
 * Pass-through wrapper for Claude. Hooks live in ~/.claude/settings.json
 * (createClaudeSettingsJson); the wrapper exists only to forward SUPERSET_*
 * env vars into the agent process tree.
 */
export function createClaudeWrapper(): void {
	const script = buildWrapperScript("claude", `exec "$REAL_BIN" "$@"`, {
		agentId: "claude",
	});
	createWrapper("claude", script);
}

/**
 * Creates the Codex wrapper that enables native hooks and session-log signals.
 */
export function createCodexWrapper(): void {
	const notifyPath = getNotifyScriptPath();
	const script = buildWrapperScript(
		"codex",
		buildCodexWrapperExecLine(notifyPath),
		{ agentId: "codex" },
	);
	createWrapper("codex", script);
}

/**
 * Builds the Codex wrapper exec block from the shell template.
 */
export function buildCodexWrapperExecLine(notifyPath: string): string {
	const template = fs.readFileSync(
		getTemplatePath("codex-wrapper-exec.template.sh"),
		"utf-8",
	);
	return template.replaceAll("{{NOTIFY_PATH}}", notifyPath);
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

/**
 * Creates the OpenCode wrapper with an environment-scoped config directory.
 */
export function createOpenCodeWrapper(): void {
	const script = buildWrapperScript(
		"opencode",
		`export OPENCODE_CONFIG_DIR="${getOpenCodeConfigDir()}"\nexec "$REAL_BIN" "$@"`,
		{ agentId: "opencode" },
	);
	createWrapper("opencode", script);
}
