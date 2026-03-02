#!/usr/bin/env bun
/**
 * Cleans up stale Launch Services registrations from deleted/invalid worktrees.
 *
 * Over time, `lsregister` accumulates entries for Electron.app bundles under
 * ~/.superset/worktrees/ that no longer exist (worktree deleted, node_modules
 * cleaned). These stale entries cause macOS to route deep links to the wrong
 * (or non-existent) Electron binary.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

if (process.platform !== "darwin") {
	process.exit(0);
}

if (process.env.NODE_ENV !== "development") {
	console.log("[clean-launch-services] Skipping - non-development mode");
	process.exit(0);
}

const LSREGISTER =
	"/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
const WORKTREE_BASE = resolve(homedir(), ".superset/worktrees");

const currentElectronApp = resolve(
	import.meta.dirname,
	"../node_modules/electron/dist/Electron.app",
);

try {
	const dump = execFileSync(LSREGISTER, ["-dump"], {
		encoding: "utf-8",
		maxBuffer: 50 * 1024 * 1024, // 50 MB — lsregister dump can be large
	});

	const pathRegex = /^\s*path:\s*(.+Electron\.app)\s*$/gm;
	const staleApps = new Set<string>();

	for (const match of dump.matchAll(pathRegex)) {
		const appPath = match[1].trim();
		if (!appPath.startsWith(WORKTREE_BASE)) continue;
		if (appPath === currentElectronApp) continue;
		if (!existsSync(appPath)) {
			staleApps.add(appPath);
		}
	}

	if (staleApps.size === 0) {
		console.log("[clean-launch-services] No stale registrations found");
		process.exit(0);
	}

	for (const appPath of staleApps) {
		try {
			execFileSync(LSREGISTER, ["-u", appPath], { stdio: "ignore" });
			console.log(`[clean-launch-services] Unregistered: ${appPath}`);
		} catch {
			// Best-effort — lsregister -u can fail for already-removed entries
		}
	}

	console.log(
		`[clean-launch-services] Cleaned ${staleApps.size} stale registration(s)`,
	);
} catch (err) {
	// Non-fatal — don't block dev startup if cleanup fails
	console.warn("[clean-launch-services] Failed to clean:", err);
}
