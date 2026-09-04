import path from "node:path";
import { pathToFileURL } from "node:url";
import { msg } from "@lingui/core/macro";
import {
	setAgentSetupTemplatesDir,
	setupAgentIntegrations,
	writeSharedDisabledAgentIds,
	writeSharedDisabledSkillIds,
} from "@superset/agent-setup";
import { i18n, initI18nAsync } from "@superset/i18n";
import { settings } from "@superset/local-db";
import { app, dialog, Notification, net, protocol, session } from "electron";
import { makeAppSetup } from "lib/electron-app/factories/app/setup";
import {
	authEvents,
	handleAuthCallback,
	loadToken,
	parseAuthDeepLink,
} from "lib/trpc/routers/auth/utils/auth-functions";
import { applyShellEnvToProcess } from "lib/trpc/routers/workspaces/utils/shell-env";
import { env as mainEnv } from "main/env.main";
import {
	DEFAULT_CONFIRM_ON_QUIT,
	PLATFORM,
	PROTOCOL_SCHEME,
} from "shared/constants";
import { initAppState } from "./lib/app-state";
import { requestAppleEventsAccess } from "./lib/apple-events-permission";
import { isUpdateReadyToInstall, setupAutoUpdater } from "./lib/auto-updater";
import { startBrowserBridge } from "./lib/browser/browser-bridge";
import { downloadManager } from "./lib/browser/download-manager";
import { installBundledCliShim } from "./lib/bundled-cli";
import { resolveDevWorkspaceName } from "./lib/dev-workspace-name";
import { setWorkspaceDockIcon } from "./lib/dock-icon";
import { loadWebviewBrowserExtension } from "./lib/extensions";
import { getHostServiceCoordinator } from "./lib/host-service-coordinator";
import { resolveAppLocale } from "./lib/language";
import { localDb } from "./lib/local-db";
import { requestLocalNetworkAccess } from "./lib/local-network-permission";
import { menuEmitter } from "./lib/menu-events";
import {
	initTanstackDbPersistence,
	shutdownTanstackDbPersistence,
} from "./lib/persistence/persistence";
import { syncInstalledPluginMcpServers } from "./lib/plugin-installs";
import { portForwardManager } from "./lib/port-forward";
import { ensureProjectIconsDir, getProjectIconPath } from "./lib/project-icons";
import { runQuitCleanup } from "./lib/quit-sequence";
import { initSentry } from "./lib/sentry";
import {
	prewarmTerminalRuntime,
	reconcileDaemonSessions,
} from "./lib/terminal";
import {
	disposeTerminalHostClient,
	getTerminalHostClient,
} from "./lib/terminal-host/client";
import { disposeTray, initTray } from "./lib/tray";
import { getFocusedOrLastWindow } from "./lib/window-registry/window-registry";
import { sweepNetworkLogs } from "./network-logger-sweep";
import {
	createPlatformWindow,
	initAppServices,
	markAppQuitting,
	persistOpenWindows,
	restoreWindows,
} from "./windows/main";

console.log("[main] Local database ready:", !!localDb);
const IS_DEV = process.env.NODE_ENV === "development";

void applyShellEnvToProcess().catch((error) => {
	console.error("[main] Failed to apply shell environment:", error);
});

// Dev mode: label the app with the workspace name so multiple worktrees are distinguishable
if (IS_DEV) {
	const workspaceName = resolveDevWorkspaceName();
	if (workspaceName) {
		app.setName(`Superset (${workspaceName})`);
	}
}

