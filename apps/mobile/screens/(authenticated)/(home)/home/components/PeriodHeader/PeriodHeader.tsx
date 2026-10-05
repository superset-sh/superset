import { View } from "react-native";
import { Text } from "@/components/ui/text";

export function PeriodHeader({ label }: { label: string }) {
	return (
		<View className="px-4 pb-1 pt-5">
			<Text
				className="text-muted-foreground font-medium text-[14px]"
				numberOfLines={1}
			>
				{label}
			</Text>
		</View>
	);
}
