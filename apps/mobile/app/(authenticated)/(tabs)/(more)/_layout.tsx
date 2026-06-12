import { Stack } from "expo-router";
import { titledScreenOptions } from "@/lib/navigation";

export default function MoreLayout() {
	return (
		<Stack screenOptions={titledScreenOptions}>
			<Stack.Screen name="index" options={{ headerShown: false }} />
			<Stack.Screen name="settings/index" options={{ title: "Settings" }} />
		</Stack>
	);
}
