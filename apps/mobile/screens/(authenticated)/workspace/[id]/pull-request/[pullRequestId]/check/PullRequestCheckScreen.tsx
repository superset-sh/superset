import { useLingui } from "@lingui/react/macro";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { openUrl } from "@/lib/open-url";
import { CheckDetailSheet } from "../components/CheckDetailSheet";
import { GitLabDetailStatus } from "../components/GitLabDetailStatus";
import { useGitlabDetailRetry } from "../hooks/useGitlabDetailRetry";
import { usePullRequestRoute } from "../usePullRequestRoute";
import { gitlabDetailView } from "../utils/gitlabDetailView/gitlabDetailView";

/**
 * One check. Identified by name rather than index: the rollup reorders between
 * fetches, and a name survives that where a position does not.
 */
export function PullRequestCheckScreen() {
	const { name } = useLocalSearchParams<{ name: string }>();
	const { t } = useLingui();
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
		const check = view?.checks.find((item) => item.name === name);
		if (!check)
			return (
				<GitLabDetailStatus
					loading={false}
					message={t({ message: "This GitLab check is no longer available." })}
					onRetry={retry.retry}
					canRetry={retry.canRetry}
				/>
			);
		return (
			<CheckDetailSheet
				provider="gitlab"
				check={check}
				onOpenInGitHub={
					check.detailsUrl
						? () => {
								if (check.detailsUrl) openUrl(check.detailsUrl);
							}
						: undefined
				}
			/>
		);
	}

	const check = detail?.checks.find((item) => item.name === name);
	if (!check) return <View className="bg-background flex-1" />;
	return (
		<CheckDetailSheet
			check={check}
			onOpenInGitHub={
				check.detailsUrl
					? () => {
							if (check.detailsUrl) openUrl(check.detailsUrl);
						}
					: undefined
			}
		/>
	);
}
