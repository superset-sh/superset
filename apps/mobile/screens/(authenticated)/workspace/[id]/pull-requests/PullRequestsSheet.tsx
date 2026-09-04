import { useLingui } from "@lingui/react/macro";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { hostServiceUrl } from "@/lib/host-service/client";
import { useWorkspacePullRequests } from "../hooks/useWorkspacePullRequest";
import { PULL_REQUEST_STATUS, pullRequestStatus } from "../utils/pullRequest";
import { RowDiffstat } from "./components/RowDiffstat";

// Diffstat is one GitHub call per row; only the newest rows get one, so a
// long-lived workspace's history cannot fan out unbounded on open.
const DIFFSTAT_ROW_LIMIT = 20;

/**
 * Every pull request this workspace has produced, oldest first, so the list
 * reads as the history of the workspace and the newest sits nearest the thumb.
 *
 * The state is carried by the leading glyph alone: with the number and title on
 * one line and the diffstat opposite, a status word would be a third thing
 * competing for the row.
 */
export function PullRequestsSheet() {
	const { t } = useLingui();
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const { host } = useWorkspaceHost(id ?? null);
	const hostUrl =
		host?.isOnline === true
			? hostServiceUrl(host.organizationId, host.machineId)
			: null;
	// The hook hands back current-then-newest, which is what the strip's chip
	// colours itself from; only the list wants the other direction.
	const pullRequests = useWorkspacePullRequests(id ?? null).toReversed();

	return (
		<>
			<Stack.Screen
				options={{
					title: t({
						message: "Pull Requests",
					}),
				}}
			/>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityLabel={t({
						message: "Close",
					})}
					icon="xmark"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			<ScrollView
				className="bg-background flex-1"
				contentContainerClassName="px-4 pb-10 pt-2"
				contentInsetAdjustmentBehavior="automatic"
			>
				{pullRequests.map((pullRequest, index) => {
					const status = PULL_REQUEST_STATUS[pullRequestStatus(pullRequest)];
					return (
						<Pressable
							accessibilityLabel={t({
								message: `Pull request #${pullRequest.prNumber}`,
							})}
							accessibilityRole="button"
							className="flex-row items-center gap-3 py-3 active:opacity-60"
							key={pullRequest.key}
							onPress={() =>
								router.replace({
									pathname: "/workspace/[id]/pull-request/[pullRequestId]",
									params: {
										id: id ?? "",
										pullRequestId: String(pullRequest.prNumber),
										owner: pullRequest.repoOwner,
										repo: pullRequest.repoName,
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
							<RowDiffstat
								enabled={index >= pullRequests.length - DIFFSTAT_ROW_LIMIT}
								hostUrl={hostUrl}
								pullRequest={pullRequest}
							/>
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
