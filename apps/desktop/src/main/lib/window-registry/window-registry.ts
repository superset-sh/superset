import type { BrowserWindow } from "electron";

/**
 * Tracks every open platform window and the organization it currently shows.
 *
 * Before multi-window support the main process held a single `currentWindow`
 * reference. This registry replaces that: it is the single source of truth for
 * "which windows are open" and "what org each window shows". The org value is
 * used by Milestone 2 (per-window organization context); Milestone 1 only needs
 * the open-window tracking and focus resolution.
 *
 * The module deliberately imports `BrowserWindow` as a type only (erased at
 * compile time) and never calls into Electron at runtime, so it can be unit
 * tested with plain stub objects exposing `id` and `isDestroyed()`.
 */
export interface WindowEntry {
	window: BrowserWindow;
	orgId: string | null;
}

const registry = new Map<number, WindowEntry>();

// Window ids in focus order, most-recently-focused last. Used by
// getFocusedOrLastWindow() as the fallback target for notifications,
// deep links, and the legacy single-window getWindow() getter.
const focusOrder: number[] = [];

function moveToEnd(windowId: number): void {
	const existing = focusOrder.indexOf(windowId);
	if (existing !== -1) {
		focusOrder.splice(existing, 1);
	}
	focusOrder.push(windowId);
}

export function registerWindow({
	window,
	orgId,
}: {
	window: BrowserWindow;
	orgId: string | null;
}): void {
	registry.set(window.id, { window, orgId });
	moveToEnd(window.id);
}

export function unregisterWindow(windowId: number): void {
	registry.delete(windowId);
	const index = focusOrder.indexOf(windowId);
	if (index !== -1) {
		focusOrder.splice(index, 1);
	}
}

/** Record that a window became focused, so it wins getFocusedOrLastWindow(). */
export function markFocused(windowId: number): void {
	if (registry.has(windowId)) {
		moveToEnd(windowId);
	}
}

export function getEntry(windowId: number): WindowEntry | undefined {
	return registry.get(windowId);
}

export function setOrg({
	windowId,
	orgId,
}: {
	windowId: number;
	orgId: string | null;
}): void {
	const entry = registry.get(windowId);
	if (entry) {
		entry.orgId = orgId;
	}
}

export function getOrg(windowId: number): string | null {
	return registry.get(windowId)?.orgId ?? null;
}

/** All live (non-destroyed) windows currently registered. */
export function getAllWindows(): BrowserWindow[] {
	const windows: BrowserWindow[] = [];
	for (const entry of registry.values()) {
		if (!entry.window.isDestroyed()) {
			windows.push(entry.window);
		}
	}
	return windows;
}

/**
 * The window that should receive app-level events (notification clicks, deep
 * links) when no specific window is implied. Prefers the most-recently-focused
 * live window; returns null if no live windows remain.
 */
export function getFocusedOrLastWindow(): BrowserWindow | null {
	for (let i = focusOrder.length - 1; i >= 0; i--) {
		const entry = registry.get(focusOrder[i]);
		if (entry && !entry.window.isDestroyed()) {
			return entry.window;
		}
	}
	return null;
}

/** Test-only: clear all state between cases. */
export function __resetForTests(): void {
	registry.clear();
	focusOrder.length = 0;
}
