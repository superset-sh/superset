import { parseRepositoryRemote } from "@superset/shared/source-control";

export interface PullRequestRef {
	repoFullName: string;
	number: number;
	provider?: "github" | "gitlab";
	instance?: string;
	repoPath?: string;
}

export function pullRequestRefFromUrl(url: string): PullRequestRef | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	const gitlabMatch = /^(.+)\/-\/merge_requests\/(\d+)(?:\/|$)/.exec(
		parsed.pathname,
	);
	const githubMatch = /^\/([^/]+\/[^/]+)\/pull\/(\d+)(?:\/|$)/.exec(
		parsed.pathname,
	);
	const match = gitlabMatch ?? githubMatch;
	if (!match?.[1] || !match[2]) return null;
	const repo = parseRepositoryRemote(
		`${parsed.origin}/${match[1].replace(/^\//, "")}`,
		{
			gitlabHosts: gitlabMatch ? [parsed.origin] : [],
		},
	);
	if (!repo || repo.provider !== (gitlabMatch ? "gitlab" : "github"))
		return null;
	return {
		repoFullName: repo.repoPath,
		number: Number(match[2]),
		provider: repo.provider,
		instance: repo.instance,
		repoPath: repo.repoPath,
	};
}

export function isSamePullRequest(
	left: PullRequestRef,
	right: PullRequestRef,
): boolean {
	return (
		left.number === right.number &&
		(left.provider ?? "github") === (right.provider ?? "github") &&
		(left.instance ?? "https://github.com").toLowerCase() ===
			(right.instance ?? "https://github.com").toLowerCase() &&
		(left.repoPath ?? left.repoFullName).toLowerCase() ===
			(right.repoPath ?? right.repoFullName).toLowerCase()
	);
}
