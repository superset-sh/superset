/**
 * Path resolvers for fresh-exec binary and zsh shell hook.
 *
 * These are pure functions (no electron import) so they can be unit-tested
 * without mocking. Callers pass the directories to search; in the real
 * Electron main process those come from __dirname + process.resourcesPath +
 * app.getAppPath(). In tests, callers pass tmpdirs.
 *
 * Both resolvers return null when no candidate exists on disk. That
 * matches the gating behaviour in env.ts: if either path is missing, the
 * SUPERSET_FRESH_EXEC_* env vars are not set, and the shell hook stays
 * inert.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Resolve the fresh-exec.js binary path.
 *
 * Rollup emits fresh-exec.js into the same directory as index.js (which
 * is where __dirname of any main-process module points at runtime).
 *
 * Packaging wrinkle: when the main bundle is packaged into app.asar,
 * fresh-exec.js is listed under `asarUnpack` so it physically lives at
 * `.../app.asar.unpacked/dist/main/fresh-exec.js`. Electron patches
 * `fs.existsSync` inside the main process to transparently read through
 * app.asar, so the asar-interior path looks valid from here — but the
 * zsh hook consumes this string via an **external** process (`[[ -x
 * "$SUPERSET_FRESH_EXEC_BIN" ]]`), which sees the real filesystem only
 * and fails on the asar-interior path. The feature would silently
 * never activate in packaged builds.
 *
 * Probe order below: prefer the asar.unpacked twin if our candidate
 * lives inside an app.asar path, then fall back to the candidate
 * itself (dev mode + non-packaged test harnesses).
 *
 * @param mainDir - Directory containing fresh-exec.js, typically __dirname
 *   of the caller. Pass something like `path.join(__dirname, "fresh-spawn")`
 *   when caller lives at `dist/main/...`.
 */
export function resolveFreshExecBinaryPath(mainDir: string): string | null {
	const candidate = path.join(mainDir, "fresh-exec.js");
	const asarInside = `${path.sep}app.asar${path.sep}`;
	const asarUnpacked = `${path.sep}app.asar.unpacked${path.sep}`;
	const probes = candidate.includes(asarInside)
		? [candidate.replace(asarInside, asarUnpacked), candidate]
		: [candidate];

	for (const probe of probes) {
		try {
			if (fs.existsSync(probe)) return probe;
		} catch {
			// Probe failures are non-fatal; continue.
		}
	}
	return null;
}

/**
 * Resolve the zsh-fresh-exec.zsh hook path by probing a list of
 * candidate directories in priority order.
 *
 * Packaged app layout:
 *   process.resourcesPath/resources/shell-hooks/zsh-fresh-exec.zsh
 * Dev mode layout:
 *   <appPath>/dist/resources/shell-hooks/zsh-fresh-exec.zsh
 *   <appPath>/src/resources/shell-hooks/zsh-fresh-exec.zsh
 *
 * @param searchDirs - Directories to probe. The first existing
 *   candidate wins. Callers should pass most-specific first.
 */
export function resolveFreshExecHookPath(
	searchDirs: readonly string[],
): string | null {
	for (const dir of searchDirs) {
		if (!dir) continue;
		const candidate = path.join(dir, "shell-hooks", "zsh-fresh-exec.zsh");
		try {
			if (fs.existsSync(candidate)) return candidate;
		} catch {
			// Probe failures are non-fatal; continue.
		}
	}
	return null;
}
