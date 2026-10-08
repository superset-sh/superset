import type { LucideIcon } from "lucide-react-native";
import { Pressable } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

interface DockChipProps {
	label: string;
	count?: number;
	icon?: LucideIcon;
	selected?: boolean;
	onPress: () => void;
}

export function DockChip({
	label,
	count,
	icon,
	selected = false,
	onPress,
}: DockChipProps) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ selected }}
			className={cn(
				"h-11 flex-row items-center gap-2 rounded-full border px-4 active:opacity-70",
				selected
					? "border-white/25 bg-[#2A2A2A]"
					: "border-white/10 bg-[#1C1C1C]",
			)}
			onPress={onPress}
		>
			{icon ? (
				<Icon as={icon} className="text-muted-foreground size-[18px]" />
			) : null}
			<Text className="text-foreground text-base">{label}</Text>
			{count !== undefined ? (
				<Text className="text-muted-foreground text-base">{count}</Text>
			) : null}
		</Pressable>
	);
}
