import { memo, useEffect } from "react";
import Animated, {
	cancelAnimation,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export interface TextShimmerProps {
	children: string;
	className?: string;
	duration?: number;
}

const ShimmerComponent = ({
	children,
	className,
	duration = 2,
}: TextShimmerProps) => {
	const opacity = useSharedValue(1);

	useEffect(() => {
		opacity.value = withRepeat(
			withTiming(0.4, { duration: (duration * 1000) / 2 }),
			-1,
			true,
		);
		return () => {
			cancelAnimation(opacity);
		};
	}, [opacity, duration]);

	const animatedStyle = useAnimatedStyle(
		() => ({
			opacity: opacity.value,
		}),
		[opacity],
	);

	return (
		<Animated.View style={animatedStyle} className="self-start">
			<Text className={cn("text-muted-foreground text-sm", className)}>
				{children}
			</Text>
		</Animated.View>
	);
};

export const Shimmer = memo(ShimmerComponent);
