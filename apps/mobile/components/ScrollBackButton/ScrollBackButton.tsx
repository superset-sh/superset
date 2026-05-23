import { ArrowDown } from "lucide-react-native";
import { useEffect } from "react";
import { View, type ViewProps } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { FabBase } from "@/components/FabBase";
import { StatusDot } from "@/components/StatusDot";
import { cn } from "@/lib/utils";

export type ScrollBackButtonProps = ViewProps & {
	onPress?: () => void;
	/** Toggle visibility with FadeIn/Out (200ms). Default true. */
	visible?: boolean;
	/** New-messages count — when > 0, renders a small accent dot badge. */
	newMessagesCount?: number;
};

/**
 * Floating circular scroll-back button (UC-RENDER-07). Appears when user has
 * scrolled away from the latest message; tap snaps thread to bottom.
 *
 * Per mol-scroll-back-button spec:
 *  - 2 variants: idle (bare chevron) · new-messages (accent dot badge at top-right)
 *  - Composes FabBase (md, overlay) with ArrowDown icon
 *  - FadeIn/Out via Reanimated when `visible` toggles
 *  - 56pt diameter satisfies 44pt minimum touch target
 *
 * Positioning is caller's responsibility (typically absolute, bottom-right
 * above composer, with safe-area inset).
 *
 * Composes first-party FabBase + StatusDot + Animated.View.
 */
export function ScrollBackButton({
	onPress,
	visible = true,
	newMessagesCount = 0,
	className,
	...props
}: ScrollBackButtonProps) {
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

	const hasNewMessages = newMessagesCount > 0;
	const accessibilityLabel = hasNewMessages
		? `${newMessagesCount} new message${newMessagesCount === 1 ? "" : "s"}, scroll to latest`
		: "Scroll to latest message";

	return (
		<Animated.View
			style={animatedStyle}
			pointerEvents={visible ? "auto" : "none"}
			className={cn("relative", className)}
			{...props}
		>
			<FabBase
				icon={ArrowDown}
				accessibilityLabel={accessibilityLabel}
				variant="overlay"
				size="md"
				onPress={onPress}
			/>
			{hasNewMessages ? (
				<View
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
					className="absolute top-1 right-1"
				>
					<StatusDot variant="live" size="sm" />
				</View>
			) : null}
		</Animated.View>
	);
}
