import { useLingui } from "@lingui/react/macro";
import { Stack } from "expo-router";

export default function FilterLayout() {
	const { t } = useLingui();

	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen
				name="index"
				options={{
					title: t({ id: "mobile.nav.filter.title", message: "Filter" }),
				}}
			/>
			<Stack.Screen
				name="scope"
				options={{
					title: t({ id: "mobile.nav.scope.title", message: "Scope" }),
				}}
			/>
			<Stack.Screen
				name="sort"
				options={{ title: t({ id: "mobile.nav.sort.title", message: "Sort" }) }}
			/>
		</Stack>
	);
}
