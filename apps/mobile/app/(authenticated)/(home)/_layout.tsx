import { useLingui } from "@lingui/react/macro";
import { Stack } from "expo-router";

export default function HomeLayout() {
	const { t } = useLingui();

	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen name="index" options={{ title: "" }} />
			<Stack.Screen
				name="pages/index"
				options={{ title: t({ message: "Pages" }) }}
			/>
			<Stack.Screen
				name="pages/[slug]/index"
				options={{ title: "", headerBackTitle: t({ message: "Pages" }) }}
			/>
			<Stack.Screen
				name="pages/[slug]/compose"
				options={{
					presentation: "formSheet",
					title: t({ message: "Write a comment" }),
					sheetAllowedDetents: [0.5],
					sheetGrabberVisible: true,
				}}
			/>
			<Stack.Screen
				name="pages/[slug]/quick"
				options={{
					presentation: "formSheet",
					title: t({ message: "Quick feedback" }),
					sheetAllowedDetents: [0.6],
					sheetGrabberVisible: true,
				}}
			/>
			<Stack.Screen
				name="pages/[slug]/thread"
				options={{
					presentation: "formSheet",
					title: t({ message: "Comment" }),
					sheetAllowedDetents: [0.7],
					sheetGrabberVisible: true,
				}}
			/>
			<Stack.Screen
				name="pages/[slug]/comments"
				options={{
					presentation: "formSheet",
					title: t({ message: "All comments" }),
					sheetAllowedDetents: [1.0],
					sheetGrabberVisible: true,
				}}
			/>
			<Stack.Screen
				name="search"
				options={{
					presentation: "formSheet",
					title: t({ message: "Search" }),
					sheetAllowedDetents: [1.0],
					sheetGrabberVisible: true,
				}}
			/>
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
					title: t({
						message: "Organizations",
					}),
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
