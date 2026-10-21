import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { nextFooterTier } from "./utils/nextFooterTier";

const FOOTER_ROW_SELECTOR = "[data-composer-footer]";
const LABEL_SELECTOR = "[data-footer-label]";

const overflows = (element: Element) =>
	element.scrollWidth > element.clientWidth + 1;

export function useFooterTier(rootRef: RefObject<HTMLElement | null>) {
	const [tier, setTier] = useState(0);
	const tierRef = useRef(0);
	const demotionWidthsRef = useRef<ReadonlyArray<number | undefined>>([]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measure after each tier renders
	useLayoutEffect(() => {
		const row =
			rootRef.current?.querySelector<HTMLElement>(FOOTER_ROW_SELECTOR);
		if (!row) return;
		const sync = () => {
			const step = nextFooterTier({
				currentTier: tierRef.current,
				width: row.clientWidth,
				overflowing:
					overflows(row) ||
					Array.from(row.querySelectorAll(LABEL_SELECTOR)).some(overflows),
				demotionWidths: demotionWidthsRef.current,
			});
			demotionWidthsRef.current = step.demotionWidths;
			if (step.tier === tierRef.current) return;
			tierRef.current = step.tier;
			setTier(step.tier);
		};
		const resizeObserver = new ResizeObserver(sync);
		const observeLabels = () => {
			resizeObserver.disconnect();
			resizeObserver.observe(row);
			for (const label of row.querySelectorAll(LABEL_SELECTOR)) {
				resizeObserver.observe(label);
			}
		};
		const mutationObserver = new MutationObserver(() => {
			observeLabels();
			sync();
		});
		mutationObserver.observe(row, {
			childList: true,
			subtree: true,
			characterData: true,
		});
		observeLabels();
		sync();
		return () => {
			mutationObserver.disconnect();
			resizeObserver.disconnect();
		};
	}, [rootRef, tier]);

	return tier;
}
