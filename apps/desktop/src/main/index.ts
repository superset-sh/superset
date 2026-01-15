import { initSentry } from "./lib/sentry";

initSentry();

import path from "node:path";
import { settings } from "@superset/local-db";
import { app, BrowserWindow, dialog } from "electron";
import { makeAppSetup } from "lib/electron-app/factories/app/setup";
import {
	handleAuthCallback,
	parseAuthDeepLink,
} from "lib/trpc/routers/auth/utils/auth-functions";
import { DEFAULT_CONFIRM_ON_QUIT, PROTOCOL_SCHEME } from "shared/constants";
import { setupAgentHooks } from "./lib/agent-setup";
import { posthog } from "./lib/analytics";
import { initAppState } from "./lib/app-state";
import { setupAutoUpdater } from "./lib/auto-updater";
import { localDb } from "./lib/local-db";
import {
	reconcileDaemonSessions,
	shutdownOrphanedDaemon,
} from "./lib/terminal";
import { getWorkspaceRuntimeRegistry } from "./lib/workspace-runtime";
import { MainWindow } from "./windows/main";

// Initialize local SQLite database (runs migrations + legacy data migration on import)
console.log("[main] Local database ready:", !!localDb);

// Set different app name for dev to avoid singleton lock conflicts with production
if (process.env.NODE_ENV === "development") {
	app.setName("Superset Dev");
}

// Register protocol handler for deep linking
// In development, we need to provide the execPath and args
if (process.defaultApp) {
	if (process.argv.length >= 2) {
		app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
			path.resolve(process.argv[1]),
		]);
	}
} else {
	app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
}

async function processDeepLink(url: string): Promise<void> {
	const authParams = parseAuthDeepLink(url);
	if (!authParams) return;

	const result = await handleAuthCallback(authParams);
	if (result.success) {
		focusMainWindow();
	} else {
		console.error("[main] Auth deep link failed:", result.error);
	}
}

/**
 * Find a deep link URL in argv
 */
function findDeepLinkInArgv(argv: string[]): string | undefined {
	return argv.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`));
}

/**
 * Focus the main window (show and bring to front)
 */
function focusMainWindow(): void {
	const windows = BrowserWindow.getAllWindows();
	if (windows.length > 0) {
		const mainWindow = windows[0];
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.show();
		mainWindow.focus();
	}
}

// Handle deep links when app is already running (macOS)
app.on("open-url", async (event, url) => {
	event.preventDefault();
	await processDeepLink(url);
});

type QuitState =
	| "idle"
	| "confirming"
	| "confirmed"
	| "cleaning"
	| "ready-to-quit";
let quitState: QuitState = "idle";
let isQuitting = false;
let skipConfirmation = false;

/**
 * Check if the user has enabled the confirm-on-quit setting
 */
function getConfirmOnQuitSetting(): boolean {
	try {
		const row = localDb.select().from(settings).get();
		return row?.confirmOnQuit ?? DEFAULT_CONFIRM_ON_QUIT;
	} catch {
		return DEFAULT_CONFIRM_ON_QUIT;
	}
}

/**
 * Skip the confirmation dialog for the next quit (e.g., auto-updater)
 */
export function setSkipQuitConfirmation(): void {
	skipConfirmation = true;
}

/**
 * Skip the confirmation dialog and quit immediately
 */
export function quitWithoutConfirmation(): void {
	skipConfirmation = true;
	app.quit();
}

app.on("before-quit", async (event) => {
	isQuitting = true;

	if (quitState === "ready-to-quit") return;
	if (quitState === "cleaning" || quitState === "confirming") {
		event.preventDefault();
		return;
	}

	// Check if we need to show confirmation
	// Skip confirmation in development mode to avoid interrupting hot-reload
	if (quitState === "idle") {
		const isDev = process.env.NODE_ENV === "development";
		const shouldConfirm =
			!skipConfirmation && !isDev && getConfirmOnQuitSetting();

		if (shouldConfirm) {
			event.preventDefault();
			quitState = "confirming";

			try {
				const { response } = await dialog.showMessageBox({
					type: "question",
					buttons: ["Quit", "Cancel"],
					defaultId: 0,
					cancelId: 1,
					title: "Quit Superset",
					message: "Are you sure you want to quit?",
				});

				if (response === 1) {
					// User cancelled
					quitState = "idle";
					isQuitting = false;
					return;
				}
			} catch (error) {
				// Dialog failed - proceed with quit to avoid stuck state
				console.error("[main] Quit confirmation dialog failed:", error);
			}

			// User confirmed or dialog failed, proceed with quit
			quitState = "confirmed";
			app.quit();
			return;
		}

		// No confirmation needed
		quitState = "confirmed";
	}

	event.preventDefault();
	quitState = "cleaning";

	try {
		await Promise.all([
			getWorkspaceRuntimeRegistry().getDefault().terminal.cleanup(),
			posthog?.shutdown(),
		]);
	} finally {
		quitState = "ready-to-quit";
		app.quit();
	}
});

process.on("uncaughtException", (error) => {
	if (isQuitting) return;
	console.error("[main] Uncaught exception:", error);
});

process.on("unhandledRejection", (reason) => {
	if (isQuitting) return;
	console.error("[main] Unhandled rejection:", reason);
});

// Single instance lock - required for second-instance event on Windows/Linux
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
	// Another instance is already running, exit immediately without triggering before-quit
	app.exit(0);
} else {
	// Handle deep links when second instance is launched (Windows/Linux)
	app.on("second-instance", async (_event, argv) => {
		focusMainWindow();
		const url = findDeepLinkInArgv(argv);
		if (url) {
			await processDeepLink(url);
		}
	});

	(async () => {
		await app.whenReady();

		await initAppState();

		// Clean up stale daemon sessions from previous app runs
		// Must happen BEFORE renderer restore runs
		await reconcileDaemonSessions();

		// Shutdown orphaned daemon if persistence is disabled
		// (cleans up daemon left from previous session with persistence enabled)
		await shutdownOrphanedDaemon();

		try {
			setupAgentHooks();
		} catch (error) {
			console.error("[main] Failed to set up agent hooks:", error);
			// App can continue without agent hooks, but log the failure
		}

		await makeAppSetup(() => MainWindow());
		setupAutoUpdater();

		// Handle cold-start deep links (Windows/Linux - app launched via deep link)
		const coldStartUrl = findDeepLinkInArgv(process.argv);
		if (coldStartUrl) {
			await processDeepLink(coldStartUrl);
		}
	})();
}
