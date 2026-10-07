import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { GitLabDetailStatus } from "../components/GitLabDetailStatus";
import { ReviewersSheet } from "../components/ReviewersSheet";
import { useGitlabDetailRetry } from "../hooks/useGitlabDetailRetry";
import { usePullRequestRoute } from "../usePullRequestRoute";
import { gitlabDetailView } from "../utils/gitlabDetailView/gitlabDetailView";

/** The reviewers sheet, presented as a sheet route. */
export function PullRequestReviewersScreen() {
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
		return <ReviewersSheet reviewers={view.reviewers} />;
	}

	if (!detail) return <View className="bg-background flex-1" />;
	return <ReviewersSheet reviewers={detail.reviewers} />;
}
