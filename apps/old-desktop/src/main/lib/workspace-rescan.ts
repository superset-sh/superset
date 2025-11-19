import { desktopStores } from "./desktop-stores";
import worktreeManager from "./worktree-manager";

/**
 * Periodic rescan manager for workspaces
 * Handles background rescans and reconciliation
 */
export class WorkspaceRescanManager {
	private rescanIntervals: Map<string, NodeJS.Timeout> = new Map();
	private readonly DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

	/**
	 * Start periodic rescan for a workspace
	 */
	startPeriodicRescan(
		workspaceId: string,
		intervalMs: number = this.DEFAULT_INTERVAL_MS,
	): void {
		// Stop existing rescan if any
		this.stopPeriodicRescan(workspaceId);

		// Start new interval
		const interval = setInterval(async () => {
			await this.rescanWorkspace(workspaceId);
		}, intervalMs);

		this.rescanIntervals.set(workspaceId, interval);
		console.log(
			`[RescanManager] Started periodic rescan for workspace ${workspaceId} (interval: ${intervalMs}ms)`,
		);
	}

	/**
	 * Stop periodic rescan for a workspace
	 */
	stopPeriodicRescan(workspaceId: string): void {
		const interval = this.rescanIntervals.get(workspaceId);
		if (interval) {
			clearInterval(interval);
			this.rescanIntervals.delete(workspaceId);
			console.log(
				`[RescanManager] Stopped periodic rescan for workspace ${workspaceId}`,
			);
		}
	}

	/**
	 * Rescan a workspace and reconcile UI metadata
	 */
	async rescanWorkspace(workspaceId: string): Promise<void> {
		try {
			const workspaceOrch = desktopStores.getWorkspaceOrchestrator();
			const composer = desktopStores.getComposer();
			const uiStore = desktopStores.getUiStore();

			// Get domain workspace
			const workspace = await workspaceOrch.get(workspaceId);
			if (workspace.type !== "local") {
				return;
			}

			// Detect main branch
			const mainBranch = await worktreeManager.detectMainBranch(workspace.path);

			// Perform rescan
			const rescanResult = await composer.rescanWorkspace(
				workspace,
				mainBranch,
			);

			// Log changes
			if (
				rescanResult.added.length > 0 ||
				rescanResult.removed.length > 0 ||
				rescanResult.changed.length > 0
			) {
				console.log(
					`[RescanManager] Workspace ${workspaceId} changes:`,
					`+${rescanResult.added.length}`,
					`-${rescanResult.removed.length}`,
					`~${rescanResult.changed.length}`,
				);
			}

			// Reconcile: Update UI metadata for new/changed worktrees
			for (const newWt of rescanResult.added) {
				// Initialize defaults for new worktrees
				const defaults = composer.initializeWorktreeDefaults(
					workspaceId,
					newWt.path,
					newWt.currentBranch,
				);
				uiStore.updateWorktreeMetadata(workspaceId, newWt.path, defaults);
			}

			// Update changed worktrees (preserve UI metadata, update Git-derived fields)
			for (const change of rescanResult.changed) {
				const existingUi =
					uiStore.readWorkspaceUiState(workspaceId)?.worktrees[change.new.path];
				if (existingUi) {
					uiStore.updateWorktreeMetadata(workspaceId, change.new.path, {
						branch: change.new.currentBranch,
						merged: change.new.merged,
					});
				}
			}

			// Handle removed worktrees (orphaned UI metadata)
			// For now, we keep orphaned metadata but mark it
			// TODO: Implement grace period logic to remove after a delay
			for (const removedWt of rescanResult.removed) {
				console.log(
					`[RescanManager] Worktree removed: ${removedWt.path} (UI metadata preserved)`,
				);
			}
		} catch (error) {
			console.error(
				`[RescanManager] Error rescanning workspace ${workspaceId}:`,
				error,
			);
		}
	}

	/**
	 * Stop all periodic rescans
	 */
	stopAll(): void {
		for (const workspaceId of this.rescanIntervals.keys()) {
			this.stopPeriodicRescan(workspaceId);
		}
	}
}

export const workspaceRescanManager = new WorkspaceRescanManager();
