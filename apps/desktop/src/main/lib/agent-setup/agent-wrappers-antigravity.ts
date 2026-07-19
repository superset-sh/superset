import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "shared/env.shared";
import {
	buildWrapperScript,
	createWrapper,
	writeFileIfChanged,
} from "./agent-wrappers-common";
import { HOOKS_DIR } from "./paths";

export const ANTIGRAVITY_HOOK_SCRIPT_NAME = "antigravity-hook.sh";

const ANTIGRAVITY_HOOK_SIGNATURE = "# Superset antigravity hook";
const ANTIGRAVITY_HOOK_VERSION = "v1";
export const ANTIGRAVITY_HOOK_MARKER = `${ANTIGRAVITY_HOOK_SIGNATURE} ${ANTIGRAVITY_HOOK_VERSION}`;

/**
 * Top-level key we own in hooks.json. Antigravity namespaces hooks by name and
 * merges every named block for a given event, so scoping our handlers under a
 * single key leaves user-defined hooks untouched.
 */
export const ANTIGRAVITY_HOOK_NAME = "superset";

const ANTIGRAVITY_HOOK_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"antigravity-hook.template.sh",
);

interface AntigravityHookHandler {
	type?: string;
	command: string;
	timeout?: number;
	[key: string]: unknown;
}

interface AntigravityHookGroup {
	matcher?: string;
	hooks: AntigravityHookHandler[];
	[key: string]: unknown;
}

interface AntigravityHooksJson {
	[hookName: string]: unknown;
}

export function getAntigravityHookScriptPath(): string {
	return path.join(HOOKS_DIR, ANTIGRAVITY_HOOK_SCRIPT_NAME);
}

/**
 * Antigravity's global customization root is `~/.gemini/config/` (shared with
 * Antigravity 2.0 and the IDE), not `~/.gemini/` itself -- that is where the
 * deprecated Gemini CLI kept settings.json.
 */
export function getAntigravityHooksJsonPath(): string {
	return path.join(os.homedir(), ".gemini", "config", "hooks.json");
}

export function getAntigravityHookScriptContent(): string {
	const template = fs.readFileSync(ANTIGRAVITY_HOOK_TEMPLATE_PATH, "utf-8");
	return template
		.replace("{{MARKER}}", ANTIGRAVITY_HOOK_MARKER)
		.replaceAll("{{DEFAULT_PORT}}", String(env.DESKTOP_NOTIFICATIONS_PORT));
}

/**
 * Antigravity hook payloads carry no event-name field, so the Superset event is
 * passed as argv instead of being derived from stdin.
 *
 * Event choice is deliberate:
 * - `PreInvocation` fires before each model call -> Start.
 * - `PostToolUse` keeps the terminal marked busy across long tool loops -> Start.
 * - `Stop` fires when the execution loop terminates -> Stop.
 *
 * `PreToolUse` is intentionally not registered: its contract requires a
 * `decision` field ("allow" | "deny" | "ask" | "force_ask"), and emitting an
 * empty object there risks gating the user's tool calls.
 */
function buildSupersetHookBlock(
	hookScriptPath: string,
): Record<string, unknown> {
	const startCommand: AntigravityHookHandler = {
		type: "command",
		command: `"${hookScriptPath}" Start`,
	};
	const stopCommand: AntigravityHookHandler = {
		type: "command",
		command: `"${hookScriptPath}" Stop`,
	};
	const postToolUseGroup: AntigravityHookGroup = {
		matcher: "*",
		hooks: [startCommand],
	};

	// PreInvocation/Stop take a flat handler list; PostToolUse is tool-matched
	// and must be wrapped in a matcher group.
	return {
		PreInvocation: [startCommand],
		PostToolUse: [postToolUseGroup],
		Stop: [stopCommand],
	};
}

/**
 * Reads existing ~/.gemini/config/hooks.json, replaces our own named block, and
 * preserves every other hook the user (or a plugin) defined.
 */
export function getAntigravityHooksJsonContent(hookScriptPath: string): string {
	const globalPath = getAntigravityHooksJsonPath();

	let existing: AntigravityHooksJson = {};
	try {
		if (fs.existsSync(globalPath)) {
			const parsed: unknown = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				existing = parsed as AntigravityHooksJson;
			}
		}
	} catch {
		console.warn(
			"[agent-setup] Could not parse existing ~/.gemini/config/hooks.json, rewriting Superset block only",
		);
	}

	existing[ANTIGRAVITY_HOOK_NAME] = buildSupersetHookBlock(hookScriptPath);

	return JSON.stringify(existing, null, 2);
}

export function createAntigravityHookScript(): void {
	const scriptPath = getAntigravityHookScriptPath();
	const content = getAntigravityHookScriptContent();
	const changed = writeFileIfChanged(scriptPath, content, 0o755);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Antigravity hook script`,
	);
}

export function createAntigravityWrapper(): void {
	const script = buildWrapperScript("agy", `exec "$REAL_BIN" "$@"`, {
		agentId: "agy",
	});
	createWrapper("agy", script);
}

export function createAntigravityHooksJson(): void {
	const hookScriptPath = getAntigravityHookScriptPath();
	const globalPath = getAntigravityHooksJsonPath();
	const content = getAntigravityHooksJsonContent(hookScriptPath);

	const dir = path.dirname(globalPath);
	fs.mkdirSync(dir, { recursive: true });
	const changed = writeFileIfChanged(globalPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Antigravity hooks.json`,
	);
}
