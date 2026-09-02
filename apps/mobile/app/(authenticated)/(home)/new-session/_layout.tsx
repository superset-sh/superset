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
					title: t({ id: "mobile.nav.branch.title", message: "Branch" }),
				}}
			/>
			<Stack.Screen
				name="agent"
				options={{
					title: t({ id: "mobile.nav.agent.title", message: "Agent" }),
				}}
			/>
			<Stack.Screen
				name="project"
				options={{
					title: t({ id: "mobile.nav.project.title", message: "Project" }),
				}}
			/>
		</Stack>
	);
}
