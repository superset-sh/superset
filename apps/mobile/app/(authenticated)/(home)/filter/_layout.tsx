import { useLingui } from "@lingui/react/macro";
import { Stack } from "expo-router";

export default function FilterLayout() {
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
				options={{
					title: t({ message: "Filter" }),
				}}
			/>
			<Stack.Screen
				name="scope"
				options={{
					title: t({ message: "Scope" }),
				}}
			/>
			<Stack.Screen name="sort" options={{ title: t({ message: "Sort" }) }} />
		</Stack>
	);
}
