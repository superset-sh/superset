import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";

export function TaskDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();

	// Native Stack header → swipe-back + 44pt back button (Jakob's + Fitts's Law).
	return (
		<>
			<Stack.Screen options={{ title: "Task" }} />
			<ScrollView
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="automatic"
			>
				<View className="p-6 gap-4">
					<Text className="text-muted-foreground">ID: {id}</Text>

					<View className="items-center justify-center py-20">
						<Text className="text-muted-foreground text-center">
							Task content will appear here
						</Text>
					</View>
				</View>
			</ScrollView>
		</>
	);
}
