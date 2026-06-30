import { toAbsoluteWorkspacePath } from "shared/absolute-paths";

export interface FolderMenuPaths {
	/** Absolute path on disk, or undefined when the worktree path is unknown. */
	absolutePath?: string;
	/** Relative path for "Copy Relative Path"; omitted for the root folder. */
	relativePath?: string;
}

/**
 * Resolve the on-disk paths a folder row's context menu needs.
 *
 * The folders view groups files one level deep and includes a synthetic root
 * group keyed by the empty string. `toAbsoluteWorkspacePath(wt, "")` returns
 * `""` (it treats an empty `filePath` as a no-op), so the root group is handled
 * explicitly — its absolute path is the worktree root and it has no meaningful
 * relative path to copy. This mirrors v1's `FolderRow` (`isRoot ? worktreePath
 * : toAbsoluteWorkspacePath(...)`).
 */
export function resolveFolderMenuPaths(
	folderPath: string,
	worktreePath: string | undefined,
): FolderMenuPaths {
	if (!worktreePath) return {};
	if (folderPath === "") return { absolutePath: worktreePath };
	return {
		absolutePath: toAbsoluteWorkspacePath(worktreePath, folderPath),
		relativePath: folderPath,
	};
}
