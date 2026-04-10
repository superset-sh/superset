import type { AppRouter } from "@superset/host-service";
import type { inferRouterOutputs } from "@trpc/server";
import { useMemo } from "react";

type GitStatusData = inferRouterOutputs<AppRouter>["git"]["getStatus"];
type ChangedFile = GitStatusData["againstBase"][number];
export type FileStatus = ChangedFile["status"];

export interface UseGitStatusMapResult {
	/** Changed files keyed by repo-relative POSIX path. */
	fileStatusByPath: Map<string, FileStatus>;
	/**
	 * Folder decoration status keyed by repo-relative POSIX path. For each
	 * folder that (transitively) contains a changed file, the value is the
	 * highest-severity status among its descendants — used to color the
	 * roll-up dot in the file tree.
	 */
	folderStatusByPath: Map<string, FileStatus>;
	/** Repo-relative POSIX paths reported as gitignored, normalized. */
	ignoredPaths: Set<string>;
}

/**
 * Status severity used when rolling up a folder's decoration from its
 * descendants — the folder takes the "worst" status under it.
 */
const STATUS_SEVERITY: Record<FileStatus, number> = {
	deleted: 5,
	modified: 4,
	changed: 4,
	added: 3,
	untracked: 2,
	renamed: 1,
	copied: 0,
};

function emptyResult(): UseGitStatusMapResult {
	return {
		fileStatusByPath: new Map(),
		folderStatusByPath: new Map(),
		ignoredPaths: new Set(),
	};
}

/**
 * Pure derivation over `git.getStatus` data. Returns lookup maps for
 * decorating the file tree with git status + gitignored muting.
 */
export function useGitStatusMap(
	status: GitStatusData | undefined,
): UseGitStatusMapResult {
	return useMemo(() => {
		if (!status) return emptyResult();

		// Union of all changes — later writes win so uncommitted state
		// overrides committed state. Same pattern as useChangesTab's "all" filter.
		const fileStatusByPath = new Map<string, FileStatus>();
		for (const file of status.againstBase) {
			fileStatusByPath.set(normalizePath(file.path), file.status);
		}
		for (const file of status.staged) {
			fileStatusByPath.set(normalizePath(file.path), file.status);
		}
		for (const file of status.unstaged) {
			fileStatusByPath.set(normalizePath(file.path), file.status);
		}

		const folderStatusByPath = new Map<string, FileStatus>();
		for (const [path, fileStatus] of fileStatusByPath) {
			// Deleted files don't appear in the tree, so propagating a dot to
			// ancestor folders is misleading — users expand the folder expecting
			// to find something but there's nothing there.
			if (fileStatus === "deleted") continue;

			const segments = path.split("/");
			for (let i = 1; i < segments.length; i++) {
				const ancestor = segments.slice(0, i).join("/");
				const existing = folderStatusByPath.get(ancestor);
				if (
					!existing ||
					STATUS_SEVERITY[fileStatus] > STATUS_SEVERITY[existing]
				) {
					folderStatusByPath.set(ancestor, fileStatus);
				}
			}
		}

		const ignoredPaths = new Set<string>();
		for (const entry of status.ignoredPaths) {
			ignoredPaths.add(normalizePath(entry).replace(/\/$/, ""));
		}

		return {
			fileStatusByPath,
			folderStatusByPath,
			ignoredPaths,
		};
	}, [status]);
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, "/");
}
