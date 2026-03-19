import type { BrowserWindow } from "electron";

/**
 * Singleton registry tracking the main window and project-focused windows.
 * Each project can have at most one dedicated window open at a time.
 */
class WindowManager {
	private mainWindow: BrowserWindow | null = null;
	private projectWindows = new Map<string, BrowserWindow>();

	getMainWindow(): BrowserWindow | null {
		return this.mainWindow;
	}

	setMainWindow(win: BrowserWindow | null): void {
		this.mainWindow = win;
	}

	getProjectWindow(projectId: string): BrowserWindow | null {
		return this.projectWindows.get(projectId) ?? null;
	}

	registerProjectWindow(projectId: string, win: BrowserWindow): void {
		this.projectWindows.set(projectId, win);
	}

	unregisterProjectWindow(projectId: string): void {
		this.projectWindows.delete(projectId);
	}

	/**
	 * If a window already exists for this project, focus it and return true.
	 * Otherwise return false so the caller knows to create a new one.
	 */
	focusProjectWindow(projectId: string): boolean {
		const win = this.projectWindows.get(projectId);
		if (!win || win.isDestroyed()) {
			this.projectWindows.delete(projectId);
			return false;
		}
		if (win.isMinimized()) win.restore();
		win.focus();
		return true;
	}

	getAllWindows(): BrowserWindow[] {
		const windows: BrowserWindow[] = [];
		if (this.mainWindow && !this.mainWindow.isDestroyed()) {
			windows.push(this.mainWindow);
		}
		for (const [id, win] of this.projectWindows) {
			if (win.isDestroyed()) {
				this.projectWindows.delete(id);
			} else {
				windows.push(win);
			}
		}
		return windows;
	}

	/** Returns the project IDs that currently have open focus windows. */
	getOpenProjectIds(): string[] {
		const ids: string[] = [];
		for (const [id, win] of this.projectWindows) {
			if (win.isDestroyed()) {
				this.projectWindows.delete(id);
			} else {
				ids.push(id);
			}
		}
		return ids;
	}

	closeAllProjectWindows(): void {
		for (const [id, win] of this.projectWindows) {
			if (!win.isDestroyed()) win.close();
			this.projectWindows.delete(id);
		}
	}
}

export const windowManager = new WindowManager();
