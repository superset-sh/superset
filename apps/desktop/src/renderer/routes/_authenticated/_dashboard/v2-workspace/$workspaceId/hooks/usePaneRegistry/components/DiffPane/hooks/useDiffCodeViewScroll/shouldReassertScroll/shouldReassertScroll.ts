export interface AssertedScroll {
	/** The click/focus request the last `scrollTo` served. */
	scrollKey: string;
	/** The target item's layout top (CodeView `getTopForItem`) at that time. */
	targetTop: number | undefined;
}

/**
 * Decide whether the sticky re-scroll should call `scrollTo` again.
 *
 * Every `scrollTo` makes CodeView suspend pointer events on its pinned
 * header for a settle window and re-snap the viewport, so firing it on every
 * unrelated re-render leaves the pinned header's buttons dropping clicks and
 * yanks the user's scroll back. Only re-assert when this is a new request or
 * the target actually moved (content above it resolved).
 */
export function shouldReassertScroll(
	last: AssertedScroll | null,
	scrollKey: string,
	targetTop: number | undefined,
): boolean {
	if (last === null || last.scrollKey !== scrollKey) return true;
	// Layout unknown for the target (not laid out yet): keep asserting so a
	// late-resolving item still lands.
	if (targetTop === undefined || last.targetTop === undefined) return true;
	return last.targetTop !== targetTop;
}
