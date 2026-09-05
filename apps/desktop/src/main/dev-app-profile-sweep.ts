import fs from "node:fs";
import path from "node:path";
import {
	isDevAppProfileDirName,
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
 * removal — see isProfileInUse.
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
				if (!stranded || isProfileInUse(target)) return;
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

/**
 * True when Chromium still holds this profile, so the sweep must leave it be.
 *
 * Age is not proof of idleness: an app running continuously past the threshold
 * would look stale, and reaping it would pull the profile out from under a
 * live window. Chromium's `SingletonLock` is a symlink to `<hostname>-<pid>`,
 * so the owning process can be probed directly.
 *
 * Fails closed on purpose. A lock we cannot parse means "in use", which at
 * worst strands one directory the teardown path still reaps on a real delete;
 * guessing the other way deletes someone's running profile.
 */
function isProfileInUse(profileDir: string): boolean {
	let target: string;
	try {
		target = fs.readlinkSync(path.join(profileDir, "SingletonLock"));
	} catch (error) {
		// ENOENT is the ordinary case: no lock, nobody home.
		return (error as NodeJS.ErrnoException).code !== "ENOENT";
	}

	const pid = Number(target.slice(target.lastIndexOf("-") + 1));
	if (!Number.isInteger(pid) || pid <= 0) return true;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM means the process is alive and simply not ours to signal.
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}
