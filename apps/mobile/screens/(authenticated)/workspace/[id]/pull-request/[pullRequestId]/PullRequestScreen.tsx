import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router, Stack } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Linking,
	Pressable,
	RefreshControl,
	ScrollView,
	Share,
	View,
} from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAppReviewPrompt } from "@/screens/(authenticated)/hooks/useAppReviewPrompt";
import { HeaderNotice } from "./components/HeaderNotice";
import { PullRequestCard } from "./components/PullRequestCard";
import { PullRequestDescription } from "./components/PullRequestDescription";
import { PullRequestHeader } from "./components/PullRequestHeader";
import { useMergePullRequest } from "./hooks/useMergePullRequest";
import { usePullRequestRoute } from "./usePullRequestRoute";
import type { ActionId } from "./utils/pullRequestState";

const NOTICE_MS = 1500;

/** One pull request: what it is waiting on and what you can do about it. */
export function PullRequestScreen() {
	const {
		detail,
		isLoading,
		error,
		refetch,
		workspaceId,
		pullNumber,
		owner,
		repo,
	} = usePullRequestRoute();

	const requestAppReview = useAppReviewPrompt();
	const merge = useMergePullRequest({
		workspaceId,
		owner,
		repo,
		pullNumber,
		onMerged: () => {
			void refetch();
			requestAppReview("pr_merged");
		},
	});

	const [notice, setNotice] = useState<string | null>(null);
	const hideNotice = useCallback(() => setNotice(null), []);
	const copyLink = async () => {
		if (!detail) return;
		await Clipboard.setStringAsync(detail.pullRequest.url);
		void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
		setNotice("Copied Link");
	};

	const [pulling, setPulling] = useState(false);
	const onPullToRefresh = async () => {
		setPulling(true);
		try {
			await refetch();
		} finally {
			setPulling(false);
		}
	};

	if (isLoading) {
		return (
			<View className="bg-background flex-1 items-center justify-center">
				<ActivityIndicator />
			</View>
		);
	}

	if (error || !detail) {
		return (
			<View className="bg-background flex-1 items-center justify-center gap-5 px-10">
				<Text className="text-muted-foreground text-center text-[15px] leading-[21px]">
					{error
						? "Could not reach the host to load this pull request."
						: "This pull request is no longer available."}
				</Text>
				<Pressable
					accessibilityRole="button"
					className="bg-secondary h-[38px] items-center justify-center rounded-md px-5 active:opacity-80"
					onPress={() =>
						router.canGoBack() ? router.back() : router.replace("/")
					}
				>
					<Text className="font-medium text-[15px]">
						{router.canGoBack() ? "Go back" : "Go home"}
					</Text>
				</Pressable>
			</View>
		);
	}

	const params = { id: workspaceId ?? "", pullRequestId: String(pullNumber) };

	const onAction = (action: ActionId) => {
		if (action === "merge") {
			merge.confirmAndMerge(detail);
			return;
		}
		Alert.alert("Not available yet", "This action is not wired up yet.");
	};

	return (
		<>
			<Stack.Screen
				options={{
					title: "",
					headerTitle: notice
						? () => (
								<HeaderNotice
									onHidden={hideNotice}
									text={notice}
									visibleFor={NOTICE_MS}
								/>
							)
						: undefined,
				}}
			/>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					accessibilityLabel="Copy link to pull request"
					icon="link"
					onPress={() => void copyLink()}
					separateBackground
				/>
				<Stack.Toolbar.Menu
					accessibilityLabel="Pull request actions"
					icon="ellipsis"
					separateBackground
				>
					<Stack.Toolbar.MenuAction
						icon="doc.on.doc"
						onPress={() => void copyLink()}
					>
						Copy link
					</Stack.Toolbar.MenuAction>
					<Stack.Toolbar.MenuAction
						icon="arrow.up.right"
						onPress={() => void Linking.openURL(detail.pullRequest.url)}
					>
						Open in GitHub
					</Stack.Toolbar.MenuAction>
					<Stack.Toolbar.MenuAction
						icon="square.and.arrow.up"
						onPress={() => void Share.share({ url: detail.pullRequest.url })}
					>
						Share
					</Stack.Toolbar.MenuAction>
				</Stack.Toolbar.Menu>
			</Stack.Toolbar>
			<ScrollView
				alwaysBounceVertical
				className="bg-background flex-1"
				contentContainerClassName="gap-4 py-4"
				contentInsetAdjustmentBehavior="automatic"
				refreshControl={
					// Bound to the pull, not the query, so background polls stay silent.
					<RefreshControl onRefresh={onPullToRefresh} refreshing={pulling} />
				}
			>
				<PullRequestHeader
					onOpenFiles={() =>
						router.push({
							pathname: "/workspace/[id]/files-changed",
							params: { id: workspaceId ?? "" },
						})
					}
					pullRequest={detail.pullRequest}
					queued={detail.mergeability.queue !== null}
				/>
				<PullRequestCard
					busyAction={merge.isMerging ? "merge" : null}
					capabilities={detail.capabilities}
					checks={detail.checks}
					mergeability={detail.mergeability}
					onAction={onAction}
					onOpenCheck={(check) =>
						router.push({
							pathname: "/workspace/[id]/pull-request/[pullRequestId]/check",
							params: { ...params, name: check.name },
						})
					}
					onOpenChecks={() =>
						router.push({
							pathname: "/workspace/[id]/pull-request/[pullRequestId]/checks",
							params,
						})
					}
					onOpenReviewers={() =>
						router.push({
							pathname:
								"/workspace/[id]/pull-request/[pullRequestId]/reviewers",
							params,
						})
					}
					pullRequest={detail.pullRequest}
					reviewers={detail.reviewers}
				/>
				<PullRequestDescription body={detail.pullRequest.body} />
				<View className="bg-border mx-4 h-px" />
				<View className="mx-4 gap-3">
					<Text className="text-muted-foreground text-[15px]">Files</Text>
					<Pressable
						accessibilityRole="button"
						className="border-border flex-row items-center justify-between rounded-xl border px-4 py-3.5 active:opacity-60"
						onPress={() =>
							router.push({
								pathname: "/workspace/[id]/files-changed",
								params: { id: workspaceId ?? "" },
							})
						}
					>
						<Text className="text-[15px]">
							{detail.pullRequest.changedFiles}{" "}
							{detail.pullRequest.changedFiles === 1 ? "file" : "files"} changed
						</Text>
						<Icon as={ChevronRight} className="text-muted-foreground size-4" />
					</Pressable>
				</View>
			</ScrollView>
		</>
	);
}
