import {
	sanitizeSegment,
	sanitizeUserBranchName,
} from "@superset/shared/workspace-launch";

/**
 * Branch name for a workspace created from a task. Prefers the external
 * provider's own branch name (Linear's `branchName`, synced into
 * `tasks.branch`) — using Linear's exact format makes the branch autolink
 * to the issue. Falls back to `<slug>-<title-slug>` for tasks without one.
 */
export function deriveBranchName({
	slug,
	title,
	branch,
}: {
	slug: string;
	title: string;
	branch?: string | null;
}): string {
	const externalBranch = branch?.trim()
		? sanitizeUserBranchName(branch.trim())
		: "";
	if (externalBranch) return externalBranch;

	const prefix = slug.toLowerCase();
	const titleSegment = sanitizeSegment(title, 40);
	return titleSegment ? `${prefix}-${titleSegment}` : prefix;
}
