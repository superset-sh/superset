import { ChevronDown } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

interface ChipProps {
	label: string;
	leading?: ReactNode;
	onPress: () => void;
}

/** One scope, named and tappable. */
export function Chip({ label, leading, onPress }: ChipProps) {
	const theme = useTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityLabel={label}
			ph-label="scope-chip"
			className="bg-secondary/60 flex-row items-center gap-1.5 rounded-full py-1.5 pl-3 pr-2.5 active:opacity-60"
		>
			{leading}
			<Text className="text-foreground max-w-40 text-xs" numberOfLines={1}>
				{label}
			</Text>
			<ChevronDown size={12} color={theme.mutedForeground} strokeWidth={2.5} />
		</Pressable>
	);
}
