interface RepositoryIssueKeyInput {
	provider: "github" | "gitlab";
	hostId?: string | null;
	projectId: string;
	instance?: string | null;
	repoPath?: string | null;
	issueNumber: number;
	url: string;
}

export function repositoryIssueKey(issue: RepositoryIssueKeyInput): string {
	return [
		issue.provider,
		issue.hostId ?? "",
		issue.projectId,
		issue.instance ?? "",
		issue.repoPath ?? "",
		issue.issueNumber,
		issue.url,
	].join("\0");
}
