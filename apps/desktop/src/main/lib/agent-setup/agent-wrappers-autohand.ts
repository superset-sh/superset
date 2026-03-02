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

interface AutohandHookEntry {
	event: string;
	command: string;
	enabled: boolean;
	[key: string]: unknown;
}

interface AutohandHooksSection {
	enabled?: boolean;
	hooks?: AutohandHookEntry[];
	[key: string]: unknown;
}

interface AutohandConfig {
	provider?: string;
	hooks?: AutohandHooksSection;
	[key: string]: unknown;
}

function quoteShellPath(filePath: string): string {
	return `'${filePath.replaceAll("'", "'\\''")}'`;
}

export function getAutohandGlobalConfigPath(): string {
	const autohandHome =
		process.env.AUTOHAND_HOME || path.join(os.homedir(), ".autohand");
	return path.join(autohandHome, "config.json");
}

export function createAutohandWrapper(): void {
	const script = buildWrapperScript("autohand", `exec "$REAL_BIN" "$@"`);
	createWrapper("autohand", script);
}

/**
 * Reads existing ~/.autohand/config.json (or $AUTOHAND_HOME/config.json),
 * merges our hook entries (identified by notify script path), and preserves
 * all non-hook settings (provider, workspace, ui, permissions, mcp, etc.).
 *
 * Autohand uses a nested hooks format:
 *   { hooks: { enabled: true, hooks: [{ event, command, enabled }] } }
 *
 * Event mapping (Superset -> Autohand):
 *   UserPromptSubmit -> pre-prompt
 *   Stop -> stop
 *   PostToolUse -> post-tool
 */
export function getAutohandHooksConfigContent(
	notifyScriptPath: string,
): string {
	const globalPath = getAutohandGlobalConfigPath();

	let existing: AutohandConfig = {};
	try {
		if (fs.existsSync(globalPath)) {
			existing = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
		}
	} catch {
		console.warn(
			"[agent-setup] Could not parse existing Autohand config.json, merging carefully",
		);
	}

	if (!existing.hooks || typeof existing.hooks !== "object") {
		existing.hooks = { enabled: true, hooks: [] };
	}

	if (existing.hooks.enabled === undefined) {
		existing.hooks.enabled = true;
	}

	const notifyCommand = `bash ${quoteShellPath(notifyScriptPath)}`;
	const managedEvents = ["pre-prompt", "stop", "post-tool"] as const;

	const currentHooks = Array.isArray(existing.hooks.hooks)
		? existing.hooks.hooks
		: [];

	// Filter out stale Superset-managed hooks
	const filtered = currentHooks.filter(
		(entry: AutohandHookEntry) =>
			!(
				entry.command?.includes(notifyScriptPath) ||
				isSupersetManagedHookCommand(entry.command, NOTIFY_SCRIPT_NAME)
			),
	);

	// Add fresh hooks for all managed events
	for (const event of managedEvents) {
		filtered.push({ event, command: notifyCommand, enabled: true });
	}

	existing.hooks.hooks = filtered;

	return JSON.stringify(existing, null, 2);
}

export function createAutohandHooksConfig(): void {
	const notifyScriptPath = getNotifyScriptPath();
	const globalPath = getAutohandGlobalConfigPath();
	const content = getAutohandHooksConfigContent(notifyScriptPath);

	const dir = path.dirname(globalPath);
	fs.mkdirSync(dir, { recursive: true });
	const changed = writeFileIfChanged(globalPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Autohand config.json`,
	);
}
