import fs from "node:fs";
import path from "node:path";
import {
	isDevAppProfileDirName,
	isProfileLockHeld,
	isStrandedDevAppProfile,
} from "@superset/shared/dev-app-profile";
import { app } from "electron";

const IS_DEV = process.env.NODE_ENV === "development";

/**
 * Dev builds rename the app to `Superset (<workspace name>)` so several
 * worktrees are distinguishable, which moves userData and mints a Chromium
 * profile per workspace — 89.3GB across 347 directories on one machine, none
 * of them ever removed.
 *
 * Workspace teardown now reaps the profile of a workspace deleted through the
 * app. This sweep catches everything else: worktrees removed by hand, deletes
 * that failed midway, and profiles minted by builds predating that step. What
 * counts as stranded (and how old is old enough) lives in
 * `@superset/shared/dev-app-profile` alongside the name derivation.
 *
 * Age alone does not prove a profile is idle, so a live Chromium lock vetoes
 * removal — see isProfileLockHeld.
 */
export function sweepDevAppProfiles(): void {
	// Packaged builds never rename themselves, so they have no per-workspace
	// profiles — and must never go looking for directories to delete.
	if (!IS_DEV) return;

	const userData = app.getPath("userData");
	const currentProfile = path.basename(userData);
	const profilesDir = path.dirname(userData);
	const now = Date.now();

	fs.readdir(profilesDir, (readError, names) => {
		if (readError) {
			console.warn("[main] dev app profile sweep failed:", readError);
			return;
		}
		// Name test first so the stats below touch only our own profiles rather
		// than every application's data directory.
		for (const name of names.filter(isDevAppProfileDirName)) {
			const target = path.join(profilesDir, name);
			fs.stat(target, (statError, stats) => {
				if (statError || !stats.isDirectory()) return;
				const stranded = isStrandedDevAppProfile({
					name,
					currentProfile,
					mtimeMs: stats.mtimeMs,
					now,
				});
				if (!stranded || isProfileLockHeld(target)) return;
				fs.rm(target, { recursive: true, force: true }, (rmError) => {
					if (rmError) {
						console.warn(
							"[main] dev app profile sweep failed:",
							target,
							rmError,
						);
					}
				});
			});
		}
	});
}
