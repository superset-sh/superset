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
				name="organizations"
				options={{
					presentation: "formSheet",
					sheetAllowedDetents: [0.5],
					sheetGrabberVisible: true,
					title: "Organizations",
				}}
			/>
			<Stack.Screen
				name="new-session"
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
