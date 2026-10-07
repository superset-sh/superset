import { Plural, Trans, useLingui } from "@lingui/react/macro";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Linking,
	Pressable,
	RefreshControl,
	ScrollView,
	Share,
	View,
} from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useReadableInset } from "@/hooks/useReadableInset";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { posthog } from "@/lib/posthog";
import { HeaderNotice } from "@/screens/(authenticated)/components/HeaderNotice";
import {
	anchorOf,
	ToolbarAnchor,
} from "@/screens/(authenticated)/components/ToolbarAnchor";
import { GitLabDetailStatus } from "./components/GitLabDetailStatus";
import { GitLabPullRequestCard } from "./components/GitLabPullRequestCard";
import { PullRequestCard } from "./components/PullRequestCard";
import { PullRequestDescription } from "./components/PullRequestDescription";
import { PullRequestHeader } from "./components/PullRequestHeader";
import { useAskAgent } from "./hooks/useAskAgent";
import { useGitlabDetailRetry } from "./hooks/useGitlabDetailRetry";
import { useMergePullRequest } from "./hooks/useMergePullRequest";
import { usePullRequestActions } from "./hooks/usePullRequestActions";
import { usePullRequestRoute } from "./usePullRequestRoute";
import { gitlabDetailView } from "./utils/gitlabDetailView/gitlabDetailView";
import { type ActionId, isAgentAction } from "./utils/pullRequestState";

const NOTICE_MS = 1500;

