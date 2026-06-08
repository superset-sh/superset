import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
	access,
	chmod,
	mkdir,
	readdir,
	readFile,
	stat,
	writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, delimiter, dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { protectedProcedure } from "../../index";
import { requireLocalProject } from "./shared/local-project";

const execFileAsync = promisify(execFile);

export const trellisStatusStateSchema = z.enum([
	"ready",
	"missing",
	"partial",
	"unavailable",
]);

export type TrellisStatusState = z.infer<typeof trellisStatusStateSchema>;

export interface TrellisStatus {
	state: TrellisStatusState;
	hasTrellis: boolean;
	configPath: string | null;
	version: string | null;
	message: string;
}

export interface TrellisSetupResult extends TrellisStatus {
	initialized: boolean;
	warning: string | null;
}

export interface SupersetTaskTrellisLinkResult {
	created: boolean;
	taskDir: string | null;
	taskJsonPath: string | null;
	warning: string | null;
}

export interface SupersetTaskSyncHookInstallResult {
	installed: boolean;
	scriptChanged: boolean;
	configChanged: boolean;
	warning: string | null;
}

export const trellisPlatformSchema = z.enum([
	"claude",
	"cursor",
	"codex",
	"gemini",
	"opencode",
	"pi",
	"copilot",
	"droid",
]);

export type TrellisPlatform = z.infer<typeof trellisPlatformSchema>;

const TRELLIS_PLATFORM_FLAGS: Record<TrellisPlatform, string> = {
	claude: "--claude",
	cursor: "--cursor",
	codex: "--codex",
	gemini: "--gemini",
	opencode: "--opencode",
	pi: "--pi",
	copilot: "--copilot",
	droid: "--droid",
};

const TRELLIS_PLATFORM_BY_AGENT: Record<string, TrellisPlatform> = {
	claude: "claude",
	cursor: "cursor",
	"cursor-agent": "cursor",
	codex: "codex",
	gemini: "gemini",
	opencode: "opencode",
	"open-code": "opencode",
	pi: "pi",
	copilot: "copilot",
	droid: "droid",
};

export interface TrellisCommandArgs {
	command: string;
	args: string[];
	cwd: string;
	timeoutMs: number;
}

export type TrellisCommandRunner = (
	args: TrellisCommandArgs,
) => Promise<{ stdout: string; stderr: string }>;

const SUPERSET_TASK_SYNC_HOOK_RELATIVE_PATH =
	".trellis/scripts/hooks/superset_task_sync.py";

const SUPERSET_TASK_SYNC_HOOK_COMMANDS = {
	after_start: `python3 ${SUPERSET_TASK_SYNC_HOOK_RELATIVE_PATH} after_start`,
	after_archive: `python3 ${SUPERSET_TASK_SYNC_HOOK_RELATIVE_PATH} after_archive`,
} as const;

type TrellisSyncHookEvent = keyof typeof SUPERSET_TASK_SYNC_HOOK_COMMANDS;

