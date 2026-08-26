import {
	Host,
	Button as SwiftUIButton,
	Image as SwiftUIImage,
} from "@expo/ui/swift-ui";
import {
	accessibilityLabel,
	buttonBorderShape,
	buttonStyle,
	frame,
} from "@expo/ui/swift-ui/modifiers";
import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

/** Matches the diameter the navigation bar's own glass buttons render at. */
const SIZE = 44;
const IN_MS = 180;
const OUT_MS = 160;

/**
 * Floats over the terminal while its viewport is scrolled up, the native half
 * of the page's overlay scrollbar: same question, same lifetime, opposite
 * edges. Positioned rather than laid out — the terminal's bottom inset is
 * measured from the composer stack, and joining it would resize the PTY every
 * time the button came and went. Staying inside that container is also what
 * gives it keyboard avoidance for free: the container's bottom margin grows by
 * the keyboard height under a LayoutAnimation on the keyboard's own curve, and
 * anything anchored to its bottom edge rides along.
 *
 * A real SwiftUI Button rather than glass painted behind a Pressable, so the
 * press response, the shape, and the degradation under Reduce Transparency are
 * the system's rather than ours. The app's deployment target is iOS 26, so
 * .glass is always available and needs no fallback.
 */
export function ScrollToBottomButton({
	visible,
	onPress,
}: {
	visible: boolean;
	onPress: () => void;
}) {
	// Mounted whenever a terminal is: fading out requires outliving the state
	// change that hid it.
	const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

	useEffect(() => {
		const animation = Animated.timing(progress, {
			toValue: visible ? 1 : 0,
			duration: visible ? IN_MS : OUT_MS,
			easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
			// The PTY streams onto the JS thread continuously, so this has to run
			// on the UI thread or the fade stutters under output.
			useNativeDriver: true,
		});
		animation.start();
		return () => animation.stop();
	}, [visible, progress]);

	return (
		<Animated.View
			className="absolute inset-x-0 bottom-3 items-center"
			pointerEvents={visible ? "box-none" : "none"}
			style={{ opacity: progress }}
		>
			<Host style={{ width: SIZE, height: SIZE }} colorScheme="dark">
				<SwiftUIButton
					onPress={onPress}
					testID="terminal-scroll-to-bottom"
					modifiers={[
						buttonStyle("glass"),
						buttonBorderShape("circle"),
						// .glass sizes itself to its label, which for a lone symbol is
						// tiny — the frame is what makes it the 44pt the navigation bar's
						// own glass buttons render at.
						frame({ width: SIZE, height: SIZE }),
						accessibilityLabel("Scroll to bottom"),
					]}
				>
					<SwiftUIImage systemName="arrow.down" size={18} color="#fafafa" />
				</SwiftUIButton>
			</Host>
		</Animated.View>
	);
}
