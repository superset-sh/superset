import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Dev builds of the desktop app rename themselves to `Superset (<workspace
 * name>)` so several worktrees are distinguishable in the dock. Renaming an
 * Electron app also moves `app.getPath("userData")`, so every workspace the
 * dev app is launched from mints its own Chromium profile directory under the
 * platform's application-data path — a few hundred MB to ~1.8GB each, and
 * nothing ever removed them.
 *
 * This module is the single definition of that directory name so the desktop
 * (which creates the profiles) and host-service (which reaps them on workspace
 * delete) cannot drift on the format.
 */

/** `productName` in apps/desktop/package.json — what Electron names the app. */
const APP_NAME = "Superset";

/** Prefix shared by every per-workspace dev profile. */
const DEV_PROFILE_PREFIX = `${APP_NAME} (`;

/**
 * Profiles of installed builds. These are real user data — never reaped. They
 * cannot collide with the prefix above, but the check is explicit so a future
 * change to the naming can't silently make it possible.
 */
const INSTALLED_APP_PROFILE_DIR_NAMES = new Set([
	APP_NAME,
	`${APP_NAME} Dev`,
	`${APP_NAME} Canary`,
]);

/** The app name a dev build takes for `workspaceName`, and so its profile dir. */
export function devAppProfileDirName(workspaceName: string): string {
	return `${DEV_PROFILE_PREFIX}${workspaceName})`;
}

/**
 * True for a directory that is a per-workspace dev profile and safe to remove.
 *
 * Deliberately a prefix test rather than a `Superset (…)` shape test: workspace
 * names have carried newlines and stray characters, so profiles like
 * `Superset (satyapatel@host:~` exist on disk with no closing paren and are
 * just as stranded. The prefix alone can never match an installed build.
 */
export function isDevAppProfileDirName(name: string): boolean {
	if (INSTALLED_APP_PROFILE_DIR_NAMES.has(name)) return false;
	if (!name.startsWith(DEV_PROFILE_PREFIX)) return false;
	// Must stay one path segment: a workspace name carrying a separator (or a
	// `..`) would otherwise let a derived path escape the profiles directory.
	return (
		name === path.basename(name) && !name.includes("/") && !name.includes("\\")
	);
}

/**
 * Where Electron puts app profiles — the parent of `app.getPath("userData")`,
 * i.e. its `appData` path. Mirrors Electron's own per-platform resolution so
 * host-service, which has no Electron to ask, lands on the same directory.
 */
export function resolveAppDataDir({
	platform = process.platform,
	homeDir = os.homedir(),
	env = process.env,
}: {
	platform?: NodeJS.Platform;
	homeDir?: string;
	env?: Record<string, string | undefined>;
} = {}): string {
	switch (platform) {
		case "darwin":
			return path.join(homeDir, "Library", "Application Support");
		case "win32":
			// `||`, not `??`: an empty variable is unset, and letting "" through
			// would make the caller's path.join resolve relative to its cwd.
			return env.APPDATA || path.join(homeDir, "AppData", "Roaming");
		default:
			return env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
	}
}

/**
 * How long a profile must sit untouched before the desktop's startup sweep
 * counts it as stranded. Deliberately generous: a workspace left alone over a
 * holiday must still find its logins, window layout and caches when its dev
 * app comes back, and the cost of waiting is only disk.
 */
export const STALE_DEV_APP_PROFILE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * The startup sweep's decision. Lives here rather than in the sweep module so
 * it is testable without an Electron app to stand up.
 */
export function isStrandedDevAppProfile({
	name,
	currentProfile,
	mtimeMs,
	now,
}: {
	name: string;
	/** Directory name of the profile the running app is using. */
	currentProfile: string;
	mtimeMs: number;
	now: number;
}): boolean {
	if (name === currentProfile) return false;
	if (!isDevAppProfileDirName(name)) return false;
	return mtimeMs <= now - STALE_DEV_APP_PROFILE_MAX_AGE_MS;
}

/**
 * True when Chromium still holds this profile, so it must not be removed.
 *
 * Age is not proof of idleness, and neither is a delete request: deleting the
 * workspace whose profile the running dev app is using would pull `userData`
 * out from under live windows. Chromium's `SingletonLock` is a symlink to
 * `<hostname>-<pid>`, so the owning process can be probed directly.
 *
 * Fails closed on purpose. A lock that cannot be read or parsed counts as in
 * use, which at worst strands one directory a later delete still reaps;
 * guessing the other way corrupts someone's running profile.
 *
 * Windows writes `SingletonLock` as a plain lock file rather than a symlink,
 * so every existing lock reads as live there and only unlocked profiles are
 * reclaimed — the conservative direction.
 */
export function isProfileLockHeld(profileDir: string): boolean {
	let target: string;
	try {
		target = fs.readlinkSync(path.join(profileDir, "SingletonLock"));
	} catch (error) {
		// ENOENT is the ordinary case: no lock, nobody home.
		return (error as NodeJS.ErrnoException).code !== "ENOENT";
	}

	// Decimal only: Number() would read "0x10" as 16 and "1e3" as 1000, and
	// probing an invented pid breaks the fail-closed contract above.
	const separator = target.lastIndexOf("-");
	const pidText = separator < 0 ? "" : target.slice(separator + 1);
	if (!pidText || /\D/.test(pidText)) return true;
	const pid = Number(pidText);
	if (!Number.isInteger(pid) || pid <= 0) return true;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM means the process is alive and simply not ours to signal.
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}
