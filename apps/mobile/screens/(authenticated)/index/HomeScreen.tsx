import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
import { apiClient } from "@/lib/trpc/client";

interface OnlineDevice {
	id: string;
	deviceId: string;
	deviceName: string;
	deviceType: "desktop" | "mobile" | "web";
	lastSeenAt: Date;
	ownerId: string;
	ownerName: string;
	ownerEmail: string;
}

export function HomeScreen() {
	const router = useRouter();
	const [switchValue, setSwitchValue] = useState(false);
	const [inputValue, setInputValue] = useState("");
	const [devices, setDevices] = useState<OnlineDevice[]>([]);
	const [devicesLoading, setDevicesLoading] = useState(true);

	const fetchDevices = useCallback(async () => {
		try {
			setDevicesLoading(true);
			const result = await apiClient.device.listOnlineDevices.query();
			setDevices(result);
		} catch (err) {
			console.warn("[devices] Failed to fetch:", err);
		} finally {
			setDevicesLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchDevices();
		const interval = setInterval(fetchDevices, 10_000);
		return () => clearInterval(interval);
	}, [fetchDevices]);

	const formatLastSeen = (date: Date) => {
		const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
		if (seconds < 60) return `${seconds}s ago`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		return new Date(date).toLocaleTimeString();
	};

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

				{/* Electric Collections Demo Link */}
				<Card>
					<CardHeader>
						<CardTitle>Electric Collections Demo</CardTitle>
						<CardDescription>
							View real-time synced data with Electric SQL
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button onPress={() => router.push("/(authenticated)/demo")}>
							<Text>Open Demo Screen</Text>
						</Button>
					</CardContent>
				</Card>

				{/* Online Devices */}
				<Card>
					<CardHeader>
						<CardTitle>Online Devices</CardTitle>
						<CardDescription>
							Devices connected to your account (refreshes every 10s)
						</CardDescription>
					</CardHeader>
					<CardContent className="gap-3">
						{devicesLoading && devices.length === 0 && (
							<Text className="text-muted-foreground">Loading...</Text>
						)}
						{!devicesLoading && devices.length === 0 && (
							<Text className="text-muted-foreground">No devices online</Text>
						)}
						{devices.map((device) => (
							<View
								key={device.id}
								className="flex-row items-center justify-between p-3 bg-accent rounded-lg"
							>
								<View className="flex-1">
									<Text className="font-medium">{device.deviceName}</Text>
									<Text className="text-sm text-muted-foreground">
										{device.ownerName} · {device.deviceType} ·{" "}
										{formatLastSeen(device.lastSeenAt)}
									</Text>
								</View>
								<View className="flex-row items-center gap-2">
									<View className="h-2 w-2 rounded-full bg-green-500" />
									<Text className="text-sm text-muted-foreground">Online</Text>
								</View>
							</View>
						))}
					</CardContent>
					<CardFooter>
						<Button variant="outline" className="w-full" onPress={fetchDevices}>
							<Text>Refresh</Text>
						</Button>
					</CardFooter>
				</Card>

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
