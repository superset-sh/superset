import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { useColorScheme, type ViewProps } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { cn } from "@/lib/utils";

// Inlined surface colors — duplicated from apps/mobile/global.css to avoid
// importing lib/theme.ts, which transitively pulls in expo-router's
// UnhandledLinkingContext (breaks Storybook RN rendering). Keep in sync
// with `--color-background` / `--color-card` / `--color-popover` in
// global.css.
const SURFACE_COLORS: Record<
	"light" | "dark",
	{ page: string; soft: string; overlay: string }
> = {
	light: {
		page: "hsl(0, 0%, 100%)",
		soft: "hsl(0, 0%, 100%)",
		overlay: "hsl(0, 0%, 100%)",
	},
	dark: {
		page: "hsl(13, 16%, 7%)",
		soft: "hsl(20, 7%, 12%)",
		overlay: "hsl(20, 7%, 12%)",
	},
};

export type ScrollFadeProps = Omit<ViewProps, "children"> & {
	/** Top edge (default) or bottom edge of the scroll container. */
	direction?: "top" | "bottom";
	/** Which underlying surface to blend into. `page` (default) · `soft` · `overlay`. */
	surface?: "page" | "soft" | "overlay";
	/** Fade height — `sm` (24) · `md` (40, default) · `lg` (64). */
	size?: "sm" | "md" | "lg";
	/** Hide the fade with a 120ms opacity transition (apply when scrolled to the boundary). */
	hidden?: boolean;
};

const sizeClass: Record<NonNullable<ScrollFadeProps["size"]>, string> = {
	sm: "h-6", // 24px
	md: "h-10", // 40px — default
	lg: "h-16", // 64px
};

const directionClass: Record<
	NonNullable<ScrollFadeProps["direction"]>,
	string
> = {
	top: "top-0",
	bottom: "bottom-0",
};

function surfaceColor(
	surface: NonNullable<ScrollFadeProps["surface"]>,
	scheme: "light" | "dark",
): string {
	return SURFACE_COLORS[scheme][surface];
}

/**
 * Decorative gradient overlay signaling that scrollable content extends beyond
 * the visible region. Composes expo-linear-gradient inside a Reanimated wrapper
 * so it can fade in/out at scroll boundaries.
 *
 * Per atom · scroll-fade spec:
 *  - direction: top (default) | bottom — anchors to that edge of the scroll container.
 *  - surface: page (default) | soft | overlay — gradient opaque stop matches the
 *    underlying surface so it blends seamlessly under both light + dark themes.
 *  - size: sm (24px) | md (40px, default) | lg (64px) — fade height.
 *  - hidden: triggers a 120ms opacity-0 transition (apply when scrolled to the boundary).
 *
 * Always `aria-hidden` + `pointerEvents: none` — decorative chrome only.
 *
 * Caller must position the scroll container as `relative` so the absolutely
 * positioned fade anchors correctly.
 */
export function ScrollFade({
	direction = "top",
	surface = "page",
	size = "md",
	hidden = false,
	className,
	style,
	...props
}: ScrollFadeProps) {
	const scheme = (useColorScheme() ?? "dark") as "light" | "dark";
	const opaque = surfaceColor(surface, scheme);
	const gradientColors: [string, string] =
		direction === "top" ? [opaque, "transparent"] : ["transparent", opaque];

	const opacity = useSharedValue(hidden ? 0 : 1);
	useEffect(() => {
		opacity.value = withTiming(hidden ? 0 : 1, { duration: 120 });
	}, [opacity, hidden]);

	const animatedStyle = useAnimatedStyle(
		() => ({ opacity: opacity.value }),
		[opacity],
	);

	return (
		<Animated.View
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			pointerEvents="none"
			style={[animatedStyle, style]}
			className={cn(
				"absolute left-0 right-0 z-[5]",
				directionClass[direction],
				sizeClass[size],
				className,
			)}
			{...props}
		>
			<LinearGradient
				colors={gradientColors}
				style={{ flex: 1 }}
				start={{ x: 0, y: 0 }}
				end={{ x: 0, y: 1 }}
			/>
		</Animated.View>
	);
}
