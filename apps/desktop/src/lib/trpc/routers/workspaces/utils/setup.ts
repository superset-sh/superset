import { cpSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	CONFIG_FILE_NAME,
	PROJECT_SUPERSET_DIR_NAME,
	PROJECTS_DIR_NAME,
	SUPERSET_DIR_NAME,
} from "shared/constants";
import type { SetupConfig } from "shared/types";

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

/**
 * Resolves setup/teardown config with a three-tier priority:
 *   1. User override:  ~/.superset/projects/<projectName>/config.json
 *   2. Worktree:       <worktreePath>/.superset/config.json
 *   3. Main repo:      <mainRepoPath>/.superset/config.json
 *
 * First config found wins entirely (no merging between levels).
 */
export function loadSetupConfig({
	mainRepoPath,
	worktreePath,
	projectName,
}: {
	mainRepoPath: string;
	worktreePath?: string;
	projectName?: string;
}): SetupConfig | null {
	if (
		projectName &&
		!projectName.includes("/") &&
		!projectName.includes("\\")
	) {
		const userConfigPath = join(
			homedir(),
			SUPERSET_DIR_NAME,
			PROJECTS_DIR_NAME,
			projectName,
			CONFIG_FILE_NAME,
		);
		const config = readConfigFile(userConfigPath);
		if (config) {
			console.log(`[setup] Using user override config from ${userConfigPath}`);
			return config;
		}
	}

	if (worktreePath) {
		const config = readConfigFromPath(worktreePath);
		if (config) {
			console.log(
				`[setup] Using worktree config from ${join(worktreePath, PROJECT_SUPERSET_DIR_NAME, CONFIG_FILE_NAME)}`,
			);
			return config;
		}
	}

	const config = readConfigFromPath(mainRepoPath);
	if (config) {
		console.log(
			`[setup] Using main repo config from ${join(mainRepoPath, PROJECT_SUPERSET_DIR_NAME, CONFIG_FILE_NAME)}`,
		);
	}
	return config;
}
