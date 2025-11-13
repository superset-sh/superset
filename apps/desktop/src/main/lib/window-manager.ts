import type { BrowserWindow } from "electron";
import { MainWindow } from "../windows/main";
import windowStateManager from "./window-state-manager";

class WindowManager {
	private windows: Set<BrowserWindow> = new Set();
	private windowWorkspaces: Map<BrowserWindow, string | null> = new Map();
	private restoredWindowIds: Set<number> = new Set();

	async createWindow(
		restoreState?: { workspaceId: string | null; bounds?: Electron.Rectangle },
	): Promise<BrowserWindow> {
		const window = await MainWindow();

		// Restore window bounds if provided
		if (restoreState?.bounds) {
			window.setBounds(restoreState.bounds);
		}

		this.windows.add(window);
		const workspaceId = restoreState?.workspaceId ?? null;
		this.windowWorkspaces.set(window, workspaceId);

		// Mark as restored if we're restoring state
		if (restoreState) {
			this.restoredWindowIds.add(window.webContents.id);
		}

		// Save window state when workspace changes
		if (workspaceId) {
			windowStateManager.saveWindowState(window, workspaceId);
		}

		// Store window ID before it might be destroyed
		const windowId = window.webContents.id;

		// Save window bounds periodically and on move/resize
		const saveBounds = () => {
			// Check if window still exists and is not destroyed
			if (window.isDestroyed() || !this.windows.has(window)) {
				return;
			}
			const currentWorkspaceId = this.windowWorkspaces.get(window) ?? null;
			windowStateManager.saveWindowState(window, currentWorkspaceId);
		};

		window.on("moved", saveBounds);
		window.on("resized", saveBounds);

		window.on("close", () => {
			// Remove event listeners to prevent them from firing after close
			window.removeListener("moved", saveBounds);
			window.removeListener("resized", saveBounds);

			// Save final state before closing (window is still valid here)
			// Get workspace ID from our map before window might be destroyed
			const workspaceId = this.windowWorkspaces.get(window) ?? null;
			
			try {
				if (!window.isDestroyed()) {
					const bounds = window.getBounds();
					// Save using window ID to avoid issues if window is destroyed
					windowStateManager.saveWindowStateById(windowId, workspaceId, bounds);
				} else {
					// Window already destroyed, use last known bounds from state
					if (workspaceId) {
						const lastState = windowStateManager.getWindowState(windowId);
						if (lastState) {
							windowStateManager.saveWindowStateById(
								windowId,
								workspaceId,
								lastState.bounds,
							);
						}
					}
				}
			} catch (error) {
				// Silently fail if window is destroyed - we'll clean up in closed handler
				if (!(error instanceof Error && error.message.includes("destroyed"))) {
					console.error("[WindowManager] Failed to save window state on close:", error);
				}
			}
		});

		window.on("closed", () => {
			// Remove from state after window is fully closed
			// Use stored window ID since window is now destroyed
			setTimeout(() => {
				windowStateManager.removeWindowState(windowId);
			}, 100);

			this.windows.delete(window);
			this.windowWorkspaces.delete(window);
			this.restoredWindowIds.delete(windowId);
		});

		return window;
	}

	getWindows(): BrowserWindow[] {
		return Array.from(this.windows);
	}

	getWindowCount(): number {
		return this.windows.size;
	}

	getWorkspaceForWindow(window: BrowserWindow): string | null {
		return this.windowWorkspaces.get(window) ?? null;
	}

	setWorkspaceForWindow(window: BrowserWindow, workspaceId: string | null): void {
		this.windowWorkspaces.set(window, workspaceId);
		// Persist the workspace association
		windowStateManager.saveWindowState(window, workspaceId);
	}

	isRestoredWindow(window: BrowserWindow): boolean {
		return this.restoredWindowIds.has(window.webContents.id);
	}

	async restoreWindows(): Promise<void> {
		const savedStates = windowStateManager.getWindowStates();

		// Only restore windows that have a workspace assigned
		// Windows without workspace were likely closed intentionally
		const windowsToRestore = savedStates.filter((state) => state.workspaceId);
		const windowsWithoutWorkspace = savedStates.filter(
			(state) => !state.workspaceId,
		);

		// Clean up windows without workspaces (they were closed intentionally)
		for (const state of windowsWithoutWorkspace) {
			windowStateManager.removeWindowState(Number.parseInt(state.id, 10));
		}

		// Restore all saved windows with workspaces
		for (const state of windowsToRestore) {
			try {
				await this.createWindow({
					workspaceId: state.workspaceId,
					bounds: state.bounds,
				});
			} catch (error) {
				console.error(
					`[WindowManager] Failed to restore window ${state.id}:`,
					error,
				);
			}
		}
	}
}

export default new WindowManager();
