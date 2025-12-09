import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Resolves a cwd path against a base worktree path.
 *
 * - Absolute paths (starting with `/`) are returned as-is if they exist, otherwise falls back to worktreePath
 * - Relative paths (e.g., `apps/desktop`, `./apps/desktop`) are resolved against the worktree
 * - If the resolved path doesn't exist, falls back to worktreePath
 * - If no cwdOverride is provided, returns the worktreePath
 * - If worktreePath is undefined and cwdOverride is relative, returns the cwdOverride as-is
 */
export function resolveCwd(
	cwdOverride: string | undefined,
	worktreePath: string | undefined,
): string | undefined {
	if (!cwdOverride) {
		return worktreePath;
	}

	// Absolute path - use if exists, otherwise fall back to worktreePath
	if (cwdOverride.startsWith("/")) {
		if (existsSync(cwdOverride)) {
			return cwdOverride;
		}
		return worktreePath ?? cwdOverride;
	}

	// No worktree path to resolve against - return as-is
	if (!worktreePath) {
		return cwdOverride;
	}

	// Relative path - resolve against worktree
	// Handles both "apps/foo" and "./apps/foo"
	const relativePath = cwdOverride.startsWith("./")
		? cwdOverride.slice(2)
		: cwdOverride;

	const resolvedPath = join(worktreePath, relativePath);

	// Fall back to worktreePath if resolved path doesn't exist
	if (!existsSync(resolvedPath)) {
		return worktreePath;
	}

	return resolvedPath;
}
