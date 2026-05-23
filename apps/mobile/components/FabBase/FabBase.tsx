import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
	AccessibilityInfo,
	ActivityIndicator,
	Pressable,
	type PressableProps,
	View,
} from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const fabBaseVariants = cva(
	"items-center justify-center active:opacity-90 shadow-lg",
	{
		variants: {
			variant: {
				accent: "bg-primary",
				neutral: "bg-foreground",
				overlay: "bg-popover border border-border",
			},
			size: {
				md: "h-14",
				lg: "h-16",
			},
			withLabel: {
				true: "px-5 flex-row gap-2 rounded-full",
				false: "rounded-full",
			},
		},
		compoundVariants: [
			{ withLabel: false, size: "md", className: "w-14" },
			{ withLabel: false, size: "lg", className: "w-16" },
		],
		defaultVariants: {
			variant: "accent",
			size: "md",
			withLabel: false,
		},
	},
);

type FabBaseVariant = NonNullable<
	VariantProps<typeof fabBaseVariants>["variant"]
>;
type FabBaseSize = NonNullable<VariantProps<typeof fabBaseVariants>["size"]>;

const iconColorByVariant: Record<FabBaseVariant, string> = {
	accent: "text-primary-foreground",
	neutral: "text-background",
	overlay: "text-foreground",
};

const iconSizeBySize: Record<FabBaseSize, string> = {
	md: "size-6",
	lg: "size-7",
};

const ringSizeBySize: Record<FabBaseSize, string> = {
	md: "size-14 rounded-full",
	lg: "size-16 rounded-full",
};

export type FabBaseProps = PressableProps &
	Omit<VariantProps<typeof fabBaseVariants>, "withLabel"> & {
		icon: LucideIcon;
		accessibilityLabel: string;
		label?: string;
		loading?: boolean;
		liveRing?: boolean;
	};

/**
 * Floating action button — sessions-list `+`, scroll-back-button, extended pill.
 *
 * Per atom · fab-base spec:
 *  - Variants: accent (default ember), neutral (inverted), overlay (subtle).
 *  - Sizes: md (56pt, icon 24) · lg (64pt, icon 28).
 *  - `label` enables the extended pill variant (icon + text, auto-width).
 *  - `liveRing` renders a decorative pulsing mint halo via Reanimated;
 *    respects AccessibilityInfo.isReduceMotionEnabled().
 *  - Carries `shadow-lg` elevation; `aria-label` is required.
 *
 * Placement is the caller's responsibility (typically absolute positioning).
 */
export function FabBase({
	icon,
	accessibilityLabel,
	label,
	variant,
	size,
	loading,
	liveRing,
	disabled,
	className,
	...props
}: FabBaseProps) {
	const resolvedVariant: FabBaseVariant = variant ?? "accent";
	const resolvedSize: FabBaseSize = size ?? "md";
	const hasLabel = Boolean(label);
	const isDisabled = disabled || loading;

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

	const ring = useSharedValue(0);
	const shouldPulse = Boolean(liveRing) && !reduceMotion;

	useEffect(() => {
		if (shouldPulse) {
			ring.value = withRepeat(withTiming(1, { duration: 1400 }), -1, false);
		} else {
			ring.value = 0;
		}
	}, [ring, shouldPulse]);

	const ringStyle = useAnimatedStyle(() => {
		if (!shouldPulse) return { opacity: 0 };
		return {
			opacity: 0.5 - ring.value * 0.5,
			transform: [{ scale: 1 + ring.value * 0.4 }],
		};
	}, [ring, shouldPulse]);

	const fab = (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			accessibilityState={{ disabled: isDisabled, busy: loading ?? false }}
			disabled={isDisabled}
			className={cn(
				fabBaseVariants({
					variant: resolvedVariant,
					size: resolvedSize,
					withLabel: hasLabel,
				}),
				isDisabled && "opacity-40",
				className,
			)}
			{...props}
		>
			{loading ? (
				<ActivityIndicator
					size="small"
					className={iconColorByVariant[resolvedVariant]}
				/>
			) : (
				<>
					<Icon
						as={icon}
						className={cn(
							iconSizeBySize[resolvedSize],
							iconColorByVariant[resolvedVariant],
						)}
					/>
					{hasLabel && label ? (
						<Text
							className={cn(
								"font-semibold",
								iconColorByVariant[resolvedVariant],
							)}
						>
							{label}
						</Text>
					) : null}
				</>
			)}
		</Pressable>
	);

	if (!liveRing) return fab;

	return (
		<View
			className={cn(
				"items-center justify-center",
				hasLabel ? "h-16" : ringSizeBySize[resolvedSize],
			)}
		>
			<Animated.View
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
				style={ringStyle}
				className={cn(
					"absolute bg-state-live-fg",
					ringSizeBySize[resolvedSize],
				)}
			/>
			{fab}
		</View>
	);
}
