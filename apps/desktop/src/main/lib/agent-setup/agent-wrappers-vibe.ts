import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	writeFileIfChanged,
} from "./agent-wrappers-common";

export const VIBE_HOOKS_MARKER_START =
	"# >>> superset-managed-hooks v1 (do not edit) >>>";
export const VIBE_HOOKS_MARKER_END = "# <<< superset-managed-hooks v1 <<<";

/**
 * Resolve the notify script from SUPERSET_HOME_DIR at runtime (mirrors
 * getClaudeManagedHookCommand) so one shared ~/.vibe/hooks.toml works for both
 * dev and prod installs. Vibe runs the command via a shell and pipes the hook
 * invocation JSON (which carries `hook_event_name`) on stdin.
 */
const VIBE_MANAGED_HOOK_COMMAND =
	'[ -n "$SUPERSET_HOME_DIR" ] && [ -x "$SUPERSET_HOME_DIR/hooks/notify.sh" ] && SUPERSET_AGENT_ID=vibe "$SUPERSET_HOME_DIR/hooks/notify.sh" || true';

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

/**
 * Merge our managed block into an existing hooks.toml: strip any prior managed
 * block (between markers), then append the fresh one. Preserves user hooks and
 * is idempotent — no TOML parser needed since we own the block content.
 *
 * A prior interrupted/partial write can leave an orphaned start marker with no
 * end marker; in that case we strip from the start marker to end-of-file so we
 * never accumulate duplicate `[[hooks]]` blocks or leave a dangling marker.
 */
export function getVibeHooksTomlContent(existing: string): string {
	let base = existing;
	const start = base.indexOf(VIBE_HOOKS_MARKER_START);
	if (start !== -1) {
		const end = base.indexOf(VIBE_HOOKS_MARKER_END, start);
		if (end !== -1) {
			base =
				base.slice(0, start) + base.slice(end + VIBE_HOOKS_MARKER_END.length);
		} else {
			// Orphaned start marker (partial/interrupted write) — strip from the
			// start marker to end-of-file rather than leaving the stale block in
			// place and appending a fresh one (which would duplicate the hooks).
			base = base.slice(0, start);
		}
	}
	base = base.replace(/\s+$/, "");
	const block = buildVibeManagedHooksBlock();
	return base.length > 0 ? `${base}\n\n${block}\n` : `${block}\n`;
}

export function createVibeHooksToml(): void {
	const tomlPath = getVibeHooksTomlPath();
	const existing = fs.existsSync(tomlPath)
		? fs.readFileSync(tomlPath, "utf-8")
		: "";
	const content = getVibeHooksTomlContent(existing);
	fs.mkdirSync(path.dirname(tomlPath), { recursive: true });
	const changed = writeFileIfChanged(tomlPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Vibe hooks.toml`,
	);
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
