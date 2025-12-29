import { app } from "electron";

let skipQuitConfirmation = false;

/**
 * Skip the quit confirmation dialog for the next quit (e.g., auto-updater).
 */
export function setSkipQuitConfirmation(): void {
	skipQuitConfirmation = true;
}

export function shouldSkipQuitConfirmation(): boolean {
	return skipQuitConfirmation;
}

/**
 * Skip the confirmation dialog and quit immediately.
 */
export function quitWithoutConfirmation(): void {
	setSkipQuitConfirmation();
	app.quit();
}

