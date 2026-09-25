import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

/** Small muted header over a run of option rows. */
export function SectionLabel({ label }: { label: string }) {
	const theme = useTheme();
	return (
		<View className="pt-4 pb-1">
			<Text
				className="text-xs uppercase"
				style={{ color: theme.mutedForeground }}
			>
				{label}
			</Text>
		</View>
	);
}
