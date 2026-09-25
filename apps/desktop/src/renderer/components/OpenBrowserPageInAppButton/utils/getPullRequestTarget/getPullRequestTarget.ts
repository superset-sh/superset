import {
	type PullRequestRef,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";

interface Project {
	projectKey: string;
	repoOwner: string | null;
	repoName: string | null;
}

/**
 * The pull request a GitHub URL points at, and the project that has its
 * repository checked out when one does. A pane needs only the ref; the
 * project-scoped Pull requests screen needs the project.
 */
export function getPullRequestTarget(
	url: string,
	projects: readonly Project[],
): { ref: PullRequestRef; projectId: string | null } | null {
	const ref = pullRequestRefFromUrl(url);
	if (!ref) return null;
	const [owner, name] = ref.repoFullName.split("/");
	const project = projects.find(
		(candidate) =>
			candidate.repoOwner?.toLowerCase() === owner?.toLowerCase() &&
			candidate.repoName?.toLowerCase() === name?.toLowerCase(),
	);
	return { ref, projectId: project?.projectKey ?? null };
}
