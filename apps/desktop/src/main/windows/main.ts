import { join } from "node:path";
import {
	app,
	type BrowserWindow,
	BrowserWindow as BrowserWindowCtor,
	nativeTheme,
} from "electron";
import log from "electron-log/main";
import { createWindow } from "lib/electron-app/factories/windows/create";
import { createAppRouter } from "lib/trpc/routers";
import { PLATFORM } from "shared/constants";
import {
	env,
	getWorkspaceName as getEnvWorkspaceName,
} from "shared/env.shared";
import { createIPCHandler } from "trpc-electron/main";
import { productName } from "~/package.json";
import { browserManager } from "../lib/browser/browser-manager";
import { createApplicationMenu } from "../lib/menu";
import {
	getInitialWindowBounds,
	loadWindowStateForKey,
	saveWindowStateForKey,
} from "../lib/window-state";
import {
	getAllManagedWindows,
	getManagedWindowByWebContents,
	type ManagedWindow,
	registerWindow,
} from "./manager";

// Singleton IPC handler to prevent duplicate handlers on window reopen (macOS).
// IMPORTANT INVARIANT: `createContext` MUST stay closure-free over any individual
// window. It resolves the sender's host window per-call so the same handler can
// route calls from every BrowserWindow correctly.
let ipcHandler: ReturnType<typeof createIPCHandler> | null = null;
let menuInitialized = false;
let gpuRepaintBound = false;

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
// Bind once: dev HMR re-evaluates this module, so without the sentinel each
// reload would stack another listener and cause N resize jitters per crash.
function bindGpuRepaintListener(): void {
	if (gpuRepaintBound) return;
	gpuRepaintBound = true;
	app.on("child-process-gone", (_event, details) => {
		if (details.type !== "GPU") return;
		console.warn("[main-window] GPU process gone:", details.reason);
		// GPU process is shared across every window — repaint all, not just
		// the focused one, so background windows don't render stale frames.
		for (const managed of getAllManagedWindows()) {
			forceRepaint(managed.window);
		}
	});
}

export interface MainWindowOptions {
	/** Persisted workspace identifier. Used to scope state, query param, and lookups. */
	workspaceId?: string | null;
	/** When true, stagger bounds off any existing window to avoid stacking. */
	stagger?: boolean;
	/** Tab to focus on first paint (forwarded to the renderer as a query param). */
	focusTabId?: string;
}

export async function MainWindow(
	options: MainWindowOptions = {},
): Promise<BrowserWindow> {
	const isDev = env.NODE_ENV === "development";
	const devWorkspaceName = isDev ? getEnvWorkspaceName() : undefined;
	const workspaceId = options.workspaceId ?? devWorkspaceName ?? null;

	// Persist state ONLY when the window can be uniquely identified across
	// launches (workspaceId set) or it's the primary "default" window.
	// A secondary window opened via "New Window" with no workspaceId stays
	// ephemeral — otherwise it would clobber the primary's persisted bounds.
	const stateKey: string | null = workspaceId
		? workspaceId
		: options.stagger
			? null
			: "default";

	const savedWindowState = stateKey ? loadWindowStateForKey(stateKey) : null;
	const initialBounds = getInitialWindowBounds(savedWindowState);
	let persistedZoomLevel = savedWindowState?.zoomLevel;

	// Stagger new windows so they don't stack perfectly on an existing one.
	if (options.stagger) {
		const STAGGER_PX = 32;
		initialBounds.x = (initialBounds.x ?? 0) + STAGGER_PX;
		initialBounds.y = (initialBounds.y ?? 0) + STAGGER_PX;
		initialBounds.center = false;
	}

	const windowTitle = devWorkspaceName
		? `${productName} — ${devWorkspaceName}`
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
		alwaysOnTop: false,
		autoHideMenuBar: true,
		frame: false,
		titleBarStyle: "hidden",
		trafficLightPosition: { x: 16, y: 16 },
		query: workspaceId
			? {
					workspaceId,
					...(options.focusTabId ? { focusTabId: options.focusTabId } : {}),
				}
			: undefined,
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			webviewTag: true,
			// Isolate Electron session from system browser cookies
			// This ensures desktop uses bearer token auth, not web cookies
			partition: "persist:superset",
		},
	});

	if (!menuInitialized) {
		createApplicationMenu();
		menuInitialized = true;
	}
	bindGpuRepaintListener();

	const managed: ManagedWindow = registerWindow(window, {
		workspaceId,
	});

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

	if (ipcHandler) {
		ipcHandler.attachWindow(window);
	} else {
		ipcHandler = createIPCHandler({
			router: createAppRouter(),
			windows: [window],
			createContext: async ({ event }) => {
				// IPC may originate from a <webview> pane, not the host renderer.
				// Walk to hostWebContents so ctx.window always resolves to the
				// owning BrowserWindow (otherwise dialog procedures no-op).
				const host = event.sender.hostWebContents ?? event.sender;
				const senderManaged = getManagedWindowByWebContents(host.id);
				const senderWindow =
					senderManaged?.window ?? BrowserWindowCtor.fromWebContents(host);
				return { window: senderWindow };
			},
		});
	}

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
			persistedZoomLevel = zoomLevel;
			if (!stateKey) return;
			saveWindowStateForKey(stateKey, {
				x: bounds.x,
				y: bounds.y,
				width: bounds.width,
				height: bounds.height,
				isMaximized,
				zoomLevel,
			});
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
	});

	window.webContents.on("preload-error", (_event, preloadPath, error) => {
		console.error("[main-window] Preload script error:");
		console.error(`  Path: ${preloadPath}`);
		console.error(`  Error:`, error);
	});

	// Snapshot the host webContents id while the window is still alive so the
	// `closed` cleanup can find its panes after the wc has been destroyed.
	const hostWebContentsId = window.webContents.id;

	window.on("close", () => {
		if (!stateKey || window.isDestroyed()) return;
		const isMaximized = window.isMaximized();
		const bounds = isMaximized ? window.getNormalBounds() : window.getBounds();
		// webContents may be tearing down on Cmd+Q — fall back to last known zoom.
		let zoomLevel = persistedZoomLevel ?? 0;
		try {
			zoomLevel = window.webContents.getZoomLevel();
		} catch {
			// wc already destroyed
		}
		saveWindowStateForKey(stateKey, {
			x: bounds.x,
			y: bounds.y,
			width: bounds.width,
			height: bounds.height,
			isMaximized,
			zoomLevel,
		});
		persistedZoomLevel = zoomLevel;
	});

	// Run scoped cleanup on `closed` (not `close`) so pane lookups happen after
	// the wc has finished tearing down — avoids the half-destroyed window
	// briefly staying in the manager registry with stale state.
	window.on("closed", () => {
		if (saveTimeout) clearTimeout(saveTimeout);
		// Scoped cleanup: only this window's panes + its IPC binding.
		// App-level services (notifications server/manager, terminal listeners)
		// outlive any single window — see lib/app-services.ts.
		browserManager.unregisterAllForWindow(hostWebContentsId);
		ipcHandler?.detachWindow(window);
	});

	return managed.window;
}
