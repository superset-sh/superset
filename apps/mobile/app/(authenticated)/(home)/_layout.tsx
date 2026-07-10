import { Stack } from "expo-router";
import { PromptInputProvider } from "@/components/ai-elements/prompt-input";

export default function HomeLayout() {
	return (
		<PromptInputProvider>
			<Stack
				screenOptions={{
					headerBackButtonDisplayMode: "minimal",
					headerShadowVisible: false,
				}}
			>
				<Stack.Screen name="index" options={{ title: "" }} />
				<Stack.Screen
					name="filter"
					options={{
						presentation: "formSheet",
						headerShown: false,
						sheetAllowedDetents: [1.0],
						sheetGrabberVisible: true,
					}}
				/>
				<Stack.Screen
					name="new-chat"
					options={{
						presentation: "formSheet",
						headerShown: false,
						sheetAllowedDetents: [1.0],
						sheetGrabberVisible: true,
					}}
				/>
				<Stack.Screen
					name="attachments"
					options={{
						presentation: "formSheet",
						headerShown: false,
						sheetAllowedDetents: [0.5, 1.0],
						sheetGrabberVisible: true,
					}}
				/>
			</Stack>
		</PromptInputProvider>
	);
}
