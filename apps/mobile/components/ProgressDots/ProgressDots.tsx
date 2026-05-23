import { cva, type VariantProps } from "class-variance-authority";
import { useEffect, useState } from "react";
import { AccessibilityInfo, View, type ViewProps } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { cn } from "@/lib/utils";

const containerVariants = cva("flex-row items-center", {
	variants: {
		size: {
			xs: "gap-0.5",
			sm: "gap-1",
			md: "gap-1.5",
		},
	},
	defaultVariants: {
		size: "sm",
	},
});

const dotVariants = cva("rounded-full", {
	variants: {
		variant: {
			muted: "bg-muted-foreground",
			accent: "bg-primary",
			live: "bg-state-live-fg",
			faint: "bg-muted",
		},
		size: {
			xs: "size-1", // 4px
			sm: "size-1.5", // 6px
			md: "size-2", // 8px
		},
	},
	defaultVariants: {
		variant: "muted",
		size: "sm",
	},
});

export type ProgressDotsProps = ViewProps &
	VariantProps<typeof dotVariants> & {
		/** Accessibility label announced via the live-region wrapper. Defaults to "Loading". */
		accessibilityLabel?: string;
		/** When true, freezes the animation (snapshot tests / debug inspection). */
		paused?: boolean;
	};

const DOT_INDICES = [0, 1, 2] as const;

/**
 * 3-dot staggered pulse loading indicator. Distinct from a spinner (rotation)
 * and a streaming-cursor (inline blink).
 *
 * Per atom · progress-dots spec:
 *  - Variants: muted (default) · accent · live · faint.
 *  - Sizes: xs (4px dots) · sm (6px dots, default) · md (8px dots).
 *  - 1.4s pulse cycle per dot; 200ms stagger between dots.
 *  - Respects AccessibilityInfo.isReduceMotionEnabled() — reduced-motion users
 *    see static dots at opacity 0.8.
 *  - Container carries `accessibilityRole="progressbar"` + `accessibilityState.busy`.
 *  - Dots are decorative children of the live-region container.
 */
export function ProgressDots({
	variant,
	size,
	accessibilityLabel = "Loading",
	paused,
	className,
	...props
}: ProgressDotsProps) {
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

	const shouldAnimate = !paused && !reduceMotion;

	return (
		<View
			accessibilityRole="progressbar"
			accessibilityLabel={accessibilityLabel}
			accessibilityState={{ busy: true }}
			accessibilityLiveRegion="polite"
			className={cn(containerVariants({ size }), className)}
			{...props}
		>
			{DOT_INDICES.map((i) => (
				<Dot
					key={i}
					index={i}
					variant={variant ?? "muted"}
					size={size ?? "sm"}
					animate={shouldAnimate}
				/>
			))}
		</View>
	);
}

type DotProps = {
	index: number;
	variant: NonNullable<VariantProps<typeof dotVariants>["variant"]>;
	size: NonNullable<VariantProps<typeof dotVariants>["size"]>;
	animate: boolean;
};

function Dot({ index, variant, size, animate }: DotProps) {
	const opacity = useSharedValue(0.4);

	useEffect(() => {
		if (!animate) {
			opacity.value = 0.8;
			return;
		}
		// 1.4s cycle, staggered by 200ms per dot.
		const cycleMs = 1400;
		opacity.value = withDelay(
			index * 200,
			withRepeat(
				withTiming(1, {
					duration: cycleMs / 2,
					easing: Easing.inOut(Easing.ease),
				}),
				-1,
				true,
			),
		);
	}, [opacity, animate, index]);

	const style = useAnimatedStyle(() => ({ opacity: opacity.value }), [opacity]);

	return (
		<Animated.View
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			style={style}
			className={dotVariants({ variant, size })}
		/>
	);
}
