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
import { HOOKS_DIR } from "./paths";

export const CURSOR_HOOK_SCRIPT_NAME = "cursor-hook.sh";

const CURSOR_HOOK_SIGNATURE = "# Superset cursor hook";
const CURSOR_HOOK_VERSION = "v1";
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

interface CursorHooksJson {
	version?: number;
	hooks?: Record<string, CursorHookEntry[]>;
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
		.replace(/\{\{DEFAULT_PORT\}\}/g, String(env.DESKTOP_NOTIFICATIONS_PORT));
}

/**
 * Reads existing ~/.cursor/hooks.json, merges our hook entries (identified by
 * hook script path), and preserves any user-defined hooks.
 */
export function getCursorHooksJsonContent(hookScriptPath: string): string {
	const globalPath = getCursorGlobalHooksJsonPath();

	let existing: CursorHooksJson = {};
	try {
		if (fs.existsSync(globalPath)) {
			existing = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
		}
	} catch {
		console.warn(
			"[agent-setup] Could not parse existing ~/.cursor/hooks.json, merging carefully",
		);
	}

	if (!existing.version) {
		existing.version = 1;
	}
	if (!existing.hooks || typeof existing.hooks !== "object") {
		existing.hooks = {};
	}

	const ourHooks: Record<string, CursorHookEntry> = {
		beforeSubmitPrompt: { command: `${hookScriptPath} Start` },
		stop: { command: `${hookScriptPath} Stop` },
		beforeShellExecution: {
			command: `${hookScriptPath} PermissionRequest`,
		},
		beforeMCPExecution: {
			command: `${hookScriptPath} PermissionRequest`,
		},
	};

	for (const [eventName, ourEntry] of Object.entries(ourHooks)) {
		const current = existing.hooks[eventName];
		if (Array.isArray(current)) {
			const filtered = current.filter(
				(entry: CursorHookEntry) =>
					!(
						entry.command?.includes(hookScriptPath) ||
						isSupersetManagedHookCommand(entry.command, CURSOR_HOOK_SCRIPT_NAME)
					),
			);
			filtered.push(ourEntry);
			existing.hooks[eventName] = filtered;
		} else {
			existing.hooks[eventName] = [ourEntry];
		}
	}

	return JSON.stringify(existing, null, 2);
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
	const script = buildWrapperScript("cursor-agent", `exec "$REAL_BIN" "$@"`);
	createWrapper("cursor-agent", script);
}

export function createCursorHooksJson(): void {
	const hookScriptPath = getCursorHookScriptPath();
	const globalPath = getCursorGlobalHooksJsonPath();
	const content = getCursorHooksJsonContent(hookScriptPath);

	const dir = path.dirname(globalPath);
	fs.mkdirSync(dir, { recursive: true });
	const changed = writeFileIfChanged(globalPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Cursor hooks.json`,
	);
}
