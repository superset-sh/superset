import { Stack } from "expo-router";

export default function ContextLayout() {
	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen name="index" options={{ title: "Attachments" }} />
			<Stack.Screen name="screenshots" options={{ title: "Screenshots" }} />
		</Stack>
	);
}
