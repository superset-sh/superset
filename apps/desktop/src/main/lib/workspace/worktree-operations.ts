import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { shell } from "electron";

import type {
	CreateWorktreeInput,
	SetupResult,
	Tab,
	Workspace,
	Worktree,
} from "shared/types";
import { generateBranchName } from "shared/utils/slug";

import configManager from "../config-manager";
import { executeSetup } from "../setup-executor";
import worktreeManager from "../worktree-manager";
import { cleanupEmptyGroupsInAllWorktrees } from "./group-cleanup";
import { cloneTabsWithNewIds } from "./tab-helpers";

/**
 * Create a new worktree
 */
export async function createWorktree(
	workspace: Workspace,
	input: CreateWorktreeInput,
	webContents?: Electron.WebContents,
): Promise<{
	success: boolean;
	worktree?: Worktree;
	setupResult?: SetupResult;
	error?: string;
}> {
	try {
		// Generate branch name from title if not provided
		const branchName = input.branch || generateBranchName(input.title);

		// Create git worktree
		const worktreeResult = await worktreeManager.createWorktree(
			workspace.repoPath,
			branchName,
			input.createBranch || false,
			input.sourceBranch,
		);

		if (!worktreeResult.success) {
			return {
				success: false,
				error: `Failed to create worktree: ${worktreeResult.error}`,
			};
		}

		// Clone tabs from source worktree if specified
		let tabs: Tab[] = [];
		if (input.cloneTabsFromWorktreeId) {
			const sourceWorktree = workspace.worktrees.find(
				(wt) => wt.id === input.cloneTabsFromWorktreeId,
			);
			if (sourceWorktree) {
				tabs = cloneTabsWithNewIds(sourceWorktree.tabs);
			}
		}

		// Create worktree object with cloned or empty tabs
		const now = new Date().toISOString();
		const worktree: Worktree = {
			id: randomUUID(),
			branch: branchName,
			path: worktreeResult.path!,
			tabs,
			createdAt: now,
			...(input.description && { description: input.description }),
		};

		// Add to workspace
		workspace.worktrees.push(worktree);
		workspace.updatedAt = now;

		// Save
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		// Execute setup script if it exists
		const setupResult = await executeSetup(
			workspace.repoPath,
			worktree.path,
			branchName,
			(status, output) => {
				// Send progress event to renderer
				if (webContents && !webContents.isDestroyed()) {
					webContents.send("worktree-setup-progress", {
						workspaceId: workspace.id,
						worktreeId: worktree.id,
						status,
						output,
					});
				}
			},
		);

		return { success: true, worktree, setupResult };
	} catch (error) {
		console.error("Failed to create worktree:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Check if a worktree can be removed (check for uncommitted changes)
 */
export async function canRemoveWorktree(
	workspace: Workspace,
	worktreeId: string,
): Promise<{
	success: boolean;
	canRemove?: boolean;
	hasUncommittedChanges?: boolean;
	error?: string;
}> {
	try {
		const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		// Check if the worktree has uncommitted changes
		const hasUncommittedChanges = worktreeManager.hasUncommittedChanges(
			worktree.path,
		);

		return {
			success: true,
			canRemove: true,
			hasUncommittedChanges,
		};
	} catch (error) {
		console.error("Failed to check if worktree can be removed:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Remove a worktree
 */
export async function removeWorktree(
	workspace: Workspace,
	worktreeId: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		// Save the worktree path for git removal
		const worktreePath = worktree.path;
		const repoPath = workspace.repoPath;

		// Remove from workspace config first (for immediate UI feedback)
		workspace.worktrees = workspace.worktrees.filter(
			(wt) => wt.id !== worktreeId,
		);
		workspace.updatedAt = new Date().toISOString();

		// Save to config immediately
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		// Remove git worktree asynchronously in the background (this can be slow)
		// Don't await - let it complete in the background
		worktreeManager.removeWorktree(repoPath, worktreePath).catch((error) => {
			console.error("Failed to remove git worktree (async):", error);
		});

		return { success: true };
	} catch (error) {
		console.error("Failed to remove worktree:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Check if a worktree can be merged into a target worktree
 */
export async function canMergeWorktree(
	workspace: Workspace,
	worktreeId: string,
	targetWorktreeId?: string,
): Promise<{
	success: boolean;
	canMerge?: boolean;
	reason?: string;
	error?: string;
	isActiveWorktree?: boolean;
	targetHasUncommittedChanges?: boolean;
	sourceHasUncommittedChanges?: boolean;
}> {
	try {
		const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		// Find the target worktree (default to active worktree)
		const targetId = targetWorktreeId || workspace.activeWorktreeId;

		// Check if trying to merge into itself
		if (targetId === worktreeId) {
			return {
				success: true,
				canMerge: false,
				reason: "Cannot merge a worktree into itself",
				isActiveWorktree: targetId === workspace.activeWorktreeId,
			};
		}

		const targetWorktree = workspace.worktrees.find((wt) => wt.id === targetId);
		if (!targetWorktree) {
			return {
				success: true,
				canMerge: false,
				reason: "Target worktree not found",
			};
		}

		// Check if the source branch can be merged into the target worktree
		const canMerge = await worktreeManager.canMerge(
			targetWorktree.path,
			worktree.branch,
			worktree.path, // Pass source worktree path to check its uncommitted changes
		);

		return {
			success: true,
			canMerge: canMerge.canMerge,
			reason: canMerge.reason,
			targetHasUncommittedChanges: canMerge.targetHasUncommittedChanges,
			sourceHasUncommittedChanges: canMerge.sourceHasUncommittedChanges,
			isActiveWorktree: targetId === workspace.activeWorktreeId,
		};
	} catch (error) {
		console.error("Failed to check if worktree can be merged:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Merge a worktree into a target worktree
 */
export async function mergeWorktree(
	workspace: Workspace,
	worktreeId: string,
	targetWorktreeId?: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		// Check if this is the target worktree
		if (targetWorktreeId === worktreeId) {
			return {
				success: false,
				error: "Cannot merge a worktree into itself",
			};
		}

		// Find the target worktree (default to active worktree)
		const targetId = targetWorktreeId || workspace.activeWorktreeId;
		const targetWorktree = workspace.worktrees.find((wt) => wt.id === targetId);
		if (!targetWorktree) {
			return { success: false, error: "Target worktree not found" };
		}

		// Merge the source branch into the target worktree
		const result = await worktreeManager.merge(
			targetWorktree.path,
			worktree.branch,
		);

		if (!result.success) {
			return { success: false, error: result.error };
		}

		// Mark the worktree as merged
		worktree.merged = true;
		workspace.updatedAt = new Date().toISOString();

		// Save to config
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to merge worktree:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Get the path of a worktree
 */
export function getWorktreePath(
	workspace: Workspace,
	worktreeId: string,
): string | null {
	const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
	return worktree?.path || null;
}

/**
 * Scan and import existing git worktrees
 */
export async function scanAndImportWorktrees(
	workspace: Workspace,
): Promise<{ success: boolean; imported?: number; error?: string }> {
	try {
		// Get all git worktrees from the repository
		const gitWorktrees = worktreeManager.listWorktrees(workspace.repoPath);

		// Include all worktrees (including main repo) that actually exist on filesystem
		const allWorktrees = gitWorktrees.filter(
			(wt) => !wt.bare && existsSync(wt.path),
		);

		// Create a set of valid worktree paths for quick lookup
		const validWorktreePaths = new Set(allWorktrees.map((wt) => wt.path));

		let importedCount = 0;
		let configChanged = false;
		const now = new Date().toISOString();

		// Remove worktrees that no longer exist (either not in git or not on filesystem)
		const initialWorktreeCount = workspace.worktrees.length;
		workspace.worktrees = workspace.worktrees.filter((wt) => {
			// Remove if not in git's worktree list OR if path doesn't exist on filesystem
			if (!validWorktreePaths.has(wt.path) || !existsSync(wt.path)) {
				configChanged = true;
				return false;
			}
			return true;
		});
		const removedCount = initialWorktreeCount - workspace.worktrees.length;

		// Get the main branch from workspace config, fallback to 'main'
		const mainBranch = workspace.branch || "main";

		for (const gitWorktree of allWorktrees) {
			// Get the actual current branch for this worktree path
			const currentBranch =
				worktreeManager.getCurrentBranch(gitWorktree.path) ||
				gitWorktree.branch;

			// Check if this worktree is already in our workspace
			const existingWorktree = workspace.worktrees.find(
				(wt) => wt.path === gitWorktree.path,
			);

			// Check if this branch has been merged into the main branch
			const isMerged =
				currentBranch !== mainBranch &&
				worktreeManager.isBranchMerged(
					workspace.repoPath,
					currentBranch,
					mainBranch,
				);

			if (existingWorktree) {
				// Update the branch if it has changed
				if (existingWorktree.branch !== currentBranch) {
					existingWorktree.branch = currentBranch;
					importedCount++;
					configChanged = true;
				}
				// Update merged status if it has changed
				if (existingWorktree.merged !== isMerged) {
					existingWorktree.merged = isMerged;
					configChanged = true;
				}
			} else {
				// Create worktree object with empty tabs
				const worktree: Worktree = {
					id: randomUUID(),
					branch: currentBranch,
					path: gitWorktree.path,
					tabs: [],
					createdAt: now,
					merged: isMerged,
				};

				workspace.worktrees.push(worktree);
				importedCount++;
				configChanged = true;
			}
		}

		// Clean up any empty group tabs across all worktrees
		const worktreesWithCleanup = cleanupEmptyGroupsInAllWorktrees(workspace);
		if (worktreesWithCleanup > 0) {
			configChanged = true;
			console.log(
				`Cleaned up empty group tabs in ${worktreesWithCleanup} worktree(s)`,
			);
		}

		if (configChanged) {
			workspace.updatedAt = now;

			// Save to config
			const config = configManager.read();
			const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
			if (index !== -1) {
				config.workspaces[index] = workspace;
				configManager.write(config);
			}
		}

		if (removedCount > 0) {
			console.log(`Removed ${removedCount} deleted worktree(s) from config`);
		}

		return { success: true, imported: importedCount };
	} catch (error) {
		console.error("Failed to scan and import worktrees:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Check if worktree settings folder exists
 */
export function checkWorktreeSettings(
	workspace: Workspace,
	worktreeId: string,
): { success: boolean; exists?: boolean; error?: string } {
	try {
		const worktreePath = getWorktreePath(workspace, worktreeId);
		if (!worktreePath) {
			return { success: false, error: "Worktree not found" };
		}

		const settingsPath = path.join(worktreePath, ".superset");
		const settingsExists = existsSync(settingsPath);

		return { success: true, exists: settingsExists };
	} catch (error) {
		console.error("Failed to check worktree settings:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Open worktree settings folder in Cursor
 * Creates .superset folder if createIfMissing is true
 */
export async function openWorktreeSettings(
	workspace: Workspace,
	worktreeId: string,
	createIfMissing = true,
): Promise<{ success: boolean; created?: boolean; error?: string }> {
	try {
		const worktreePath = getWorktreePath(workspace, worktreeId);
		if (!worktreePath) {
			return { success: false, error: "Worktree not found" };
		}

		const settingsPath = path.join(worktreePath, ".superset");
		const settingsExists = existsSync(settingsPath);

		// Create .superset folder if it doesn't exist and we're allowed to
		if (!settingsExists) {
			if (!createIfMissing) {
				return {
					success: false,
					error: "Settings folder does not exist and createIfMissing is false",
				};
			}
			mkdirSync(settingsPath, { recursive: true });
		}

		// Open in Cursor using cursor://file protocol
		await shell.openExternal(`cursor://file/${settingsPath}`);

		return { success: true, created: !settingsExists };
	} catch (error) {
		console.error("Failed to open worktree settings:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Update worktree description
 */
export async function updateWorktreeDescription(
	workspace: Workspace,
	worktreeId: string,
	description: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		// Update the description
		worktree.description = description;
		workspace.updatedAt = new Date().toISOString();

		// Save to config
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to update worktree description:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
