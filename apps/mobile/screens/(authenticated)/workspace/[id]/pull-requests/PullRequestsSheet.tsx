import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import {
	useWorkspacePullRequests,
	type WorkspacePullRequest,
} from "../hooks/useWorkspacePullRequest";
import { PULL_REQUEST_STATUS, pullRequestStatus } from "../utils/pullRequest";

/**
 * Every pull request this workspace has produced, oldest first, so the list
 * reads as the history of the workspace and the newest sits nearest the thumb.
 *
 * The state is carried by the leading glyph alone: with the number and title on
 * one line and the diffstat opposite, a status word would be a third thing
 * competing for the row.
 */
export function PullRequestsSheet() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const { host } = useWorkspaceHost(id ?? null);
	const hostUrl =
		host?.isOnline === true
			? hostServiceUrl(host.organizationId, host.machineId)
			: null;
	// The hook hands back current-then-newest, which is what the chip colours
	// itself from; only the list wants the other direction.
	const pullRequests = useWorkspacePullRequests(id ?? null).toReversed();

	return (
		<>
			<Stack.Screen options={{ title: "Pull Requests" }} />
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityLabel="Close"
					icon="xmark"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			<ScrollView
				className="bg-background flex-1"
				contentContainerClassName="px-4 pb-10 pt-2"
				contentInsetAdjustmentBehavior="automatic"
			>
				{pullRequests.map((pullRequest) => {
					const status = PULL_REQUEST_STATUS[pullRequestStatus(pullRequest)];
					return (
						<Pressable
							accessibilityLabel={`Pull request #${pullRequest.prNumber}`}
							accessibilityRole="button"
							className="flex-row items-center gap-3 py-3 active:opacity-60"
							key={pullRequest.key}
							onPress={() =>
								router.replace({
									pathname: "/workspace/[id]/pull-request/[pullRequestId]",
									params: {
										id: id ?? "",
										pullRequestId: String(pullRequest.prNumber),
									},
								})
							}
						>
							<Icon
								as={status.icon}
								className={`size-[18px] ${status.ink}`}
								strokeWidth={1.75}
							/>
							<Text className="flex-1 text-[15px]" numberOfLines={2}>
								#{pullRequest.prNumber} {pullRequest.title}
							</Text>
							<RowDiffstat hostUrl={hostUrl} pullRequest={pullRequest} />
							<Icon
								as={ChevronRight}
								className="text-muted-foreground/60 size-4"
							/>
						</Pressable>
					);
				})}
			</ScrollView>
		</>
	);
}

/**
 * The history rows come from the host's sweep, which lists PRs without
 * per-PR detail; the diffstat is fetched per row on open. Renders nothing
 * until the numbers exist — a placeholder would be a third thing on the row.
 */
function RowDiffstat({
	hostUrl,
	pullRequest,
}: {
	hostUrl: string | null;
	pullRequest: WorkspacePullRequest;
}) {
	const { data } = useQuery({
		queryKey: ["pull-request-diffstat", pullRequest.key],
		enabled: hostUrl !== null,
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
