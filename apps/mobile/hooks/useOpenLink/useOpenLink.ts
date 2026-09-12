import { useRouter } from "expo-router";
import { useCallback } from "react";
import { env } from "@/lib/env";
import { openUrl } from "@/lib/open-url";
import { pageSlugFromUrl } from "@/lib/page-links";
import { pullRequestFromUrl } from "@/lib/pull-request-links";

/** Pull request links only open in-app with a workspace: its host is what answers for the PR. */
export function useOpenLink({
	workspaceId,
}: {
	workspaceId?: string;
} = {}): (url: string) => void {
	const router = useRouter();

	return useCallback(
		(url: string) => {
			const slug = pageSlugFromUrl(url, env.EXPO_PUBLIC_WEB_URL);
			if (slug !== null) {
				router.push({
					pathname: "/(authenticated)/pages/[slug]/preview",
					params: { slug },
				});
				return;
			}
			const pullRequest = pullRequestFromUrl(url);
			if (pullRequest !== null && workspaceId) {
				router.push({
					pathname: "/workspace/[id]/pull-request/[pullRequestId]",
					params: {
						id: workspaceId,
						pullRequestId: String(pullRequest.pullNumber),
						owner: pullRequest.owner,
						repo: pullRequest.repo,
					},
				});
				return;
			}
			openUrl(url);
		},
		[router, workspaceId],
	);
}
