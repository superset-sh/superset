import { cva, type VariantProps } from "class-variance-authority";
import { useEffect, useState } from "react";
import { AccessibilityInfo, View, type ViewProps } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { cn } from "@/lib/utils";

const statusDotVariants = cva("rounded-full", {
	variants: {
		variant: {
			live: "bg-state-live-fg",
			warning: "bg-state-warning-fg",
			danger: "bg-state-danger-fg",
			success: "bg-state-success-fg",
			neutral: "bg-state-neutral-fg",
		},
		size: {
			xs: "size-1.5", // 6px
			sm: "size-2", // 8px — default
			md: "size-2.5", // 10px
		},
	},
	defaultVariants: {
		variant: "neutral",
		size: "sm",
	},
});

type StatusDotVariant = NonNullable<
	VariantProps<typeof statusDotVariants>["variant"]
>;
type StatusDotSize = NonNullable<
	VariantProps<typeof statusDotVariants>["size"]
>;

const haloBgByVariant: Record<StatusDotVariant, string> = {
	live: "bg-state-live-bg",
	warning: "bg-state-warning-bg",
	danger: "bg-state-danger-bg",
	success: "bg-state-success-bg",
	neutral: "bg-transparent",
};

const haloSizeBySize: Record<StatusDotSize, string> = {
	xs: "size-3", // 12px halo behind 6px dot
	sm: "size-4", // 16px halo behind 8px dot
	md: "size-5", // 20px halo behind 10px dot
};

export type StatusDotProps = ViewProps &
	VariantProps<typeof statusDotVariants> & {
		/** Optional accessibility label — e.g. "Streaming". When provided, dot is treated as standalone image. */
		accessibilityLabel?: string;
	};

/**
 * Single colored circle indicating status. Variants drawn from the state palette
 * (live · warning · danger · success · neutral).
 *
 * Behavior per atom · status-dot spec:
 *  - `live` pulses at ~1.4s scale + opacity, gated by AccessibilityInfo.isReduceMotionEnabled() —
 *    reduced-motion users see only the static glow halo.
 *  - `warning` shows a static ring halo at low opacity (the "box-shadow ring" in web spec).
 *  - Other variants render no halo.
 *
 * Sizes (explicit per spec): xs=6px · sm=8px (default) · md=10px.
 */
export function StatusDot({
	variant,
	size,
	className,
	accessibilityLabel,
	...props
}: StatusDotProps) {
	const resolvedVariant: StatusDotVariant = variant ?? "neutral";
	const resolvedSize: StatusDotSize = size ?? "sm";
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

	const pulse = useSharedValue(0);
	const isLive = resolvedVariant === "live";
	const shouldPulse = isLive && !reduceMotion;

	useEffect(() => {
		if (shouldPulse) {
			pulse.value = withRepeat(withTiming(1, { duration: 1400 }), -1, false);
		} else {
			pulse.value = 0;
		}
	}, [pulse, shouldPulse]);

	const haloStyle = useAnimatedStyle(() => {
		if (!shouldPulse) return { opacity: 0.35, transform: [{ scale: 1.5 }] };
		return {
			opacity: 0.6 - pulse.value * 0.6,
			transform: [{ scale: 1 + pulse.value * 0.8 }],
		};
	}, [pulse, shouldPulse]);

	const showHalo = isLive || resolvedVariant === "warning";

	return (
		<View
			accessibilityLabel={accessibilityLabel}
			accessibilityRole={accessibilityLabel ? "image" : undefined}
			className="items-center justify-center"
			{...props}
		>
			{showHalo ? (
				<Animated.View
					style={haloStyle}
					className={cn(
						"absolute rounded-full",
						haloBgByVariant[resolvedVariant],
						haloSizeBySize[resolvedSize],
					)}
				/>
			) : null}
			<View
				className={cn(
					statusDotVariants({ variant: resolvedVariant, size: resolvedSize }),
					className,
				)}
			/>
		</View>
	);
}
