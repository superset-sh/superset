import { useRouter } from "expo-router";
import { CloudOff } from "lucide-react-native";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export function HostOfflineView({ hostName }: { hostName: string }) {
	const router = useRouter();
	return (
		<View className="flex-1 items-center justify-center gap-4 px-8">
			<Icon
				as={CloudOff}
				className="text-muted-foreground size-12"
				strokeWidth={1.25}
			/>
			<View className="items-center gap-1">
				<Text className="text-lg font-semibold">{hostName} is offline</Text>
				<Text className="text-center text-muted-foreground">
					Its workspaces will appear when it reconnects.
				</Text>
			</View>
			<Button
				variant="secondary"
				onPress={() => router.push("/(authenticated)/(home)/filter/host")}
			>
				<Text>Switch host</Text>
			</Button>
		</View>
	);
}
