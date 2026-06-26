import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	CONFIG_FILE_NAME,
	PROJECT_SUPERSET_DIR_NAME,
	PROJECTS_DIR_NAME,
	SUPERSET_DIR_NAME,
} from "shared/constants";

function isSafeProjectId(projectId: string): boolean {
	return !projectId.includes("/") && !projectId.includes("\\");
}

export function getProjectOverrideConfigPath(
	projectId?: string,
): string | null {
	if (!projectId || !isSafeProjectId(projectId)) {
		return null;
	}

	return join(
		homedir(),
		SUPERSET_DIR_NAME,
		PROJECTS_DIR_NAME,
		projectId,
		CONFIG_FILE_NAME,
	);
}

export function getProjectConfigPath(
	mainRepoPath: string,
	projectId?: string,
): string {
	const userOverrideConfigPath = getProjectOverrideConfigPath(projectId);
	if (userOverrideConfigPath && existsSync(userOverrideConfigPath)) {
		return userOverrideConfigPath;
	}

	return join(mainRepoPath, PROJECT_SUPERSET_DIR_NAME, CONFIG_FILE_NAME);
}

export function ensureProjectConfigExists(
	mainRepoPath: string,
	configTemplate: string,
	projectId?: string,
): string {
	const configPath = getProjectConfigPath(mainRepoPath, projectId);
	if (existsSync(configPath)) {
		return configPath;
	}

	const supersetDir = join(mainRepoPath, PROJECT_SUPERSET_DIR_NAME);
	if (!existsSync(supersetDir)) {
		mkdirSync(supersetDir, { recursive: true });
	}

	writeFileSync(configPath, configTemplate, "utf-8");
	return configPath;
}
