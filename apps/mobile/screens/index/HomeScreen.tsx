import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { signOut } from "@/lib/auth/client";

export default function HomeScreen() {
	const [switchValue, setSwitchValue] = useState(false);
	const [inputValue, setInputValue] = useState("");

	const handleSignOut = async () => {
		await signOut();
	};

	return (
		<ScrollView className="flex-1 bg-background">
			<View className="p-6 gap-6">
				{/* Header with Sign Out */}
				<View className="gap-2">
					<View className="flex-row items-center justify-between">
						<View className="flex-1">
							<Text className="text-4xl font-bold">Superset Mobile</Text>
							<Text className="text-lg text-muted-foreground">
								Component Showcase
							</Text>
						</View>
						<Button variant="outline" size="sm" onPress={handleSignOut}>
							<Text>Sign Out</Text>
						</Button>
					</View>
				</View>

				{/* Typography Section */}
				<Card>
					<CardHeader>
						<CardTitle>Typography</CardTitle>
						<CardDescription>
							Text components with various styles
						</CardDescription>
					</CardHeader>
					<CardContent className="gap-3">
						<Text className="text-xl font-bold">Heading Text</Text>
						<Text className="text-base">Regular body text</Text>
						<Text className="text-sm text-muted-foreground">
							Muted secondary text
						</Text>
					</CardContent>
				</Card>

				{/* Button Section */}
				<Card>
					<CardHeader>
						<CardTitle>Buttons</CardTitle>
						<CardDescription>
							Various button styles and variants
						</CardDescription>
					</CardHeader>
					<CardContent className="gap-3">
						<Button>
							<Text>Default Button</Text>
						</Button>
						<Button variant="secondary">
							<Text>Secondary Button</Text>
						</Button>
						<Button variant="destructive">
							<Text>Destructive Button</Text>
						</Button>
						<Button variant="outline">
							<Text>Outline Button</Text>
						</Button>
						<Button variant="ghost">
							<Text>Ghost Button</Text>
						</Button>
					</CardContent>
				</Card>

				{/* Input Section */}
				<Card>
					<CardHeader>
						<CardTitle>Input</CardTitle>
						<CardDescription>Text input field</CardDescription>
					</CardHeader>
					<CardContent className="gap-3">
						<Input
							placeholder="Enter text..."
							value={inputValue}
							onChangeText={setInputValue}
						/>
						{inputValue ? (
							<Text className="text-sm text-muted-foreground">
								You typed: {inputValue}
							</Text>
						) : null}
					</CardContent>
				</Card>

				{/* Switch Section */}
				<Card>
					<CardHeader>
						<CardTitle>Switch</CardTitle>
						<CardDescription>Toggle switch component</CardDescription>
					</CardHeader>
					<CardContent>
						<View className="flex-row items-center justify-between">
							<Text>Enable notifications</Text>
							<Switch checked={switchValue} onCheckedChange={setSwitchValue} />
						</View>
						<Text className="text-sm text-muted-foreground mt-2">
							Switch is {switchValue ? "ON" : "OFF"}
						</Text>
					</CardContent>
				</Card>

				{/* Card Examples */}
				<Card>
					<CardHeader>
						<CardTitle>Cards</CardTitle>
						<CardDescription>Nested card example</CardDescription>
					</CardHeader>
					<CardContent className="gap-3">
						<Card>
							<CardHeader>
								<CardTitle>Inner Card</CardTitle>
								<CardDescription>This is a card inside a card</CardDescription>
							</CardHeader>
							<CardContent>
								<Text>Cards can be nested for complex layouts</Text>
							</CardContent>
							<CardFooter>
								<Button variant="outline" className="w-full">
									<Text>Card Action</Text>
								</Button>
							</CardFooter>
						</Card>
					</CardContent>
				</Card>
			</View>
		</ScrollView>
	);
}
