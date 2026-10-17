import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import {
	pullRequestDiffQueryKey,
	pullRequestThreadsQueryKey,
} from "../../components/PullRequestCodeTab/utils/pullRequestCodeTabQueryKeys";
import { pullRequestDetailQueryKey } from "../usePullRequestDetail";

interface RefreshPullRequestInput {
	projectId: string | null;
	hostUrl: string | null;
	prNumber: number | null;
	repoFullName: string | null;
	/** The PR's own URL; the Code tab keys its diff on the repository in it. */
	url: string | null | undefined;
}

export function useRefreshPullRequest({
	projectId,
	hostUrl,
	prNumber,
	repoFullName,
	url,
}: RefreshPullRequestInput) {
	const queryClient = useQueryClient();
	const organizationId = useActiveOrganizationId();
	const detailKey = pullRequestDetailQueryKey({ projectId, hostUrl, prNumber });
	const isRefreshing = useIsFetching({ queryKey: detailKey }) > 0;

	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: detailKey });
		if (prNumber === null) return;
		const codeTabKey = { projectId, hostUrl: hostUrl ?? "", prNumber };
		void queryClient.invalidateQueries({
			queryKey: pullRequestDiffQueryKey({
				...codeTabKey,
				organizationId,
				repoFullName:
					(url ? pullRequestRefFromUrl(url)?.repoFullName : null) ??
					repoFullName,
			}),
		});
		void queryClient.invalidateQueries({
			queryKey: pullRequestThreadsQueryKey(codeTabKey),
		});
		for (const queryKey of [
			[["git", "getPullRequest"]],
			[["git", "getPullRequestThreads"]],
		]) {
			void queryClient.invalidateQueries({ queryKey });
		}
	};

	return { refresh, isRefreshing };
}
