import { type RefObject, useEffect, useState } from "react";

export type SplitOrientation = "vertical" | "horizontal";

export function useSplitOrientation(
	containerRef: RefObject<HTMLDivElement | null>,
): SplitOrientation {
	const [splitOrientation, setSplitOrientation] =
		useState<SplitOrientation>("vertical");

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const updateOrientation = ({ width, height }: DOMRectReadOnly) => {
			setSplitOrientation(width >= height ? "vertical" : "horizontal");
		};

		const resizeObserver = new ResizeObserver(([entry]) => {
			if (entry) updateOrientation(entry.contentRect);
		});
		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
		};
	}, [containerRef]);

	return splitOrientation;
}
