import {
	type PullRequestRef,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";

interface Project {
	projectKey: string;
	hostId?: string;
	repoOwner: string | null;
	repoName: string | null;
	provider?: "github" | "gitlab";
	instance?: string | null;
}

/**
 * The pull request a GitHub URL points at, and the project that has its
 * repository checked out when one does. A pane needs only the ref; the
 * project-scoped Pull requests screen needs the project.
 */
export function getPullRequestTarget(
	url: string,
	projects: readonly Project[],
): { ref: PullRequestRef; projectId: string | null; hostId?: string } | null {
	const ref = pullRequestRefFromUrl(url);
	if (!ref) return null;
	const segments = (ref.repoPath ?? ref.repoFullName).split("/");
	const name = segments.pop();
	const owner = segments.join("/");
	const project = projects.find(
		(candidate) =>
			(candidate.provider ?? "github") === (ref.provider ?? "github") &&
			(candidate.instance ?? "https://github.com").toLowerCase() ===
				(ref.instance ?? "https://github.com").toLowerCase() &&
			candidate.repoOwner?.toLowerCase() === owner?.toLowerCase() &&
			candidate.repoName?.toLowerCase() === name?.toLowerCase(),
	);
	return {
		ref,
		projectId: project?.projectKey ?? null,
		...(project?.hostId ? { hostId: project.hostId } : {}),
	};
}
