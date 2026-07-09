import { Stack } from "expo-router";

export default function HomeLayout() {
	return (
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
		</Stack>
	);
}
