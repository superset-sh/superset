import { rm } from "node:fs/promises";
import path from "node:path";
import {
	devAppProfileDirName,
	isDevAppProfileDirName,
	isProfileLockHeld,
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
	/**
	 * Defaults to the real `appData` path, so a test that drives a delete with
	 * a plausible workspace name would reap a developer's actual profile.
	 * Every test touching this path must pass a temp directory.
	 */
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

		const target = path.join(appDataDir, dirName);
		// Deleting the workspace the running dev app was launched from would
		// pull userData out from under its live windows. Leave it; once that
		// app exits, the startup sweep reclaims the directory.
		if (isProfileLockHeld(target)) {
			console.warn(
				"[workspace-cleanup] Dev app profile still in use, leaving it:",
				target,
			);
			return;
		}
		await rm(target, { recursive: true, force: true });
	} catch (error) {
		console.warn(
			"[teardown] Failed to remove dev app profile for workspace",
			workspaceName,
			error,
		);
	}
}
