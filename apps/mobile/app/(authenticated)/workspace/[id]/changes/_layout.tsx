import { Stack } from "expo-router";

export default function WorkspaceChangesLayout() {
	return (
		<Stack screenOptions={{ headerShadowVisible: false }}>
			<Stack.Screen name="index" options={{ title: "Changes" }} />
		</Stack>
	);
}
