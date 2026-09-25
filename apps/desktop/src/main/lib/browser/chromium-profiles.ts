import { existsSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * A Chromium-family browser installed on this machine, identified by the
 * user-data directory that holds its profiles.
 */
export interface ChromiumBrowser {
	/** Stable key, e.g. "chrome", "brave". */
	key: string;
	/** Human-readable name shown in the UI, e.g. "Google Chrome". */
	name: string;
	/** Absolute path to the browser's user-data directory. */
	userDataDir: string;
}

/**
 * One profile inside a Chromium browser (e.g. "Default", "Profile 1"), along
 * with the display name Chrome stored for it.
 */
export interface ChromiumProfile {
	browser: ChromiumBrowser;
	/** On-disk directory name, e.g. "Default" or "Profile 1". */
	directoryName: string;
	/** Display name from Chrome's Local State, falling back to the dir name. */
	displayName: string;
	/** Absolute path to the profile directory. */
	profileDir: string;
}

interface BrowserLocation {
	key: string;
	name: string;
	/** Path relative to the user's home directory. */
	relativePath: string;
}

export function browserLocations(platform: NodeJS.Platform): BrowserLocation[] {
	if (platform === "darwin") {
		const base = "Library/Application Support";
		return [
			{
				key: "chrome",
				name: "Google Chrome",
				relativePath: `${base}/Google/Chrome`,
			},
			{
				key: "chrome-beta",
				name: "Chrome Beta",
				relativePath: `${base}/Google/Chrome Beta`,
			},
			{
				key: "chrome-canary",
				name: "Chrome Canary",
				relativePath: `${base}/Google/Chrome Canary`,
			},
			{ key: "chromium", name: "Chromium", relativePath: `${base}/Chromium` },
			{
				key: "edge",
				name: "Microsoft Edge",
				relativePath: `${base}/Microsoft Edge`,
			},
			{
				key: "brave",
				name: "Brave",
				relativePath: `${base}/BraveSoftware/Brave-Browser`,
			},
			{ key: "arc", name: "Arc", relativePath: `${base}/Arc/User Data` },
			{ key: "dia", name: "Dia", relativePath: `${base}/Dia/User Data` },
			{ key: "comet", name: "Comet", relativePath: `${base}/Comet` },
		];
	}

	if (platform === "win32") {
		const localAppData = process.env.LOCALAPPDATA;
		if (!localAppData) return [];
		// On Windows these are anchored to LOCALAPPDATA rather than home.
		const rel = (p: string) =>
			path.relative(os.homedir(), path.join(localAppData, p));
		return [
			{
				key: "chrome",
				name: "Google Chrome",
				relativePath: rel("Google/Chrome/User Data"),
			},
			{
				key: "chrome-beta",
				name: "Chrome Beta",
				relativePath: rel("Google/Chrome Beta/User Data"),
			},
			{
				key: "chrome-canary",
				name: "Chrome Canary",
				relativePath: rel("Google/Chrome SxS/User Data"),
			},
			{
				key: "chromium",
				name: "Chromium",
				relativePath: rel("Chromium/User Data"),
			},
			{
				key: "edge",
				name: "Microsoft Edge",
				relativePath: rel("Microsoft/Edge/User Data"),
			},
			{
				key: "brave",
				name: "Brave",
				relativePath: rel("BraveSoftware/Brave-Browser/User Data"),
			},
			{ key: "arc", name: "Arc", relativePath: rel("Arc/User Data") },
			{
				key: "comet",
				name: "Comet",
				relativePath: rel("Perplexity/Comet/User Data"),
			},
		];
	}

	return [
		{
			key: "chrome",
			name: "Google Chrome",
			relativePath: ".config/google-chrome",
		},
		{
			key: "chrome-beta",
			name: "Chrome Beta",
			relativePath: ".config/google-chrome-beta",
		},
		{
			key: "chrome-canary",
			name: "Chrome Canary",
			relativePath: ".config/google-chrome-canary",
		},
		{ key: "chromium", name: "Chromium", relativePath: ".config/chromium" },
		{
			key: "edge",
			name: "Microsoft Edge",
			relativePath: ".config/microsoft-edge",
		},
		{
			key: "brave",
			name: "Brave",
			relativePath: ".config/BraveSoftware/Brave-Browser",
		},
	];
}

/**
 * User-data directories for every Chromium-family browser we know about, on the
 * current platform. Paths are returned whether or not they exist on disk.
 */
export function getChromiumUserDataDirs(
	homeDir: string = os.homedir(),
): string[] {
	return browserLocations(process.platform).map((location) =>
		path.join(homeDir, location.relativePath),
	);
}

/**
 * Chromium-family browsers whose user-data directory actually exists on disk.
 */
export function getInstalledChromiumBrowsers(
	homeDir: string = os.homedir(),
): ChromiumBrowser[] {
	return browserLocations(process.platform)
		.map((location) => ({
			key: location.key,
			name: location.name,
			userDataDir: path.join(homeDir, location.relativePath),
		}))
		.filter((browser) => existsSync(browser.userDataDir));
}

/** Chrome's built-in non-user profiles, which we never offer for import. */
const EXCLUDED_PROFILE_DIRS = new Set(["System Profile", "Guest Profile"]);

function safeReadDirNames(pathname: string): string[] {
	try {
		return readdirSync(pathname, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return [];
	}
}

/**
 * Reads Chrome's `Local State` to map profile directory names to the display
 * names the user set (e.g. "Profile 1" -> "Work"). Returns an empty map when
 * the file is missing or unparseable.
 */
function readProfileDisplayNames(userDataDir: string): Map<string, string> {
	const names = new Map<string, string>();
	try {
		const raw = readFileSync(path.join(userDataDir, "Local State"), "utf8");
		const parsed = JSON.parse(raw) as {
			profile?: { info_cache?: Record<string, { name?: string }> };
		};
		const cache = parsed.profile?.info_cache ?? {};
		for (const [dir, info] of Object.entries(cache)) {
			if (info?.name) names.set(dir, info.name);
		}
	} catch {
		// No Local State (or malformed) — callers fall back to the dir name.
	}
	return names;
}

/**
 * Lists the profiles inside a browser that have a `History` database on disk.
 * A profile directory is any subdirectory containing a `History` file, which is
 * how Chrome lays out both the "Default" profile and additional "Profile N"s.
 */
export function listProfilesWithHistory(
	browser: ChromiumBrowser,
): ChromiumProfile[] {
	if (!existsSync(browser.userDataDir)) return [];

	const displayNames = readProfileDisplayNames(browser.userDataDir);

	return (
		safeReadDirNames(browser.userDataDir)
			.filter((dirName) => !EXCLUDED_PROFILE_DIRS.has(dirName))
			.filter((dirName) =>
				existsSync(path.join(browser.userDataDir, dirName, "History")),
			)
			.map((dirName) => ({
				browser,
				directoryName: dirName,
				displayName: displayNames.get(dirName) ?? dirName,
				profileDir: path.join(browser.userDataDir, dirName),
			}))
			// Arc (and similar) mark internal profiles with a "__" display name.
			.filter((profile) => !profile.displayName.startsWith("__"))
	);
}

/**
 * Every importable profile across every installed Chromium browser.
 */
export function listAllChromiumProfiles(
	homeDir: string = os.homedir(),
): ChromiumProfile[] {
	return getInstalledChromiumBrowsers(homeDir).flatMap((browser) =>
		listProfilesWithHistory(browser),
	);
}

/**
 * True when a Chromium browser's user-data directory exists but its contents
 * can't be read — the signature of a macOS permission denial. Chrome's own data
 * dir is normally readable without Full Disk Access, so this is only a fallback
 * hint for the rare protected case.
 */
export function hasUnreadableChromiumBrowser(
	homeDir: string = os.homedir(),
): boolean {
	for (const browser of getInstalledChromiumBrowsers(homeDir)) {
		try {
			readdirSync(browser.userDataDir);
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === "EPERM" || code === "EACCES") return true;
		}
	}
	return false;
}
