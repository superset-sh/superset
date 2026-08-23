import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
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
}: {
	hostUrl: string | null;
	pullRequest: WorkspacePullRequest;
	/** The sheet caps how many rows fetch, so an old long history cannot fan
	 * out one GitHub call per row the moment the sheet opens. */
	enabled: boolean;
}) {
	const { data } = useQuery({
		queryKey: ["pull-request-diffstat", hostUrl, pullRequest.key],
		enabled: enabled && hostUrl !== null,
		staleTime: 5 * 60_000,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!hostUrl) return null;
			const pr = await getHostServiceClientByUrl(hostUrl).github.getPR.query({
				owner: pullRequest.repoOwner,
				repo: pullRequest.repoName,
				pullNumber: pullRequest.prNumber,
			});
			return { additions: pr.additions, deletions: pr.deletions };
		},
	});

	if (!data) return null;
	return (
		<View className="flex-row items-center gap-1">
			<Text className="text-green-500 text-[13px]">+{data.additions}</Text>
			<Text className="text-red-500 text-[13px]">−{data.deletions}</Text>
		</View>
	);
}
