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
			<Stack.Screen name="project" options={{ title: "Project" }} />
			<Stack.Screen name="host" options={{ title: "Host" }} />
			<Stack.Screen name="sort" options={{ title: "Sort" }} />
		</Stack>
	);
}
