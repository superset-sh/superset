import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import type { WorkspaceConfig } from "shared/types";
import type {
	DesktopEnvironmentOrchestrator,
	DesktopWorkspaceOrchestrator,
} from "../storage/orchestrators";
import { DomainVersion } from "../storage/version";
import { WorkspaceType } from "../types/cli-types";
import type { UiStore } from "../ui-store/store";

/**
 * Migrator for legacy config.json to new Desktop persistence structure
 */
export class LegacyMigrator {
	private readonly legacyConfigPath: string;
	private readonly desktopDbDir: string;

	constructor() {
		this.legacyConfigPath = join(os.homedir(), ".superset", "config.json");
		this.desktopDbDir = join(os.homedir(), ".superset", "desktop");
	}

	/**
	 * Check if migration is needed
	 */
	shouldMigrate(): boolean {
		// Check if legacy config exists and Desktop db is empty
		const legacyExists = existsSync(this.legacyConfigPath);
		const desktopDbExists = existsSync(
			join(this.desktopDbDir, "db", "workspaces.json"),
		);

		return legacyExists && !desktopDbExists;
	}

	/**
	 * Perform migration from legacy config.json
	 */
	async migrate(
		envOrch: DesktopEnvironmentOrchestrator,
		workspaceOrch: DesktopWorkspaceOrchestrator,
		uiStore: UiStore,
		dryRun: boolean = false,
	): Promise<{
		success: boolean;
		migrated: {
			environments: number;
			workspaces: number;
		};
		error?: string;
	}> {
		try {
			if (!this.shouldMigrate()) {
				return {
					success: true,
					migrated: { environments: 0, workspaces: 0 },
				};
			}

			// Read legacy config
			const legacyConfig: WorkspaceConfig = JSON.parse(
				readFileSync(this.legacyConfigPath, "utf-8"),
			);

			if (dryRun) {
				return {
					success: true,
					migrated: {
						environments: 1,
						workspaces: legacyConfig.workspaces.length,
					},
				};
			}

			// Create backup of legacy config
			const backupPath = `${this.legacyConfigPath}.backup.${Date.now()}`;
			copyFileSync(this.legacyConfigPath, backupPath);
			console.log(`[Migration] Created backup at ${backupPath}`);

			// Create default environment
			const defaultEnv = await envOrch.create();

			// Migrate workspaces
			let migratedWorkspaces = 0;

			for (const legacyWs of legacyConfig.workspaces) {
				// Create domain workspace (LocalWorkspace)
				const domainWorkspace = await workspaceOrch.create(
					defaultEnv.id,
					WorkspaceType.LOCAL,
					legacyWs.repoPath,
				);

				// Migrate worktree UI metadata
				const worktrees: Record<string, any> = {};
				for (const legacyWt of legacyWs.worktrees) {
					worktrees[legacyWt.path] = {
						path: legacyWt.path,
						branch: legacyWt.branch,
						description: legacyWt.description,
						prUrl: legacyWt.prUrl,
						merged: legacyWt.merged,
						tabs: legacyWt.tabs,
						mosaicTree: undefined, // Will be derived from tabs structure if needed
						activeTabId: legacyWs.activeTabId,
						updatedAt: legacyWs.updatedAt || new Date().toISOString(),
					};
				}

				// Create workspace UI state
				const uiState = {
					workspaceId: domainWorkspace.id,
					activeWorktreePath:
						legacyWs.worktrees.find((wt) => wt.id === legacyWs.activeWorktreeId)
							?.path ?? null,
					worktrees,
					updatedAt: legacyWs.updatedAt || new Date().toISOString(),
				};

				uiStore.writeWorkspaceUiState(uiState);
				migratedWorkspaces++;
			}

			// Update settings
			const settings = uiStore.readSettings();
			settings.lastActiveWorkspaceId = legacyConfig.activeWorkspaceId;
			uiStore.writeSettings(settings);

			// Set versions
			DomainVersion.write();
			uiStore.writeUiVersion();

			console.log(
				`[Migration] Migrated ${migratedWorkspaces} workspaces successfully`,
			);

			return {
				success: true,
				migrated: {
					environments: 1,
					workspaces: migratedWorkspaces,
				},
			};
		} catch (error) {
			console.error("[Migration] Error during migration:", error);
			return {
				success: false,
				migrated: { environments: 0, workspaces: 0 },
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}
}
