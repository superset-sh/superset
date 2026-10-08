import type { AppRouter as HostServiceAppRouter } from "@superset/host-service";
import type { inferRouterOutputs } from "@trpc/server";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import type { PullRequestDetail } from "../../hooks/usePullRequestDetail";

type HostPullRequestContent =
	inferRouterOutputs<HostServiceAppRouter>["pullRequests"]["getContent"];

/**
 * The host's `gh pr view` output in the shared shape. A host is the source
 * whenever it has the repository checked out: it reads as the person, so it
 * needs no GitHub App, which most organizations never install.
 */
function toReviewDecision(
	value: string | null | undefined,
): PullRequestDetail["reviewDecision"] {
	switch (value) {
		case "APPROVED":
			return "approved";
		case "CHANGES_REQUESTED":
			return "changes_requested";
		case "REVIEW_REQUIRED":
			return "pending";
		default:
			return null;
	}
}

export function fromHostPullRequestContent(
	content: HostPullRequestContent,
): PullRequestDetail {
	return {
		repoFullName: pullRequestRefFromUrl(content.url)?.repoFullName ?? "",
		number: content.number,
		url: content.url,
		title: content.title,
		body: content.body,
		state:
			content.state === "merged" || content.state === "closed"
				? content.state
				: "open",
		isDraft: content.isDraft,
		author: content.author ? { login: content.author, avatarUrl: null } : null,
		head: {
			ref: content.branch,
			// The host reports only the fork's owner, never its name, so a
			// cross-repository head is unknown here rather than half-named.
			repoFullName: content.isCrossRepository
				? null
				: (pullRequestRefFromUrl(content.url)?.repoFullName ?? null),
		},
		base: { ref: content.baseBranch },
		reviewDecision: toReviewDecision(content.reviewDecision),
		checksStatus: content.checksStatus,
		checks: content.checks,
		createdAt: content.createdAt ?? "",
		updatedAt: content.updatedAt ?? "",
		// Hosts older than the extended read answer without these; the detail
		// view treats each absent field as unknown rather than empty.
		...(content.mergeability !== undefined && {
			additions: content.additions,
			deletions: content.deletions,
			changedFiles: content.changedFiles,
			mergeability: content.mergeability,
			mergedAt: content.mergedAt,
			closedAt: content.closedAt,
			reviewers: content.reviewers,
			comments: content.comments,
			labels: content.labels,
		}),
	};
}