const SUPERSET_TASK_SYNC_HOOK_SCRIPT = `#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


EVENT_TO_STATUS_TYPE = {
    "after_start": "started",
    "start": "started",
    "in_progress": "started",
    "after_archive": "completed",
    "archive": "completed",
    "completed": "completed",
}


def warn(message: str) -> None:
    print(f"[superset-task-sync] {message}", file=sys.stderr)


def load_task_json() -> dict | None:
    task_json_path = os.environ.get("TASK_JSON_PATH", "").strip()
    if not task_json_path:
        warn("TASK_JSON_PATH is not set; skipping Superset status sync")
        return None
    try:
        with open(task_json_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except Exception as exc:
        warn(f"could not read task.json: {exc}")
        return None
    return data if isinstance(data, dict) else None


def linked_superset_task_id(task_json: dict) -> str | None:
    meta = task_json.get("meta")
    if not isinstance(meta, dict):
        return None
    task_id = meta.get("supersetTaskId")
    return task_id if isinstance(task_id, str) and task_id.strip() else None


def candidate_cli_paths() -> list[str]:
    candidates: list[str] = []
    explicit = os.environ.get("SUPERSET_CLI_PATH", "").strip()
    if explicit:
        candidates.append(explicit)

    superset_home = os.environ.get("SUPERSET_HOME_DIR", "").strip()
    if superset_home:
        binary = "superset.exe" if os.name == "nt" else "superset"
        candidates.append(str(Path(superset_home) / "bin" / binary))

    path_cli = shutil.which("superset")
    if path_cli:
        candidates.append(path_cli)

    seen: set[str] = set()
    deduped: list[str] = []
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        deduped.append(candidate)
    return deduped


def find_superset_cli() -> str | None:
    for candidate in candidate_cli_paths():
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def run_cli(cli_path: str, args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [cli_path, *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=30,
    )


def resolve_status_id(cli_path: str, status_type: str) -> str | None:
    result = run_cli(cli_path, ["tasks", "statuses", "list", "--json"])
    if result.returncode != 0:
        warn(f"could not list Superset task statuses: {result.stderr.strip() or result.stdout.strip()}")
        return None
    try:
        statuses = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        warn(f"Superset task status list returned invalid JSON: {exc}")
        return None
    if not isinstance(statuses, list):
        warn("Superset task status list returned a non-list response")
        return None
    for status in statuses:
        if not isinstance(status, dict):
            continue
        if status.get("type") != status_type:
            continue
        status_id = status.get("id")
        if isinstance(status_id, str) and status_id:
            return status_id
    warn(f"Superset task status type not found: {status_type}")
    return None


def update_superset_task(cli_path: str, task_id: str, status_id: str) -> None:
    result = run_cli(
        cli_path,
        ["tasks", "update", task_id, "--status-id", status_id, "--json"],
    )
    if result.returncode != 0:
        warn(f"could not update Superset task status: {result.stderr.strip() or result.stdout.strip()}")


def main() -> int:
    event = sys.argv[1] if len(sys.argv) > 1 else ""
    status_type = EVENT_TO_STATUS_TYPE.get(event)
    if status_type is None:
        return 0

    task_json = load_task_json()
    if task_json is None:
        return 0

    task_id = linked_superset_task_id(task_json)
    if task_id is None:
        return 0

    cli_path = find_superset_cli()
    if cli_path is None:
        warn("Superset CLI was not found; skipping status sync")
        return 0

    status_id = resolve_status_id(cli_path, status_type)
    if status_id is None:
        return 0

    update_superset_task(cli_path, task_id, status_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;

export function resolveTrellisPlatformsFromAgents(
	agents: readonly string[] | undefined,
): TrellisPlatform[] {
	const platforms = new Set<TrellisPlatform>();

	for (const agent of agents ?? []) {
		const normalized = agent.trim().toLowerCase().replaceAll("_", "-");
		const platform = TRELLIS_PLATFORM_BY_AGENT[normalized];
		if (platform) {
			platforms.add(platform);
		}
	}

	return Array.from(platforms);
}

function buildTrellisInitArgs(platforms: readonly TrellisPlatform[]): string[] {
	const flags = new Set<string>();
	for (const platform of platforms) {
		flags.add(TRELLIS_PLATFORM_FLAGS[platform]);
	}
	return ["init", "--yes", "--skip-existing", ...flags];
}

function executableName(name: "bun" | "node"): string {
	return process.platform === "win32" ? `${name}.exe` : name;
}

export function canRunNodeEntrypoint(execPath: string): boolean {
	const name = basename(execPath).toLowerCase();
	return (
		name === "bun" ||
		name === "bun.exe" ||
		name === "node" ||
		name === "node.exe"
	);
}

async function isExecutablePath(path: string): Promise<boolean> {
	try {
		await access(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

async function resolveExecutable(
	name: "bun" | "node",
	extraCandidates: Array<string | undefined> = [],
): Promise<string | null> {
	const binaryName = executableName(name);
	const pathCandidates = (process.env.PATH ?? "")
		.split(delimiter)
		.filter(Boolean)
		.map((entry) => join(entry, binaryName));
	const candidates = [...extraCandidates, ...pathCandidates, binaryName].filter(
		(candidate): candidate is string => Boolean(candidate),
	);

	for (const candidate of candidates) {
		if (!isAbsolute(candidate)) continue;
		if (await isExecutablePath(candidate)) {
			return candidate;
		}
	}

	return null;
}

export async function resolveTrellisRuntimeCommand(): Promise<string> {
	if (canRunNodeEntrypoint(process.execPath)) {
		return process.execPath;
	}

	const bun = await resolveExecutable("bun", [
		process.env.BUN_EXECUTABLE,
		process.env.BUN_INSTALL
			? join(process.env.BUN_INSTALL, "bin", executableName("bun"))
			: undefined,
	]);
	if (bun) return bun;

	const node = await resolveExecutable("node");
	if (node) return node;

	throw new Error(
		"Unable to find Bun or Node.js to run the repo-local Trellis CLI. Electron cannot execute Trellis bin scripts directly.",
	);
}

function isNodeErrno(error: unknown, code: string): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === code
	);
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (error) {
		if (isNodeErrno(error, "ENOENT")) return false;
		throw error;
	}
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		const entry = await stat(path);
		return entry.isDirectory();
	} catch (error) {
		if (isNodeErrno(error, "ENOENT")) return false;
		throw error;
	}
}

async function readTrimmed(path: string): Promise<string | null> {
	try {
		const text = await readFile(path, "utf8");
		const trimmed = text.trim();
		return trimmed || null;
	} catch (error) {
		if (isNodeErrno(error, "ENOENT")) return null;
		throw error;
	}
}

export async function getTrellisStatusAtPath(
	repoPath: string,
): Promise<TrellisStatus> {
	const trellisDir = join(repoPath, ".trellis");
	const configPath = join(trellisDir, "config.yaml");
	const tasksPath = join(trellisDir, "tasks");
	const versionPath = join(trellisDir, ".version");

	try {
		if (!(await isDirectory(trellisDir))) {
			return {
				state: "missing",
				hasTrellis: false,
				configPath: null,
				version: null,
				message: "Trellis is not initialized for this repository.",
			};
		}

		const [hasConfig, hasTasks, version] = await Promise.all([
			pathExists(configPath),
			isDirectory(tasksPath),
			readTrimmed(versionPath),
		]);

		if (hasConfig && hasTasks) {
			return {
				state: "ready",
				hasTrellis: true,
				configPath,
				version,
				message: version ? `Trellis ${version} is ready.` : "Trellis is ready.",
			};
		}

		return {
			state: "partial",
			hasTrellis: true,
			configPath: hasConfig ? configPath : null,
			version,
			message:
				"Trellis files exist, but the setup looks incomplete. Workspace creation will not overwrite it.",
		};
	} catch (error) {
		return {
			state: "unavailable",
			hasTrellis: false,
			configPath: null,
			version: null,
			message:
				error instanceof Error
					? error.message
					: "Unable to inspect Trellis setup.",
		};
	}
}

function resolveTrellisBinPath(): string {
	const require = createRequire(import.meta.url);
	const packageJsonPath = require.resolve("@mindfoldhq/trellis/package.json");
	return join(dirname(packageJsonPath), "bin", "trellis.js");
}

async function defaultTrellisCommandRunner(
	args: TrellisCommandArgs,
): Promise<{ stdout: string; stderr: string }> {
	const result = await execFileAsync(args.command, args.args, {
		cwd: args.cwd,
		timeout: args.timeoutMs,
		maxBuffer: 1024 * 1024,
		env: {
			...process.env,
			CI: "1",
		},
	});
	return {
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

function errorMessageWithOutput(error: unknown): string {
	if (error instanceof Error) {
		const maybeOutput = error as Error & {
			stderr?: unknown;
			stdout?: unknown;
		};
		const stderr =
			typeof maybeOutput.stderr === "string" ? maybeOutput.stderr.trim() : "";
		const stdout =
			typeof maybeOutput.stdout === "string" ? maybeOutput.stdout.trim() : "";
		return [error.message, stderr, stdout].filter(Boolean).join("\n");
	}
	return String(error);
}

function mergeWarnings(
	...warnings: Array<string | null | undefined>
): string | null {
	const merged = warnings
		.flatMap((warning) => (warning ? warning.split("\n") : []))
		.map((warning) => warning.trim())
		.filter(Boolean);
	if (merged.length === 0) return null;
	return Array.from(new Set(merged)).join("\n");
}

export async function applyTrellisSetup(args: {
	worktreePath: string;
	initialize: boolean;
	platforms?: readonly TrellisPlatform[];
	runner?: TrellisCommandRunner;
	trellisBinPath?: string;
	timeoutMs?: number;
}): Promise<TrellisSetupResult> {
	const before = await getTrellisStatusAtPath(args.worktreePath);

	if (!args.initialize) {
		return {
			...before,
			initialized: false,
			warning: null,
		};
	}

	if (before.state === "ready") {
		return {
			...before,
			initialized: false,
			warning: null,
		};
	}

	if (before.state !== "missing") {
		return {
			...before,
			initialized: false,
			warning:
				"Trellis setup was requested, but existing Trellis files were left untouched.",
		};
	}

	const platforms = args.platforms ?? [];
	if (platforms.length === 0) {
		return {
			...before,
			initialized: false,
			warning:
				"Guided workflow setup was requested, but no supported Agent platform was selected. Select Claude, Codex, Gemini, OpenCode, Cursor Agent, Copilot, Droid, or Pi to write matching workflow adapter files.",
		};
	}

	try {
		const runner = args.runner ?? defaultTrellisCommandRunner;
		const trellisBinPath = args.trellisBinPath ?? resolveTrellisBinPath();
		const runtimeCommand = await resolveTrellisRuntimeCommand();
		await runner({
			command: runtimeCommand,
			args: [trellisBinPath, ...buildTrellisInitArgs(platforms)],
			cwd: args.worktreePath,
			timeoutMs: args.timeoutMs ?? 120_000,
		});

		const after = await getTrellisStatusAtPath(args.worktreePath);
		return {
			...after,
			initialized: after.hasTrellis,
			warning: after.hasTrellis
				? null
				: "Trellis init completed, but .trellis was not detected afterward.",
		};
	} catch (error) {
		return {
			...before,
			initialized: false,
			warning: `Trellis initialization failed: ${errorMessageWithOutput(error)}`,
		};
	}
}

function yamlCommandLine(command: string): string {
	return `    - ${JSON.stringify(command)}`;
}

function findTopLevelHooksLine(lines: string[]): number {
	return lines.findIndex((line) => /^hooks:\s*(?:#.*)?$/.test(line));
}

function findTopLevelHooksInlineEmptyLine(lines: string[]): number {
	return lines.findIndex((line) => /^hooks:\s*\{\s*\}\s*(?:#.*)?$/.test(line));
}

function lineIndent(line: string): number {
	return line.length - line.trimStart().length;
}

function findTopLevelBlockEnd(lines: string[], startIndex: number): number {
	for (let index = startIndex + 1; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		if (lineIndent(line) === 0) return index;
	}
	return lines.length;
}

function findEventLine(
	lines: string[],
	startIndex: number,
	endIndex: number,
	event: TrellisSyncHookEvent,
): number {
	const pattern = new RegExp(`^ {2}${event}:`);
	for (let index = startIndex + 1; index < endIndex; index += 1) {
		if (pattern.test(lines[index] ?? "")) return index;
	}
	return -1;
}

function eventBlockInsertIndex(
	lines: string[],
	eventIndex: number,
	hooksEndIndex: number,
): number {
	for (let index = eventIndex + 1; index < hooksEndIndex; index += 1) {
		const line = lines[index] ?? "";
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		if (lineIndent(line) <= 2) return index;
	}
	return hooksEndIndex;
}

function ensureHookCommandInLines(args: {
	lines: string[];
	hooksStartIndex: number;
	hooksEndIndex: number;
	event: TrellisSyncHookEvent;
	command: string;
}): { hooksEndIndex: number; changed: boolean } {
	const { lines, hooksStartIndex, event, command } = args;
	const { hooksEndIndex } = args;

	for (let index = hooksStartIndex + 1; index < hooksEndIndex; index += 1) {
		if ((lines[index] ?? "").includes(command)) {
			return { hooksEndIndex, changed: false };
		}
	}

	const eventIndex = findEventLine(
		lines,
		hooksStartIndex,
		hooksEndIndex,
		event,
	);
	if (eventIndex === -1) {
		lines.splice(hooksEndIndex, 0, `  ${event}:`, yamlCommandLine(command));
		return { hooksEndIndex: hooksEndIndex + 2, changed: true };
	}

	if (/:\s*\[\s*\]\s*(?:#.*)?$/.test(lines[eventIndex] ?? "")) {
		lines[eventIndex] = `  ${event}:`;
		lines.splice(eventIndex + 1, 0, yamlCommandLine(command));
		return { hooksEndIndex: hooksEndIndex + 1, changed: true };
	}

	const insertIndex = eventBlockInsertIndex(lines, eventIndex, hooksEndIndex);
	lines.splice(insertIndex, 0, yamlCommandLine(command));
	return { hooksEndIndex: hooksEndIndex + 1, changed: true };
}

export function mergeTrellisHookConfig(
	configText: string,
	commands: Partial<Record<TrellisSyncHookEvent, string>>,
): { text: string; changed: boolean } {
	const entries = Object.entries(commands).filter(
		(entry): entry is [TrellisSyncHookEvent, string] => Boolean(entry[1]),
	);
	if (entries.length === 0) return { text: configText, changed: false };

	const hadTrailingNewline = configText.endsWith("\n");
	const lines = configText.replace(/\n$/, "").split("\n");

	let hooksStartIndex = findTopLevelHooksLine(lines);
	let changed = false;
	if (hooksStartIndex === -1) {
		const inlineEmptyIndex = findTopLevelHooksInlineEmptyLine(lines);
		if (inlineEmptyIndex >= 0) {
			lines[inlineEmptyIndex] = "hooks:";
			hooksStartIndex = inlineEmptyIndex;
			changed = true;
		}
	}

	if (hooksStartIndex === -1) {
		const prefix =
			configText.trim().length > 0 ? `${configText.trimEnd()}\n\n` : "";
		const hookLines = [
			"hooks:",
			...entries.flatMap(([event, command]) => [
				`  ${event}:`,
				yamlCommandLine(command),
			]),
			"",
		];
		return {
			text: `${prefix}${hookLines.join("\n")}`,
			changed: true,
		};
	}

	let hooksEndIndex = findTopLevelBlockEnd(lines, hooksStartIndex);
	for (const [event, command] of entries) {
		const result = ensureHookCommandInLines({
			lines,
			hooksStartIndex,
			hooksEndIndex,
			event,
			command,
		});
		hooksEndIndex = result.hooksEndIndex;
		changed = changed || result.changed;
	}

	if (!changed) return { text: configText, changed: false };

	const text = lines.join("\n");
	return { text: hadTrailingNewline ? `${text}\n` : text, changed: true };
}

function currentLocalDateString(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function currentTaskDatePrefix(date = new Date()): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${month}-${day}`;
}

