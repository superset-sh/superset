import { app } from "electron";

/**
 * Lifecycle intents for explicit quit actions.
 *
 * When no intent is set, implicit quit (Cmd+Q, Dock Quit) goes through
 * the default before-quit path (confirm dialog, release services, exit).
 *
 * - exit_release: release host services (re-adoptable on next launch), full exit
 * - exit_stop: stop host services, full exit
 * - restart: release services, relaunch app, full exit
 */
export type LifecycleIntent = "exit_release" | "exit_stop" | "restart";

let pendingIntent: LifecycleIntent | null = null;
let exiting = false;

/** Request a full exit with the given intent. Triggers app.quit(). */
export function requestExit(intent: LifecycleIntent): void {
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
