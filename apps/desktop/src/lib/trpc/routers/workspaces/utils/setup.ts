import { cpSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	CONFIG_FILE_NAME,
	LOCAL_CONFIG_FILE_NAME,
	PROJECT_SUPERSET_DIR_NAME,
	PROJECTS_DIR_NAME,
	SUPERSET_DIR_NAME,
} from "shared/constants";
import type { LocalSetupConfig, SetupConfig } from "shared/types";
import {
	applyLifecycleTrustBoundary,
	applyLocalLifecycleTrustBoundary,
	type LifecycleConfigSource,
	type RejectedLifecycleField,
} from "./lifecycle-trust";

/**
 * Worktrees don't include gitignored files, so copy .superset from main repo
 * if it's missing — ensures setup scripts like "./.superset/setup.sh" work.
 */
export function copySupersetConfigToWorktree(
	mainRepoPath: string,
	worktreePath: string,
): void {
	const mainSupersetDir = join(mainRepoPath, PROJECT_SUPERSET_DIR_NAME);
	const worktreeSupersetDir = join(worktreePath, PROJECT_SUPERSET_DIR_NAME);

	if (existsSync(mainSupersetDir) && !existsSync(worktreeSupersetDir)) {
		try {
			cpSync(mainSupersetDir, worktreeSupersetDir, { recursive: true });
		} catch (error) {
			console.error(
				`Failed to copy ${PROJECT_SUPERSET_DIR_NAME} to worktree: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}

function readConfigFile(configPath: string): SetupConfig | null {
	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const content = readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(content) as SetupConfig;

		if (parsed.setup && !Array.isArray(parsed.setup)) {
			throw new Error("'setup' field must be an array of strings");
		}

		if (parsed.teardown && !Array.isArray(parsed.teardown)) {
			throw new Error("'teardown' field must be an array of strings");
		}

		if (parsed.run && !Array.isArray(parsed.run)) {
			throw new Error("'run' field must be an array of strings");
		}

		if (parsed.cwd !== undefined) {
			if (typeof parsed.cwd !== "string" || parsed.cwd.trim().length === 0) {
				throw new Error("'cwd' field must be a non-empty string");
			}
			parsed.cwd = parsed.cwd.trim();
		}

		return parsed;
	} catch (error) {
		console.error(
			`Failed to read setup config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

function readConfigFromPath(
	basePath: string,
	source: LifecycleConfigSource,
	rejected: RejectedLifecycleField[],
): SetupConfig | null {
	const config = readConfigFile(
		join(basePath, PROJECT_SUPERSET_DIR_NAME, CONFIG_FILE_NAME),
	);
	if (!config) return null;
	return applyLifecycleTrustBoundary(config, source, rejected);
}

function readLocalConfigFile(filePath: string): LocalSetupConfig | null {
	if (!existsSync(filePath)) {
		return null;
	}

	try {
		const content = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(content) as LocalSetupConfig;

		for (const key of ["setup", "teardown", "run"] as const) {
			const value = parsed[key];
			if (value === undefined) continue;

			if (Array.isArray(value)) continue;

			if (typeof value === "object" && value !== null) {
				if (value.before !== undefined && !Array.isArray(value.before)) {
					throw new Error(`'${key}.before' must be an array of strings`);
				}
				if (value.after !== undefined && !Array.isArray(value.after)) {
					throw new Error(`'${key}.after' must be an array of strings`);
				}
				continue;
			}

			throw new Error(
				`'${key}' must be an array of strings or an object with before/after`,
			);
		}

		return parsed;
	} catch (error) {
		console.error(
			`Failed to read local config at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

function readLocalConfigFromPath(
	basePath: string,
	source: LifecycleConfigSource,
	rejected: RejectedLifecycleField[],
): LocalSetupConfig | null {
	const config = readLocalConfigFile(
		join(basePath, PROJECT_SUPERSET_DIR_NAME, LOCAL_CONFIG_FILE_NAME),
	);
	if (!config) return null;
	return applyLocalLifecycleTrustBoundary(config, source, rejected);
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

/**
 * Merge a base config with a local config overlay.
 *
 * For each key (setup, teardown):
 *   - local is array       → override (replace base entirely)
 *   - local is {before,after} → merge: [...before, ...base, ...after]
 *   - local is undefined   → passthrough (use base)
 */
export function mergeConfigs(
	base: SetupConfig,
	local: LocalSetupConfig,
): SetupConfig {
	const result: SetupConfig = { ...base };

	for (const key of ["setup", "teardown", "run"] as const) {
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

export interface ResolvedLifecycleConfig {
	config: SetupConfig | null;
	/** Execution-steering fields dropped because their source is untrusted. */
	rejected: RejectedLifecycleField[];
}

/**
 * Resolves setup/teardown/run config, lowest priority first:
 *   1. Main repo:     <mainRepoPath>/.superset/config.json
 *   2. Worktree:      <worktreePath>/.superset/config.json
 *   3. User override: ~/.superset/projects/<projectId>/config.json
 *
 * Higher-priority configs override only the keys they explicitly define, so a
 * source that omits a key inherits it rather than blanking it. A local overlay
 * from `.superset/config.local.json` is then applied on top, which can prepend
 * (before), append (after), or replace each key.
 *
 * Commands and `cwd` are only honoured from sources the local user controls
 * (GHSA-h3q4-r3jv-gmj2, GHSA-hf7c-jmhj-qghw). The worktree is branch content —
 * for a workspace opened from a pull request it belongs to the PR author — so
 * tier 2 contributes nothing executable and is left in the chain only for
 * non-executable keys. A branch that needs its own commands has to land them on
 * the checked-out main repo, or the user puts them in the gitignored
 * `config.local.json`, which is read from the main repo for the same reason.
 */
export function resolveLifecycleConfig({
	mainRepoPath,
	worktreePath,
	projectId,
}: {
	mainRepoPath: string;
	worktreePath?: string;
	projectId?: string;
}): ResolvedLifecycleConfig {
	const rejected: RejectedLifecycleField[] = [];
	let base = readConfigFromPath(mainRepoPath, "main-repo", rejected);

	if (worktreePath) {
		const config = readConfigFromPath(worktreePath, "worktree", rejected);
		if (config) {
			base = mergeBaseConfigs(base, config);
		}
	}

	if (projectId && !projectId.includes("/") && !projectId.includes("\\")) {
		const userConfigPath = join(
			homedir(),
			SUPERSET_DIR_NAME,
			PROJECTS_DIR_NAME,
			projectId,
			CONFIG_FILE_NAME,
		);
		const config = readConfigFile(userConfigPath);
		if (config) {
			base = mergeBaseConfigs(base, config);
		}
	}

	// Apply local config overlay (worktree first, then main repo)
	const worktreeLocal = worktreePath
		? readLocalConfigFromPath(worktreePath, "worktree", rejected)
		: null;
	const localConfig =
		worktreeLocal ??
		readLocalConfigFromPath(mainRepoPath, "local-config", rejected);

	for (const field of rejected) {
		console.warn(
			`[lifecycle-trust] Ignoring '${field.key}' from ${field.source} config: ${JSON.stringify(field.value)}`,
		);
	}

	if (!base) return { config: null, rejected };

	if (localConfig) {
		return { config: mergeConfigs(base, localConfig), rejected };
	}

	return { config: base, rejected };
}

export function loadSetupConfig(params: {
	mainRepoPath: string;
	worktreePath?: string;
	projectId?: string;
}): SetupConfig | null {
	return resolveLifecycleConfig(params).config;
}
