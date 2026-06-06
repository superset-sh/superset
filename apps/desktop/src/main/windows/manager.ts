import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";

export interface ManagedWindow {
	id: string;
	window: BrowserWindow;
	workspaceId: string | null;
	lastFocusedAt: number;
}

const managedWindows = new Map<string, ManagedWindow>();
const webContentsToWindowId = new Map<number, string>();

export function registerWindow(
	window: BrowserWindow,
	opts: { workspaceId?: string | null } = {},
): ManagedWindow {
	const id = randomUUID();
	const managed: ManagedWindow = {
		id,
		window,
		workspaceId: opts.workspaceId ?? null,
		lastFocusedAt: Date.now(),
	};
	managedWindows.set(id, managed);
	webContentsToWindowId.set(window.webContents.id, id);

	window.on("focus", () => {
		managed.lastFocusedAt = Date.now();
	});
	window.on("closed", () => {
		unregisterWindow(id);
	});

	return managed;
}

export function unregisterWindow(id: string): void {
	const managed = managedWindows.get(id);
	if (!managed) return;
	webContentsToWindowId.delete(managed.window.webContents.id);
	managedWindows.delete(id);
}

export function getManagedWindow(id: string): ManagedWindow | undefined {
	return managedWindows.get(id);
}

export function getManagedWindowByWebContents(
	webContentsId: number,
): ManagedWindow | undefined {
	const id = webContentsToWindowId.get(webContentsId);
	if (!id) return undefined;
	return managedWindows.get(id);
}

export function getAllManagedWindows(): ManagedWindow[] {
	return Array.from(managedWindows.values()).filter(
		(m) => !m.window.isDestroyed(),
	);
}

/**
 * Returns the currently focused managed window, or the most-recently-focused
 * one if nothing is focused (e.g. app not in foreground).
 */
export function getFocusedManagedWindow(): ManagedWindow | undefined {
	const all = getAllManagedWindows();
	const focused = all.find((m) => m.window.isFocused());
	if (focused) return focused;
	if (all.length === 0) return undefined;
	return [...all].sort((a, b) => b.lastFocusedAt - a.lastFocusedAt)[0];
}

export function setWorkspaceIdForWindow(
	id: string,
	workspaceId: string | null,
): void {
	const managed = managedWindows.get(id);
	if (!managed) return;
	managed.workspaceId = workspaceId;
}
