import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	getManagedNotifyHookCommand,
	writeFileIfChanged,
} from "./agent-wrappers-common";

export const KIMI_HOOKS_MARKER_START =
	"# >>> superset-managed-kimi-hooks v1 (do not edit) >>>";
export const KIMI_HOOKS_MARKER_END = "# <<< superset-managed-kimi-hooks v1 <<<";

const KIMI_MANAGED_HOOK_COMMAND = getManagedNotifyHookCommand("kimi");

/**
 * Kimi Code lifecycle events that drive Superset's terminal binding and tab
 * status. The CLI pipes a JSON payload with `hook_event_name` to each command.
 */
export const KIMI_MANAGED_HOOK_EVENTS = [
	"SessionStart",
	"UserPromptSubmit",
	"PermissionRequest",
	"PermissionResult",
	"Stop",
	"StopFailure",
	"Interrupt",
	"SessionEnd",
] as const;

function buildKimiManagedHooksBlock(): string {
	return [
		KIMI_HOOKS_MARKER_START,
		...KIMI_MANAGED_HOOK_EVENTS.flatMap((event, index) => [
			...(index > 0 ? [""] : []),
			"[[hooks]]",
			`event = "${event}"`,
			`command = '${KIMI_MANAGED_HOOK_COMMAND}'`,
		]),
		KIMI_HOOKS_MARKER_END,
	].join("\n");
}

export function getKimiConfigTomlPath(): string {
	const configuredHome = process.env.KIMI_CODE_HOME?.trim();
	if (!configuredHome) {
		return path.join(os.homedir(), ".kimi-code", "config.toml");
	}
	const expandedHome = configuredHome.replace(/^~(?=$|[/\\])/, os.homedir());
	return path.join(path.resolve(expandedHome), "config.toml");
}

/**
 * Replace Superset's managed Kimi hook block while preserving every user-owned
 * TOML field and hook. A missing end marker indicates a partial/manual edit;
 * leave the file untouched rather than risk deleting user configuration.
 */
export function getKimiConfigTomlContent(existing: string): string {
	let base = existing;
	const start = base.indexOf(KIMI_HOOKS_MARKER_START);
	if (start !== -1) {
		const end = base.indexOf(KIMI_HOOKS_MARKER_END, start);
		if (end === -1) return existing;
		base =
			base.slice(0, start) + base.slice(end + KIMI_HOOKS_MARKER_END.length);
	}

	base = base.replace(/\s+$/, "");
	const block = buildKimiManagedHooksBlock();
	return base.length > 0 ? `${base}\n\n${block}\n` : `${block}\n`;
}

export function createKimiConfigToml(): void {
	const configPath = getKimiConfigTomlPath();
	const existing = fs.existsSync(configPath)
		? fs.readFileSync(configPath, "utf-8")
		: "";
	const content = getKimiConfigTomlContent(existing);

	if (
		existing.includes(KIMI_HOOKS_MARKER_START) &&
		!existing.includes(KIMI_HOOKS_MARKER_END)
	) {
		console.warn(
			"[agent-setup] Kimi config contains an incomplete Superset hook block; leaving it unchanged",
		);
		return;
	}

	fs.mkdirSync(path.dirname(configPath), { recursive: true });
	const changed = writeFileIfChanged(configPath, content, 0o600);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Kimi config.toml`,
	);
}

export function getKimiWrapperScript(): string {
	return buildWrapperScript("kimi", 'exec "$REAL_BIN" "$@"', {
		agentId: "kimi",
	});
}

export function createKimiWrapper(): void {
	createWrapper("kimi", getKimiWrapperScript());
}
