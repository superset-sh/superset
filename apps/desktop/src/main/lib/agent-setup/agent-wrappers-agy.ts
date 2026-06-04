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

export const AGY_HOOK_SCRIPT_NAME = "agy-hook.sh";

const AGY_HOOK_SIGNATURE = "# Superset agy hook";
const AGY_HOOK_VERSION = "v3";
export const AGY_HOOK_MARKER = `${AGY_HOOK_SIGNATURE} ${AGY_HOOK_VERSION}`;

const AGY_HOOK_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"agy-hook.template.sh",
);

// Named key we write into hooks.json. Arbitrary but stable — used to identify
// and replace our entry across worktree moves without touching user entries.
const AGY_HOOKS_JSON_KEY = "superset-lifecycle";

interface AgyHookCommand {
	command: string;
}

interface AgyToolHookEntry {
	matcher: string;
	hooks: AgyHookCommand[];
}

interface AgyHookSpec {
	PreInvocation?: AgyHookCommand[];
	PostInvocation?: AgyHookCommand[];
	PreToolUse?: AgyToolHookEntry[];
	PostToolUse?: AgyToolHookEntry[];
	Stop?: AgyHookCommand[];
	enabled?: boolean;
}

type AgyHooksJson = Record<string, unknown>;

function quoteShellPath(filePath: string): string {
	return `'${filePath.replaceAll("'", "'\\''")}'`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAgyHookCommand(value: unknown): value is AgyHookCommand {
	return isRecord(value) && typeof value.command === "string";
}

function extractHookCommands(entries: unknown): string[] {
	if (!Array.isArray(entries)) return [];
	return entries
		.filter(isAgyHookCommand)
		.map((entry) => entry.command);
}

function extractToolHookCommands(entries: unknown): string[] {
	if (!Array.isArray(entries)) return [];
	const commands: string[] = [];

	for (const entry of entries) {
		if (isAgyHookCommand(entry)) {
			commands.push(entry.command);
			continue;
		}
		if (!isRecord(entry) || !Array.isArray(entry.hooks)) continue;

		for (const hook of entry.hooks) {
			if (isAgyHookCommand(hook)) {
				commands.push(hook.command);
			}
		}
	}

	return commands;
}

function readExistingAgyHooksJson(globalPath: string): AgyHooksJson {
	if (!fs.existsSync(globalPath)) {
		return {};
	}

	const rawContent = fs.readFileSync(globalPath, "utf-8");
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawContent);
	} catch (error) {
		throw new Error(
			"[agent-setup] Invalid ~/.gemini/config/hooks.json; refusing to overwrite malformed file.",
			{ cause: error },
		);
	}

	if (!isRecord(parsed)) {
		throw new Error(
			"[agent-setup] Expected ~/.gemini/config/hooks.json to contain a JSON object.",
		);
	}

	return parsed;
}

export function getAgyHookScriptPath(): string {
	return path.join(HOOKS_DIR, AGY_HOOK_SCRIPT_NAME);
}

// agy reads hooks from ~/.gemini/config/hooks.json (SharedConfigPath), not
// from ~/.gemini/antigravity-cli/settings.json.
export function getAgyHooksJsonPath(): string {
	return path.join(os.homedir(), ".gemini", "config", "hooks.json");
}

export function getAgyHookScriptContent(): string {
	const template = fs.readFileSync(AGY_HOOK_TEMPLATE_PATH, "utf-8");
	return template
		.replace("{{MARKER}}", AGY_HOOK_MARKER)
		.replaceAll("{{DEFAULT_PORT}}", String(env.DESKTOP_NOTIFICATIONS_PORT));
}

/**
 * Reads existing ~/.gemini/config/hooks.json, removes any stale Superset-managed
 * entries (identified by hook script name), and writes a fresh "superset-lifecycle"
 * entry pointing at the current hook script path.
 *
 * agy hooks.json format: { [namedKey: string]: AgyHookSpec }
 * Each hook spec registers per-event command arrays with the event type passed
 * as $1 so the hook script doesn't need to parse the payload for it.
 */
export function getAgyHooksJsonContent(hookScriptPath: string): string {
	const globalPath = getAgyHooksJsonPath();
	const existing = readExistingAgyHooksJson(globalPath);

	// Remove all entries whose commands reference our hook script (covers key
	// renames and stale worktree paths from older installs).
	for (const [key, spec] of Object.entries(existing)) {
		if (!isRecord(spec)) continue;

		const invocationCommands = [
			...extractHookCommands(spec.PreInvocation),
			...extractHookCommands(spec.PostInvocation),
			...extractHookCommands(spec.Stop),
		];
		const toolCommands = [
			...extractToolHookCommands(spec.PreToolUse),
			...extractToolHookCommands(spec.PostToolUse),
		];

		if (
			[...invocationCommands, ...toolCommands].some((cmd) =>
				isSupersetManagedHookCommand(cmd, AGY_HOOK_SCRIPT_NAME),
			)
		) {
			delete existing[key];
		}
	}

	// Write event type as $1 so the hook script doesn't need to infer it from
	// the payload (which differs per hook proto type).
	// Tool-use hooks require a matcher; invocation/stop hooks are flat commands.
	const quotedHookScriptPath = quoteShellPath(hookScriptPath);
	existing[AGY_HOOKS_JSON_KEY] = {
		PreInvocation: [{ command: `${quotedHookScriptPath} PreInvocation` }],
		PostInvocation: [{ command: `${quotedHookScriptPath} PostInvocation` }],
		PreToolUse: [
			{
				matcher: ".*",
				hooks: [{ command: `${quotedHookScriptPath} PreToolUse` }],
			},
		],
		PostToolUse: [
			{
				matcher: ".*",
				hooks: [{ command: `${quotedHookScriptPath} PostToolUse` }],
			},
		],
		Stop: [{ command: `${quotedHookScriptPath} Stop` }],
	} satisfies AgyHookSpec;

	return JSON.stringify(existing, null, 2);
}

export function createAgyHookScript(): void {
	const scriptPath = getAgyHookScriptPath();
	const content = getAgyHookScriptContent();
	const changed = writeFileIfChanged(scriptPath, content, 0o755);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} agy hook script`,
	);
}

export function createAgyHooksJson(): void {
	const hookScriptPath = getAgyHookScriptPath();
	const globalPath = getAgyHooksJsonPath();
	const content = getAgyHooksJsonContent(hookScriptPath);

	const dir = path.dirname(globalPath);
	fs.mkdirSync(dir, { recursive: true });
	const changed = writeFileIfChanged(globalPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} agy hooks.json`,
	);
}

export function createAgyWrapper(): void {
	const script = buildWrapperScript("agy", `exec "$REAL_BIN" "$@"`, {
		agentId: "agy",
	});
	createWrapper("agy", script);
}
