import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

/** One pick in an option list, drawn like the new-session agent rows. */
export function OptionRow({
	label,
	isSelected,
	onPress,
	phLabel,
}: {
	label: string;
	isSelected: boolean;
	onPress: () => void;
	phLabel: string;
}) {
	const theme = useTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityState={{ selected: isSelected }}
			className="flex-row items-center gap-2.5 py-2.5"
			ph-label={phLabel}
		>
			<Text
				className="flex-1 text-sm font-medium"
				style={{ color: theme.foreground }}
			>
				{label}
			</Text>
			{isSelected ? (
				<Ionicons name="checkmark-circle" size={18} color={theme.primary} />
			) : null}
		</Pressable>
	);
}
