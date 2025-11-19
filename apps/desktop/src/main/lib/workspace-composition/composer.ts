import { randomUUID } from "node:crypto";
import type { LocalWorkspace } from "../types/cli-types";
import worktreeManager from "../worktree-manager";
import type { UiStore } from "../ui-store/store";
import type {
	ComposedWorkspaceState,
	ComposedWorktree,
	RescanResult,
	ScannedWorktree,
} from "./types";
import type { WorktreeUiMetadata } from "../ui-store/types";

/**
 * Workspace state composer
 * Composes domain workspace + Git scan + UI metadata
 */
export class WorkspaceComposer {
	constructor(private readonly uiStore: UiStore) {}

	/**
	 * Scan Git for worktrees in a repository
	 */
	async scanWorktrees(repoPath: string, mainBranch: string): Promise<ScannedWorktree[]> {
		const gitWorktrees = worktreeManager.listWorktrees(repoPath);
		const scanned: ScannedWorktree[] = [];

		for (const gitWorktree of gitWorktrees) {
			// Get the actual current branch for this worktree
			const currentBranch =
				worktreeManager.getCurrentBranch(gitWorktree.path) ||
				gitWorktree.branch;

			// Check if this branch has been merged into main
			const isMerged =
				currentBranch !== mainBranch &&
				worktreeManager.isBranchMerged(
					repoPath,
					currentBranch,
					mainBranch,
				);

			scanned.push({
				...gitWorktree,
				currentBranch,
				merged: isMerged,
			});
		}

		return scanned;
	}

	/**
	 * Compose workspace state from domain + Git scan + UI
	 */
	async composeWorkspaceState(
		workspace: LocalWorkspace,
		mainBranch: string = "main",
	): Promise<ComposedWorkspaceState> {
		// Scan Git for worktrees
		const scanned = await this.scanWorktrees(workspace.path, mainBranch);

		// Load UI state
		const uiState = this.uiStore.readWorkspaceUiState(workspace.id);

		// Merge scanned worktrees with UI metadata
		const composedWorktrees: ComposedWorktree[] = scanned.map((scannedWt) => {
			// Try to find UI metadata by path (primary key)
			let uiMetadata = uiState?.worktrees[scannedWt.path];

			// Fallback to branch if path doesn't match (for renamed worktrees)
			if (!uiMetadata) {
				const worktreesByBranch = Object.values(uiState?.worktrees ?? {}).find(
					(wt) => wt.branch === scannedWt.currentBranch,
				);
				if (worktreesByBranch) {
					uiMetadata = worktreesByBranch;
					// Update path to match current Git state
					uiMetadata.path = scannedWt.path;
				}
			}

			// Create default UI metadata if none exists
			if (!uiMetadata) {
				uiMetadata = {
					path: scannedWt.path,
					branch: scannedWt.currentBranch,
					tabs: [],
					activeTabId: null,
					updatedAt: new Date().toISOString(),
				};
			}

			// Merge: use Git scan as truth for branch/path, preserve UI metadata
			return {
				...scannedWt,
				ui: {
					...uiMetadata,
					path: scannedWt.path, // Always use Git path
					branch: scannedWt.currentBranch, // Always use Git branch
					merged: scannedWt.merged ?? uiMetadata.merged, // Prefer Git scan
				},
			};
		});

		// Get active selection from UI state
		const activeWorktreePath = uiState?.activeWorktreePath ?? null;
		const activeWorktree = composedWorktrees.find(
			(wt) => wt.path === activeWorktreePath,
		);
		const activeTabId = activeWorktree?.ui.activeTabId ?? null;

		return {
			workspace,
			worktrees: composedWorktrees,
			ui: {
				activeWorktreePath,
				activeTabId,
			},
		};
	}

	/**
	 * Rescan workspace and return diff
	 */
	async rescanWorkspace(
		workspace: LocalWorkspace,
		mainBranch: string = "main",
	): Promise<RescanResult> {
		// Get current composed state
		const currentState = await this.composeWorkspaceState(workspace, mainBranch);

		// Scan Git again
		const newScanned = await this.scanWorktrees(workspace.path, mainBranch);

		// Compare with current state
		const currentPaths = new Set(
			currentState.worktrees.map((wt) => wt.path),
		);
		const newPaths = new Set(newScanned.map((wt) => wt.path));

		const added: ScannedWorktree[] = newScanned.filter(
			(wt) => !currentPaths.has(wt.path),
		);
		const removed: ScannedWorktree[] = currentState.worktrees
			.filter((wt) => !newPaths.has(wt.path))
			.map((wt) => ({
				path: wt.path,
				branch: wt.branch,
				bare: wt.bare,
				currentBranch: wt.currentBranch,
				merged: wt.merged,
			}));

		const changed: Array<{ old: ScannedWorktree; new: ScannedWorktree }> = [];
		for (const newWt of newScanned) {
			const oldWt = currentState.worktrees.find(
				(wt) => wt.path === newWt.path,
			);
			if (
				oldWt &&
				(oldWt.currentBranch !== newWt.currentBranch ||
					oldWt.merged !== newWt.merged)
			) {
				changed.push({
					old: {
						path: oldWt.path,
						branch: oldWt.branch,
						bare: oldWt.bare,
						currentBranch: oldWt.currentBranch,
						merged: oldWt.merged,
					},
					new: newWt,
				});
			}
		}

		// Re-compose state with new scan
		const newState = await this.composeWorkspaceState(workspace, mainBranch);

		// Reconcile: remove orphaned UI metadata (after grace period)
		// For now, we'll keep orphaned metadata but mark it
		// TODO: Implement grace period logic

		return {
			added,
			removed,
			changed,
			state: newState,
		};
	}

	/**
	 * Initialize default UI state for a new worktree
	 */
	initializeWorktreeDefaults(
		workspaceId: string,
		worktreePath: string,
		branch: string,
	): WorktreeUiMetadata {
		// Create a default terminal tab
		const defaultTab: WorktreeUiMetadata["tabs"][0] = {
			id: randomUUID(),
			name: "Terminal",
			type: "terminal",
			cwd: worktreePath,
			createdAt: new Date().toISOString(),
		};

		return {
			path: worktreePath,
			branch,
			tabs: [defaultTab],
			activeTabId: defaultTab.id,
			updatedAt: new Date().toISOString(),
		};
	}
}

