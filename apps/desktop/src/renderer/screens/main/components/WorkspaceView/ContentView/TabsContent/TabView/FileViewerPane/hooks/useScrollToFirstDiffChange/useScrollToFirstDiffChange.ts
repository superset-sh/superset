import { type RefObject, useEffect, useRef } from "react";
import { getDiffShadowRoots } from "../../utils/diffRendererRoots";

const CHANGE_SELECTOR =
	"[data-line-type='change-addition'], [data-line-type='change-deletion']";

/** Timeout (ms) after which we stop waiting for change elements to appear. */
const OBSERVER_TIMEOUT = 2_000;

interface UseScrollToFirstDiffChangeOptions {
	containerRef: RefObject<HTMLDivElement | null>;
	filePath: string;
	diffData: { original: string; modified: string } | undefined;
	enabled: boolean;
}

/**
 * When a diff view first renders, scrolls the container so the first changed
 * line is vertically centered. Fires once per file/diff combination.
 */
export function useScrollToFirstDiffChange({
	containerRef,
	filePath,
	diffData,
	enabled,
}: UseScrollToFirstDiffChangeOptions): void {
	const hasScrolledRef = useRef(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: filePath and diffData deps are not read inside the effect but intentionally included to re-trigger scroll on file/content change
	useEffect(() => {
		hasScrolledRef.current = false;

		if (!enabled) {
			return;
		}

		const container = containerRef.current;
		if (!container) {
			return;
		}

		function tryScrollToFirstChange(): boolean {
			if (!container || hasScrolledRef.current) {
				return true;
			}

			const shadowRoots = getDiffShadowRoots(container);
			if (shadowRoots.length === 0) {
				return false;
			}

			let firstChange: HTMLElement | null = null;
			for (const shadowRoot of shadowRoots) {
				firstChange = shadowRoot.querySelector<HTMLElement>(CHANGE_SELECTOR);
				if (firstChange) {
					break;
				}
			}

			if (!firstChange) {
				return false;
			}

			const containerRect = container.getBoundingClientRect();
			const elementRect = firstChange.getBoundingClientRect();

			const elementTop =
				elementRect.top - containerRect.top + container.scrollTop;
			const scrollTarget =
				elementTop - container.clientHeight / 2 + elementRect.height / 2;

			container.scrollTo({
				top: Math.max(0, scrollTarget),
				behavior: "instant",
			});
			hasScrolledRef.current = true;
			return true;
		}

		// Try immediately — the diff might already be rendered
		if (tryScrollToFirstChange()) {
			return;
		}

		// Otherwise observe the DOM until change elements appear
		const observedShadowRoots = new Set<ShadowRoot>();

		const mutationObserver = new MutationObserver(() => {
			// Also observe any newly-appeared shadow roots
			for (const shadowRoot of getDiffShadowRoots(container)) {
				if (!observedShadowRoots.has(shadowRoot)) {
					mutationObserver.observe(shadowRoot, {
						childList: true,
						subtree: true,
					});
					observedShadowRoots.add(shadowRoot);
				}
			}

			if (tryScrollToFirstChange()) {
				mutationObserver.disconnect();
			}
		});

		mutationObserver.observe(container, { childList: true, subtree: true });

		// Observe existing shadow roots immediately
		for (const shadowRoot of getDiffShadowRoots(container)) {
			mutationObserver.observe(shadowRoot, {
				childList: true,
				subtree: true,
			});
			observedShadowRoots.add(shadowRoot);
		}

		// Safety: disconnect after timeout even if no changes were found
		const timeoutId = setTimeout(() => {
			mutationObserver.disconnect();
		}, OBSERVER_TIMEOUT);

		return () => {
			clearTimeout(timeoutId);
			mutationObserver.disconnect();
		};
	}, [containerRef, enabled, filePath, diffData?.original, diffData?.modified]);
}
