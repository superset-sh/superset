import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { cn } from "@/lib/utils";

export type StreamingCursorVariant = "default" | "steady" | "paused";

export type StreamingCursorProps = {
	/** Variant per atom · streaming-cursor spec. */
	variant?: StreamingCursorVariant;
	/** Override the cursor glyph. Defaults to a 2px-wide tall block (▌). */
	glyph?: string;
	/** Override the duration (ms) of a single full blink cycle. Defaults vary by variant. */
	durationMs?: number;
	/** Tailwind text-* class — overrides default variant color. */
	className?: string;
};

const variantColorClass: Record<StreamingCursorVariant, string> = {
	default: "text-streaming-cursor",
	steady: "text-streaming-cursor",
	paused: "text-state-warning-fg",
};

const variantDurationMs: Record<StreamingCursorVariant, number> = {
	default: 1000, // 1s steps(2)
	steady: 0,
	paused: 600, // 0.6s steps(2)
};

/**
 * Blinking text cursor (▌) appended to streaming assistant content (UC-RENDER-01).
 *
 * Per atom · streaming-cursor spec:
 *  - `default` — mint glow, 1s steps(2) blink. Active streaming.
 *  - `steady`  — mint glow, no animation. Snapshot tests / paused-paint frames.
 *  - `paused`  — amber, 0.6s steps(2) blink. Stream pause-pending.
 *
 * Respects AccessibilityInfo.isReduceMotionEnabled() — reduced-motion users see a
 * static steady cursor regardless of variant.
 *
 * Decorative — `aria-hidden`. The containing paragraph carries
 * `role="status" aria-live="polite"` (caller's responsibility).
 */
export function StreamingCursor({
	variant = "default",
	glyph = "▌",
	durationMs,
	className,
}: StreamingCursorProps) {
	const opacity = useSharedValue(1);
	const [reduceMotion, setReduceMotion] = useState(false);

	useEffect(() => {
		let mounted = true;
		AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
			if (mounted) setReduceMotion(enabled);
		});
		const sub = AccessibilityInfo.addEventListener(
			"reduceMotionChanged",
			(enabled) => setReduceMotion(enabled),
		);
		return () => {
			mounted = false;
			sub.remove();
		};
	}, []);

	const resolvedDuration = durationMs ?? variantDurationMs[variant];
	const shouldAnimate =
		variant !== "steady" && resolvedDuration > 0 && !reduceMotion;

	useEffect(() => {
		if (!shouldAnimate) {
			opacity.value = 1;
			return;
		}
		// Emulate CSS `animation-timing-function: steps(2)` — discrete on/off.
		// Each cycle: half duration off (opacity 0.1), half duration on (opacity 1).
		const half = resolvedDuration / 2;
		opacity.value = 1;
		opacity.value = withRepeat(
			withSequence(
				withTiming(0.1, { duration: 1, easing: Easing.linear }),
				withTiming(0.1, { duration: half - 1, easing: Easing.linear }),
				withTiming(1, { duration: 1, easing: Easing.linear }),
				withTiming(1, { duration: half - 1, easing: Easing.linear }),
			),
			-1,
		);
	}, [opacity, resolvedDuration, shouldAnimate]);

	const animatedStyle = useAnimatedStyle(
		() => ({ opacity: opacity.value }),
		[opacity],
	);

	return (
		<Animated.Text
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			style={animatedStyle}
			className={cn(
				"leading-none font-bold",
				variantColorClass[variant],
				className,
			)}
		>
			{glyph}
		</Animated.Text>
	);
}