function slugifyTaskTitle(title: string, fallback: string): string {
	const slug = title
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return slug || fallback;
}

function supersetTaskShortId(taskId: string): string {
	return taskId.replace(/-/g, "").slice(0, 8) || "task";
}

async function readJsonObject(
	path: string,
): Promise<Record<string, unknown> | null> {
	try {
		const parsed = JSON.parse(await readFile(path, "utf8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch (error) {
		if (isNodeErrno(error, "ENOENT")) return null;
		throw error;
	}
}

async function writeJsonObject(
	path: string,
	data: Record<string, unknown>,
): Promise<void> {
	await writeFile(path, JSON.stringify(data, null, 2), "utf8");
}

function readSupersetTaskId(taskJson: Record<string, unknown>): string | null {
	const meta = taskJson.meta;
	if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
	const taskId = (meta as Record<string, unknown>).supersetTaskId;
	return typeof taskId === "string" && taskId.trim() ? taskId : null;
}

async function findLinkedTrellisTaskJson(args: {
	tasksPath: string;
	supersetTaskId: string;
}): Promise<string | null> {
	const entries = await readdir(args.tasksPath, { withFileTypes: true }).catch(
		(error) => {
			if (isNodeErrno(error, "ENOENT")) return [];
			throw error;
		},
	);

	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name === "archive") continue;
		const taskJsonPath = join(args.tasksPath, entry.name, "task.json");
		const taskJson = await readJsonObject(taskJsonPath);
		if (taskJson && readSupersetTaskId(taskJson) === args.supersetTaskId) {
			return taskJsonPath;
		}
	}

	return null;
}

