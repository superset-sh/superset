import type { Dirent } from "node:fs";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, session } from "electron";
import { env } from "main/env.main";

const APP_PARTITION = "persist:superset";
const REACT_DEVTOOLS_EXTENSION_ID = "fmkadmapgofadopljbjfkapdkoienihi";

function safeReadDir(pathname: string): string[] {
	try {
		return readdirSync(pathname);
	} catch {
		return [];
	}
}

function safeReadDirents(pathname: string): Dirent[] {
	try {
		return readdirSync(pathname, { withFileTypes: true });
	} catch {
		return [];
	}
}

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

	const versionDirs = safeReadDirents(basePath)
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

		const profileEntries = safeReadDirents(userDataDir);
		for (const profileEntry of profileEntries) {
			if (!profileEntry.isDirectory()) continue;

			const extensionsDir = path.join(
				userDataDir,
				profileEntry.name,
				"Extensions",
			);
			if (existsSync(extensionsDir)) roots.push(extensionsDir);
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

	// Fallback to common legacy path patterns for profiles that use
	// non-standard folder layouts.
	for (const userDataDir of getChromiumUserDataDirs()) {
		if (!existsSync(userDataDir)) continue;

		for (const profileName of safeReadDir(userDataDir)) {
			const extensionRoot = path.join(
				userDataDir,
				profileName,
				"Extensions",
				REACT_DEVTOOLS_EXTENSION_ID,
			);
			const resolvedPath = resolveExtensionVersionPath(extensionRoot);
			if (resolvedPath) return resolvedPath;
		}
	}

	return null;
}

function resolveWebviewExtensionPath(): string | null {
	const candidates = app.isPackaged
		? [path.join(process.resourcesPath, "browser-extension")]
		: [
				path.join(process.cwd(), "src/resources/browser-extension"),
				path.join(process.cwd(), "dist/resources/browser-extension"),
				path.resolve(__dirname, "../../../../src/resources/browser-extension"),
				path.resolve(__dirname, "../../../resources/browser-extension"),
			];

	for (const candidate of candidates) {
		if (existsSync(path.join(candidate, "manifest.json"))) return candidate;
	}

	return null;
}

export async function loadReactDevToolsExtension(): Promise<void> {
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
		if (ses.extensions.getExtension(REACT_DEVTOOLS_EXTENSION_ID)) continue;

		try {
			const extension = await ses.extensions.loadExtension(extensionPath, {
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

export async function loadWebviewBrowserExtension(): Promise<void> {
	const extensionPath = resolveWebviewExtensionPath();
	if (!extensionPath) {
		console.warn(
			"[main] Browser extension not found; skipping webview extension load",
		);
		return;
	}

	try {
		await session
			.fromPartition(APP_PARTITION)
			.extensions.loadExtension(extensionPath);
		console.log("[main] Browser extension loaded");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes("already loaded")) return;
		console.error("[main] Failed to load browser extension:", error);
	}
}
