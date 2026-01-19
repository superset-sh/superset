/**
 * File path normalization utilities for terminal link handling.
 */

export type NormalizedPath =
	| { type: "relative"; path: string }
	| { type: "absolute-outside-workspace"; path: string }
	| { type: "workspace-root" };

/**
 * Normalize an absolute path to a worktree-relative path for file viewer.
 * File viewer expects relative paths, but terminal links can be absolute.
 *
 * @param path - The file path from terminal link (may be absolute or relative)
 * @param workspaceCwd - The workspace root directory
 * @returns Normalized path info with type indicator
 */
export function normalizeFilePath(
	path: string,
	workspaceCwd: string,
): NormalizedPath {
	// Use path boundary check to avoid incorrect prefix stripping
	// e.g., /repo vs /repo-other should not match
	if (path === workspaceCwd) {
		return { type: "workspace-root" };
	}

	if (path.startsWith(`${workspaceCwd}/`)) {
		return {
			type: "relative",
			path: path.slice(workspaceCwd.length + 1),
		};
	}

	if (path.startsWith("/")) {
		// Absolute path outside workspace
		return { type: "absolute-outside-workspace", path };
	}

	// Already relative path
	return { type: "relative", path };
}
