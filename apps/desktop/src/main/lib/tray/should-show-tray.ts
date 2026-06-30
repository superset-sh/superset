/**
 * Pure decision logic for whether the menu bar (tray) icon should be shown.
 *
 * Kept separate from `index.ts` so it can be unit-tested without pulling in
 * Electron (the tray module imports `electron`, which is unavailable under
 * `bun test`).
 */
export interface TrayVisibilityInput {
	/** `process.platform` value */
	platform: NodeJS.Platform | string;
	/** User preference from app-state (`preferencesState.showTrayIcon`) */
	showTrayIcon: boolean;
}

/**
 * The tray is only supported on macOS, and only shown when the user hasn't
 * disabled it via settings.
 */
export function shouldShowTray({
	platform,
	showTrayIcon,
}: TrayVisibilityInput): boolean {
	return platform === "darwin" && showTrayIcon;
}
