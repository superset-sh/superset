import {
	type PullRequestRef,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";

interface Project {
	projectKey: string;
	repoOwner: string | null;
	repoName: string | null;
	repoUrl?: string | null;
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
	const project = projects.find(
		(candidate) =>
			`${candidate.repoOwner}/${candidate.repoName}`.toLowerCase() ===
				ref.repoFullName.toLowerCase() &&
			(candidate.repoUrl && URL.canParse(candidate.repoUrl)
				? new URL(candidate.repoUrl).host
				: "github.com") === (ref.host ?? "github.com"),
	);
	if (ref.host && !project) return null;
	return { ref, projectId: project?.projectKey ?? null };
}
