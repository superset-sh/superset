import { Stack } from "expo-router";

export default function NewChatLayout() {
	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen name="branch" options={{ title: "Branch" }} />
			<Stack.Screen name="model" options={{ title: "Model" }} />
			<Stack.Screen name="project" options={{ title: "Project" }} />
		</Stack>
	);
}
