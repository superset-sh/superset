import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";

export function toPullRequestDisplayState(
	pullRequest: Pick<CloudPullRequest, "state" | "isDraft">,
) {
	return pullRequest.state === "open" && pullRequest.isDraft
		? "draft"
		: pullRequest.state;
}

export type PullRequestDisplayState = ReturnType<
	typeof toPullRequestDisplayState
>;
