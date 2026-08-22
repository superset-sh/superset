import { View } from "react-native";
import { Text } from "@/components/ui/text";

export function Row({ label, value }: { label: string; value: string }) {
	return (
		<View className="border-border/60 flex-row items-center justify-between border-b py-4">
			<Text className="text-[17px]">{label}</Text>
			<Text className="text-muted-foreground text-[17px]">{value}</Text>
		</View>
	);
}
