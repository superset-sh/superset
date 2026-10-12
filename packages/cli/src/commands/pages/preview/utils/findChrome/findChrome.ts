import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ChromeSearch {
	env: Record<string, string | undefined>;
	platform: NodeJS.Platform;
	home: string;
	isExecutable: (path: string) => boolean;
	listDir: (dir: string) => string[];
	which: (command: string) => string | null;
}

const PATH_COMMANDS = [
	"google-chrome-stable",
	"google-chrome",
	"chromium",
	"chromium-browser",
];

const PLAYWRIGHT_BINARIES: Record<string, Record<string, string[]>> = {
	"chromium-": {
		darwin: [
			"chrome-mac/Chromium.app/Contents/MacOS/Chromium",
			"chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
		],
		linux: ["chrome-linux/chrome", "chrome-linux64/chrome"],
		win32: ["chrome-win/chrome.exe", "chrome-win64/chrome.exe"],
	},
	"chromium_headless_shell-": {
		darwin: [
			"chrome-mac/headless_shell",
			"chrome-headless-shell-mac-arm64/chrome-headless-shell",
			"chrome-headless-shell-mac-x64/chrome-headless-shell",
		],
		linux: [
			"chrome-linux/headless_shell",
			"chrome-headless-shell-linux64/chrome-headless-shell",
		],
		win32: [
			"chrome-win/headless_shell.exe",
			"chrome-headless-shell-win64/chrome-headless-shell.exe",
		],
	},
};

function playwrightRoot(search: ChromeSearch): string {
	if (search.env.PLAYWRIGHT_BROWSERS_PATH) {
		return search.env.PLAYWRIGHT_BROWSERS_PATH;
	}
	if (search.platform === "darwin") {
		return join(search.home, "Library/Caches/ms-playwright");
	}
	if (search.platform === "win32") {
		return join(
			search.env.LOCALAPPDATA ?? join(search.home, "AppData/Local"),
			"ms-playwright",
		);
	}
	return join(search.home, ".cache/ms-playwright");
}

function playwrightCandidates(search: ChromeSearch): string[] {
	const root = playwrightRoot(search);
	const revision = (dir: string) => Number(dir.split("-").pop()) || 0;
	const dirs = search.listDir(root).sort((a, b) => revision(b) - revision(a));
	return Object.entries(PLAYWRIGHT_BINARIES).flatMap(([prefix, byPlatform]) =>
		dirs
			.filter((dir) => dir.startsWith(prefix))
			.flatMap((dir) =>
				(byPlatform[search.platform] ?? []).map((binary) =>
					join(root, dir, binary),
				),
			),
	);
}

function systemCandidates(search: ChromeSearch): string[] {
	if (search.platform === "darwin") {
		const apps = [
			"Google Chrome.app/Contents/MacOS/Google Chrome",
			"Chromium.app/Contents/MacOS/Chromium",
			"Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
			"Brave Browser.app/Contents/MacOS/Brave Browser",
		];
		return ["/Applications", join(search.home, "Applications")].flatMap(
			(root) => apps.map((app) => join(root, app)),
		);
	}
	if (search.platform === "win32") {
		const roots = [
			search.env.PROGRAMFILES,
			search.env["PROGRAMFILES(X86)"],
			search.env.LOCALAPPDATA,
		].filter((root): root is string => Boolean(root));
		const apps = [
			"Google/Chrome/Application/chrome.exe",
			"Chromium/Application/chrome.exe",
			"Microsoft/Edge/Application/msedge.exe",
		];
		return roots.flatMap((root) => apps.map((app) => join(root, app)));
	}
	return [
		"/usr/bin/google-chrome-stable",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium-browser",
		"/usr/bin/chromium",
		"/usr/local/bin/chromium",
		"/snap/bin/chromium",
		"/opt/google/chrome/chrome",
	];
}

export function chromeCandidates(search: ChromeSearch): string[] {
	const override = search.env.SUPERSET_CHROME_PATH;
	if (override) return [override];
	return [
		...new Set([...playwrightCandidates(search), ...systemCandidates(search)]),
	];
}

export function findChrome(
	search: ChromeSearch = systemSearch(),
): string | null {
	const installed = chromeCandidates(search).find((path) =>
		search.isExecutable(path),
	);
	if (installed || search.env.SUPERSET_CHROME_PATH) return installed ?? null;
	for (const command of PATH_COMMANDS) {
		const found = search.which(command);
		if (found) return found;
	}
	return null;
}

function systemSearch(): ChromeSearch {
	return {
		env: process.env,
		platform: process.platform,
		home: homedir(),
		isExecutable: (path) => {
			const stat = statSync(path, { throwIfNoEntry: false });
			return Boolean(stat?.isFile() && stat.mode & 0o111);
		},
		which: (command) => Bun.which(command),
		listDir: (dir) => {
			try {
				return readdirSync(dir);
			} catch {
				return [];
			}
		},
	};
}
