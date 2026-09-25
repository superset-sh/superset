import { randomUUID } from "node:crypto";
import { join } from "node:path";
import * as Sentry from "@sentry/electron/main";
import type { BrowserWindow } from "electron";
import { app, nativeTheme } from "electron";
import log from "electron-log/main";
import { createWindow } from "lib/electron-app/factories/windows/create";
import { createTrpcContext } from "lib/trpc/context";
import { createAppRouter } from "lib/trpc/routers";
import { resolveDevWorkspaceName } from "main/lib/dev-workspace-name";
import { getIconPath } from "main/lib/dock-icon";
import { isExpectedRendererExit } from "main/lib/renderer-exit";
import { PLATFORM } from "shared/constants";
import { env } from "shared/env.shared";
import { createIPCHandler } from "trpc-electron/main";
import { productName } from "~/package.json";
import {
	isAppStateInitialized,
	pruneWindowScopedState,
} from "../lib/app-state";
import { browserManager } from "../lib/browser/browser-manager";
import { attachEditContextMenu } from "../lib/edit-context-menu";
import { createApplicationMenu } from "../lib/menu";
import { menuEmitter } from "../lib/menu-events";
import { notificationsApp } from "../lib/notifications/server";
import {
	getAllWindows,
	getFocusedOrLastWindow,
	getKey,
	getOrg,
	markFocused,
	registerWindow,
	unregisterWindow,
} from "../lib/window-registry/window-registry";
import {
	getInitialWindowBounds,
	loadWindowState,
	loadWindows,
	type PersistedWindow,
	saveWindowState,
	saveWindows,
	type WindowState,
} from "../lib/window-state";

// Singleton IPC handler — created once, shared by every window. Each window is
// attached/detached individually via attachWindow/detachWindow.
let ipcHandler: ReturnType<typeof createIPCHandler> | null = null;

// Routers receive this getter so they always act on the currently relevant
// window. With multi-window support that is the most-recently-focused window
// (tracked by the window registry) rather than a single stored reference.
const getWindow = (): BrowserWindow | null => getFocusedOrLastWindow();

// invalidate() alone may not rebuild corrupted GPU layers — a tiny resize
// forces Chromium to reconstruct the compositor layer tree.
const forceRepaint = (win: BrowserWindow) => {
	if (win.isDestroyed()) return;
	win.webContents.invalidate();
	if (win.isMaximized() || win.isFullScreen()) return;
	const [width, height] = win.getSize();
	win.setSize(width + 1, height);
	setTimeout(() => {
		if (!win.isDestroyed()) win.setSize(width, height);
	}, 32);
};

// GPU process restarts don't repaint existing compositor layers automatically.
// Rate-limited: each repaint resizes the window, which runs a full fit +
// refresh on every attached terminal, so a crash-looping GPU process must not
// turn into an unbounded resize storm (GH #6822).
const GPU_GONE_REPAINT_COOLDOWN_MS = 10_000;
let lastGpuGoneRepaintAt = 0;
app.on("child-process-gone", (_event, details) => {
	if (details.type === "GPU") {
		console.warn("[main-window] GPU process gone:", details.reason);
		const now = Date.now();
		if (now - lastGpuGoneRepaintAt < GPU_GONE_REPAINT_COOLDOWN_MS) return;
		lastGpuGoneRepaintAt = now;
		const win = getWindow();
		if (win) forceRepaint(win);
	}
});

// ---------------------------------------------------------------------------
// App-level services
// ---------------------------------------------------------------------------
// These exist once for the whole app, independent of how many windows are open.
// Splitting them out of per-window setup is what makes opening a second window
// safe: the notifications HTTP server binds a single fixed port and the
// terminal/notification listeners must not be registered more than once.

let appServicesInitialized = false;

/**
 * Initialize app-wide singletons (the tRPC IPC handler and the application
 * menu). Idempotent — safe to call before each window is created.
 */
