/**
 * `react-resizable-panels` only honors `defaultSize` on the initial mount.
 * After mount it owns the panel sizes internally, so store-driven changes to a
 * split's `splitPercentage` (e.g. the "Equalize Pane Splits" action) never
 * reach the DOM through props alone — they must be pushed in imperatively via
 * `PanelGroup.setLayout`.
 *
 * This computes the two-panel layout to apply for the current store-derived
 * first-panel size, returning `null` when the group is already in sync. The
 * no-op case matters: re-applying the layout on every render would clobber an
 * in-progress user drag and create a feedback loop with the group's `onLayout`
 * callback (which writes sizes back to the store).
 */
export function getLayoutToApply(
	currentLayout: number[] | undefined,
	targetFirstSize: number,
	epsilon = 0.5,
): [number, number] | null {
	const target: [number, number] = [targetFirstSize, 100 - targetFirstSize];

	if (currentLayout == null || currentLayout.length < 2) return target;

	const currentFirst = currentLayout[0];
	if (currentFirst == null) return target;

	if (Math.abs(currentFirst - targetFirstSize) <= epsilon) return null;

	return target;
}
