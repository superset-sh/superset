import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

export function SheetCloseButton({
	onPress,
	className,
}: {
	onPress?: () => void;
	className?: string;
}) {
	const theme = useTheme();
	const router = useRouter();
	return (
		<Pressable
			accessibilityLabel="Close"
			className={cn(
				"size-9 items-center justify-center rounded-full bg-secondary",
				className,
			)}
			hitSlop={8}
			onPress={onPress ?? (() => router.back())}
		>
			<Ionicons name="close" size={20} color={theme.foreground} />
		</Pressable>
	);
}
