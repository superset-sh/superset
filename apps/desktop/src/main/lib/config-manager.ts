import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { WorkspaceConfig } from "shared/types";

class ConfigManager {
	private static instance: ConfigManager;
	private configPath: string;
	private configDir: string;

	private constructor() {
		this.configDir = path.join(os.homedir(), ".superset");
		this.configPath = path.join(this.configDir, "config.json");
		this.ensureConfigExists();
	}

	static getInstance(): ConfigManager {
		if (!ConfigManager.instance) {
			ConfigManager.instance = new ConfigManager();
		}
		return ConfigManager.instance;
	}

	private ensureConfigExists(): void {
		// Create directory if it doesn't exist
		if (!existsSync(this.configDir)) {
			mkdirSync(this.configDir, { recursive: true });
		}

		// Create config file with default structure if it doesn't exist
		if (!existsSync(this.configPath)) {
			const defaultConfig: WorkspaceConfig = {
				workspaces: [],
				lastOpenedWorkspaceId: null,
				activeWorktreeId: null,
				activeTabGroupId: null,
				activeTabId: null,
			};
			writeFileSync(
				this.configPath,
				JSON.stringify(defaultConfig, null, 2),
				"utf-8",
			);
		}
	}

	read(): WorkspaceConfig {
		try {
			const content = readFileSync(this.configPath, "utf-8");
			const config = JSON.parse(content) as WorkspaceConfig;
			// Ensure fields exist for backwards compatibility
			if (config.lastOpenedWorkspaceId === undefined) {
				config.lastOpenedWorkspaceId = null;
			}
			if (config.activeWorktreeId === undefined) {
				config.activeWorktreeId = null;
			}
			if (config.activeTabGroupId === undefined) {
				config.activeTabGroupId = null;
			}
			if (config.activeTabId === undefined) {
				config.activeTabId = null;
			}
			return config;
		} catch (error) {
			console.error("Failed to read config:", error);
			// Return default config if read fails
			return {
				workspaces: [],
				lastOpenedWorkspaceId: null,
				activeWorktreeId: null,
				activeTabGroupId: null,
				activeTabId: null,
			};
		}
	}

	write(config: WorkspaceConfig): boolean {
		try {
			writeFileSync(this.configPath, JSON.stringify(config, null, 2), "utf-8");
			return true;
		} catch (error) {
			console.error("Failed to write config:", error);
			return false;
		}
	}

	getConfigPath(): string {
		return this.configPath;
	}

	getLastOpenedWorkspaceId(): string | null {
		const config = this.read();
		return config.lastOpenedWorkspaceId;
	}

	setLastOpenedWorkspaceId(id: string | null): boolean {
		const config = this.read();
		config.lastOpenedWorkspaceId = id;
		return this.write(config);
	}

	getActiveSelection(): {
		worktreeId: string | null;
		tabGroupId: string | null;
		tabId: string | null;
	} {
		const config = this.read();
		return {
			worktreeId: config.activeWorktreeId,
			tabGroupId: config.activeTabGroupId,
			tabId: config.activeTabId,
		};
	}

	setActiveSelection(
		worktreeId: string | null,
		tabGroupId: string | null,
		tabId: string | null,
	): boolean {
		const config = this.read();
		config.activeWorktreeId = worktreeId;
		config.activeTabGroupId = tabGroupId;
		config.activeTabId = tabId;
		return this.write(config);
	}
}

export default ConfigManager.getInstance();
