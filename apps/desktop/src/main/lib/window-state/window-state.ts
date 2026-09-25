import { randomUUID } from "node:crypto";
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

// ---------------------------------------------------------------------------
// Multi-window restore
// ---------------------------------------------------------------------------
// Persists the full set of open platform windows (each window's bounds + the
// organization it shows) so the app can reopen them on relaunch. Stored next to
// the single-window record; falls back to the legacy single record on first run.

const WINDOWS_STATE_PATH = join(
	dirname(WINDOW_STATE_PATH),
	"windows-state.json",
);

/**
 * The key given to the window that inherits the pre-multi-window tab layout.
 * app-state.json holds exactly one `tabsState` from the single-window era; the
 * first restored window adopts it so an existing user's tabs survive the
 * upgrade, and every window created afterwards starts from its own record.
 */
export const LEGACY_WINDOW_KEY = "legacy-single-window";

export interface PersistedWindow {
	/**
	 * Stable identity for this window across relaunches. Electron's window id is
	 * per-process and gets reused, so it cannot key anything that outlives the
	 * session — this does. Windows restored from disk keep their key, which is
	 * what lets a window find its own tab layout again after a restart.
	 */
	key: string;
	orgId: string | null;
	state: WindowState;
}

/** Legacy rows (written before per-window keys) are adopted with a fresh key. */
export function isValidPersistedWindow(
	value: unknown,
): value is PersistedWindow {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.key === "string" &&
		v.key.length > 0 &&
		(v.orgId === null || typeof v.orgId === "string") &&
		isValidWindowState(v.state)
	);
}

/**
 * Loads the set of windows to restore. Prefers the multi-window file; if absent,
 * migrates from the legacy single-window record so existing users keep their
 * window. Returns [] when nothing valid is saved.
 */
export function loadWindows(): PersistedWindow[] {
	try {
		if (existsSync(WINDOWS_STATE_PATH)) {
			const parsed = JSON.parse(readFileSync(WINDOWS_STATE_PATH, "utf-8"));
			if (Array.isArray(parsed)) {
				// Rows written before per-window keys are still restorable — give
				// them one now. Only the first such window inherits the legacy
				// single-window tab layout (see LEGACY_WINDOW_KEY), which is the
				// behaviour a returning single-window user expects.
				return parsed
					.map((row, index) =>
						row && typeof row === "object" && !("key" in row)
							? {
									...row,
									key: index === 0 ? LEGACY_WINDOW_KEY : randomUUID(),
								}
							: row,
					)
					.filter(isValidPersistedWindow);
			}
			return [];
		}
	} catch {
		// fall through to legacy migration
	}

	const legacy = loadWindowState();
	return legacy ? [{ key: LEGACY_WINDOW_KEY, orgId: null, state: legacy }] : [];
}

/** Saves the set of open windows atomically (temp file + rename). */
export function saveWindows(windows: PersistedWindow[]): void {
	const tempPath = join(
		dirname(WINDOWS_STATE_PATH),
		`.windows-state.${Date.now()}.tmp`,
	);
	try {
		writeFileSync(tempPath, JSON.stringify(windows, null, 2), "utf-8");
		renameSync(tempPath, WINDOWS_STATE_PATH);
	} catch (error) {
		try {
			unlinkSync(tempPath);
		} catch {}
		console.error("[window-state] Failed to save windows:", error);
	}
}
