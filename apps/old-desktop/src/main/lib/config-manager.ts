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
				activeWorkspaceId: null,
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
			const config = JSON.parse(content) as WorkspaceConfig & {
				lastOpenedWorkspaceId?: string | null;
			};

			// Migrate lastOpenedWorkspaceId to activeWorkspaceId if needed
			if (config.lastOpenedWorkspaceId !== undefined) {
				config.activeWorkspaceId = config.lastOpenedWorkspaceId;
				delete config.lastOpenedWorkspaceId;
			}

			// Ensure activeWorkspaceId exists for backwards compatibility
			if (config.activeWorkspaceId === undefined) {
				config.activeWorkspaceId = null;
			}

			// Migrate old global active selection to workspace-specific
			const oldConfig = config as WorkspaceConfig & {
				activeWorktreeId?: string | null;
				activeTabGroupId?: string | null;
				activeTabId?: string | null;
			};
			if (
				oldConfig.activeWorktreeId !== undefined &&
				config.activeWorkspaceId
			) {
				// Migrate to workspace-specific selection
				const workspace = config.workspaces.find(
					(ws) => ws.id === config.activeWorkspaceId,
				);
				if (workspace) {
					workspace.activeWorktreeId = oldConfig.activeWorktreeId || null;
					workspace.activeTabId = oldConfig.activeTabId || null;
				}
				// Clean up old fields
				delete oldConfig.activeWorktreeId;
				delete oldConfig.activeTabId;
			}
			// Ensure all workspaces have active selection fields
			for (const workspace of config.workspaces) {
				if (workspace.activeWorktreeId === undefined) {
					workspace.activeWorktreeId = null;
				}
				if (workspace.activeTabId === undefined) {
					workspace.activeTabId = null;
				}
			}
			return config;
		} catch (error) {
			console.error("Failed to read config:", error);
			// Return default config if read fails
			return {
				workspaces: [],
				activeWorkspaceId: null,
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

	getActiveSelection(workspaceId: string): {
		worktreeId: string | null;
		tabId: string | null;
	} | null {
		const config = this.read();
		const workspace = config.workspaces.find((ws) => ws.id === workspaceId);
		if (!workspace) return null;

		return {
			worktreeId: workspace.activeWorktreeId,
			tabId: workspace.activeTabId,
		};
	}

	getActiveWorkspaceId(): string | null {
		const config = this.read();
		return config.activeWorkspaceId;
	}

	setActiveWorkspaceId(id: string | null): boolean {
		const config = this.read();
		config.activeWorkspaceId = id;
		return this.write(config);
	}
}

export default ConfigManager.getInstance();
