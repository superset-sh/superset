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

export const KIMI_HOOKS_MARKER_START =
	"# >>> superset-managed-kimi-hooks v1 (do not edit) >>>";
export const KIMI_HOOKS_MARKER_END = "# <<< superset-managed-kimi-hooks v1 <<<";

const KIMI_MANAGED_HOOK_EVENTS = [
	"SessionStart",
	"UserPromptSubmit",
	"PostToolUse",
	"PostToolUseFailure",
	"PermissionRequest",
	"PermissionResult",
	"StopFailure",
	"Interrupt",
	"Stop",
	"SessionEnd",
] as const;

const KIMI_MANAGED_HOOK_COMMAND = getManagedNotifyHookCommand("kimi");

export function getKimiConfigTomlPath(): string {
	const configuredHome = process.env.KIMI_CODE_HOME?.trim();
	const kimiHome = configuredHome || path.join(os.homedir(), ".kimi-code");
	return path.join(kimiHome, "config.toml");
}

function buildKimiManagedHooksBlock(): string {
	return [
		KIMI_HOOKS_MARKER_START,
		...KIMI_MANAGED_HOOK_EVENTS.flatMap((event, index) => [
			...(index === 0 ? [] : [""]),
			"[[hooks]]",
			`event = "${event}"`,
			`command = '${KIMI_MANAGED_HOOK_COMMAND}'`,
		]),
		KIMI_HOOKS_MARKER_END,
	].join("\n");
}

function isManagedOrPartialHookTable(lines: string[]): boolean {
	if (!/^\s*\[\[hooks\]\]\s*$/.test(lines[0] ?? "")) return false;
	const event = lines
		.map((line) => line.match(/^\s*event\s*=\s*"([^"]+)"/))
		.find((match) => match)?.[1];
	if (
		!event ||
		!(KIMI_MANAGED_HOOK_EVENTS as readonly string[]).includes(event)
	) {
		return false;
	}

	const commandLine = lines.find((line) => /^\s*command\s*=/.test(line));
	return !commandLine || commandLine.includes("SUPERSET_AGENT_ID=kimi");
}

const KIMI_TOML_SPEC: ManagedTomlBlockSpec = {
	markerStart: KIMI_HOOKS_MARKER_START,
	markerEnd: KIMI_HOOKS_MARKER_END,
	getFilePath: getKimiConfigTomlPath,
	fileLabel: "Kimi config.toml",
	removeLabel: "Kimi managed hooks",
	fileMode: 0o600,
	isManagedTable: isManagedOrPartialHookTable,
	buildBlock: () => buildKimiManagedHooksBlock(),
};

/** Preserve user config while replacing Superset's marker-owned hook block. */
export function getKimiConfigTomlContent(existing: string): string {
	return getManagedTomlContent(KIMI_TOML_SPEC, existing);
}

/**
 * Removes Superset's marker-owned hook block from Kimi's config.toml,
 * preserving user config. Deletes the file when nothing but the managed
 * block was in it. No-op when the file does not exist.
 */
export function removeKimiManagedHooks(): void {
	removeManagedTomlBlock(KIMI_TOML_SPEC);
}

export function createKimiConfigToml(): void {
	ensureManagedTomlBlock(KIMI_TOML_SPEC);
}

export function getKimiWrapperScript(): string {
	return buildWrapperScript("kimi", 'exec "$REAL_BIN" "$@"', {
		agentId: "kimi",
	});
}

export function createKimiWrapper(): void {
	createWrapper("kimi", getKimiWrapperScript());
}
