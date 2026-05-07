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
type ScriptKey = (typeof SCRIPT_KEYS)[number];

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

function getUserOverridePath(
	projectId: string,
	homeDir: string,
): string | null {
	if (projectId.includes("/") || projectId.includes("\\")) return null;
	return join(
		homeDir,
		SUPERSET_DIR_NAME,
		PROJECTS_DIR_NAME,
		projectId,
		CONFIG_FILE_NAME,
	);
}

function getLocalOverlayPath(repoPath: string): string {
	return join(repoPath, PROJECT_SUPERSET_DIR_NAME, LOCAL_CONFIG_FILE_NAME);
}

/**
 * Resolve setup/teardown/run config for a v2 project.
 *
 *   1. <repoPath>/.superset/config.json    — canonical
 *   2. ~/.superset/projects/<id>/config.json — per-machine override (later wins)
 *   3. <repoPath>/.superset/config.local.json — overlay with before/after/replace
 *
 * Returns null when no source defines anything. Worktrees are not consulted —
 * the main repo path is the single source of truth.
 */
export function loadSetupConfig(args: {
	repoPath: string;
	projectId: string;
	/** Override $HOME for tests. Defaults to `os.homedir()`. */
	homeDir?: string;
}): SetupConfig | null {
	const projectConfig = readSetupConfigAt(getProjectConfigPath(args.repoPath));

	const userOverridePath = getUserOverridePath(
		args.projectId,
		args.homeDir ?? homedir(),
	);
	const userConfig = userOverridePath
		? readSetupConfigAt(userOverridePath)
		: null;

	const base = mergeBaseConfigs(projectConfig, userConfig);
	if (!base) return null;

	const local = readLocalConfigAt(getLocalOverlayPath(args.repoPath));
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

export function getResolvedSetupCommands(config: SetupConfig | null): string[] {
	return nonEmptyStrings(config?.setup);
}
