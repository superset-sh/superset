interface Project {
	projectKey: string;
	repoOwner: string | null;
	repoName: string | null;
}

export function getPullRequestTarget(
	url: string,
	projects: readonly Project[],
) {
	const match = url.match(
		/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/([1-9]\d*)(?:[/?#].*)?$/i,
	);
	if (!match) return null;
	const [, owner, repo, prNumber] = match;
	if (!Number.isSafeInteger(Number(prNumber))) return null;
	const project = projects.find(
		(candidate) =>
			candidate.repoOwner?.toLowerCase() === owner.toLowerCase() &&
			candidate.repoName?.toLowerCase() === repo.toLowerCase(),
	);
	return project ? { projectId: project.projectKey, prNumber } : null;
}
