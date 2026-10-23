import { z } from "zod";

/** A CLI request to purge empty sidebar folders, served by a desktop window of `organizationId`. */
export const sidebarFolderPruneRequestSchema = z.object({
	organizationId: z.string().min(1),
	projectId: z.string().min(1).optional(),
	dryRun: z.boolean().optional(),
});

export type SidebarFolderPruneRequest = z.infer<
	typeof sidebarFolderPruneRequestSchema
>;

export interface SidebarFolder {
	/** Null for the Sessions lane. */
	projectId: string | null;
	projectName: string | null;
	tag: string;
	name: string;
}

/**
 * `unanswered`: a host or the cloud list has not answered, so the tag may
 * still be in use. `settingHostsUnknown`: not every host that keeps the
 * folder's settings is known yet. `organizationChanged`: the desktop window
 * switched organization while the prune ran. `noLongerEmpty`: while the
 * prune ran, a workspace took the folder's tag or the folder was hidden.
 */
export type SidebarFolderSkipReason =
	| "unanswered"
	| "settingHostsUnknown"
	| "organizationChanged"
	| "noLongerEmpty";

export interface SidebarFolderPruneResult {
	dryRun: boolean;
	/** Removed, or on a dry run the folders that would be. */
	removed: SidebarFolder[];
	/** Looked empty, but could not be removed safely yet. */
	skipped: (SidebarFolder & { reason: SidebarFolderSkipReason })[];
	failed: (SidebarFolder & { error: string })[];
}

export const SIDEBAR_REQUEST_ERROR_CODES = [
	"BAD_REQUEST",
	"PRECONDITION_FAILED",
] as const;
export type SidebarRequestErrorCode =
	(typeof SIDEBAR_REQUEST_ERROR_CODES)[number];
