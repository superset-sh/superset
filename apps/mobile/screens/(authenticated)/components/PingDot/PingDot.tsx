import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";

/**
 * Status dot with the expanding-ring halo of desktop's StatusIndicator
 * (Tailwind's animate-ping: scale to 2x while fading, once a second).
 */
export function PingDot({
	color,
	size = 10,
}: {
	color: string;
	size?: number;
}) {
	const progress = useSharedValue(0);
	useEffect(() => {
		progress.value = withRepeat(
			withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }),
			-1,
			false,
		);
	}, [progress]);

	const ringStyle = useAnimatedStyle(() => ({
		transform: [{ scale: 1 + progress.value }],
		opacity: 0.75 * (1 - progress.value),
	}));

	return (
		<View style={{ width: size, height: size }}>
			<Animated.View
				style={[
					{
						position: "absolute",
						width: size,
						height: size,
						borderRadius: size / 2,
						backgroundColor: color,
					},
					ringStyle,
				]}
			/>
			<View
				style={{
					width: size,
					height: size,
					borderRadius: size / 2,
					backgroundColor: color,
				}}
			/>
		</View>
	);
}
