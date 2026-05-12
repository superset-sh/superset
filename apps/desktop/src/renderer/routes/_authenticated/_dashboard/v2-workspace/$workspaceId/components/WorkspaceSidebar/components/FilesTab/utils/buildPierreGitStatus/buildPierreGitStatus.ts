import type { FileStatus } from "renderer/hooks/host-service/useGitStatusMap";
import {
	FILE_STATUS_TO_PIERRE,
	type PierreGitStatusEntry,
} from "renderer/lib/pierreTree";

/**
 * Flatten the per-path git-status maps into the entry list `@pierre/trees`
 * consumes. Folder rollups get a trailing slash so Pierre matches them against
 * directory rows (its canonical directory path form); tinting the folder row
 * text uses the same `--trees-status-*` color as files. Ignored paths have no
 * per-file status of their own, so they're tagged `ignored` directly.
 */
export function buildPierreGitStatus(
	fileStatusByPath: Map<string, FileStatus>,
	folderStatusByPath: Map<string, FileStatus>,
	ignoredPaths: Set<string>,
): PierreGitStatusEntry[] {
	const entries: PierreGitStatusEntry[] = [];
	for (const [path, status] of fileStatusByPath) {
		entries.push({ path, status: FILE_STATUS_TO_PIERRE[status] });
	}
	for (const [path, status] of folderStatusByPath) {
		entries.push({ path: `${path}/`, status: FILE_STATUS_TO_PIERRE[status] });
	}
	for (const path of ignoredPaths) {
		entries.push({ path, status: "ignored" });
	}
	return entries;
}
