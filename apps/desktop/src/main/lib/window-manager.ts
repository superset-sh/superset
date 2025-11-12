import type { BrowserWindow } from "electron";
import { MainWindow } from "../windows/main";

class WindowManager {
	private windows: Set<BrowserWindow> = new Set();
	private windowWorkspaces: Map<BrowserWindow, string | null> = new Map();

	async createWindow(): Promise<BrowserWindow> {
		const window = await MainWindow();
		this.windows.add(window);
		// New windows start with no workspace - user must select one
		this.windowWorkspaces.set(window, null);

		window.on("closed", () => {
			this.windows.delete(window);
			this.windowWorkspaces.delete(window);
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
	}
}

export default new WindowManager();
