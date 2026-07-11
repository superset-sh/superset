import { type ComponentProps, type ReactNode, useRef } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS_IN_MS = 80;
const PRESS_OUT_MS = 250;
// Fade back to rest while a long press develops, so the row is clean before
// the native context-menu lift snapshots it (~500ms in).
const HOLD_FADE_DELAY_MS = 300;
const HOLD_FADE_MS = 150;

export function PressableScale({
	children,
	onPressIn,
	onPressOut,
	...props
}: Omit<ComponentProps<typeof Pressable>, "children"> & {
	children?: ReactNode;
}) {
	const pressed = useSharedValue(0);
	const holdFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const containerStyle = useAnimatedStyle(() => ({
		transform: [{ scale: 1 - pressed.value * 0.025 }],
	}));
	const highlightStyle = useAnimatedStyle(() => ({
		opacity: pressed.value,
	}));

	return (
		<AnimatedPressable
			{...props}
			style={containerStyle}
			onPressIn={(event) => {
				pressed.value = withTiming(1, { duration: PRESS_IN_MS });
				if (holdFadeTimer.current) clearTimeout(holdFadeTimer.current);
				holdFadeTimer.current = setTimeout(() => {
					pressed.value = withTiming(0, { duration: HOLD_FADE_MS });
				}, HOLD_FADE_DELAY_MS);
				onPressIn?.(event);
			}}
			onPressOut={(event) => {
				if (holdFadeTimer.current) {
					clearTimeout(holdFadeTimer.current);
					holdFadeTimer.current = null;
				}
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
