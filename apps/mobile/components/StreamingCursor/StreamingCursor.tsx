import { useEffect } from "react";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { cn } from "@/lib/utils";

export type StreamingCursorProps = {
	/** Override the cursor glyph. Defaults to a 2px-wide block (▌). */
	glyph?: string;
	/** Override the duration (ms) of a single fade cycle. */
	durationMs?: number;
	/** Tailwind text-* class for cursor color. Defaults to streaming color (--color-streaming-cursor). */
	className?: string;
};

/**
 * Blinking text cursor (▌) appended to streaming assistant content (UC-RENDER-01).
 * Drives a Reanimated opacity loop on a shared value. Hidden from screen readers
 * (decorative).
 */
export function StreamingCursor({
	glyph = "▌",
	durationMs = 600,
	className,
}: StreamingCursorProps) {
	const opacity = useSharedValue(1);

	useEffect(() => {
		opacity.value = withRepeat(
			withTiming(0.1, { duration: durationMs }),
			-1,
			true,
		);
	}, [opacity, durationMs]);

	const animatedStyle = useAnimatedStyle(
		() => ({ opacity: opacity.value }),
		[opacity],
	);

	return (
		<Animated.Text
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			style={animatedStyle}
			className={cn("text-streaming-cursor leading-none", className)}
		>
			{glyph}
		</Animated.Text>
	);
}
