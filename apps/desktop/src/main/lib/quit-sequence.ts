/**
 * Quit cleanup sequencing for the `before-quit` handler.
 *
 * Extracted from `main/index.ts` so the update-install path can be exercised
 * without booting the whole main process (index.ts has heavy import-time side
 * effects: local DB, shell env, protocol registration, ...).
 */

/** Watchdog window for Squirrel to terminate the app itself during an install. */
export const UPDATE_INSTALL_EXIT_GRACE_MS = 15_000;

export interface QuitCleanupDeps {
	isDev: boolean;
	/** Tray "Quit Completely": stop background services too. */
	forceFullCleanup: boolean;
	/** An update is downloaded/installing, so this quit hands off to Squirrel. */
	isUpdateInstalling: boolean;
	stopHostServices: () => void;
	teardownTerminalHost: () => Promise<void>;
	disposeTerminalHostClient: () => void;
	shutdownPersistence: () => void;
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
		disposeTerminalHostClient,
		shutdownPersistence,
		disposeTray,
		forceExit,
		scheduleTimer = (callback, delayMs) => {
			setTimeout(callback, delayMs);
		},
		logError = (message, error) => console.error(message, error),
	} = deps;

	try {
		stopHostServices();
		if (isDev || forceFullCleanup) {
			await teardownTerminalHost();
		} else if (isUpdateInstalling) {
			disposeTerminalHostClient();
		}
		shutdownPersistence();
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
