import type { LinkedIssue } from "renderer/stores/new-workspace-draft";

export function issueContextKey(
	issue: LinkedIssue,
	context: { projectId?: string | null; hostId?: string | null } = {},
): string {
	return [
		"repository-issue",
		issue.source ?? "github",
		issue.hostId ?? context.hostId ?? "",
		issue.projectId ?? context.projectId ?? "",
		issue.instance ?? "",
		issue.repoPath ?? "",
		issue.url ?? "",
		issue.number ?? "",
	].join("\0");
}
