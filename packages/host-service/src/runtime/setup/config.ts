import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT_SUPERSET_DIR_NAME = ".superset";
const CONFIG_FILE_NAME = "config.json";
const LOCAL_CONFIG_FILE_NAME = "config.local.json";
const SUPERSET_DIR_NAME = ".superset";
const PROJECTS_DIR_NAME = "projects";

export interface SetupConfig {
	setup?: string[];
	teardown?: string[];
	run?: string[];
	cwd?: string;
}

interface LocalScriptMerge {
	before?: string[];
	after?: string[];
}

interface LocalSetupConfig {
	setup?: string[] | LocalScriptMerge;
	teardown?: string[] | LocalScriptMerge;
	run?: string[] | LocalScriptMerge;
}

const SCRIPT_KEYS = ["setup", "teardown", "run"] as const;
export type ScriptKey = (typeof SCRIPT_KEYS)[number];

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

function readJson<T>(filePath: string): T | null {
	if (!existsSync(filePath)) return null;
	try {
		return JSON.parse(readFileSync(filePath, "utf-8")) as T;
	} catch (error) {
		console.error(
			`Failed to read JSON at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

function validateSetupConfig(
	parsed: unknown,
	source: string,
): SetupConfig | null {
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return null;
	}
	const obj = parsed as Record<string, unknown>;
	const result: SetupConfig = {};
	if (obj.cwd !== undefined) {
		if (typeof obj.cwd !== "string" || obj.cwd.trim().length === 0) {
			console.error(
				`Invalid setup config at ${source}: 'cwd' must be a non-empty string`,
			);
			return null;
		}
		result.cwd = obj.cwd.trim();
	}
	for (const key of SCRIPT_KEYS) {
		const value = obj[key];
		if (value === undefined) continue;
		if (!isStringArray(value)) {
			console.error(
				`Invalid setup config at ${source}: '${key}' must be an array of strings`,
			);
			return null;
		}
		result[key] = value;
	}
	return result;
}

function readSetupConfigAt(filePath: string): SetupConfig | null {
	const parsed = readJson<unknown>(filePath);
	if (parsed === null) return null;
	return validateSetupConfig(parsed, filePath);
}

function readLocalConfigAt(filePath: string): LocalSetupConfig | null {
	const parsed = readJson<unknown>(filePath);
	if (parsed === null) return null;
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return null;
	}
	const obj = parsed as Record<string, unknown>;
	const result: LocalSetupConfig = {};
	for (const key of SCRIPT_KEYS) {
		const value = obj[key];
		if (value === undefined) continue;
		if (isStringArray(value)) {
			result[key] = value;
			continue;
		}
		if (value && typeof value === "object" && !Array.isArray(value)) {
			const merge = value as Record<string, unknown>;
			if (merge.before !== undefined && !isStringArray(merge.before)) {
				console.error(
					`Invalid local config at ${filePath}: '${key}.before' must be an array of strings`,
				);
				return null;
			}
			if (merge.after !== undefined && !isStringArray(merge.after)) {
				console.error(
					`Invalid local config at ${filePath}: '${key}.after' must be an array of strings`,
				);
				return null;
			}
			result[key] = {
				before: merge.before as string[] | undefined,
				after: merge.after as string[] | undefined,
			};
			continue;
		}
		console.error(
			`Invalid local config at ${filePath}: '${key}' must be an array or {before,after}`,
		);
		return null;
	}
	return result;
}

function mergeBaseConfigs(
	base: SetupConfig | null,
	override: SetupConfig | null,
): SetupConfig | null {
	if (!base) return override;
	if (!override) return base;
	return {
		setup: override.setup ?? base.setup,
		teardown: override.teardown ?? base.teardown,
		run: override.run ?? base.run,
		cwd: override.cwd ?? base.cwd,
	};
}

function applyLocalOverlay(
	base: SetupConfig,
	local: LocalSetupConfig,
): SetupConfig {
	const result: SetupConfig = { ...base };
	for (const key of SCRIPT_KEYS) {
		const localValue = local[key];
		if (localValue === undefined) continue;
		if (Array.isArray(localValue)) {
			result[key] = localValue;
		} else {
			const before = localValue.before ?? [];
			const after = localValue.after ?? [];
			result[key] = [...before, ...(base[key] ?? []), ...after];
		}
	}
	return result;
}

export function getProjectConfigPath(repoPath: string): string {
	return join(repoPath, PROJECT_SUPERSET_DIR_NAME, CONFIG_FILE_NAME);
}

/**
 * Candidate user-override files, highest priority first: keyed by the
 * project's repo path mirrored under the projects dir (e.g.
 * `~/.superset/projects/Users/me/work/app/config.json` — discoverable
 * without looking up an ID), then by project id (legacy). The first
 * candidate that parses wins.
 */
function getUserOverridePaths(args: {
	repoPath: string;
	projectId: string;
	homeDir: string;
}): string[] {
	const projectsDir = join(args.homeDir, SUPERSET_DIR_NAME, PROJECTS_DIR_NAME);
	const paths = [join(projectsDir, args.repoPath, CONFIG_FILE_NAME)];
	if (!args.projectId.includes("/") && !args.projectId.includes("\\")) {
		paths.push(join(projectsDir, args.projectId, CONFIG_FILE_NAME));
	}
	return paths;
}

function getLocalOverlayPath(repoPath: string): string {
	return join(repoPath, PROJECT_SUPERSET_DIR_NAME, LOCAL_CONFIG_FILE_NAME);
}

/**
 * Resolve setup/teardown/run config for a v2 project. Base merge, per key,
 * later wins:
 *
 *   1. <repoPath>/.superset/config.json      — canonical project config
 *   2. <worktreePath>/.superset/config.json  — workspace/branch override
 *      (only when a worktree is in scope: setup at create, teardown at delete)
 *   3. ~/.superset/projects/<repoPath>/config.json — per-machine user
 *      override (falls back to the legacy <project-id> key)
 *
 * Then a local overlay with before/after/replace semantics: the worktree's
 * `config.local.json` if present, else the main repo's.
 *
 * Returns null when no source defines anything.
 */
export function loadSetupConfig(args: {
	repoPath: string;
	projectId: string;
	/** Workspace worktree; when set, its config overrides the main repo's. */
	worktreePath?: string;
	/** Override $HOME for tests. Defaults to `os.homedir()`. */
	homeDir?: string;
}): SetupConfig | null {
	const projectConfig = readSetupConfigAt(getProjectConfigPath(args.repoPath));
	const worktreeConfig = args.worktreePath
		? readSetupConfigAt(getProjectConfigPath(args.worktreePath))
		: null;

	let userConfig: SetupConfig | null = null;
	for (const overridePath of getUserOverridePaths({
		repoPath: args.repoPath,
		projectId: args.projectId,
		homeDir: args.homeDir ?? homedir(),
	})) {
		userConfig = readSetupConfigAt(overridePath);
		if (userConfig) break;
	}

	const base = mergeBaseConfigs(
		mergeBaseConfigs(projectConfig, worktreeConfig),
		userConfig,
	);
	if (!base) return null;

	const worktreeLocal = args.worktreePath
		? readLocalConfigAt(getLocalOverlayPath(args.worktreePath))
		: null;
	const local =
		worktreeLocal ?? readLocalConfigAt(getLocalOverlayPath(args.repoPath));
	return local ? applyLocalOverlay(base, local) : base;
}

function nonEmptyStrings(value: string[] | undefined): string[] {
	return (value ?? []).filter((s) => s.trim().length > 0);
}

export function hasConfiguredScripts(config: SetupConfig | null): boolean {
	if (!config) return false;
	for (const key of SCRIPT_KEYS satisfies readonly ScriptKey[]) {
		if (nonEmptyStrings(config[key]).length > 0) return true;
	}
	return false;
}

export type ResolvedScript =
	| { kind: "commands"; commands: string[]; cwd?: string }
	| { kind: "script"; scriptPath: string; cwd?: string };

/**
 * Resolve a lifecycle script (`setup` | `teardown` | `run`) for a project.
 * Every key gets the same posture:
 *
 *   1. Configured commands via {@link loadSetupConfig} — worktree config
 *      overrides the main repo's when `worktreePath` is in scope.
 *   2. Fallback: `.superset/<key>.sh`, worktree first (when in scope), then
 *      the main repo — gitignored scripts only exist in the main repo.
 *
 * Setup and teardown pass their worktree; `run` resolves per project, where
 * no single worktree exists, so it uses the main repo only.
 *
 * `cwd` from the same config rides along either way. Returns null when no
 * source resolves to anything runnable.
 */
export function resolveScript(
	key: ScriptKey,
	args: {
		repoPath: string;
		projectId: string;
		/** Workspace worktree; its config and script win over the main repo. */
		worktreePath?: string;
		/** Override $HOME for tests. Defaults to `os.homedir()`. */
		homeDir?: string;
	},
): ResolvedScript | null {
	const config = loadSetupConfig(args);
	const cwd = config?.cwd;
	const commands = nonEmptyStrings(config?.[key]);
	if (commands.length > 0) {
		return { kind: "commands", commands, ...(cwd && { cwd }) };
	}

	const roots = args.worktreePath
		? [args.worktreePath, args.repoPath]
		: [args.repoPath];
	for (const root of roots) {
		const scriptPath = join(root, PROJECT_SUPERSET_DIR_NAME, `${key}.sh`);
		if (existsSync(scriptPath)) {
			return { kind: "script", scriptPath, ...(cwd && { cwd }) };
		}
	}

	return null;
}

/** POSIX single-quote escape: safe for any byte sequence in a path. */
export function shellSingleQuote(s: string): string {
	return `'${s.replaceAll("'", "'\\''")}'`;
}
