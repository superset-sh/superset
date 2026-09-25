import { router } from "expo-router";
import { View } from "react-native";
import { ChecksSheet } from "../components/ChecksSheet";
import { usePullRequestRoute } from "../usePullRequestRoute";

/** The checks sheet, presented as a sheet route the way the app's others are. */
export function PullRequestChecksScreen() {
	const { detail, workspaceId, pullNumber } = usePullRequestRoute();
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
