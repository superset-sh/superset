import { Stack } from "expo-router";

export default function WorkspaceChatLayout() {
	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen name="index" options={{ title: "Chats" }} />
			<Stack.Screen name="[sessionId]" options={{ title: "" }} />
		</Stack>
	);
}
