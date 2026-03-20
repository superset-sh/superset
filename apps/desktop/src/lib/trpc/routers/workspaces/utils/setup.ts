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

		return parsed;
	} catch (error) {
		console.error(
			`Failed to read setup config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

function readConfigFromPath(basePath: string): SetupConfig | null {
	return readConfigFile(
		join(basePath, PROJECT_SUPERSET_DIR_NAME, CONFIG_FILE_NAME),
	);
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

function readLocalConfigFromPath(basePath: string): LocalSetupConfig | null {
	return readLocalConfigFile(
		join(basePath, PROJECT_SUPERSET_DIR_NAME, LOCAL_CONFIG_FILE_NAME),
	);
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

/**
 * Resolves setup/teardown/run config with a three-tier priority:
 *   1. User override:  ~/.superset/projects/<projectId>/config.json
 *   2. Worktree:       <worktreePath>/.superset/config.json
 *   3. Main repo:      <mainRepoPath>/.superset/config.json
 *
 * Higher-priority configs override only the keys they explicitly define.
 * Missing keys inherit from lower-priority sources, so stale copied worktree
 * configs do not mask newly added project-level commands like `run`.
 *
 * After resolving the base config, a local overlay is applied if
 * `.superset/config.local.json` exists in the workspace (worktree or main repo).
 * The local config can prepend (before), append (after), or override each key.
 */
export function loadSetupConfig({
	mainRepoPath,
	worktreePath,
	projectId,
}: {
	mainRepoPath: string;
	worktreePath?: string;
	projectId?: string;
}): SetupConfig | null {
	let base = readConfigFromPath(mainRepoPath);

	if (base) {
		console.log(
			`[setup] Using main repo config from ${join(mainRepoPath, PROJECT_SUPERSET_DIR_NAME, CONFIG_FILE_NAME)}`,
		);
	}

	if (worktreePath) {
		const config = readConfigFromPath(worktreePath);
		if (config) {
			console.log(
				`[setup] Using worktree config from ${join(worktreePath, PROJECT_SUPERSET_DIR_NAME, CONFIG_FILE_NAME)}`,
			);
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
			console.log(`[setup] Using user override config from ${userConfigPath}`);
			base = mergeBaseConfigs(base, config);
		}
	}

	if (!base) return null;

	// Apply local config overlay (worktree first, then main repo)
	const worktreeLocal = worktreePath
		? readLocalConfigFromPath(worktreePath)
		: null;
	const localConfig = worktreeLocal ?? readLocalConfigFromPath(mainRepoPath);

	if (localConfig) {
		const source = worktreeLocal && worktreePath ? worktreePath : mainRepoPath;
		console.log(
			`[setup] Applying local config overlay from ${join(source, PROJECT_SUPERSET_DIR_NAME, LOCAL_CONFIG_FILE_NAME)}`,
		);
		return mergeConfigs(base, localConfig);
	}

	return base;
}
