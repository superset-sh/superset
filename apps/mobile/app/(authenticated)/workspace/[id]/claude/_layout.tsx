import { Stack } from "expo-router";

export default function WorkspaceClaudeLayout() {
	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
				headerTransparent: true,
				headerBlurEffect: "systemUltraThinMaterial",
				headerStyle: { backgroundColor: "transparent" },
			}}
		/>
	);
}
