import { Stack } from "expo-router";

export default function HomeLayout() {
	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
			}}
		>
			<Stack.Screen name="index" options={{ title: "" }} />
			<Stack.Screen name="workspaces/[id]" options={{ title: "Workspace" }} />
		</Stack>
	);
}
