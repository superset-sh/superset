import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/hooks/useTheme";

export function ListRowCheck({ visible }: { visible: boolean }) {
	const theme = useTheme();
	return visible ? (
		<Ionicons name="checkmark-circle" size={20} color={theme.primary} />
	) : null;
}
