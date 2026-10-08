import { useLingui } from "@lingui/react/macro";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ScrollView } from "react-native";
import { useActiveChat } from "../stores/activeChatStore";
import { BackgroundTasks } from "./components/BackgroundTasks";

export function BackgroundTasksSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const { session } = useLocalSearchParams<{ session?: string }>();
	const { backgroundTasks: tasks, stopTask } = useActiveChat(session);

	useEffect(() => {
		if (tasks.length === 0 && router.canGoBack()) router.back();
	}, [tasks.length, router]);

	return (
		<>
			<Stack.Screen
				options={{ title: t({ message: "Running in the background" }) }}
			/>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityLabel={t({ message: "Close" })}
					icon="xmark"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			<ScrollView
				className="bg-background flex-1"
				contentContainerClassName="px-4 pb-10 pt-2"
				contentInsetAdjustmentBehavior="automatic"
			>
				<BackgroundTasks onStop={stopTask} tasks={tasks} />
			</ScrollView>
		</>
	);
}
