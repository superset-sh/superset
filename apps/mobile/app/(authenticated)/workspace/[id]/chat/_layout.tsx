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
			{/* Glass, edge-to-edge header: the thread content scrolls UNDER a
			    translucent blurred bar so it "extends nicely" behind it. The
			    per-session title is set dynamically from ChatThreadScreen.
			    headerTransparent makes the screen content full-bleed (top y=0),
			    which is why the thread's KeyboardAvoidingView uses offset 0. */}
			<Stack.Screen
				name="[sessionId]"
				options={{
					title: "",
					headerTransparent: true,
					headerBlurEffect: "systemUltraThinMaterial",
					headerStyle: { backgroundColor: "transparent" },
				}}
			/>
		</Stack>
	);
}
