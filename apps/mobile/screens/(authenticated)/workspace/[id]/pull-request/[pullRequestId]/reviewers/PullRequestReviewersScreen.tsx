import { View } from "react-native";
import { ReviewersSheet } from "../components/ReviewersSheet";
import { usePullRequestRoute } from "../usePullRequestRoute";

/** The reviewers sheet, presented as a sheet route. */
export function PullRequestReviewersScreen() {
	const { detail } = usePullRequestRoute();
	if (!detail) return <View className="bg-background flex-1" />;
	return <ReviewersSheet reviewers={detail.reviewers} />;
}
