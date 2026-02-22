import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, session, shell } from "electron";
import { env } from "main/env.main";
import { PLATFORM } from "shared/constants";
import { makeAppId } from "shared/utils";
import { ignoreConsoleWarnings } from "../../utils/ignore-console-warnings";

ignoreConsoleWarnings(["Manifest version 2 is deprecated"]);

const APP_PARTITION = "persist:superset";
const REACT_DEVTOOLS_EXTENSION_ID = "fmkadmapgofadopljbjfkapdkoienihi";

function compareVersionLikeStrings(a: string, b: string): number {
	const aParts = a.split(/[._-]/).map((part) => Number.parseInt(part, 10));
	const bParts = b.split(/[._-]/).map((part) => Number.parseInt(part, 10));
	const maxLen = Math.max(aParts.length, bParts.length);

	for (let index = 0; index < maxLen; index++) {
		const left = Number.isFinite(aParts[index]) ? aParts[index] : -1;
		const right = Number.isFinite(bParts[index]) ? bParts[index] : -1;
		if (left !== right) return left - right;
	}

	return 0;
}

function getChromiumUserDataDirs(): string[] {
	const homeDir = os.homedir();

	if (process.platform === "darwin") {
		return [
			path.join(homeDir, "Library/Application Support/Google/Chrome"),
			path.join(homeDir, "Library/Application Support/Google/Chrome Beta"),
			path.join(homeDir, "Library/Application Support/Google/Chrome Canary"),
			path.join(homeDir, "Library/Application Support/Chromium"),
			path.join(
				homeDir,
				"Library/Application Support/BraveSoftware/Brave-Browser",
			),
			path.join(homeDir, "Library/Application Support/Arc/User Data"),
		];
	}

	if (process.platform === "win32") {
		const localAppData = process.env.LOCALAPPDATA;
		if (!localAppData) return [];

		return [
			path.join(localAppData, "Google/Chrome/User Data"),
			path.join(localAppData, "Google/Chrome Beta/User Data"),
			path.join(localAppData, "Google/Chrome SxS/User Data"),
			path.join(localAppData, "Chromium/User Data"),
			path.join(localAppData, "BraveSoftware/Brave-Browser/User Data"),
			path.join(localAppData, "Arc/User Data"),
		];
	}

	return [
		path.join(homeDir, ".config/google-chrome"),
		path.join(homeDir, ".config/google-chrome-beta"),
		path.join(homeDir, ".config/google-chrome-canary"),
		path.join(homeDir, ".config/chromium"),
		path.join(homeDir, ".config/BraveSoftware/Brave-Browser"),
	];
}

function resolveExtensionVersionPath(basePath: string): string | null {
	if (existsSync(path.join(basePath, "manifest.json"))) return basePath;

	if (!existsSync(basePath)) return null;

	const versionDirs = readdirSync(basePath, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort(compareVersionLikeStrings)
		.reverse();

	if (versionDirs.length === 0) return null;
	return path.join(basePath, versionDirs[0]);
}

function getChromeExtensionRoots(): string[] {
	const roots: string[] = [];
	for (const userDataDir of getChromiumUserDataDirs()) {
		if (!existsSync(userDataDir)) continue;

		// Browsers keep extension folders under profile directories such as
		// "Default", "Profile 1", "Profile 11", etc.
		const profileEntries = readdirSync(userDataDir, { withFileTypes: true });
		for (const profileEntry of profileEntries) {
			if (!profileEntry.isDirectory()) continue;

			const extensionsDir = path.join(userDataDir, profileEntry.name, "Extensions");
			if (existsSync(extensionsDir)) {
				roots.push(extensionsDir);
			}
		}
	}

	return roots;
}

function resolveReactDevToolsPath(): string | null {
	const overridePath = process.env.ELECTRON_REACT_DEVTOOLS_PATH;
	if (overridePath) {
		const resolvedOverridePath = resolveExtensionVersionPath(overridePath);
		if (resolvedOverridePath) return resolvedOverridePath;
		console.warn(
			`[main] ELECTRON_REACT_DEVTOOLS_PATH does not exist: ${overridePath}`,
		);
	}

	for (const root of getChromeExtensionRoots()) {
		const extensionRoot = path.join(root, REACT_DEVTOOLS_EXTENSION_ID);
		const resolvedPath = resolveExtensionVersionPath(extensionRoot);
		if (resolvedPath) return resolvedPath;
	}

	return null;
}

async function loadReactDevTools(): Promise<void> {
	if (env.NODE_ENV !== "development") return;

	const extensionPath = resolveReactDevToolsPath();
	if (!extensionPath) {
		console.warn(
			"[main] React DevTools extension not found. Install it in Chrome, or set ELECTRON_REACT_DEVTOOLS_PATH.",
		);
		return;
	}

	const targets = [
		{ label: "default", ses: session.defaultSession },
		{ label: APP_PARTITION, ses: session.fromPartition(APP_PARTITION) },
	];

	for (const { label, ses } of targets) {
		if (ses.getExtension(REACT_DEVTOOLS_EXTENSION_ID)) continue;

		try {
			const extension = await ses.loadExtension(extensionPath, {
				allowFileAccess: true,
			});
			console.log(
				`[main] React DevTools loaded in ${label} session (v${extension.version})`,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message.includes("already loaded")) continue;
			console.error(
				`[main] Failed to load React DevTools in ${label} session:`,
				error,
			);
		}
	}
}

export async function makeAppSetup(
	createWindow: () => Promise<BrowserWindow>,
	restoreWindows?: () => Promise<void>,
) {
	await loadReactDevTools();

	// Restore windows from previous session if available
	if (restoreWindows) {
		await restoreWindows();
	}

	// If no windows were restored, create a new one
	const existingWindows = BrowserWindow.getAllWindows();
	let window: BrowserWindow;
	if (existingWindows.length > 0) {
		window = existingWindows[0];
	} else {
		window = await createWindow();
	}

	app.on("activate", async () => {
		const windows = BrowserWindow.getAllWindows();

		if (!windows.length) {
			window = await createWindow();
		} else {
			for (window of windows.reverse()) {
				window.restore();
			}
		}
	});

	app.on("web-contents-created", (_, contents) => {
		if (contents.getType() === "webview") return;
		contents.on("will-navigate", (event, url) => {
			// Always prevent in-app navigation for external URLs
			if (url.startsWith("http://") || url.startsWith("https://")) {
				event.preventDefault();
				shell.openExternal(url);
			}
		});
	});

	app.on("window-all-closed", () => !PLATFORM.IS_MAC && app.quit());
	app.on("before-quit", () => {});

	return window;
}

PLATFORM.IS_LINUX && app.disableHardwareAcceleration();

// macOS Sequoia+: occluded window throttling can corrupt GPU compositor layers
if (PLATFORM.IS_MAC) {
	app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
}

PLATFORM.IS_WINDOWS &&
	app.setAppUserModelId(
		env.NODE_ENV === "development" ? process.execPath : makeAppId(),
	);

app.commandLine.appendSwitch("force-color-profile", "srgb");

// Enable CDP for browser DevTools and desktop automation MCP
const cdpPort = String(process.env.DESKTOP_AUTOMATION_PORT || 41729);
app.commandLine.appendSwitch("remote-debugging-port", cdpPort);
app.commandLine.appendSwitch("remote-allow-origins", "*");