async function reserveTrellisTaskDir(args: {
	tasksPath: string;
	baseSlug: string;
}): Promise<string> {
	const prefix = currentTaskDatePrefix();
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
		const candidate = join(
			args.tasksPath,
			`${prefix}-${args.baseSlug}${suffix}`,
		);
		if (!(await pathExists(candidate))) return candidate;
	}
	throw new Error("Could not reserve a unique Trellis task directory");
}

function optionalString(value: string | null | undefined): string | null {
	return typeof value === "string" && value.trim() ? value : null;
}

function buildTrellisTaskPrd(args: {
	title: string;
	description: string | null;
	taskId: string;
	taskSlug: string | null;
}): string {
	const taskLabel = args.taskSlug ?? args.taskId;
	const body =
		args.description?.trim() ||
		"Review and complete the linked Superset Task in the app.";
	return `# ${args.title}

## Goal

Mirror Superset Task \`${taskLabel}\` in this repository's guided workflow.

## Requirements

${body}

## Acceptance Criteria

- [ ] Complete the linked Superset Task.
`;
}

export async function ensureSupersetTaskTrellisLink(args: {
	worktreePath: string;
	supersetTask: {
		id: string;
		slug?: string | null;
		title?: string | null;
		description?: string | null;
	};
	workspaceId?: string | null;
	branch?: string | null;
}): Promise<SupersetTaskTrellisLinkResult> {
	const status = await getTrellisStatusAtPath(args.worktreePath);
	if (status.state !== "ready") {
		return {
			created: false,
			taskDir: null,
			taskJsonPath: null,
			warning:
				"Guided workflow status sync was requested, but Trellis is not ready in this workspace.",
		};
	}

	const tasksPath = join(args.worktreePath, ".trellis", "tasks");
	const existingTaskJsonPath = await findLinkedTrellisTaskJson({
		tasksPath,
		supersetTaskId: args.supersetTask.id,
	});
	if (existingTaskJsonPath) {
		return {
			created: false,
			taskDir: dirname(existingTaskJsonPath),
			taskJsonPath: existingTaskJsonPath,
			warning: null,
		};
	}

	try {
		await mkdir(tasksPath, { recursive: true });
		const title =
			optionalString(args.supersetTask.title) ??
			`Superset Task ${supersetTaskShortId(args.supersetTask.id)}`;
		const slug =
			optionalString(args.supersetTask.slug) ??
			slugifyTaskTitle(
				title,
				`superset-task-${supersetTaskShortId(args.supersetTask.id)}`,
			);
		const dirSlug = slugifyTaskTitle(
			slug,
			`superset-task-${supersetTaskShortId(args.supersetTask.id)}`,
		);
		const taskDir = await reserveTrellisTaskDir({
			tasksPath,
			baseSlug: dirSlug,
		});
		await mkdir(taskDir, { recursive: true });

		const taskJsonPath = join(taskDir, "task.json");
		const taskJson = {
			id: dirSlug,
			name: dirSlug,
			title,
			description: optionalString(args.supersetTask.description) ?? "",
			status: "planning",
			dev_type: null,
			scope: null,
			package: null,
			priority: "P2",
			creator: "superset",
			assignee: "superset",
			createdAt: currentLocalDateString(),
			completedAt: null,
			branch: optionalString(args.branch),
			base_branch: null,
			worktree_path: args.worktreePath,
			commit: null,
			pr_url: null,
			subtasks: [],
			children: [],
			parent: null,
			relatedFiles: [],
			notes: "",
			meta: {
				supersetTaskId: args.supersetTask.id,
				supersetTaskSlug: optionalString(args.supersetTask.slug),
				supersetWorkspaceId: optionalString(args.workspaceId),
			},
		};

		await writeJsonObject(taskJsonPath, taskJson);
		await writeFile(
			join(taskDir, "prd.md"),
			buildTrellisTaskPrd({
				title,
				description: optionalString(args.supersetTask.description),
				taskId: args.supersetTask.id,
				taskSlug: optionalString(args.supersetTask.slug),
			}),
			"utf8",
		);

		return {
			created: true,
			taskDir,
			taskJsonPath,
			warning: null,
		};
	} catch (error) {
		return {
			created: false,
			taskDir: null,
			taskJsonPath: null,
			warning: `Failed to link the Superset Task into Trellis: ${errorMessageWithOutput(error)}`,
		};
	}
}

