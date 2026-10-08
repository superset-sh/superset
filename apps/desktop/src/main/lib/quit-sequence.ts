/**
 * Quit cleanup sequencing for the `before-quit` handler.
 *
 * Extracted from `main/index.ts` so the update-install path can be exercised
 * without booting the whole main process (index.ts has heavy import-time side
 * effects: local DB, shell env, protocol registration, ...).
 */

/** Watchdog window for Squirrel to terminate the app itself during an install. */
export const UPDATE_INSTALL_EXIT_GRACE_MS = 15_000;

/** Quit Completely hides the windows while it cleans up; never wait longer. */
export const FULL_CLEANUP_TIMEOUT_MS = 15_000;

export interface QuitCleanupDeps {
	isDev: boolean;
	/** Tray "Quit Completely": stop background services too. */
	forceFullCleanup: boolean;
	/** An update is downloaded/installing, so this quit hands off to Squirrel. */
	isUpdateInstalling: boolean;
	/** Returns the pids of the host-services it sent SIGTERM to. */
	stopHostServices: () => number[];
	teardownTerminalHost: () => Promise<void>;
	stopPtyDaemons: (stoppedHostServicePids: number[]) => Promise<void>;
	disposeTerminalHostClient: () => void;
	disposeTray: () => void;
	forceExit: (code: number) => void;
	scheduleTimer?: (callback: () => void, delayMs: number) => void;
	logError?: (message: string, error: unknown) => void;
}

export async function runQuitCleanup(deps: QuitCleanupDeps): Promise<void> {
	const {
		isDev,
		forceFullCleanup,
		isUpdateInstalling,
		stopHostServices,
		teardownTerminalHost,
		stopPtyDaemons,
		disposeTerminalHostClient,
		disposeTray,
		forceExit,
		scheduleTimer = (callback, delayMs) => {
			setTimeout(callback, delayMs);
		},
		logError = (message, error) => console.error(message, error),
	} = deps;

	try {
		const stoppedHostServicePids = stopHostServices();
		if (forceFullCleanup) {
			let settled = false;
			await Promise.race([
				Promise.all([
					teardownTerminalHost(),
					stopPtyDaemons(stoppedHostServicePids),
				]).finally(() => {
					settled = true;
				}),
				new Promise<void>((resolve) => {
					scheduleTimer(() => {
						if (!settled) {
							logError(
								"[main] Full cleanup during quit timed out after ms:",
								FULL_CLEANUP_TIMEOUT_MS,
							);
						}
						resolve();
					}, FULL_CLEANUP_TIMEOUT_MS);
				}),
			]);
		} else if (isDev) {
			await teardownTerminalHost();
		} else if (isUpdateInstalling) {
			disposeTerminalHostClient();
		}
		disposeTray();
	} catch (error) {
		logError("[main] Cleanup during quit failed:", error);
	}

	if (isUpdateInstalling) {
		// `quitAndInstall()` only *starts* the Squirrel.Mac handoff: ShipIt is
		// launched asynchronously and swaps the app bundle (then relaunches) once
		// this process terminates on its own. `app.exit()` kills the browser
		// process immediately and skips `will-quit`, which preempts that handoff —
		// the app closes but is still on the old version and never comes back
		// (#6048). Let Electron's normal termination finish the install, and keep
		// the forced exit only as a watchdog so a wedged quit can't hang forever.
		scheduleTimer(() => forceExit(0), UPDATE_INSTALL_EXIT_GRACE_MS);
		return;
	}

	forceExit(0);
}
