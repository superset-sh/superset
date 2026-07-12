import { View } from "react-native";
import { Text } from "@/components/ui/text";

export function SummaryRow({
	additions,
	deletions,
	fileCount,
}: {
	additions: number;
	deletions: number;
	fileCount: number;
}) {
	return (
		<View className="flex-row items-center gap-1.5 px-4 pb-3 pt-1">
			<Text className="text-green-500 font-semibold text-[15px]">
				+{additions.toLocaleString()}
			</Text>
			<Text className="text-red-500 font-semibold text-[15px]">
				−{deletions.toLocaleString()}
			</Text>
			<Text className="text-muted-foreground text-[15px]">
				· {fileCount === 1 ? "1 file" : `${fileCount} files`}
			</Text>
		</View>
	);
}
