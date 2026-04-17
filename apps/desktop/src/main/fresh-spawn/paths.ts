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
 * is where __dirname of any main-process module points at runtime). When
 * the main bundle is packaged into app.asar, fresh-exec.js needs to be
 * asarUnpack'd so zsh can `source` / `exec` it — but the path resolution
 * stays the same because __dirname inside asar still points at the
 * unpacked copy for files listed in asarUnpack.
 *
 * @param mainDir - Directory containing fresh-exec.js, typically __dirname
 *   of the caller. Pass something like `path.join(__dirname, "fresh-spawn")`
 *   when caller lives at `dist/main/...`.
 */
export function resolveFreshExecBinaryPath(mainDir: string): string | null {
	const candidate = path.join(mainDir, "fresh-exec.js");
	try {
		return fs.existsSync(candidate) ? candidate : null;
	} catch {
		return null;
	}
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
