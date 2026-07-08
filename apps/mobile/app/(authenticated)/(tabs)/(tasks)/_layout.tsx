import { Stack } from "expo-router";
import { titledScreenOptions } from "@/lib/navigation";

export default function TasksLayout() {
	return (
		<Stack screenOptions={titledScreenOptions}>
			<Stack.Screen name="index" options={{ title: "Tasks" }} />
			<Stack.Screen name="[id]" options={{ title: "Task" }} />
		</Stack>
	);
}
