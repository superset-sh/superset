import type { GitHubStatus } from "@superset/local-db";
import { normalizeGitHubRepoUrl } from "./pull-request-url";

type ExistingPullRequest = NonNullable<GitHubStatus["pr"]>;

export interface GitRemoteInfo {
	name: string;
	fetchUrl?: string;
	pushUrl?: string;
}

export interface GitTrackingRefInfo {
	remoteName: string;
	branchName: string;
}

export interface ExistingPullRequestPushTargetInfo {
	remote: string;
	targetBranch: string;
}

export function isOpenPullRequestState(
	state: ExistingPullRequest["state"],
): boolean {
	return state === "open" || state === "draft";
}

export function getExistingPRHeadRepoUrl(
	pr: Pick<
		ExistingPullRequest,
		"headRepositoryOwner" | "headRepositoryName" | "isCrossRepository"
	>,
): string | null {
	if (
		!pr.isCrossRepository ||
		!pr.headRepositoryOwner ||
		!pr.headRepositoryName
	) {
		return null;
	}

	return `https://github.com/${pr.headRepositoryOwner}/${pr.headRepositoryName}`;
}

export function resolveRemoteNameForExistingPRHead({
	remotes,
	pr,
	fallbackRemote,
}: {
	remotes: GitRemoteInfo[];
	pr: Pick<
		ExistingPullRequest,
		"headRepositoryOwner" | "headRepositoryName" | "isCrossRepository"
	>;
	fallbackRemote: string;
}): string | null {
	if (!pr.isCrossRepository) {
		return fallbackRemote;
	}

	const headRepoUrl = getExistingPRHeadRepoUrl(pr);
	if (!headRepoUrl) {
		return null;
	}

	const normalizedHeadRepoUrl = normalizeGitHubRepoUrl(headRepoUrl);
	if (!normalizedHeadRepoUrl) {
		return null;
	}

	for (const remote of remotes) {
		const fetchUrl = remote.fetchUrl
			? normalizeGitHubRepoUrl(remote.fetchUrl)
			: null;
		const pushUrl = remote.pushUrl
			? normalizeGitHubRepoUrl(remote.pushUrl)
			: null;
		if (
			fetchUrl === normalizedHeadRepoUrl ||
			pushUrl === normalizedHeadRepoUrl
		) {
			return remote.name;
		}
	}

	return null;
}

export function shouldRetargetPushToExistingPRHead({
	trackingRef,
	target,
}: {
	trackingRef: GitTrackingRefInfo | null;
	target: ExistingPullRequestPushTargetInfo;
}): boolean {
	if (!trackingRef) {
		return true;
	}

	return (
		trackingRef.remoteName !== target.remote ||
		trackingRef.branchName !== target.targetBranch
	);
}
