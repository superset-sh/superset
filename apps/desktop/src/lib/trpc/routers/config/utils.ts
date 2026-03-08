import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	CONFIG_FILE_NAME,
	PROJECTS_DIR_NAME,
	SUPERSET_DIR_NAME,
} from "shared/constants";

const CONFIG_TEMPLATE = `{
  "setup": [],
  "teardown": []
}
`;

const PROJECT_SUPERSET_DIR_NAME = ".superset";

export function getLocalConfigPath(mainRepoPath: string): string {
	return join(mainRepoPath, PROJECT_SUPERSET_DIR_NAME, CONFIG_FILE_NAME);
}

function ensureLocalConfigExists(mainRepoPath: string): string {
	const configPath = getLocalConfigPath(mainRepoPath);
	const supersetDir = join(mainRepoPath, PROJECT_SUPERSET_DIR_NAME);

	if (!existsSync(configPath)) {
		if (!existsSync(supersetDir)) {
			mkdirSync(supersetDir, { recursive: true });
		}
		writeFileSync(configPath, CONFIG_TEMPLATE, "utf-8");
	}

	return configPath;
}

/**
 * Resolves the config file path for a project.
 *
 * If a user override config exists at ~/.superset/projects/<projectId>/config.json,
 * that path is returned without creating any local files.
 *
 * Otherwise, ensures the local project config exists at
 * <mainRepoPath>/.superset/config.json (creating it if needed) and returns that path.
 */
export function resolveConfigFilePath(
	mainRepoPath: string,
	projectId: string,
): string {
	const userConfigPath = join(
		homedir(),
		SUPERSET_DIR_NAME,
		PROJECTS_DIR_NAME,
		projectId,
		CONFIG_FILE_NAME,
	);

	if (existsSync(userConfigPath)) {
		return userConfigPath;
	}

	return ensureLocalConfigExists(mainRepoPath);
}
