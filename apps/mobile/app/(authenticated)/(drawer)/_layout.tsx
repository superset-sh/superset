import { Stack } from "expo-router";
import { DrawerToggleButton } from "@/screens/(authenticated)/components/DrawerToggleButton";

export default function DrawerGroupLayout() {
	return (
		<Stack
			screenOptions={{
				headerLeft: () => <DrawerToggleButton />,
			}}
		>
			<Stack.Screen name="workspaces/index" options={{ title: "Workspaces" }} />
			<Stack.Screen name="tasks/index" options={{ title: "Tasks" }} />
		</Stack>
	);
}
