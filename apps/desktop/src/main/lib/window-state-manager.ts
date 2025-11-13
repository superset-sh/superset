import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BrowserWindow } from "electron";

interface WindowState {
	id: string; // webContents.id as string
	workspaceId: string | null;
	bounds: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
}

interface WindowStateConfig {
	windows: WindowState[];
}

class WindowStateManager {
	private static instance: WindowStateManager;
	private statePath: string;
	private stateDir: string;

	private constructor() {
		this.stateDir = path.join(os.homedir(), ".superset");
		this.statePath = path.join(this.stateDir, "window-state.json");
		this.ensureStateExists();
	}

	static getInstance(): WindowStateManager {
		if (!WindowStateManager.instance) {
			WindowStateManager.instance = new WindowStateManager();
		}
		return WindowStateManager.instance;
	}

	private ensureStateExists(): void {
		// Create directory if it doesn't exist
		if (!existsSync(this.stateDir)) {
			mkdirSync(this.stateDir, { recursive: true });
		}

		// Create state file with default structure if it doesn't exist
		if (!existsSync(this.statePath)) {
			const defaultState: WindowStateConfig = {
				windows: [],
			};
			writeFileSync(
				this.statePath,
				JSON.stringify(defaultState, null, 2),
				"utf-8",
			);
		}
	}

	read(): WindowStateConfig {
		try {
			const content = readFileSync(this.statePath, "utf-8");
			return JSON.parse(content) as WindowStateConfig;
		} catch (error) {
			console.error("Failed to read window state:", error);
			return { windows: [] };
		}
	}

	write(state: WindowStateConfig): boolean {
		try {
			writeFileSync(this.statePath, JSON.stringify(state, null, 2), "utf-8");
			return true;
		} catch (error) {
			console.error("Failed to write window state:", error);
			return false;
		}
	}

	saveWindowState(window: BrowserWindow, workspaceId: string | null): void {
		// Check if window is destroyed before accessing properties
		if (window.isDestroyed()) {
			return;
		}

		try {
			const state = this.read();
			const windowId = String(window.webContents.id);
			const bounds = window.getBounds();

			const existingIndex = state.windows.findIndex((w) => w.id === windowId);
			const windowState: WindowState = {
				id: windowId,
				workspaceId,
				bounds,
			};

			if (existingIndex >= 0) {
				state.windows[existingIndex] = windowState;
			} else {
				state.windows.push(windowState);
			}

			this.write(state);
		} catch (error) {
			// Window might be destroyed between check and access
			if (error instanceof Error && error.message.includes("destroyed")) {
				return;
			}
			console.error("[WindowStateManager] Failed to save window state:", error);
		}
	}

	saveWindowStateById(
		windowId: number,
		workspaceId: string | null,
		bounds: Electron.Rectangle,
	): void {
		try {
			const state = this.read();
			const id = String(windowId);
			const windowState: WindowState = {
				id,
				workspaceId,
				bounds,
			};

			const existingIndex = state.windows.findIndex((w) => w.id === id);
			if (existingIndex >= 0) {
				state.windows[existingIndex] = windowState;
			} else {
				state.windows.push(windowState);
			}

			this.write(state);
		} catch (error) {
			console.error("[WindowStateManager] Failed to save window state by ID:", error);
		}
	}

	removeWindowState(windowId: number): void {
		const state = this.read();
		state.windows = state.windows.filter((w) => w.id !== String(windowId));
		this.write(state);
	}

	getWindowStates(): WindowState[] {
		return this.read().windows;
	}

	getWindowState(windowId: number): WindowState | undefined {
		const state = this.read();
		return state.windows.find((w) => w.id === String(windowId));
	}

	clearAll(): void {
		this.write({ windows: [] });
	}
}

export default WindowStateManager.getInstance();