/** One pull request: what it is waiting on and what you can do about it. */
export function PullRequestScreen() {
	const { t } = useLingui();
	const {
		detail,
		gitlabDetail,
		isLoading,
		error,
		refetch,
		workspaceId,
		pullNumber,
		owner,
		repo,
	} = usePullRequestRoute();

	const nativeParams = useLocalSearchParams<{
		provider?: string;
		expectedUrl?: string;
	}>();
	const nativeRequested =
		nativeParams.provider === "gitlab" ||
		nativeParams.expectedUrl !== undefined;
	const { workspace } = useWorkspaceHost(workspaceId);
	const retry = useGitlabDetailRetry({
		workspaceId,
		owner,
		repo,
		pullNumber,
		refetch,
	});
	const gitlab =
		gitlabDetail && workspace?.projectId
			? {
					projectId: workspace.projectId,
					host: gitlabDetail.host,
					expectedUrl: gitlabDetail.pullRequest.url,
					detail: gitlabDetail,
				}
			: undefined;

	// Once per pull request the screen shows, not once per refetch.
	const openedPullRequestRef = useRef<string | null>(null);
	const shareAnchorRef = useRef<View>(null);
	const readableInset = useReadableInset();
	useEffect(() => {
		const key = `${workspaceId}:${pullNumber}`;
		if (pullNumber === null || openedPullRequestRef.current === key) return;
		openedPullRequestRef.current = key;
		posthog.capture("pull_request_opened", {
			workspace_id: workspaceId,
			pr_number: pullNumber,
		});
	}, [workspaceId, pullNumber]);

	const merge = useMergePullRequest({
		workspaceId,
		owner,
		repo,
		pullNumber,
		...(gitlab ? { gitlab } : {}),
		onMerged: () => {
			posthog.capture("pull_request_merged", {
				workspace_id: workspaceId,
				pr_number: pullNumber,
			});
			void refetch();
		},
	});
	const actions = usePullRequestActions({
		workspaceId,
		owner,
		repo,
		pullNumber,
		...(gitlab ? { gitlab } : {}),
		onDone: () => void refetch(),
	});
	const askAgent = useAskAgent(
		gitlab ? { workspaceId, owner, repo, pullNumber, gitlab } : { workspaceId },
	);

	const [notice, setNotice] = useState<string | null>(null);
	const hideNotice = useCallback(() => setNotice(null), []);
	const copyLink = async () => {
		if (gitlabDetail) {
			await Clipboard.setStringAsync(gitlabDetail.pullRequest.url);
			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
			setNotice(t({ message: "Copied Link" }));
			return;
		}
		if (!detail) return;
		await Clipboard.setStringAsync(detail.pullRequest.url);
		void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
		setNotice(t({ message: "Copied Link" }));
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
		if (nativeRequested)
			return (
				<GitLabDetailStatus
					loading
					onRetry={retry.retry}
					canRetry={retry.canRetry}
				/>
			);
		return (
			<View className="bg-background flex-1 items-center justify-center">
				<ActivityIndicator />
			</View>
		);
	}

	const nativeView =
		gitlabDetail && !error ? gitlabDetailView(gitlabDetail) : null;
	if (gitlabDetail && nativeView && !error) {
		const params = {
			id: workspaceId ?? "",
			pullRequestId: String(pullNumber),
			owner: owner ?? "",
			repo: repo ?? "",
			provider: "gitlab",
			expectedUrl: gitlabDetail.pullRequest.url,
		};
		const onAction = (action: ActionId) => {
			if (action === "merge") {
				merge.confirmAndMerge(gitlabDetail);
				return;
			}
			if (isAgentAction(action)) {
				askAgent.ask(action, gitlabDetail);
				return;
			}
			actions.run(action);
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
						accessibilityLabel={t({ message: "Copy link to merge request" })}
						icon="link"
						onPress={() => void copyLink()}
						separateBackground
					/>
					<Stack.Toolbar.Menu
						accessibilityLabel={t({ message: "Merge request actions" })}
						icon="ellipsis"
						separateBackground
					>
						<Stack.Toolbar.MenuAction
							icon="doc.on.doc"
							onPress={() => void copyLink()}
						>
							{t({ message: "Copy link" })}
						</Stack.Toolbar.MenuAction>
						<Stack.Toolbar.MenuAction
							icon="arrow.up.right"
							onPress={() => void Linking.openURL(gitlabDetail.pullRequest.url)}
						>
							{t({ message: "Open in GitLab" })}
						</Stack.Toolbar.MenuAction>
						<Stack.Toolbar.MenuAction
							icon="square.and.arrow.up"
							onPress={() =>
								void Share.share(
									{ url: gitlabDetail.pullRequest.url },
									{ anchor: anchorOf(shareAnchorRef) },
								)
							}
						>
							{t({ message: "Share" })}
						</Stack.Toolbar.MenuAction>
					</Stack.Toolbar.Menu>
				</Stack.Toolbar>
				<ScrollView
					alwaysBounceVertical
					className="bg-background flex-1"
					contentContainerClassName="gap-4 py-4"
					contentContainerStyle={{ paddingHorizontal: readableInset }}
					contentInsetAdjustmentBehavior="automatic"
					refreshControl={
						<RefreshControl onRefresh={onPullToRefresh} refreshing={pulling} />
					}
				>
					<PullRequestHeader
						pullRequest={nativeView.pullRequest}
						diffStatsComplete={gitlabDetail.pullRequest.diffStatsComplete}
					/>
					{!gitlabDetail.pullRequest.diffStatsComplete ? (
						<Text className="text-muted-foreground mx-4 text-[13px]">
							{t({ message: "Merge request changes are unavailable" })}
						</Text>
					) : null}
					<GitLabPullRequestCard
						detail={gitlabDetail}
						view={nativeView}
						busyAction={
							merge.isMerging
								? "merge"
								: (actions.busyAction ?? askAgent.busyAction)
						}
						onAction={onAction}
						onOpenChecks={() =>
							router.push({
								pathname: "/workspace/[id]/pull-request/[pullRequestId]/checks",
								params,
							})
						}
						onOpenCheck={(check) =>
							router.push({
								pathname: "/workspace/[id]/pull-request/[pullRequestId]/check",
								params: { ...params, name: check.name },
							})
						}
						onOpenReviewers={() =>
							router.push({
								pathname:
									"/workspace/[id]/pull-request/[pullRequestId]/reviewers",
								params,
							})
						}
					/>
					<PullRequestDescription body={gitlabDetail.pullRequest.body} />
					<Pressable
						accessibilityRole="button"
						className="border-border mx-4 rounded-xl border px-4 py-3.5"
						onPress={() =>
							router.push({
								pathname: "/workspace/[id]/files-changed",
								params: { id: workspaceId ?? "" },
							})
						}
					>
						<Text>
							<Trans>Current workspace files</Trans>
						</Text>
					</Pressable>
				</ScrollView>
				<ToolbarAnchor ref={shareAnchorRef} />
			</>
		);
	}

	if (nativeRequested && (error || !nativeView))
		return (
			<GitLabDetailStatus
				loading={false}
				onRetry={retry.retry}
				canRetry={retry.canRetry}
				onGoBack={() =>
					router.canGoBack() ? router.back() : router.replace("/")
				}
			/>
		);
	if (error || !detail) {
		return (
			<View className="bg-background flex-1 items-center justify-center gap-5 px-10">
				<Text className="text-muted-foreground text-center text-[15px] leading-[21px]">
					{error
						? t({
								message: "Could not reach the host to load this pull request.",
							})
						: t({
								message: "This pull request is no longer available.",
							})}
				</Text>
				<Pressable
					accessibilityRole="button"
					className="bg-secondary h-[38px] items-center justify-center rounded-md px-5 active:opacity-80"
					onPress={() =>
						router.canGoBack() ? router.back() : router.replace("/")
					}
				>
					<Text className="font-medium text-[15px]">
						{router.canGoBack()
							? t({ message: "Go back" })
							: t({ message: "Go home" })}
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
		if (isAgentAction(action)) {
			askAgent.ask(action, detail);
			return;
		}
		actions.run(action);
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
					accessibilityLabel={t({
						message: "Copy link to pull request",
					})}
					icon="link"
					onPress={() => void copyLink()}
					separateBackground
				/>
				<Stack.Toolbar.Menu
					accessibilityLabel={t({
						message: "Pull request actions",
					})}
					icon="ellipsis"
					separateBackground
				>
					<Stack.Toolbar.MenuAction
						icon="doc.on.doc"
						onPress={() => void copyLink()}
					>
						{t({ message: "Copy link" })}
					</Stack.Toolbar.MenuAction>
					<Stack.Toolbar.MenuAction
						icon="arrow.up.right"
						onPress={() => void Linking.openURL(detail.pullRequest.url)}
					>
						{t({
							message: "Open in GitHub",
						})}
					</Stack.Toolbar.MenuAction>
					<Stack.Toolbar.MenuAction
						icon="square.and.arrow.up"
						onPress={() =>
							void Share.share(
								{ url: detail.pullRequest.url },
								{ anchor: anchorOf(shareAnchorRef) },
							)
						}
					>
						{t({ message: "Share" })}
					</Stack.Toolbar.MenuAction>
				</Stack.Toolbar.Menu>
			</Stack.Toolbar>
			<ScrollView
				alwaysBounceVertical
				className="bg-background flex-1"
				contentContainerClassName="gap-4 py-4"
				contentContainerStyle={{ paddingHorizontal: readableInset }}
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
					busyAction={
						merge.isMerging
							? "merge"
							: (actions.busyAction ?? askAgent.busyAction)
					}
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
					<Text className="text-muted-foreground text-[15px]">
						<Trans>Files</Trans>
					</Text>
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
							<Plural
								value={detail.pullRequest.changedFiles}
								one="# file changed"
								other="# files changed"
							/>
						</Text>
						<Icon as={ChevronRight} className="text-muted-foreground size-4" />
					</Pressable>
				</View>
			</ScrollView>
			<ToolbarAnchor ref={shareAnchorRef} />
		</>
	);
}
