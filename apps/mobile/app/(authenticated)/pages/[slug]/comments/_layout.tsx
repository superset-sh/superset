import { useLingui } from "@lingui/react/macro";
import { Stack } from "expo-router";

export default function CommentsLayout() {
	const { t } = useLingui();

	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen
				name="index"
				options={{ title: t({ message: "All comments" }) }}
			/>
		</Stack>
	);
}