// Dev mode: register with execPath + app script so macOS launches Electron with our entry point
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
	const authLink = parseAuthDeepLink(url);
	if (authLink.type !== "not-auth") {
		// Never log the auth URL: it contains the desktop session token.
		console.log("[main] Processing auth deep link");
		// `error` stays English: it is the log line. What the user reads is
		// resolved separately below so it can be translated.
		const result =
			authLink.type === "valid"
				? await handleAuthCallback(authLink.params)
				: {
						success: false as const,
						error: "sign-in link was missing required parameters",
					};
		if (result.success) {
			focusMainWindow();
		} else {
			console.error("[main] Auth deep link failed:", result.error);
			focusMainWindow();
			dialog.showErrorBox(
				i18n._(msg({ message: "Sign-in failed" })),
				authLink.type === "valid"
					? (result.error ??
							i18n._(
								msg({
									message:
										"Superset could not complete sign-in. Please try again.",
								}),
							))
					: i18n._(
							msg({
								message: "The sign-in link was incomplete. Please try again.",
							}),
						),
			);
		}
		return;
	}

	console.log("[main] Processing deep link:", url);

	// Non-auth deep links: extract path and navigate in renderer
	// e.g. superset://tasks/my-slug -> /tasks/my-slug
	const path = `/${url.split("://")[1]}`;
	focusMainWindow();

	const target = getFocusedOrLastWindow();
	target?.webContents.send("deep-link-navigate", path);
}

