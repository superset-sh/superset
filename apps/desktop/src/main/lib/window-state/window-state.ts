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

const DEFAULT_STATE_KEY = "default";

type WindowStateMap = Record<string, WindowState>;

/** Read & validate the entire window-state map from disk. */
function readWindowStateMap(filePath: string): WindowStateMap {
	try {
		if (!existsSync(filePath)) return {};

		const raw = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw);

		// Legacy shape (a bare WindowState): treat it as the default key.
		if (isValidWindowState(parsed)) {
			return { [DEFAULT_STATE_KEY]: parsed };
		}

		if (!parsed || typeof parsed !== "object") return {};

		const map: WindowStateMap = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (isValidWindowState(value)) {
				map[key] = value;
			}
		}
		return map;
	} catch {
		// Parse error or read error → treat as no saved state
		return {};
	}
}

function writeWindowStateMap(map: WindowStateMap, filePath: string): void {
	const tempPath = join(dirname(filePath), `.window-state.${Date.now()}.tmp`);

	try {
		writeFileSync(tempPath, JSON.stringify(map, null, 2), "utf-8");
		renameSync(tempPath, filePath); // Atomic replace
	} catch (error) {
		// Clean up temp file if rename failed
		try {
			unlinkSync(tempPath);
		} catch {}
		console.error("[window-state] Failed to save:", error);
	}
}

/**
 * Loads window state from disk for the default key.
 * Returns null if file doesn't exist, is corrupted, or has invalid shape.
 */
export function loadWindowState(): WindowState | null {
	return loadWindowStateForKey(DEFAULT_STATE_KEY);
}

/**
 * Loads window state for a specific key (e.g. workspace id).
 * No cross-key fallback: a first-time workspace window gets fresh defaults
 * (centered, default size) instead of inheriting another window's bounds.
 *
 * `filePath` is injectable for tests only.
 */
export function loadWindowStateForKey(
	key: string,
	filePath: string = WINDOW_STATE_PATH,
): WindowState | null {
	const map = readWindowStateMap(filePath);
	return map[key] ?? null;
}

/**
 * Saves window state to disk atomically (temp file + rename) under the default key.
 * Corruption-safe: partial writes won't corrupt existing state.
 */
export function saveWindowState(state: WindowState): void {
	saveWindowStateForKey(DEFAULT_STATE_KEY, state);
}

/**
 * Saves window state for a specific key while preserving other entries.
 * `filePath` is injectable for tests only.
 *
 * INVARIANT: this read-modify-write is fully synchronous (readFileSync →
 * mutate → writeFileSync). Node runs each call to completion before any other
 * JS, so two windows closing "simultaneously" cannot interleave their
 * read/write phases — the second call's read only runs after the first call's
 * write has landed, so no key is dropped. Keep it synchronous: introducing an
 * `await` between read and write would reopen that race and require a lock or
 * in-memory map to close it again.
 */
export function saveWindowStateForKey(
	key: string,
	state: WindowState,
	filePath: string = WINDOW_STATE_PATH,
): void {
	const map = readWindowStateMap(filePath);
	map[key] = state;
	writeWindowStateMap(map, filePath);
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
