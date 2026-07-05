import { ActivityIndicator } from "react-native";
import { THEME } from "@/lib/theme";

function Spinner({
	size = "small",
	color,
	...props
}: React.ComponentProps<typeof ActivityIndicator>) {
	return (
		<ActivityIndicator
			size={size}
			color={color ?? THEME.dark.mutedForeground}
			{...props}
		/>
	);
}

export { Spinner };
