import { useHeaderHeight } from "expo-router/react-navigation";
import { type RefObject, useCallback, useEffect, useState } from "react";
import { findNodeHandle, View } from "react-native";

// Center of the trailing header button: 16pt margin plus half a 44pt button.
const TRAILING_BUTTON_CENTER = 38;

/**
 * A point just under the header's trailing button, for anchoring a share
 * sheet opened from a `Stack.Toolbar` menu. iPad presents the share sheet as
 * a popover, and a native bar item has no React tag to anchor to — without
 * one it floats mid-screen with no arrow. iPhone ignores the anchor.
 *
 * Render it in the screen's root view and pass `anchorOf(ref)` as
 * `Share.share`'s `anchor`.
 */
export function ToolbarAnchor({ ref }: { ref: RefObject<View | null> }) {
	const headerHeight = useHeaderHeight();
	const [top, setTop] = useState(0);

	// The screen's root starts under the header when it is opaque and at the
	// window's top when it is transparent; measure, don't guess. `y - current`
	// is the root's own offset, so re-measuring at the new position settles.
	const measure = useCallback(() => {
		ref.current?.measureInWindow((_x, y) =>
			setTop((current) => Math.max(0, headerHeight - (y - current))),
		);
	}, [ref, headerHeight]);

	// The anchor's own frame never changes size, so onLayout alone misses a
	// header that changes height after mount (rotation, a transparency
	// change); re-measure whenever it does.
	useEffect(measure, [measure]);

	return (
		<View
			ref={ref}
			collapsable={false}
			pointerEvents="none"
			onLayout={measure}
			style={{
				position: "absolute",
				top,
				right: TRAILING_BUTTON_CENTER,
				width: 1,
				height: 1,
			}}
		/>
	);
}

/** A view's React tag as `Share.share` / `ActionSheetIOS` take an anchor. */
export function anchorOf(ref: RefObject<View | null>): number | undefined {
	return findNodeHandle(ref.current) ?? undefined;
}
