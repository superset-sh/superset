import { ScrollView, View } from "react-native";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";

export function SettingsScreen() {
	// Parent (more)/_layout.tsx already provides the native Stack header
	// with title "Settings" — that gives us swipe-back + a 44pt back button
	// for free (Jakob's + Fitts's Law). No custom chevron needed.
	return (
		<ScrollView
			className="flex-1 bg-background"
			contentInsetAdjustmentBehavior="automatic"
		>
			<View className="p-6 gap-4">
				<Card>
					<CardHeader>
						<CardTitle>Account</CardTitle>
					</CardHeader>
					<CardContent>
						<Text className="text-muted-foreground">
							Account settings will appear here
						</Text>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Appearance</CardTitle>
					</CardHeader>
					<CardContent>
						<Text className="text-muted-foreground">
							Theme and display settings will appear here
						</Text>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Notifications</CardTitle>
					</CardHeader>
					<CardContent>
						<Text className="text-muted-foreground">
							Notification preferences will appear here
						</Text>
					</CardContent>
				</Card>
			</View>
		</ScrollView>
	);
}
