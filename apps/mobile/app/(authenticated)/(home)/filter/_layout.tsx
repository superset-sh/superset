import { Stack } from "expo-router";

export default function FilterLayout() {
	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen name="index" options={{ title: "Filter" }} />
			<Stack.Screen name="scope" options={{ title: "Scope" }} />
			<Stack.Screen name="sort" options={{ title: "Sort" }} />
		</Stack>
	);
}
