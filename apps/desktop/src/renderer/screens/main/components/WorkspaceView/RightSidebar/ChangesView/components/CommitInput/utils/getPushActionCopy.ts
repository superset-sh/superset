import type { GitHubStatus } from "@superset/local-db";

type PushActionPullRequest = Pick<
	NonNullable<GitHubStatus["pr"]>,
	"headRefName" | "headRepositoryOwner"
>;

export interface PushActionCopy {
	label: string;
	menuLabel: string;
	tooltip: string;
}

function formatPullRequestPushTarget(
	pullRequest?: PushActionPullRequest | null,
): string | null {
	const branch = pullRequest?.headRefName?.trim();
	if (!branch) {
		return null;
	}

	const owner = pullRequest?.headRepositoryOwner?.trim();
	return owner ? `${owner}:${branch}` : branch;
}

export function getPushActionCopy({
	hasUpstream,
	pushCount,
	pullRequest,
}: {
	hasUpstream: boolean;
	pushCount: number;
	pullRequest?: PushActionPullRequest | null;
}): PushActionCopy {
	const pullRequestTarget = formatPullRequestPushTarget(pullRequest);
	if (pullRequestTarget) {
		return {
			label: "Push to PR",
			menuLabel: "Push to PR",
			tooltip:
				pushCount > 0
					? `Push ${pushCount} commit${pushCount !== 1 ? "s" : ""} to ${pullRequestTarget}`
					: `Push changes to ${pullRequestTarget}`,
		};
	}

	if (!hasUpstream) {
		return {
			label: "Publish Branch",
			menuLabel: "Publish Branch",
			tooltip: "Publish branch to remote",
		};
	}

	return {
		label: "Push",
		menuLabel: "Push",
		tooltip:
			pushCount > 0
				? `Push ${pushCount} commit${pushCount !== 1 ? "s" : ""}`
				: "Push branch changes",
	};
}