export function initAppServices(): void {
	if (appServicesInitialized) return;
	appServicesInitialized = true;
	ipcHandler = createIPCHandler({
		createContext: createTrpcContext,
		router: createAppRouter(getWindow),
		windows: [],
	});
	createApplicationMenu();

	// File → New Window (Cmd+N): open another window on the same org as the
	// currently focused window. Per-window org independence arrives in a later
	// milestone; for now a new window mirrors the current org.
	menuEmitter.on("new-window", (payload?: { orgId?: string | null }) => {
		// Prefer the org the caller passed (e.g. window.openNew, which captures the
		// calling window deterministically). Fall back to the focused window's org
		// for the menu-driven File → New Window.
		const focused = getFocusedOrLastWindow();
		const orgId =
			payload && "orgId" in payload
				? (payload.orgId ?? null)
				: focused
					? getOrg(focused.id)
					: null;
		void createPlatformWindow({ orgId }).catch((error) => {
			console.error("[main-window] Failed to open new window:", error);
		});
	});
}

// Shared services that should run while at least one window is open. Started
// when the first window opens and torn down when the last window closes, so
// they are never double-initialized by additional windows.
let notificationsServer: ReturnType<typeof notificationsApp.listen> | null =
	null;

function startSharedServices(): void {
	if (notificationsServer) return;

	notificationsServer = notificationsApp.listen(
		env.DESKTOP_NOTIFICATIONS_PORT,
		"127.0.0.1",
		() => {
			console.log(
				`[notifications] Listening on http://127.0.0.1:${env.DESKTOP_NOTIFICATIONS_PORT}`,
			);
		},
	);
}

function stopSharedServices(): void {
	browserManager.unregisterAll();
	notificationsServer?.close();
	notificationsServer = null;
}

// ---------------------------------------------------------------------------
// Multi-window restore
// ---------------------------------------------------------------------------

// Set during app quit so per-window close handlers don't shrink the persisted
// set as windows close one-by-one — the full set is snapshotted in before-quit.
let appQuitting = false;
export function markAppQuitting(): void {
	appQuitting = true;
}

function snapshotWindowState(window: BrowserWindow): WindowState {
	const isMaximized = window.isMaximized();
	const bounds = isMaximized ? window.getNormalBounds() : window.getBounds();
	return {
		x: bounds.x,
		y: bounds.y,
		width: bounds.width,
		height: bounds.height,
		isMaximized,
		zoomLevel: window.webContents.getZoomLevel(),
	};
}

/** Persist every open window's bounds + org so they can be restored on relaunch. */
export function persistOpenWindows(): void {
	// Quit before initAppState() completed: windows are only created after init,
	// so there is nothing to snapshot — appState access below would throw, and
	// writing the empty set would clobber the previous session's restore state.
	if (!isAppStateInitialized()) return;
	const persisted: PersistedWindow[] = getAllWindows()
		.filter((w) => !w.isDestroyed())
		.map((w) => ({
			key: getKey(w.id) ?? randomUUID(),
			orgId: getOrg(w.id),
			state: snapshotWindowState(w),
		}));
	// Per-window UI state is keyed by these, so anything belonging to a window
	// that is no longer restorable is dropped here rather than accumulating in
	// app-state.json forever.
	pruneWindowScopedState(persisted.map((w) => w.key));
	// Write unconditionally — an empty array clears stale restore state when the
	// last window closes, so previously-closed windows aren't reopened next launch.
	saveWindows(persisted);
}

/** Recreate the windows saved from the previous session (each on its org). */
export async function restoreWindows(): Promise<void> {
	const saved = loadWindows();
	for (const pw of saved) {
		await createPlatformWindow({
			orgId: pw.orgId,
			bounds: pw.state,
			key: pw.key,
		});
	}
}

// ---------------------------------------------------------------------------
// Per-window setup
// ---------------------------------------------------------------------------

/**
 * Create one platform window. Safe to call multiple times — each call builds an
 * independent BrowserWindow, registers it in the window registry, and attaches
 * it to the shared IPC handler. The first window starts shared services; the
 * last window to close stops them.
 *
 * @param orgId  The organization this window should show. Consumed by the
 *               per-window organization context (Milestone 2); may be null
 *               until the renderer resolves a default.
 * @param bounds Optional saved bounds to restore (used by window restore).
 * @param key    The window's persisted identity. Supplied when restoring so the
 *               window finds its own tab layout again; minted for a new window.
 */

/** The overlay's colours follow the OS theme until the renderer's theme store sets its own. */
function titleBarOverlayColors(): Electron.TitleBarOverlay {
	return nativeTheme.shouldUseDarkColors
		? { color: "#252525", symbolColor: "#e5e5e5", height: 40 }
		: { color: "#ffffff", symbolColor: "#1f1f1f", height: 40 };
}

