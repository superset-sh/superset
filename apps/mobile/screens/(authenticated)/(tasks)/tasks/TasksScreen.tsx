import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";

export function TasksScreen() {
	const [refreshing, setRefreshing] = useState(false);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		// TODO: refresh task data
		setRefreshing(false);
	}, []);

	return (
		<ScrollView
			className="flex-1 bg-background"
			refreshControl={
				<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
			}
		>
			<View className="p-6">
				<View className="items-center justify-center py-20">
					<Text className="text-muted-foreground text-center">
						Tasks synced via Electric will appear here
					</Text>
				</View>
			</View>
		</ScrollView>
	);
}
