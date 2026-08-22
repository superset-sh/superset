import { useLocalSearchParams } from "expo-router";
import { Linking, View } from "react-native";
import { CheckDetailSheet } from "../components/CheckDetailSheet";
import { usePullRequestRoute } from "../usePullRequestRoute";

/**
 * One check. Identified by name rather than index: the rollup reorders between
 * fetches, and a name survives that where a position does not.
 */
export function PullRequestCheckScreen() {
	const { name } = useLocalSearchParams<{ name: string }>();
	const { detail } = usePullRequestRoute();
	const check = detail?.checks.find((item) => item.name === name);
	if (!check) return <View className="bg-background flex-1" />;
	return (
		<CheckDetailSheet
			check={check}
			onOpenInGitHub={
				check.detailsUrl
					? () => {
							if (check.detailsUrl) Linking.openURL(check.detailsUrl);
						}
					: undefined
			}
		/>
	);
}
