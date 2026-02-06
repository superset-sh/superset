import * as React from "react";
import type { View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { cn } from "@/lib/utils";

const duration = 1000;

function Skeleton({
	className,
	...props
}: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
	const sv = useSharedValue(1);

	React.useEffect(() => {
		sv.value = withRepeat(withTiming(0.5, { duration }), -1, true);
	}, [sv]);

	const style = useAnimatedStyle(
		() => ({
			opacity: sv.value,
		}),
		[sv],
	);
	return (
		<Animated.View
			style={style}
			className={cn("bg-secondary dark:bg-muted rounded-md", className)}
			{...props}
		/>
	);
}

export { Skeleton };
