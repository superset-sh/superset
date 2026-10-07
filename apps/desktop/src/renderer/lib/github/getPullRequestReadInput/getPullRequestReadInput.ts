import type { PullRequestRef } from "renderer/lib/github/pullRequestRef";
import type { HostServiceClient } from "renderer/lib/host-service-client";

type ReadInput = Parameters<
	HostServiceClient["pullRequests"]["getContent"]["query"]
>[0];

export function getPullRequestReadInput(
	ref: PullRequestRef | undefined,
	projectId: string,
): Pick<ReadInput, "provider" | "expectedPullRequest"> {
	if (ref?.provider !== "gitlab" || !ref.host) return {};
	const parts = ref.repoFullName.split("/");
	const repo = parts.pop();
	if (!repo || !parts.length) return {};
	return {
		provider: "gitlab" as const,
		expectedPullRequest: {
			projectId,
			provider: "gitlab" as const,
			host: ref.host,
			owner: parts.join("/"),
			repo,
			pullNumber: ref.number,
			expectedUrl: `https://${ref.host}/${[...parts, repo].map(encodeURIComponent).join("/")}/-/merge_requests/${ref.number}`,
		},
	};
}
