import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { ChecksSheet } from "../components/ChecksSheet";
import { GitLabDetailStatus } from "../components/GitLabDetailStatus";
import { useGitlabDetailRetry } from "../hooks/useGitlabDetailRetry";
import { usePullRequestRoute } from "../usePullRequestRoute";
import { gitlabDetailView } from "../utils/gitlabDetailView/gitlabDetailView";

/** The checks sheet, presented as a sheet route the way the app's others are. */
export function PullRequestChecksScreen() {
	const params = useLocalSearchParams<{
		provider?: string;
		expectedUrl?: string;
	}>();
	const {
		detail,
		gitlabDetail,
		workspaceId,
		pullNumber,
		owner,
		repo,
		isLoading,
		error,
		refetch,
	} = usePullRequestRoute();
	const retry = useGitlabDetailRetry({
		workspaceId,
		owner,
		repo,
		pullNumber,
		refetch,
	});
	const nativeRequested =
		params.provider === "gitlab" ||
		params.expectedUrl !== undefined ||
		gitlabDetail !== null;
	if (nativeRequested && (isLoading || error || !gitlabDetail))
		return (
			<GitLabDetailStatus
				loading={isLoading && !error}
				onRetry={retry.retry}
				canRetry={retry.canRetry}
			/>
		);
	if (gitlabDetail) {
		const view = gitlabDetailView(gitlabDetail);
		if (!view)
			return (
				<GitLabDetailStatus
					loading={false}
					onRetry={retry.retry}
					canRetry={retry.canRetry}
				/>
			);
		return (
			<ChecksSheet
				checks={view.checks}
				onOpenCheck={(check) =>
					router.push({
						pathname: "/workspace/[id]/pull-request/[pullRequestId]/check",
						params: {
							id: workspaceId ?? "",
							pullRequestId: String(pullNumber),
							owner: owner ?? "",
							repo: repo ?? "",
							provider: "gitlab",
							expectedUrl: gitlabDetail.pullRequest.url,
							name: check.name,
						},
					})
				}
			/>
		);
	}

	if (!detail) return <View className="bg-background flex-1" />;
	return (
		<ChecksSheet
			checks={detail.checks}
			onOpenCheck={(check) =>
				router.push({
					pathname: "/workspace/[id]/pull-request/[pullRequestId]/check",
					params: {
						id: workspaceId ?? "",
						pullRequestId: String(pullNumber),
						name: check.name,
					},
				})
			}
		/>
	);
}
