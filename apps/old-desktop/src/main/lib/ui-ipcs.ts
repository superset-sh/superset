import { ipcMain } from "electron";
import { desktopStores } from "./desktop-stores";
import type { WorktreeUiMetadata } from "./ui-store/types";

/**
 * Register IPC handlers for UI operations
 */
export function registerUiIPCs(): void {
	// Get workspace UI state
	ipcMain.handle(
		"ui-workspace-get",
		async (_event, input: { workspaceId: string }) => {
			try {
				const uiStore = desktopStores.getUiStore();
				const uiState = uiStore.readWorkspaceUiState(input.workspaceId);

				if (!uiState) {
					return {
						success: false,
						error: "Workspace UI state not found",
					};
				}

				return {
					success: true,
					data: uiState,
				};
			} catch (error) {
				console.error("[UiIPC] Error getting workspace UI state:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	);

	// Update workspace UI state
	ipcMain.handle(
		"ui-workspace-update",
		async (
			_event,
			input: {
				workspaceId: string;
				patch: {
					activeWorktreePath?: string | null;
					worktrees?: Record<string, WorktreeUiMetadata>;
				};
			},
		) => {
			try {
				const uiStore = desktopStores.getUiStore();
				const success = uiStore.updateWorkspaceUiState(
					input.workspaceId,
					input.patch,
				);

				return {
					success,
					error: success ? undefined : "Failed to update workspace UI state",
				};
			} catch (error) {
				console.error("[UiIPC] Error updating workspace UI state:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	);

	// Set active workspace/worktree/tab
	ipcMain.handle(
		"ui-set-active",
		async (
			_event,
			input: {
				workspaceId: string;
				activeWorktreePath?: string | null;
				activeTabId?: string | null;
				updateGlobalActiveWorkspace?: boolean;
			},
		) => {
			try {
				const uiStore = desktopStores.getUiStore();

				// Update workspace UI state
				const updates: {
					activeWorktreePath?: string | null;
				} = {};
				if (input.activeWorktreePath !== undefined) {
					updates.activeWorktreePath = input.activeWorktreePath;
				}

				const success = uiStore.updateWorkspaceUiState(
					input.workspaceId,
					updates,
				);

				// Update active tab if specified
				if (input.activeTabId !== undefined && input.activeWorktreePath) {
					const uiState = uiStore.readWorkspaceUiState(input.workspaceId);
					if (uiState) {
						const worktreeMetadata =
							uiState.worktrees[input.activeWorktreePath];
						if (worktreeMetadata) {
							uiStore.updateWorktreeMetadata(
								input.workspaceId,
								input.activeWorktreePath,
								{
									activeTabId: input.activeTabId,
								},
							);
						}
					}
				}

				// Update global active workspace setting if requested
				// This is now explicit instead of coupled to activeWorktreePath === null
				if (input.updateGlobalActiveWorkspace) {
					const settings = uiStore.readSettings();
					settings.lastActiveWorkspaceId = input.workspaceId;
					uiStore.writeSettings(settings);
				}

				return {
					success,
					error: success ? undefined : "Failed to set active state",
				};
			} catch (error) {
				console.error("[UiIPC] Error setting active state:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	);

	// Get settings
	ipcMain.handle("ui-settings-get", async () => {
		try {
			const uiStore = desktopStores.getUiStore();
			const settings = uiStore.readSettings();

			return {
				success: true,
				data: settings,
			};
		} catch (error) {
			console.error("[UiIPC] Error getting settings:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	});

	// Update settings
	ipcMain.handle(
		"ui-settings-update",
		async (
			_event,
			input: {
				lastActiveWorkspaceId?: string | null;
				preferences?: Record<string, unknown>;
			},
		) => {
			try {
				const uiStore = desktopStores.getUiStore();
				const settings = uiStore.readSettings();

				if (input.lastActiveWorkspaceId !== undefined) {
					settings.lastActiveWorkspaceId = input.lastActiveWorkspaceId;
				}
				if (input.preferences !== undefined) {
					settings.preferences = {
						...settings.preferences,
						...input.preferences,
					};
				}

				const success = uiStore.writeSettings(settings);

				return {
					success,
					error: success ? undefined : "Failed to update settings",
				};
			} catch (error) {
				console.error("[UiIPC] Error updating settings:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	);
}
