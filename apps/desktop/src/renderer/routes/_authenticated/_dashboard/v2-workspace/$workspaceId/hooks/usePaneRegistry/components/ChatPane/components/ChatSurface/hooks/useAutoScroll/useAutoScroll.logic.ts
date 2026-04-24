/**
 * Pure helpers for useAutoScroll. Ported from OpenCode's
 * create-auto-scroll.tsx (temp/opencode/packages/ui/src/hooks/).
 */

export function distanceFromBottom(el: HTMLElement): number {
	return el.scrollHeight - el.clientHeight - el.scrollTop;
}

export function canScroll(el: HTMLElement): boolean {
	return el.scrollHeight - el.clientHeight > 1;
}

/**
 * True iff the scroll event target is inside a nested `[data-scrollable]`
 * region (code block, tool output) rather than the outer chat scroller.
 * Those regions should scroll independently without marking the outer
 * surface as "user took over".
 *
 * Duck-types `target` (checks for `.closest`) so this stays testable in
 * Bun's DOM-less test runner.
 */
export function isInsideNestedScrollable(
	target: EventTarget | null,
	outer: HTMLElement,
): boolean {
	if (!target) return false;
	const closestFn = (target as { closest?: unknown }).closest;
	if (typeof closestFn !== "function") return false;
	const nested = (closestFn as (s: string) => Element | null).call(
		target,
		"[data-scrollable]",
	);
	return !!nested && nested !== outer;
}
