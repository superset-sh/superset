import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { gitlabPullRequestFromUrl } from "@/lib/pull-request-links";
import type { WorkspacePullRequest } from "../../../hooks/useWorkspacePullRequest";

/**
 * The history rows come from the host's sweep, which lists PRs without
 * per-PR detail; the diffstat is fetched per row on open. Renders nothing
 * until the numbers exist — a placeholder would be a third thing on the row.
 */
export function RowDiffstat({
	hostUrl,
	pullRequest,
	enabled,
	workspaceId,
	projectId,
}: {
	hostUrl: string | null;
	pullRequest: WorkspacePullRequest;
	/** The sheet caps how many rows fetch, so an old long history cannot fan
	 * out one GitHub call per row the moment the sheet opens. */
	enabled: boolean;
	workspaceId?: string | null;
	projectId?: string | null;
}) {
	const native = pullRequest.provider === "gitlab";
	const identity =
		native && pullRequest.expectedUrl
			? gitlabPullRequestFromUrl(pullRequest.expectedUrl)
			: null;
	const nativeReady = !!(
		identity &&
		identity.host === pullRequest.host &&
		identity.expectedUrl === pullRequest.expectedUrl &&
		identity.owner === pullRequest.repoOwner &&
		identity.repo === pullRequest.repoName &&
		identity.pullNumber === pullRequest.prNumber &&
		workspaceId &&
		projectId &&
		hostUrl
	);
	const query = useQuery({
		queryKey: native
			? [
					"pull-request-diffstat",
					hostUrl,
					pullRequest.key,
					workspaceId,
					projectId,
					pullRequest.expectedUrl,
				]
			: ["pull-request-diffstat", hostUrl, pullRequest.key],
		enabled: enabled && hostUrl !== null && (!native || nativeReady),
		staleTime: 5 * 60_000,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!hostUrl) return null;
			if (native) {
				if (!nativeReady || !identity || !projectId || !workspaceId)
					return null;
				const detail = await getHostServiceClientByUrl(
					hostUrl,
				).github.getPullRequestDetail.query({
					owner: pullRequest.repoOwner,
					repo: pullRequest.repoName,
					pullNumber: pullRequest.prNumber,
					provider: "gitlab",
					host: identity.host,
					projectId,
					workspaceId,
					expectedUrl: identity.expectedUrl,
				});
				if (
					!("provider" in detail) ||
					detail.provider !== "gitlab" ||
					detail.host !== identity.host ||
					detail.pullRequest.number !== pullRequest.prNumber ||
					detail.pullRequest.url !== identity.expectedUrl ||
					!detail.pullRequest.diffStatsComplete
				)
					return null;
				return {
					additions: detail.pullRequest.additions,
					deletions: detail.pullRequest.deletions,
				};
			}
			const pr = await getHostServiceClientByUrl(hostUrl).github.getPR.query({
				owner: pullRequest.repoOwner,
				repo: pullRequest.repoName,
				pullNumber: pullRequest.prNumber,
			});
			return { additions: pr.additions, deletions: pr.deletions };
		},
	});

	const data = native && (!nativeReady || query.isError) ? null : query.data;
	if (!data) return null;
	return (
		<View className="flex-row items-center gap-1">
			<Text className="text-green-500 text-[13px]">+{data.additions}</Text>
			<Text className="text-red-500 text-[13px]">−{data.deletions}</Text>
		</View>
	);
}
