import {
	existsSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { WINDOW_STATE_PATH } from "../app-environment";

export interface WindowState {
	x: number;
	y: number;
	width: number;
	height: number;
	isMaximized: boolean;
	zoomLevel?: number;
}

/**
 * Loads window state from disk.
 * Returns null if file doesn't exist, is corrupted, or has invalid shape.
 */
export function loadWindowState(): WindowState | null {
	try {
		if (!existsSync(WINDOW_STATE_PATH)) return null;

		const raw = readFileSync(WINDOW_STATE_PATH, "utf-8");
		const parsed = JSON.parse(raw);

		if (!isValidWindowState(parsed)) return null;

		return parsed;
	} catch {
		// Parse error or read error → treat as no saved state
		return null;
	}
}

/**
 * Saves window state to disk atomically (temp file + rename).
 * Corruption-safe: partial writes won't corrupt existing state.
 */
export function saveWindowState(state: WindowState): void {
	const tempPath = join(
		dirname(WINDOW_STATE_PATH),
		`.window-state.${Date.now()}.tmp`,
	);

	try {
		writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf-8");
		renameSync(tempPath, WINDOW_STATE_PATH); // Atomic replace
	} catch (error) {
		// Clean up temp file if rename failed
		try {
			unlinkSync(tempPath);
		} catch {}
		console.error("[window-state] Failed to save:", error);
	}
}

export function isValidWindowState(value: unknown): value is WindowState {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (
		Number.isFinite(v.x) &&
		Number.isFinite(v.y) &&
		Number.isFinite(v.width) &&
		(v.width as number) > 0 &&
		Number.isFinite(v.height) &&
		(v.height as number) > 0 &&
		typeof v.isMaximized === "boolean" &&
		(v.zoomLevel === undefined || Number.isFinite(v.zoomLevel))
	);
}
