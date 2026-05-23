import {
	AlertTriangle,
	ArrowDown,
	ArrowUp,
	type LucideIcon,
	Sparkles,
	Target,
} from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, type PressableProps } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type PendingActionPillKind = "approval" | "question" | "plan";

type KindConfig = {
	leadingIcon: LucideIcon;
	defaultDirection: "down" | "up" | undefined;
	defaultLabel: string;
};

const KIND: Record<PendingActionPillKind, KindConfig> = {
	approval: {
		leadingIcon: Target,
		defaultDirection: "down",
		defaultLabel: "PENDING",
	},
	question: {
		leadingIcon: AlertTriangle,
		defaultDirection: "up",
		defaultLabel: "QUESTION",
	},
	plan: { leadingIcon: Sparkles, defaultDirection: "up", defaultLabel: "PLAN" },
};

export type PendingActionPillProps = PressableProps & {
	kind?: PendingActionPillKind;
	/** Override the count label. Defaults to "1 PENDING" / "QUESTION" / "PLAN". */
	label?: string;
	/** Count prefix (e.g. 1 → "1 PENDING"). Approval kind only. */
	count?: number;
	/** Show + direction of trailing arrow. Defaults to kind default; pass null to hide. */
	direction?: "down" | "up" | null;
	/** When true (default), mounts with FadeIn animation; false renders static. */
	visible?: boolean;
};

/**
 * Floating pill above the composer when a session has an active pause and the
 * user has scrolled away or dismissed the relevant inline card / sheet
 * (UC-PAUSE-04 §A).
 *
 * Per mol-pending-action-pill spec:
 *  - 3 kinds: approval (target + ↓) · question (warning + ↑) · plan (sparkles + ↑)
 *  - FadeIn enter (opacity 0 → 1, translateY 8 → 0) when `visible` toggles true,
 *    FadeOut exit on false
 *  - Always warning-amber palette via Pill-like styling
 *
 * Pressable positioning is caller's responsibility (typically absolute, bottom-right
 * above composer).
 */
export function PendingActionPill({
	kind = "approval",
	label,
	count,
	direction,
	visible = true,
	className,
	disabled,
	...props
}: PendingActionPillProps) {
	const cfg = KIND[kind];
	const resolvedLabel =
		label ??
		(count !== undefined && kind === "approval"
			? `${count} ${cfg.defaultLabel}`
			: cfg.defaultLabel);
	const resolvedDirection =
		direction === undefined ? cfg.defaultDirection : direction;

	const opacity = useSharedValue(visible ? 1 : 0);
	const translateY = useSharedValue(visible ? 0 : 8);

	useEffect(() => {
		opacity.value = withTiming(visible ? 1 : 0, { duration: 200 });
		translateY.value = withTiming(visible ? 0 : 8, { duration: 200 });
	}, [opacity, translateY, visible]);

	const animatedStyle = useAnimatedStyle(
		() => ({
			opacity: opacity.value,
			transform: [{ translateY: translateY.value }],
		}),
		[opacity, translateY],
	);

	if (!visible && opacity.value === 0) {
		return null;
	}

	const directionIcon =
		resolvedDirection === "down"
			? ArrowDown
			: resolvedDirection === "up"
				? ArrowUp
				: null;

	return (
		<Animated.View style={animatedStyle}>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`${resolvedLabel} — tap to view`}
				disabled={disabled}
				className={cn(
					"flex-row items-center gap-1.5 h-7 px-3 rounded-full bg-state-warning-bg border border-state-warning-fg/30 active:opacity-70",
					disabled && "opacity-50",
					className,
				)}
				{...props}
			>
				<Icon as={cfg.leadingIcon} className="size-3.5 text-state-warning-fg" />
				<Text className="text-xs font-mono uppercase tracking-wider font-bold text-state-warning-fg">
					{resolvedLabel}
				</Text>
				{directionIcon ? (
					<Icon as={directionIcon} className="size-3.5 text-state-warning-fg" />
				) : null}
			</Pressable>
		</Animated.View>
	);
}
