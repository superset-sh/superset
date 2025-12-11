import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentType } from "../../types/process";

/**
 * User configuration file structure
 */
export interface UserConfig {
	launchers?: Partial<Record<AgentType, string>>;
}

/**
 * Get the path to the user config file
 * Default: ~/.superset-cli.json
 */
export function getUserConfigPath(): string {
	return join(homedir(), ".superset-cli.json");
}

/**
 * Load user configuration from ~/.superset-cli.json
 * Returns null if file doesn't exist or can't be parsed
 */
export async function loadUserConfig(): Promise<UserConfig | null> {
	const configPath = getUserConfigPath();

	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const content = await readFile(configPath, "utf-8");
		return JSON.parse(content) as UserConfig;
	} catch (error) {
		console.error("[config] Failed to load user config:", error);
		return null;
	}
}

/**
 * Save user configuration to ~/.superset-cli.json
 */
export async function saveUserConfig(config: UserConfig): Promise<void> {
	const configPath = getUserConfigPath();

	try {
		await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
	} catch (error) {
		console.error("[config] Failed to save user config:", error);
		throw error;
	}
}

/**
 * Get the launch command for a specific agent type from user config
 */
export async function getLaunchCommandFromConfig(
	agentType: AgentType,
): Promise<string | null> {
	const config = await loadUserConfig();
	return config?.launchers?.[agentType] || null;
}
