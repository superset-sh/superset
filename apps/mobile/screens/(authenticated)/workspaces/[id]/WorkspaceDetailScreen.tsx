import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";

export function WorkspaceDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();

	// Native Stack header gives us:
	// - swipe-back gesture (Jakob's Law)
	// - hit-tested back button at 44pt by default (Fitts's Law)
	// - large-title behavior + safe-area handling for free
	return (
		<>
			<Stack.Screen options={{ title: "Workspace" }} />
			<ScrollView
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="automatic"
			>
				<View className="p-6 gap-4">
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
		</>
	);
}
