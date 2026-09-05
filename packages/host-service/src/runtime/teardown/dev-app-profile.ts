import { rm } from "node:fs/promises";
import path from "node:path";
import {
	devAppProfileDirName,
	isDevAppProfileDirName,
	resolveAppDataDir,
} from "@superset/shared/dev-app-profile";

/**
 * Remove the desktop dev app profile this workspace minted, if any.
 *
 * A dev build renames itself `Superset (<workspace name>)`, which moves the
 * app's user-data directory and so gives every workspace its own Chromium
 * profile — hundreds of megabytes each, and nothing removed them when the
 * workspace went away. Packaged builds never rename themselves, so on a
 * machine that only runs installed Superset there is simply nothing to find.
 *
 * Best-effort by contract: everything here is swallowed, because nothing about
 * reclaiming disk may fail a workspace delete.
 */
export async function removeDevAppProfile({
	workspaceName,
	appDataDir = resolveAppDataDir(),
}: {
	workspaceName: string;
	/** Override for tests. Defaults to Electron's `appData` path. */
	appDataDir?: string;
}): Promise<void> {
	try {
		// Not just a type formality: rows written before the name column was
		// backfilled carry "" (and older callers, none), which would resolve to
		// the harmless-looking `Superset ()` — a profile no workspace minted.
		const name = typeof workspaceName === "string" ? workspaceName.trim() : "";
		if (!name) return;

		const dirName = devAppProfileDirName(name);
		// Guards against a name with a path separator escaping the profiles
		// directory, and against ever naming an installed build's profile.
		if (!isDevAppProfileDirName(dirName)) return;

		await rm(path.join(appDataDir, dirName), { recursive: true, force: true });
	} catch (error) {
		console.warn(
			"[teardown] Failed to remove dev app profile for workspace",
			workspaceName,
			error,
		);
	}
}
