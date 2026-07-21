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

function isTomlTableHeader(line: string): boolean {
	return /^\s*\[/.test(line);
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

/**
 * Recover from an interrupted write whose end marker is missing. Managed hook
 * tables are removed, while a later user-owned table and its leading comments
 * are retained.
 */
function stripOrphanedManagedBlock(base: string, start: number): string {
	const before = base.slice(0, start);
	const lines = base.slice(start).split("\n");
	let cut = lines.length;

	for (let index = 1; index < lines.length; index++) {
		if (!isTomlTableHeader(lines[index])) continue;
		let end = index + 1;
		while (end < lines.length && !isTomlTableHeader(lines[end])) end++;
		if (isManagedOrPartialHookTable(lines.slice(index, end))) {
			index = end - 1;
			continue;
		}

		cut = index;
		break;
	}

	while (
		cut > 1 &&
		(lines[cut - 1].trim() === "" || lines[cut - 1].trimStart().startsWith("#"))
	) {
		cut--;
	}

	return before + lines.slice(cut).join("\n");
}

/** Preserve user config while replacing Superset's marker-owned hook block. */
export function getKimiConfigTomlContent(existing: string): string {
	let base = existing;
	const start = base.indexOf(KIMI_HOOKS_MARKER_START);
	if (start !== -1) {
		const end = base.indexOf(KIMI_HOOKS_MARKER_END, start);
		base =
			end !== -1
				? base.slice(0, start) + base.slice(end + KIMI_HOOKS_MARKER_END.length)
				: stripOrphanedManagedBlock(base, start);
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
