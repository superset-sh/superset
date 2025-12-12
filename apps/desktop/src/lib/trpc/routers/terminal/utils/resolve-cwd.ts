import { existsSync } from "node:fs";
import os from "node:os";
import { isAbsolute, join } from "node:path";

/**
 * Resolves a cwd path against a base worktree path.
 *
 * - Absolute paths (Unix `/...` or Windows `C:\...`, UNC `\\...`) are returned as-is if they exist
 * - Relative paths (e.g., `apps/desktop`, `./apps/desktop`) are resolved against the worktree
 * - If the resolved path doesn't exist, falls back to worktreePath
 * - If no cwdOverride is provided, returns the worktreePath
 * - Always validates that returned paths exist, falling back to os.homedir() as a last resort
 */
export function resolveCwd(
	cwdOverride: string | undefined,
	worktreePath: string | undefined,
): string | undefined {
	// Validate worktreePath exists if provided
	const validWorktreePath =
		worktreePath && existsSync(worktreePath) ? worktreePath : undefined;

	if (!cwdOverride) {
		return validWorktreePath;
	}

	// Absolute path (Unix `/...`, Windows `C:\...`, UNC `\\...`) - use if exists, otherwise fall back
	if (isAbsolute(cwdOverride)) {
		if (existsSync(cwdOverride)) {
			return cwdOverride;
		}
		// Fall back to worktreePath if it exists, otherwise homedir
		return validWorktreePath ?? os.homedir();
	}

	// No valid worktree path to resolve against - can't resolve relative path
	if (!validWorktreePath) {
		return os.homedir();
	}

	// Relative path - resolve against worktree
	// Handles both "apps/foo" and "./apps/foo"
	const relativePath = cwdOverride.startsWith("./")
		? cwdOverride.slice(2)
		: cwdOverride;

	const resolvedPath = join(validWorktreePath, relativePath);

	// Fall back to worktreePath if resolved path doesn't exist
	if (!existsSync(resolvedPath)) {
		return validWorktreePath;
	}

	return resolvedPath;
}