function findDeepLinkInArgv(argv: string[]): string | undefined {
	return argv.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`));
}

export function focusMainWindow(): void {
	const target = getFocusedOrLastWindow();
	if (target) {
		if (target.isMinimized()) {
			target.restore();
		}
		target.show();
		target.focus();
	} else {
		// Triggers window creation via makeAppSetup's activate handler
		app.emit("activate");
	}
}

function registerWithMacOSNotificationCenter() {
	if (!PLATFORM.IS_MAC || !Notification.isSupported()) return;

	const registrationNotification = new Notification({
		title: app.name,
		body: " ",
		silent: true,
	});

	let handled = false;
	const cleanup = () => {
		if (handled) return;
		handled = true;
		registrationNotification.close();
	};

	registrationNotification.on("show", () => {
		cleanup();
		console.log("[notifications] Registered with Notification Center");
	});

	// Fallback timeout in case macOS doesn't fire events
	setTimeout(cleanup, 1000);

	registrationNotification.show();
}

// macOS open-url can fire before the window exists (cold-start via protocol link).
// Queue the URL and process it after initialization.
let pendingDeepLinkUrl: string | null = null;
let appReady = false;

app.on("open-url", async (event, url) => {
	event.preventDefault();
	if (appReady) {
		await processDeepLink(url);
	} else {
		pendingDeepLinkUrl = url;
	}
});

let isQuitting = false;
let skipQuitConfirmation = false;
let forceFullCleanup = false;

export function setSkipQuitConfirmation(): void {
	skipQuitConfirmation = true;
}

export function quitApp(): void {
	setSkipQuitConfirmation();
	app.quit();
}

/** Quit + also stop background services. Tray "Quit Completely". */
export function quitAppCompletely(): void {
	forceFullCleanup = true;
	setSkipQuitConfirmation();
	app.quit();
}

/** Bypasses before-quit. Host-service children self-exit via the parent watchdog. */
export function exitImmediately(): void {
	app.exit(0);
}

function getLanguageSetting(): string | null {
	try {
		const row = localDb.select().from(settings).get();
		return row?.language ?? null;
	} catch {
		return null;
	}
}

function getConfirmOnQuitSetting(): boolean {
	try {
		const row = localDb.select().from(settings).get();
		return row?.confirmOnQuit ?? DEFAULT_CONFIRM_ON_QUIT;
	} catch {
		return DEFAULT_CONFIRM_ON_QUIT;
	}
}

app.on("before-quit", async (event) => {
	if (isQuitting) return;

	const isDev = process.env.NODE_ENV === "development";
	if (!skipQuitConfirmation && !isDev && getConfirmOnQuitSetting()) {
		event.preventDefault();

		try {
			const { response } = await dialog.showMessageBox({
				type: "question",
				buttons: [
					i18n._(msg({ message: "Quit" })),
					i18n._(msg({ message: "Cancel" })),
				],
				defaultId: 0,
				cancelId: 1,
				title: i18n._(msg({ message: "Quit Superset" })),
				message: i18n._(
					msg({
						message: "Are you sure you want to quit?",
					}),
				),
			});

			if (response === 1) {
				return;
			}
		} catch (error) {
			console.error("[main] Quit confirmation dialog failed:", error);
		}
	}

	isQuitting = true;
	// Local port-forward listeners hold no state worth draining; drop them so
	// nothing keeps 127.0.0.1:<port> bound after the app is gone.
	portForwardManager.stopAll();
	// Snapshot all open windows (bounds + org) before they close, so relaunch
	// restores them. markAppQuitting() stops per-window close handlers from
	// shrinking the set as windows close one-by-one.
	markAppQuitting();
	persistOpenWindows();
	await runQuitCleanup({
		isDev,
		forceFullCleanup,
		isUpdateInstalling: isUpdateReadyToInstall(),
		stopHostServices: () => getHostServiceCoordinator().stopAll(),
		teardownTerminalHost,
		disposeTerminalHostClient,
		shutdownPersistence: shutdownTanstackDbPersistence,
		disposeTray,
		forceExit: (code) => app.exit(code),
	});
});

/**
 * Fully stop the v1 terminal-host process. Do not call this for update
 * installs: terminal-host owns the PTY subprocesses, so shutdown is
 * destructive and prevents reattach on next launch.
 */
async function teardownTerminalHost(): Promise<void> {
	try {
		await getTerminalHostClient().shutdownIfRunning({ killSessions: true });
	} catch (err) {
		console.warn("[main] terminal-host dev shutdown failed:", err);
	}
	disposeTerminalHostClient();
}

process.on("uncaughtException", (error) => {
	if (isQuitting) return;
	console.error("[main] Uncaught exception:", error);
});

process.on("unhandledRejection", (reason) => {
	if (isQuitting) return;
	console.error("[main] Unhandled rejection:", reason);
});

// Without these handlers, Electron may not quit when electron-vite sends SIGTERM
if (process.env.NODE_ENV === "development") {
	let signalHandled = false;
	const handleTerminationSignal = (signal: string) => {
		if (signalHandled) return;
		signalHandled = true;
		console.log(`[main] Received ${signal}, quitting...`);
		getHostServiceCoordinator().stopAll();
		void Promise.allSettled([teardownTerminalHost()]).finally(() =>
			app.exit(0),
		);
	};

	process.on("SIGTERM", () => handleTerminationSignal("SIGTERM"));
	process.on("SIGINT", () => handleTerminationSignal("SIGINT"));

	// Fallback: electron-vite may exit without signaling the child Electron process
	const parentPid = process.ppid;
	const isParentAlive = (): boolean => {
		try {
			process.kill(parentPid, 0);
			return true;
		} catch {
			return false;
		}
	};

	const parentCheckInterval = setInterval(() => {
		if (!isParentAlive()) {
			console.log("[main] Parent process exited, quitting...");
			clearInterval(parentCheckInterval);
			handleTerminationSignal("parent-exit");
		}
	}, 1000);
	parentCheckInterval.unref();
}

// Chromium refuses to cache any single entry larger than about an eighth
// of the disk cache, and the default cache is a few hundred MB — too
// small for a video inside a page. 1 GiB lifts the per-entry cap to
// roughly 128 MB.
app.commandLine.appendSwitch("disk-cache-size", String(1024 * 1024 * 1024));

protocol.registerSchemesAsPrivileged([
	{
		scheme: "superset-icon",
		privileges: {
			standard: true,
			secure: true,
			bypassCSP: true,
			supportFetchAPI: true,
		},
	},
	{
		scheme: "superset-font",
		privileges: {
			standard: true,
			secure: true,
			bypassCSP: true,
			supportFetchAPI: true,
		},
	},
]);

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
	app.exit(0);
} else {
	// Windows/Linux: protocol URL arrives as argv on the second instance
	app.on("second-instance", async (_event, argv) => {
		// An auto-update restart spawns the replacement while this process
		// still holds the single-instance lock; don't build windows mid-quit.
		if (isQuitting) return;
		const url = findDeepLinkInArgv(argv);
		if (url) {
			// processDeepLink focuses the window on every one of its paths.
			await processDeepLink(url);
			return;
		}
		// The desktop entry's "New Window" action (GNOME top-bar/dock app
		// menus) relaunches the executable with --new-window, and the
		// single-instance lock lands it here. A plain relaunch keeps the
		// Electron-standard behavior of focusing the running app, so a
		// Start-menu or launcher re-click never stacks extra windows. The
		// listener-count check covers the boot window before initAppServices
		// registers the handler; falling back to focus matches pre-ready
		// behavior instead of dropping the event silently.
		if (
			argv.includes("--new-window") &&
			menuEmitter.listenerCount("new-window") > 0
		) {
			console.log("[main] Second instance requested a new window");
			menuEmitter.emit("new-window");
			return;
		}
		focusMainWindow();
	});

	(async () => {
		await app.whenReady();
		// Persisted language setting wins; otherwise infer from OS preferences
		// (plans/20260826-i18n-strategy.md). Menus are built later in
		// initAppServices/initTray, so a plain activate is enough here.
		await initI18nAsync(resolveAppLocale(getLanguageSetting()));
		registerWithMacOSNotificationCenter();
		requestAppleEventsAccess();
		requestLocalNetworkAccess();

		// Must register on both default session and the app's custom partition
		const iconProtocolHandler = (request: Request) => {
			const url = new URL(request.url);
			const projectId = url.pathname.replace(/^\//, "");
			const iconPath = getProjectIconPath(projectId);
			if (!iconPath) {
				return new Response("Not found", { status: 404 });
			}
			return net.fetch(pathToFileURL(iconPath).toString());
		};
		protocol.handle("superset-icon", iconProtocolHandler);
		session
			.fromPartition("persist:superset")
			.protocol.handle("superset-icon", iconProtocolHandler);

		// Serve system fonts (e.g. SF Mono on macOS) via custom protocol
		// so the renderer can use @font-face with font-src 'self' CSP
		if (process.platform === "darwin") {
			const SYSTEM_FONT_DIRS = [
				"/System/Applications/Utilities/Terminal.app/Contents/Resources/Fonts",
				"/System/Library/Fonts",
				"/Library/Fonts",
			];
			const fontProtocolHandler = async (request: Request) => {
				const url = new URL(request.url);
				const filename = path.basename(url.pathname);
				if (!/\.(otf|ttf|woff2?)$/i.test(filename)) {
					return new Response("Not found", { status: 404 });
				}
				for (const dir of SYSTEM_FONT_DIRS) {
					const fontPath = path.join(dir, filename);
					try {
						return await net.fetch(pathToFileURL(fontPath).toString());
					} catch {
						// Not in this directory
					}
				}
				return new Response("Not found", { status: 404 });
			};
			protocol.handle("superset-font", fontProtocolHandler);
			session
				.fromPartition("persist:superset")
				.protocol.handle("superset-font", fontProtocolHandler);
		}

		ensureProjectIconsDir();
		setWorkspaceDockIcon();
		initSentry();
		await initAppState();
		initTanstackDbPersistence();

		sweepNetworkLogs();

		await loadWebviewBrowserExtension();

		// Must happen before renderer restore runs
		await reconcileDaemonSessions();
		prewarmTerminalRuntime();

		// Must be listening before any host-service spawns: the child learns the
		// bridge endpoint/secret from its env, so a late bridge means browser
		// control stays dark until the next respawn.
		try {
			await startBrowserBridge();
		} catch (error) {
			console.error("[main] Failed to start browser bridge:", error);
		}
		downloadManager.start();

		const hostServiceCoordinator = getHostServiceCoordinator();
		hostServiceCoordinator.setConfigProvider(async () => {
			const { token } = await loadToken();
			if (!token) return null;
			return { authToken: token, cloudApiUrl: mainEnv.NEXT_PUBLIC_API_URL };
		});

		// The authenticated session's cached membership is the source of truth.
		// Host data on disk can outlive membership and must never resurrect an
		// obsolete service. This cache keeps subsequent launches offline-capable.
		let authGeneration = 0;
		const reconcileHostServices = async (providedAuth?: {
			token: string;
			organizationIds: string[];
		}) => {
			const generation = authGeneration;
			try {
				const storedAuth = providedAuth ?? (await loadToken());
				if (generation !== authGeneration) return;
				if (!storedAuth.token || !storedAuth.organizationIds) return;
				await hostServiceCoordinator.reconcile(storedAuth.organizationIds, {
					authToken: storedAuth.token,
					cloudApiUrl: mainEnv.NEXT_PUBLIC_API_URL,
				});
			} catch (error) {
				console.error("[main] host-service reconcile failed:", error);
			}
		};
		void reconcileHostServices();
		// A new token can belong to a different account. Stop immediately and wait
		// for that account's session membership before starting anything.
		authEvents.on("token-saved", () => {
			authGeneration++;
			hostServiceCoordinator.stopAll();
		});
		authEvents.on("token-cleared", () => {
			authGeneration++;
			hostServiceCoordinator.stopAll();
		});
		authEvents.on(
			"organization-ids-saved",
			(data: { token: string; organizationIds: string[] }) => {
				authGeneration++;
				void reconcileHostServices(data);
			},
		);

		try {
			// The vite build copies @superset/agent-setup's templates (plus the
			// bundled Claude plugin) next to this bundle; see vite/helpers.ts.
			setAgentSetupTemplatesDir(path.join(__dirname, "templates"));
			const settingsRow = localDb.select().from(settings).get();
			const disabledAgentHooks = settingsRow?.disabledAgentHooks ?? [];
			const disabledSkills = settingsRow?.disabledSkills ?? [];
			// Mirror the disable lists so CLI-launched host-services on this
			// machine honor them instead of re-provisioning disabled agents/skills.
			writeSharedDisabledAgentIds(disabledAgentHooks);
			writeSharedDisabledSkillIds(disabledSkills);
			setupAgentIntegrations({
				disabledAgentIds: disabledAgentHooks,
				disabledSkillIds: disabledSkills,
			});
		} catch (error) {
			console.error("[main] Failed to set up agent integrations:", error);
		}
		try {
			// Converge agent MCP configs on the installed-plugin set, so
			// installs/uninstalls that missed a mid-session sync land here.
			syncInstalledPluginMcpServers();
		} catch (error) {
			console.error("[main] Failed to sync installed plugins:", error);
		}
		try {
			installBundledCliShim();
		} catch (error) {
			console.error("[main] Failed to install bundled CLI shim:", error);
		}

		if (IS_DEV) {
			hostServiceCoordinator.enableDevReload(async () => {
				const { token } = await loadToken();
				if (!token) return null;
				return { authToken: token, cloudApiUrl: mainEnv.NEXT_PUBLIC_API_URL };
			});
		}

		initAppServices();
		await makeAppSetup(
			() => createPlatformWindow({ orgId: null }),
			restoreWindows,
		);
		setupAutoUpdater();
		initTray();

		const coldStartUrl = findDeepLinkInArgv(process.argv);
		if (coldStartUrl) {
			await processDeepLink(coldStartUrl);
		}
		if (pendingDeepLinkUrl) {
			await processDeepLink(pendingDeepLinkUrl);
			pendingDeepLinkUrl = null;
		}

		appReady = true;
	})();
}
