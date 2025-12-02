import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE_NAME, PROJECT_SUPERSET_DIR_NAME } from "shared/constants";
import type { SetupConfig } from "shared/types";

export function loadSetupConfig(mainRepoPath: string): SetupConfig | null {
	const configPath = join(
		mainRepoPath,
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

		return parsed;
	} catch (error) {
		console.error(
			`Failed to read setup config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}
