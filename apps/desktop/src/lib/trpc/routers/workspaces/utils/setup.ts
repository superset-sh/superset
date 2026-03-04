import { execFile } from "node:child_process";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	CONFIG_FILE_NAME,
	PROJECT_SUPERSET_DIR_NAME,
	PROJECTS_DIR_NAME,
	SUPERSET_DIR_NAME,
} from "shared/constants";
import type { SetupConfig } from "shared/types";
import { fetchDefaultBranch } from "./git";

const execFileAsync = promisify(execFile);
const CONFIG_RELATIVE_PATH = `${PROJECT_SUPERSET_DIR_NAME}/${CONFIG_FILE_NAME}`;

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
		return parseSetupConfig(content);
	} catch (error) {
		console.error(
			`Failed to read setup config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

function parseSetupConfig(content: string): SetupConfig {
	const parsed = JSON.parse(content) as SetupConfig;

	if (parsed.setup && !Array.isArray(parsed.setup)) {
		throw new Error("'setup' field must be an array of strings");
	}

	if (parsed.teardown && !Array.isArray(parsed.teardown)) {
		throw new Error("'teardown' field must be an array of strings");
	}

	return parsed;
}

function readConfigFromPath(basePath: string): SetupConfig | null {
	return readConfigFile(join(basePath, CONFIG_RELATIVE_PATH));
}

function readUserOverrideConfig(projectId?: string): SetupConfig | null {
	if (!projectId || projectId.includes("/") || projectId.includes("\\")) {
		return null;
	}

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
	}
	return config;
}

async function readConfigFromGitRef(
	mainRepoPath: string,
	ref: string,
): Promise<SetupConfig | null> {
	try {
		const { stdout } = await execFileAsync(
			"git",
			["-C", mainRepoPath, "show", `${ref}:${CONFIG_RELATIVE_PATH}`],
			{ timeout: 15_000 },
		);
		const config = parseSetupConfig(stdout);
		console.log(
			`[setup] Using git ref config from ${ref}:${CONFIG_RELATIVE_PATH}`,
		);
		return config;
	} catch (error) {
		console.warn(
			`[setup] Could not read config from git ref ${ref}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

/**
 * Resolves setup/teardown config with a three-tier priority:
 *   1. User override:  ~/.superset/projects/<projectId>/config.json
 *   2. Worktree:       <worktreePath>/.superset/config.json
 *   3. Main repo:      <mainRepoPath>/.superset/config.json
 *
 * First config found wins entirely (no merging between levels).
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
	const userConfig = readUserOverrideConfig(projectId);
	if (userConfig) {
		return userConfig;
	}

	if (worktreePath) {
		const config = readConfigFromPath(worktreePath);
		if (config) {
			console.log(
				`[setup] Using worktree config from ${join(worktreePath, CONFIG_RELATIVE_PATH)}`,
			);
			return config;
		}
	}

	const config = readConfigFromPath(mainRepoPath);
	if (config) {
		console.log(
			`[setup] Using main repo config from ${join(mainRepoPath, CONFIG_RELATIVE_PATH)}`,
		);
	}
	return config;
}

/**
 * Resolves setup/teardown config for workspace creation before the worktree
 * has been materialized on disk.
 *
 * Priority:
 *   1. User override
 *   2. Existing worktree (if already present)
 *   3. Remote source branch ref (origin/<branch>)
 *   4. Local source branch ref (<branch>)
 *   5. Main repo working tree
 */
export async function loadSetupConfigForPendingWorktree({
	mainRepoPath,
	worktreePath,
	projectId,
	sourceBranch,
}: {
	mainRepoPath: string;
	worktreePath: string;
	projectId?: string;
	sourceBranch: string;
}): Promise<SetupConfig | null> {
	const userConfig = readUserOverrideConfig(projectId);
	if (userConfig) {
		return userConfig;
	}

	if (existsSync(worktreePath)) {
		const config = readConfigFromPath(worktreePath);
		if (config) {
			console.log(
				`[setup] Using worktree config from ${join(worktreePath, CONFIG_RELATIVE_PATH)}`,
			);
			return config;
		}
	}

	try {
		await fetchDefaultBranch(mainRepoPath, sourceBranch);
	} catch (error) {
		console.warn(
			`[setup] Failed to fetch origin/${sourceBranch} before reading setup config: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const remoteConfig = await readConfigFromGitRef(
		mainRepoPath,
		`origin/${sourceBranch}`,
	);
	if (remoteConfig) {
		return remoteConfig;
	}

	const localBranchConfig = await readConfigFromGitRef(
		mainRepoPath,
		sourceBranch,
	);
	if (localBranchConfig) {
		return localBranchConfig;
	}

	const mainConfig = readConfigFromPath(mainRepoPath);
	if (mainConfig) {
		console.log(
			`[setup] Using main repo config from ${join(mainRepoPath, CONFIG_RELATIVE_PATH)}`,
		);
	}

	return mainConfig;
}
