export interface PullRequestProject {
	id: string;
	projectKey?: string;
	repoOwner?: string | null;
	repoName?: string | null;
}

export function resolvePullRequestTarget({
	projectId,
	repoFullName,
	projects,
}: {
	projectId: string | null;
	repoFullName?: string | null;
	projects: readonly PullRequestProject[];
}) {
	const project = projects.find(
		(candidate) =>
			candidate.id === projectId || candidate.projectKey === projectId,
	);
	const projectRepo =
		project?.repoOwner && project.repoName
			? `${project.repoOwner}/${project.repoName}`
			: null;
	const repository = repoFullName ?? projectRepo;
	const matches =
		!!projectRepo && projectRepo.toLowerCase() === repository?.toLowerCase();
	return {
		repoFullName: repository,
		projectId: project && (!repoFullName || matches) ? projectId : null,
	};
}
