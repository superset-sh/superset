import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Resolves a cwd path against a base worktree path.
 *
 * - Absolute paths (Unix `/...` or Windows `C:\...`, UNC `\\...`) are returned as-is if they exist
 * - Relative paths (e.g., `apps/desktop`, `./apps/desktop`) are resolved against the worktree
 * - If the resolved path doesn't exist, falls back to worktreePath
 * - If no cwdOverride is provided, returns the worktreePath
 * - Always validates that returned paths exist, falling back to os.homedir() as a last resort
 *
 * For remote workspaces (isRemote=true):
 * - Uses POSIX path semantics (forward slashes) regardless of local platform
 * - Skips existsSync checks since the path is on a remote server
 * - Assumes remote paths are valid since we can't verify them locally
 */
export function resolveCwd({
	cwdOverride,
	worktreePath,
	isRemote = false,
}: {
	cwdOverride?: string;
	worktreePath?: string;
	isRemote?: boolean;
}): string | undefined {
	// For remote workspaces, use POSIX path operations
	const pathModule = isRemote ? path.posix : path;

	// For remote paths, we can't check existence locally
	// For local paths, validate worktreePath exists
	const validWorktreePath = isRemote
		? worktreePath
		: worktreePath && existsSync(worktreePath)
			? worktreePath
			: undefined;

	if (!cwdOverride) {
		return validWorktreePath;
	}

	// Check if path is absolute
	// For remote (POSIX): starts with /
	// For local: use platform-specific isAbsolute
	const isAbsolutePath = isRemote
		? cwdOverride.startsWith("/")
		: pathModule.isAbsolute(cwdOverride);

	// Absolute path (Unix `/...`, Windows `C:\...`, UNC `\\...`) - use if exists, otherwise fall back
	if (isAbsolutePath) {
		// For remote paths, assume absolute paths are valid
		if (isRemote) {
			return cwdOverride;
		}
		if (existsSync(cwdOverride)) {
			return cwdOverride;
		}
		// Fall back to worktreePath if it exists, otherwise homedir
		return validWorktreePath ?? os.homedir();
	}

	// No valid worktree path to resolve against - can't resolve relative path
	if (!validWorktreePath) {
		return isRemote ? undefined : os.homedir();
	}

	// Relative path - resolve against worktree
	// Handles both "apps/foo" and "./apps/foo"
	const relativePath = cwdOverride.startsWith("./")
		? cwdOverride.slice(2)
		: cwdOverride;

	const resolvedPath = pathModule.join(validWorktreePath, relativePath);

	// For remote paths, assume resolved path is valid
	if (isRemote) {
		return resolvedPath;
	}

	// Fall back to worktreePath if resolved path doesn't exist
	if (!existsSync(resolvedPath)) {
		return validWorktreePath;
	}

	return resolvedPath;
}
