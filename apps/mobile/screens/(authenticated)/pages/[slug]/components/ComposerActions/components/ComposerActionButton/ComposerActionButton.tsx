import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { Pressable } from "react-native";
import { Icon } from "@/components/ui/icon";

interface ComposerActionButtonProps {
	icon: LucideIcon;
	label: string;
	disabled: boolean;
	onPress: () => void;
}

export function ComposerActionButton({
	icon,
	label,
	disabled,
	onPress,
}: ComposerActionButtonProps) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			disabled={disabled}
			onPress={() => {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				onPress();
			}}
			className={
				disabled
					? "size-10 items-center justify-center rounded-lg opacity-50"
					: "size-10 items-center justify-center rounded-lg active:bg-accent"
			}
		>
			<Icon as={icon} className="text-muted-foreground size-4.5" />
		</Pressable>
	);
}
