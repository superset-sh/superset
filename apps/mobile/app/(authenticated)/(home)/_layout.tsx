import { Stack } from "expo-router";
import { OrgDropdown } from "@/screens/(authenticated)/components/OrgDropdown";

export default function HomeLayout() {
	return (
		<Stack>
			<Stack.Screen
				name="index"
				options={{
					title: "Home",
					headerLeft: () => <OrgDropdown />,
				}}
			/>
			<Stack.Screen name="workspaces/[id]" options={{ title: "Workspace" }} />
		</Stack>
	);
}
