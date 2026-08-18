import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	getManagedNotifyHookCommand,
} from "./agent-wrappers-common";
import {
	ensureManagedTomlBlock,
	getManagedTomlContent,
	type ManagedTomlBlockSpec,
	removeManagedTomlBlock,
} from "./managed-toml-block";

export const VIBE_HOOKS_MARKER_START =
	"# >>> superset-managed-hooks v1 (do not edit) >>>";
export const VIBE_HOOKS_MARKER_END = "# <<< superset-managed-hooks v1 <<<";

// Vibe runs the command via a shell and pipes the hook invocation JSON (which
// carries `hook_event_name`) on stdin.
const VIBE_MANAGED_HOOK_COMMAND = getManagedNotifyHookCommand("vibe");

const MANAGED_HOOK_NAME_PREFIX = "superset-notify-";

export function getVibeHooksTomlPath(): string {
	return path.join(os.homedir(), ".vibe", "hooks.toml");
}

function buildVibeManagedHooksBlock(): string {
	return [
		VIBE_HOOKS_MARKER_START,
		"[[hooks]]",
		'name = "superset-notify-before-tool"',
		'type = "before_tool"',
		`command = '${VIBE_MANAGED_HOOK_COMMAND}'`,
		"",
		"[[hooks]]",
		'name = "superset-notify-post-agent-turn"',
		'type = "post_agent_turn"',
		`command = '${VIBE_MANAGED_HOOK_COMMAND}'`,
		VIBE_HOOKS_MARKER_END,
	].join("\n");
}

// Our block only ever contains `[[hooks]]` tables named `superset-notify-*`,
// so during orphan recovery a table is foreign only when it carries a name
// outside that prefix.
function isManagedVibeTable(lines: string[]): boolean {
	const name = lines
		.map((line) => line.match(/^\s*name\s*=\s*"([^"]*)"/))
		.find((match) => match)?.[1];
	return name === undefined || name.startsWith(MANAGED_HOOK_NAME_PREFIX);
}

const VIBE_TOML_SPEC: ManagedTomlBlockSpec = {
	markerStart: VIBE_HOOKS_MARKER_START,
	markerEnd: VIBE_HOOKS_MARKER_END,
	getFilePath: getVibeHooksTomlPath,
	fileLabel: "Vibe hooks.toml",
	removeLabel: "Vibe managed hooks",
	fileMode: 0o644,
	isManagedTable: isManagedVibeTable,
	buildBlock: () => buildVibeManagedHooksBlock(),
};

/**
 * Merge our managed block into an existing hooks.toml: strip any prior managed
 * block, then append the fresh one. Preserves user hooks and is idempotent —
 * no TOML parser needed since we own the block content.
 */
export function getVibeHooksTomlContent(existing: string): string {
	return getManagedTomlContent(VIBE_TOML_SPEC, existing);
}

/**
 * Removes Superset's marker-owned hook block from ~/.vibe/hooks.toml,
 * preserving user hooks. Deletes the file when nothing but the managed block
 * was in it. No-op when the file does not exist.
 */
export function removeVibeManagedHooks(): void {
	removeManagedTomlBlock(VIBE_TOML_SPEC);
}

export function createVibeHooksToml(): void {
	ensureManagedTomlBlock(VIBE_TOML_SPEC);
}

/**
 * Wrapper for `vibe`: enables experimental hooks (so hooks.toml loads) and
 * stamps SUPERSET_AGENT_ID so the notify payload carries identity. Modeled on
 * createOpenCodeWrapper (plain export + exec — no session-log watcher).
 */
export function getVibeWrapperScript(): string {
	return buildWrapperScript(
		"vibe",
		'export VIBE_ENABLE_EXPERIMENTAL_HOOKS=true\nexec "$REAL_BIN" "$@"',
		{ agentId: "vibe" },
	);
}

export function createVibeWrapper(): void {
	createWrapper("vibe", getVibeWrapperScript());
}
