/**
 * How much of the bottom edge the keyboard covers, from a keyboard event's
 * end frame (screen coordinates).
 *
 * `endCoordinates.height` alone is wrong on iPad: a floating or split
 * keyboard sits mid-screen and covers nothing at the bottom, yet reports its
 * own height. Only a keyboard docked to the screen's bottom edge pushes the
 * composer up, and then by how far its top reaches — which also covers the
 * short shortcut bar shown with a hardware keyboard.
 */
export function keyboardOverlap(
	frame: { screenY: number; height: number },
	screenHeight: number,
): number {
	const docked = frame.screenY + frame.height >= screenHeight - 1;
	if (!docked) return 0;
	return Math.max(0, Math.min(frame.height, screenHeight - frame.screenY));
}
