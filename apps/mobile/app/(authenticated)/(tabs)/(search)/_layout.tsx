import { Stack } from "expo-router";
import { titledScreenOptions } from "@/lib/navigation";

export default function SearchLayout() {
	return (
		<Stack screenOptions={titledScreenOptions}>
			<Stack.Screen name="index" options={{ title: "Search" }} />
		</Stack>
	);
}