export async function installSupersetTaskSyncHook(args: {
	worktreePath: string;
}): Promise<SupersetTaskSyncHookInstallResult> {
	const status = await getTrellisStatusAtPath(args.worktreePath);
	if (status.state !== "ready") {
		return {
			installed: false,
			scriptChanged: false,
			configChanged: false,
			warning:
				"Guided workflow status sync hook was requested, but Trellis is not ready in this workspace.",
		};
	}

	try {
		const scriptPath = join(
			args.worktreePath,
			SUPERSET_TASK_SYNC_HOOK_RELATIVE_PATH,
		);
		await mkdir(dirname(scriptPath), { recursive: true });
		const currentScript = await readTrimmed(scriptPath);
		const scriptChanged =
			currentScript !== SUPERSET_TASK_SYNC_HOOK_SCRIPT.trim();
		if (scriptChanged) {
			await writeFile(
				scriptPath,
				`${SUPERSET_TASK_SYNC_HOOK_SCRIPT}\n`,
				"utf8",
			);
		}
		await chmod(scriptPath, 0o755);

		const configPath =
			status.configPath ?? join(args.worktreePath, ".trellis", "config.yaml");
		const currentConfig = await readFile(configPath, "utf8");
		const merged = mergeTrellisHookConfig(
			currentConfig,
			SUPERSET_TASK_SYNC_HOOK_COMMANDS,
		);
		if (merged.changed) {
			await writeFile(configPath, merged.text, "utf8");
		}

		return {
			installed: true,
			scriptChanged,
			configChanged: merged.changed,
			warning: null,
		};
	} catch (error) {
		return {
			installed: false,
			scriptChanged: false,
			configChanged: false,
			warning: `Failed to install Superset Task status sync hook: ${errorMessageWithOutput(error)}`,
		};
	}
}

export async function applySupersetTaskTrellisBridge(args: {
	worktreePath: string;
	trellisSetup: TrellisSetupResult;
	supersetTask: {
		id: string;
		slug?: string | null;
		title?: string | null;
		description?: string | null;
	};
	workspaceId: string;
	branch: string;
}): Promise<TrellisSetupResult> {
	if (args.trellisSetup.state !== "ready") return args.trellisSetup;

	const [installResult, linkResult] = await Promise.all([
		installSupersetTaskSyncHook({ worktreePath: args.worktreePath }),
		ensureSupersetTaskTrellisLink({
			worktreePath: args.worktreePath,
			supersetTask: args.supersetTask,
			workspaceId: args.workspaceId,
			branch: args.branch,
		}),
	]);

	return {
		...args.trellisSetup,
		warning: mergeWarnings(
			args.trellisSetup.warning,
			installResult.warning,
			linkResult.warning,
		),
	};
}

export const getTrellisStatus = protectedProcedure
	.input(z.object({ projectId: z.string().uuid() }))
	.query(async ({ ctx, input }) => {
		const localProject = requireLocalProject(ctx, input.projectId);
		return getTrellisStatusAtPath(localProject.repoPath);
	});
