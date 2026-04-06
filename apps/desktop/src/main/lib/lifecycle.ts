import { app } from "electron";

/**
 * Lifecycle intents determine how quit requests are handled.
 *
 * When no intent is set, macOS implicit quit (Cmd+Q, Dock Quit, window close)
 * backgrounds to tray by destroying windows and keeping the process alive.
 *
 * Explicit intents trigger full process termination:
 * - exit_release: release host services (re-adoptable on next launch), full exit
 * - exit_stop: stop host services, full exit
 * - install_update: release services, let updater handle shutdown/install
 * - restart: release services, relaunch app, full exit
 */
export type LifecycleIntent =
	| "exit_release"
	| "exit_stop"
	| "install_update"
	| "restart";

let pendingIntent: LifecycleIntent | null = null;
let exiting = false;

/** Request a full exit with the given intent. Triggers app.quit(). */
export function requestExit(
	intent: "exit_release" | "exit_stop" | "restart",
): void {
	pendingIntent = intent;
	app.quit();
}

/**
 * Set an intent without triggering quit.
 * Use when another API (e.g. autoUpdater.quitAndInstall) triggers quit internally.
 */
export function prepareIntent(intent: LifecycleIntent): void {
	pendingIntent = intent;
}

/** Consume and return the pending intent. Resets to null after reading. */
export function consumeIntent(): LifecycleIntent | null {
	const intent = pendingIntent;
	pendingIntent = null;
	return intent;
}

export function markExiting(): void {
	exiting = true;
}

export function isExiting(): boolean {
	return exiting;
}

/** Any non-null intent requires full process termination. */
export function isFullExitIntent(
	intent: LifecycleIntent | null,
): intent is LifecycleIntent {
	return intent !== null;
}
