import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export function WorkspaceDetailScreen() {
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
					<Text className="text-2xl font-bold">Workspace</Text>
				</View>

				<Text className="text-muted-foreground">ID: {id}</Text>

				<Card>
					<CardHeader>
						<CardTitle>Branch Info</CardTitle>
					</CardHeader>
					<CardContent>
						<Text className="text-muted-foreground">
							Branch details will appear here
						</Text>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Claude Session</CardTitle>
					</CardHeader>
					<CardContent>
						<Text className="text-muted-foreground">
							Active Claude session info will appear here
						</Text>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Terminal</CardTitle>
					</CardHeader>
					<CardContent>
						<Text className="text-muted-foreground">
							Terminal output will appear here
						</Text>
					</CardContent>
				</Card>
			</View>
		</ScrollView>
	);
}
