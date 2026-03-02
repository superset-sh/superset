import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export function TaskDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const insets = useSafeAreaInsets();

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentContainerStyle={{ paddingTop: insets.top }}
		>
			<View className="p-6 gap-4">
				<View className="flex-row items-center gap-2">
					<Pressable onPress={() => router.back()} className="p-1">
						<Icon as={ChevronLeft} className="text-foreground size-6" />
					</Pressable>
					<Text className="text-2xl font-bold">Task</Text>
				</View>

				<Text className="text-muted-foreground">ID: {id}</Text>

				<View className="items-center justify-center py-20">
					<Text className="text-muted-foreground text-center">
						Task content will appear here
					</Text>
				</View>
			</View>
		</ScrollView>
	);
}
