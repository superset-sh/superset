import type { UnverifiedTagFolderReason } from "renderer/routes/_authenticated/utils/workspaceTagFolders";

export interface EmptySidebarFolder {
	scope: string;
	/** Null for the Sessions lane. */
	projectId: string | null;
	projectName: string | null;
	tag: string;
	name: string;
}

export interface FailedSidebarFolder extends EmptySidebarFolder {
	error: string;
}

/**
 * `organizationChanged`: the window switched organization while the prune
 * ran. `noLongerEmpty`: while the prune ran, a workspace took the folder's
 * tag or the folder was hidden.
 */
export type SidebarFolderSkipReason =
	| UnverifiedTagFolderReason
	| "organizationChanged"
	| "noLongerEmpty";

export interface SkippedSidebarFolder extends EmptySidebarFolder {
	reason: SidebarFolderSkipReason;
}

export interface RemoveEmptySidebarFoldersResult {
	/** Removed, or on a dry run the folders that would be. */
	removed: EmptySidebarFolder[];
	/** Looked empty, but could not be removed safely; `reason` says why. */
	skipped: SkippedSidebarFolder[];
	failed: FailedSidebarFolder[];
}

export interface RemoveEmptySidebarFoldersOptions {
	projectId?: string;
	dryRun?: boolean;
}

/** One folder, with every stored row that carries its (scope, tag). */
export interface FolderGroup {
	folder: EmptySidebarFolder;
	sectionIds: string[];
}
