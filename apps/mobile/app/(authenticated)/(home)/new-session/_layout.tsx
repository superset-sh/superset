import { Stack } from "expo-router";

export default function NewSessionLayout() {
	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen name="branch" options={{ title: "Branch" }} />
			<Stack.Screen name="agent" options={{ title: "Agent" }} />
			<Stack.Screen name="project" options={{ title: "Project" }} />
		</Stack>
	);
}