export async function createPlatformWindow({
	orgId,
	bounds,
	key,
}: {
	orgId: string | null;
	bounds?: WindowState;
	key?: string;
}): Promise<BrowserWindow> {
	initAppServices();

	const wasEmpty = getAllWindows().length === 0;

	// Explicit bounds (restore) win. The first window falls back to the saved
	// single-window position; an *additional* New Window opens fresh/centered so
	// it doesn't land exactly on top of an existing window.
	const savedWindowState = bounds ?? (wasEmpty ? loadWindowState() : null);
	const initialBounds = getInitialWindowBounds(savedWindowState);
	let persistedZoomLevel = savedWindowState?.zoomLevel;

	const isDev = env.NODE_ENV === "development";
	const workspaceName = isDev ? resolveDevWorkspaceName() : undefined;
	const windowTitle = workspaceName
		? `${productName} — ${workspaceName}`
		: productName;

	const window = createWindow({
		id: "main",
		title: windowTitle,
		width: initialBounds.width,
		height: initialBounds.height,
		x: initialBounds.x,
		y: initialBounds.y,
		minWidth: 400,
		minHeight: 400,
		show: false,
		backgroundColor: nativeTheme.shouldUseDarkColors ? "#252525" : "#ffffff",
		center: initialBounds.center,
		movable: true,
		resizable: true,
		// macOS: deliver the first click on an unfocused window to the renderer
		// (otherwise it only activates the window and pane focus needs a second
		// click).
		acceptFirstMouse: true,
		alwaysOnTop: false,
		autoHideMenuBar: true,
		titleBarStyle: "hidden",
		// macOS keeps its traffic lights, positioned for the sidebar header.
		// Elsewhere the window-controls overlay draws minimize/maximize/close
		// on every screen, sign-in included, and the renderer keeps its top
		// strip clear of them through the titlebar-area CSS variables.
		...(PLATFORM.IS_MAC
			? { frame: false, trafficLightPosition: { x: 16, y: 16 } }
			: { titleBarOverlay: titleBarOverlayColors(), icon: getIconPath() }),
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			webviewTag: true,
			// Chromium's built-in PDF viewer, used by the file pane's PDF view
			plugins: true,
			// Isolate Electron session from system browser cookies
			// This ensures desktop uses bearer token auth, not web cookies
			partition: "persist:superset",
		},
	});

	registerWindow({ window, orgId, key: key ?? randomUUID() });
	window.on("focus", () => markFocused(window.id));

	attachEditContextMenu(window.webContents);

	if (wasEmpty) {
		startSharedServices();
	}

	// macOS Sequoia+: background throttling can corrupt GPU compositor layers
	if (PLATFORM.IS_MAC) {
		window.webContents.setBackgroundThrottling(false);
	}

	if (isDev) {
		window.webContents.on(
			"console-message",
			(_event, level, message, line, sourceId) => {
				const shouldForward =
					level >= 2 ||
					message.includes("[stress]") ||
					message.includes("[main]");
				if (!shouldForward) return;

				const details = sourceId ? ` (${sourceId}:${line})` : "";
				const formatted = `[renderer-console] ${message}${details}`;
				if (level >= 3) {
					log.error(formatted);
				} else if (level >= 2) {
					log.warn(formatted);
				} else {
					log.info(formatted);
				}
			},
		);

		window.on("unresponsive", () => {
			log.warn("[main-window] Renderer became unresponsive", {
				url: window.webContents.getURL(),
			});
		});
		window.on("responsive", () => {
			log.info("[main-window] Renderer became responsive", {
				url: window.webContents.getURL(),
			});
		});
	}

	ipcHandler?.attachWindow(window);
	browserManager.registerHostWindow(window.webContents);

	// macOS Sequoia+: occluded/minimized windows can lose compositor layers
	if (PLATFORM.IS_MAC) {
		window.on("restore", () => {
			window.webContents.invalidate();
		});
		window.on("show", () => {
			window.webContents.invalidate();
		});
	}

	// Persist window bounds on move/resize so state survives app.exit(0)
	// (which skips the close handler — e.g. electron-vite SIGTERM during dev).
	// Gated by `initialized` so the initial maximize() doesn't immediately
	// write isMaximized: true back to disk before the user touches the window.
	let initialized = false;
	let hasCompletedFirstLoad = false;
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	const debouncedSave = () => {
		if (!initialized || window.isDestroyed()) return;
		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => {
			if (window.isDestroyed()) return;
			const isMaximized = window.isMaximized();
			const bounds = isMaximized
				? window.getNormalBounds()
				: window.getBounds();
			const zoomLevel = window.webContents.getZoomLevel();
			saveWindowState({
				x: bounds.x,
				y: bounds.y,
				width: bounds.width,
				height: bounds.height,
				isMaximized,
				zoomLevel,
			});
			persistedZoomLevel = zoomLevel;
			// Keep the multi-window restore set fresh as windows move/resize.
			persistOpenWindows();
		}, 500);
	};
	window.on("move", debouncedSave);
	window.on("resize", debouncedSave);
	window.webContents.on("zoom-changed", () => {
		setTimeout(() => {
			if (window.isDestroyed()) return;
			persistedZoomLevel = window.webContents.getZoomLevel();
			debouncedSave();
		}, 0);
	});

	window.webContents.on("did-finish-load", () => {
		console.log("[main-window] Renderer loaded successfully");

		if (persistedZoomLevel !== undefined) {
			window.webContents.setZoomLevel(persistedZoomLevel);
		}

		if (!hasCompletedFirstLoad) {
			if (initialBounds.isMaximized) {
				window.maximize();
			}
			window.show();
			initialized = true;
			hasCompletedFirstLoad = true;
		}
	});

	window.webContents.on(
		"did-fail-load",
		(_event, errorCode, errorDescription, validatedURL) => {
			console.error("[main-window] Failed to load renderer:");
			console.error(`  Error code: ${errorCode}`);
			console.error(`  Description: ${errorDescription}`);
			console.error(`  URL: ${validatedURL}`);
			// Show the window anyway so user can see something is wrong
			window.show();
		},
	);

	window.webContents.on("render-process-gone", (_event, details) => {
		console.error("[main-window] Renderer process gone:", details);
		log.error("[main-window] Renderer process gone", details);
		// The Sentry SDK's own capture for this event runs off the app-level
		// listener it registered at init, so it fires before this one and cannot
		// be tagged retroactively — report the details separately.
		//
		// Deliberately an exclude-list, not an allow-list: a reason Electron adds
		// in a future version reports by default. Silence has to be opted into
		// one reason at a time, so a new crash mode is never lost to this filter.
		if (!isExpectedRendererExit(details.reason)) {
			Sentry.captureMessage(`renderer process gone (${details.reason})`, {
				level: "error",
				tags: {
					renderer_gone_reason: details.reason,
					renderer_gone_exit_code: String(details.exitCode),
				},
			});
		}
	});

	window.webContents.on("preload-error", (_event, preloadPath, error) => {
		console.error("[main-window] Preload script error:");
		console.error(`  Path: ${preloadPath}`);
		console.error(`  Error:`, error);
	});

	window.on("close", (event) => {
		// Outside macOS the last window is the app: quit through its
		// confirmation instead of leaving a windowless process, and keep the
		// window when the confirmation is cancelled.
		if (!appQuitting && !PLATFORM.IS_MAC && getAllWindows().length === 1) {
			event.preventDefault();
			app.quit();
			return;
		}
		// Save window state first, before any cleanup
		const isMaximized = window.isMaximized();
		const bounds = isMaximized ? window.getNormalBounds() : window.getBounds();
		const zoomLevel = window.webContents.getZoomLevel();
		saveWindowState({
			x: bounds.x,
			y: bounds.y,
			width: bounds.width,
			height: bounds.height,
			isMaximized,
			zoomLevel,
		});
		persistedZoomLevel = zoomLevel;

		ipcHandler?.detachWindow(window);
		unregisterWindow(window.id);

		// A user closing one window (app keeps running) updates the restore set.
		// During app quit we skip this — before-quit snapshots the full set so
		// closing windows one-by-one doesn't shrink it.
		if (!appQuitting) {
			persistOpenWindows();
		}

		// Tear down app-wide shared services only when the last window closes.
		if (getAllWindows().length === 0) {
			stopSharedServices();
		}
	});

	return window;
}
