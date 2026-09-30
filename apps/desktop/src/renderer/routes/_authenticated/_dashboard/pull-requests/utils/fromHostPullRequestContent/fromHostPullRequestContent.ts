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
export function fromHostPullRequestContent(
	content: HostPullRequestContent,
): PullRequestDetail {
	const ref = pullRequestRefFromUrl(content.url);
	const metadata = content as HostPullRequestContent & {
		provider?: "github" | "gitlab";
		instance?: string;
		repoPath?: string;
		authorAvatarUrl?: string | null;
		headSha?: string | null;
		capabilities?: PullRequestDetail["capabilities"];
	};
	return {
		provider: metadata.provider ?? ref?.provider ?? "github",
		instance: metadata.instance ?? ref?.instance,
		repoPath: metadata.repoPath ?? ref?.repoPath,
		headSha: metadata.headSha,
		capabilities: metadata.capabilities,
		repoFullName: ref?.repoFullName ?? "",
		number: content.number,
		url: content.url,
		title: content.title,
		body: content.body,
		state:
			content.state === "merged" || content.state === "closed"
				? content.state
				: "open",
		isDraft: content.isDraft,
		author: content.author
			? { login: content.author, avatarUrl: metadata.authorAvatarUrl ?? null }
			: null,
		head: {
			ref: content.branch,
			// The host reports only the fork's owner, never its name, so a
			// cross-repository head is unknown here rather than half-named.
			repoFullName: content.isCrossRepository
				? null
				: (ref?.repoFullName ?? null),
		},
		base: { ref: content.baseBranch },
		reviewDecision: null,
		checksStatus:
			content.checksStatus === "success" ||
			content.checksStatus === "failure" ||
			content.checksStatus === "pending"
				? content.checksStatus
				: "none",
		checks: content.checks,
		createdAt: content.createdAt ?? "",
		updatedAt: content.updatedAt ?? "",
	};
}
