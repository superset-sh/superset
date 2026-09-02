import { useLingui } from "@lingui/react/macro";
import { Stack } from "expo-router";

export default function NewSessionLayout() {
	const { t } = useLingui();

	return (
		<Stack
			screenOptions={{
				headerBackButtonDisplayMode: "minimal",
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen
				name="branch"
				options={{
					title: t({ message: "Branch" }),
				}}
			/>
			<Stack.Screen
				name="agent"
				options={{
					title: t({ message: "Agent" }),
				}}
			/>
			<Stack.Screen
				name="project"
				options={{
					title: t({ message: "Project" }),
				}}
			/>
			<Stack.Screen
				name="environment"
				options={{
					title: t({
						message: "Environment",
					}),
				}}
			/>
		</Stack>
	);
}
