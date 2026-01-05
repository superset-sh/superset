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

		const updateOrientation = () => {
			const { width, height } = container.getBoundingClientRect();
			setSplitOrientation(width >= height ? "vertical" : "horizontal");
		};

		updateOrientation();

		const resizeObserver = new ResizeObserver(updateOrientation);
		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
		};
	}, [containerRef]);

	return splitOrientation;
}
