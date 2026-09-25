import { View } from "react-native";
import { useTheme } from "@/hooks/useTheme";

const ONLINE_COLOR = "#3fb950";

export function HostStatusDot({ isOnline }: { isOnline: boolean }) {
	const theme = useTheme();
	return (
		<View
			className="size-2 rounded-full"
			style={{
				backgroundColor: isOnline ? ONLINE_COLOR : theme.mutedForeground,
			}}
		/>
	);
}
