import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "shared/env.shared";
import {
	buildWrapperScript,
	createWrapper,
	isSupersetManagedHookCommand,
	writeFileIfChanged,
} from "./agent-wrappers-common";
import {
	ensureManagedJsonHooks,
	getManagedJsonHooksContent,
	type ManagedJsonHooksSpec,
	removeManagedJsonHooks,
} from "./managed-json-hooks";
import { HOOKS_DIR } from "./paths";

export const CURSOR_HOOK_SCRIPT_NAME = "cursor-hook.sh";

const CURSOR_HOOK_SIGNATURE = "# Superset cursor hook";
const CURSOR_HOOK_VERSION = "v6";
export const CURSOR_HOOK_MARKER = `${CURSOR_HOOK_SIGNATURE} ${CURSOR_HOOK_VERSION}`;

const CURSOR_HOOK_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"cursor-hook.template.sh",
);

interface CursorHookEntry {
	command: string;
	[key: string]: unknown;
}

export function getCursorHookScriptPath(): string {
	return path.join(HOOKS_DIR, CURSOR_HOOK_SCRIPT_NAME);
}

export function getCursorGlobalHooksJsonPath(): string {
	return path.join(os.homedir(), ".cursor", "hooks.json");
}

export function getCursorHookScriptContent(): string {
	const template = fs.readFileSync(CURSOR_HOOK_TEMPLATE_PATH, "utf-8");
	return template
		.replace("{{MARKER}}", CURSOR_HOOK_MARKER)
		.replaceAll("{{DEFAULT_PORT}}", String(env.DESKTOP_NOTIFICATIONS_PORT));
}

// Cursor invokes the hook script with the event name as argv; the script
// path is absolute (per-install), so the outside-Superset guard lives inside
// the script rather than in the registered command.
const CURSOR_MANAGED_EVENT_ARGS: Record<string, string> = {
	sessionStart: "SessionStart",
	sessionEnd: "SessionEnd",
	beforeSubmitPrompt: "Start",
	stop: "Stop",
	beforeShellExecution: "PermissionRequest",
	beforeMCPExecution: "PermissionRequest",
};

function cursorHooksSpec(
	hookScriptPath: string,
): ManagedJsonHooksSpec<CursorHookEntry> {
	return {
		fileLabel: "Cursor hooks.json",
		agentLabel: "Cursor",
		getFilePath: getCursorGlobalHooksJsonPath,
		eventsContainerKey: "hooks",
		desiredEntriesByEvent: Object.fromEntries(
			Object.entries(CURSOR_MANAGED_EVENT_ARGS).map(([eventName, arg]) => [
				eventName,
				[{ command: `${hookScriptPath} ${arg}` }],
			]),
		),
		cleanEntry: (entry) =>
			entry.command?.includes(hookScriptPath) ||
			isSupersetManagedHookCommand(entry.command, CURSOR_HOOK_SCRIPT_NAME)
				? null
				: entry,
		applyRootDefaults: (root) => {
			if (!root.version) root.version = 1;
		},
	};
}

/**
 * Reads existing ~/.cursor/hooks.json, merges our hook entries (identified by
 * hook script path), and preserves any user-defined hooks.
 */
export function getCursorHooksJsonContent(
	hookScriptPath: string,
): string | null {
	return getManagedJsonHooksContent(cursorHooksSpec(hookScriptPath));
}

export function createCursorHookScript(): void {
	const scriptPath = getCursorHookScriptPath();
	const content = getCursorHookScriptContent();
	const changed = writeFileIfChanged(scriptPath, content, 0o755);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Cursor hook script`,
	);
}

export function createCursorAgentWrapper(): void {
	const script = buildWrapperScript("cursor-agent", `exec "$REAL_BIN" "$@"`, {
		agentId: "cursor-agent",
	});
	createWrapper("cursor-agent", script);
}

/**
 * Removes Superset-managed hook entries from ~/.cursor/hooks.json, preserving
 * user hooks. No-op when the file does not exist.
 */
export function removeCursorManagedHooks(): void {
	removeManagedJsonHooks(cursorHooksSpec(getCursorHookScriptPath()));
}

export function createCursorHooksJson(): void {
	ensureManagedJsonHooks(cursorHooksSpec(getCursorHookScriptPath()));
}
