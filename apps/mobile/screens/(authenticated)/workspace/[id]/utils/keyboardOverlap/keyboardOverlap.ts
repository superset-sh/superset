/**
 * How much of the window's bottom edge the keyboard covers, from a keyboard
 * event's end frame. React Native reports that frame in the window's
 * coordinates (`RCTKeyboardObserver` converts it from the screen's), so
 * compare it with the window's height, not the screen's — they differ in
 * Slide Over and in a Stage Manager window.
 *
 * `endCoordinates.height` alone is wrong on iPad: a floating or split
 * keyboard sits mid-window and covers nothing at the bottom, yet reports its
 * own height. Only a keyboard that reaches the window's bottom edge pushes
 * the composer up, and then by how far its top reaches into the window —
 * which also covers the short shortcut bar shown with a hardware keyboard,
 * and a keyboard that runs past the bottom of a window that ends above the
 * screen's bottom.
 */
export function keyboardOverlap(
	frame: { screenY: number; height: number },
	windowHeight: number,
): number {
	const reachesBottom = frame.screenY + frame.height >= windowHeight - 1;
	if (!reachesBottom) return 0;
	return Math.max(0, Math.min(frame.height, windowHeight - frame.screenY));
}
