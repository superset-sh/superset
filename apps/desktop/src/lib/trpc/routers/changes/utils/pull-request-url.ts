export {
	type ParsedUpstreamRef,
	parseUpstreamRef,
} from "../../workspaces/utils/upstream-ref";

export interface PullRequestCompareUrlInput {
	baseRepoUrl: string;
	baseBranch: string;
	headRepoOwner: string;
	headBranch: string;
}

export function normalizeGitHubRepoUrl(remoteUrl: string): string | null {
	const trimmedRemoteUrl = remoteUrl.trim();
	const match = [
		/^git@github\.com:(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/,
		/^ssh:\/\/git@github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/,
		/^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?\/?$/,
	]
		.map((pattern) => pattern.exec(trimmedRemoteUrl))
		.find((result) => result?.groups?.owner && result.groups.repo);

	if (!match?.groups?.owner || !match.groups.repo) {
		return null;
	}

	return `https://github.com/${match.groups.owner}/${match.groups.repo}`;
}

export function buildPullRequestCompareUrl({
	baseRepoUrl,
	baseBranch,
	headRepoOwner,
	headBranch,
}: PullRequestCompareUrlInput): string {
	const normalizedBaseRepoUrl =
		normalizeGitHubRepoUrl(baseRepoUrl) ??
		baseRepoUrl.replace(/\.git$/, "").replace(/\/$/, "");

	return `${normalizedBaseRepoUrl}/compare/${baseBranch}...${headRepoOwner}:${headBranch}?expand=1`;
}
