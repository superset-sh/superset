import { createContext, forwardRef, useContext } from "react";
import { StyleSheet, type View, type ViewProps } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";

/** Open only around section collapse/expand commits. */
export const CellTransitionsContext = createContext(false);

const TRANSITION = LinearTransition.duration(240);
const ENTERING = FadeIn.duration(200);

/**
 * FlashList cell container. zIndex = list index makes paint order follow list
 * order (mount order is recycling order, so an earlier cell could otherwise
 * paint over the section below it). Position transitions run only while the
 * gate is open — recycled cells must never animate their reposition during
 * normal scrolling; sticky headers (relative-positioned) never animate.
 */
export const AnimatedCellContainer = forwardRef<
	View,
	ViewProps & { index?: number }
>(function AnimatedCellContainer({ index, style, ...props }, ref) {
	const transitions = useContext(CellTransitionsContext);
	const sticky = StyleSheet.flatten(style)?.position === "relative";
	const animated = transitions && !sticky;
	return (
		<Animated.View
			{...props}
			ref={ref}
			style={[style, index != null && !sticky ? { zIndex: index } : null]}
			layout={animated ? TRANSITION : undefined}
			entering={animated ? ENTERING : undefined}
		/>
	);
});
