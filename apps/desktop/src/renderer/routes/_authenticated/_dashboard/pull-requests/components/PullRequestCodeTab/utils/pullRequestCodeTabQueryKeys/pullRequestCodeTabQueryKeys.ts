interface PullRequestCodeTabKeyInput {
	projectId: string | null;
	hostUrl: string;
	prNumber: number;
}

export function pullRequestDiffQueryKey({
	organizationId,
	repoFullName,
	projectId,
	hostUrl,
	prNumber,
}: PullRequestCodeTabKeyInput & {
	organizationId: string | null;
	repoFullName: string | null;
}) {
	return [
		"pull-request-diff",
		organizationId,
		repoFullName,
		projectId,
		hostUrl,
		prNumber,
	] as const;
}

export function pullRequestThreadsQueryKey({
	projectId,
	hostUrl,
	prNumber,
}: PullRequestCodeTabKeyInput) {
	return ["pull-request-threads", projectId, hostUrl, prNumber] as const;
}
