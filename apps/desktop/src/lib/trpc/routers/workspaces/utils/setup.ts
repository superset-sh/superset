import { cpSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE_NAME, PROJECT_SUPERSET_DIR_NAME } from "shared/constants";
import type { SetupConfig } from "shared/types";

/**
 * Copies the .superset directory from main repo to worktree if it exists in main but not in worktree.
 * This handles the case where .superset is gitignored - worktrees won't have it since git only
 * includes tracked files. By copying it, setup scripts like "./.superset/setup.sh" will work.
 */
export function copySupersetConfigToWorktree(
	mainRepoPath: string,
	worktreePath: string,
): void {
	const mainSupersetDir = join(mainRepoPath, PROJECT_SUPERSET_DIR_NAME);
	const worktreeSupersetDir = join(worktreePath, PROJECT_SUPERSET_DIR_NAME);

	// Only copy if it exists in main repo but not in worktree
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

function readConfigFromPath(basePath: string): SetupConfig | null {
	const configPath = join(
		basePath,
		PROJECT_SUPERSET_DIR_NAME,
		CONFIG_FILE_NAME,
	);

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

export function loadSetupConfig({
	mainRepoPath,
	worktreePath,
}: {
	mainRepoPath: string;
	worktreePath?: string;
}): SetupConfig | null {
	if (worktreePath) {
		const config = readConfigFromPath(worktreePath);
		if (config) return config;
	}

	return readConfigFromPath(mainRepoPath);
}
