import type { ComponentProps, ReactNode } from "react";
import {
	Pressable,
	type StyleProp,
	StyleSheet,
	type ViewStyle,
} from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS_IN_MS = 80;
const PRESS_OUT_MS = 250;

// Button press feedback (scale + highlight, held while pressed). Not for
// rows with a native context menu — the system lift owns that animation;
// give those a plain Pressable with a highlight.
export function PressableScale({
	children,
	style,
	onPressIn,
	onPressOut,
	...props
}: Omit<ComponentProps<typeof Pressable>, "children" | "style"> & {
	children?: ReactNode;
	style?: StyleProp<ViewStyle>;
}) {
	const pressed = useSharedValue(0);
	const containerStyle = useAnimatedStyle(() => ({
		transform: [{ scale: 1 - pressed.value * 0.025 }],
	}));
	const highlightStyle = useAnimatedStyle(() => ({
		opacity: pressed.value,
	}));

	return (
		<AnimatedPressable
			{...props}
			style={[style, containerStyle]}
			onPressIn={(event) => {
				pressed.value = withTiming(1, { duration: PRESS_IN_MS });
				onPressIn?.(event);
			}}
			onPressOut={(event) => {
				pressed.value = withTiming(0, { duration: PRESS_OUT_MS });
				onPressOut?.(event);
			}}
		>
			<Animated.View
				pointerEvents="none"
				style={[
					StyleSheet.absoluteFill,
					{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12 },
					highlightStyle,
				]}
			/>
			{children}
		</AnimatedPressable>
	);
}
