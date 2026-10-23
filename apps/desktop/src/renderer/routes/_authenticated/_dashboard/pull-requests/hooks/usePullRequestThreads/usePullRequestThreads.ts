import { useQuery } from "@tanstack/react-query";
import {
	canActOnPullRequest,
	type PullRequestTarget,
	pullRequestThreadsQueryKey,
	readPullRequestThreads,
} from "../../utils/pullRequestClient";

/** The pull request's review threads, polled so a reply made elsewhere shows within the half minute. */
export function usePullRequestThreads(
	target: PullRequestTarget,
	options: { enabled?: boolean } = {},
) {
	return useQuery({
		queryKey: pullRequestThreadsQueryKey(target),
		queryFn: () => readPullRequestThreads(target),
		enabled: (options.enabled ?? true) && canActOnPullRequest(target),
		staleTime: 30_000,
		gcTime: 10 * 60_000,
		refetchInterval: 30_000,
		refetchOnWindowFocus: true,
	});
}
