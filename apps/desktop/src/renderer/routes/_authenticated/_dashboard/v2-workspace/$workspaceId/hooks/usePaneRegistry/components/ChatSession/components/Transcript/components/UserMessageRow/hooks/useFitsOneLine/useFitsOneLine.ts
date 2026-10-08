import { type RefObject, useLayoutEffect, useState } from "react";

export function useFitsOneLine(ref: RefObject<HTMLElement | null>): boolean {
	const [fits, setFits] = useState(true);
	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		const measure = () => {
			const lineHeight = Number.parseFloat(
				getComputedStyle(element).lineHeight,
			);
			setFits(!(lineHeight > 0) || element.clientHeight <= lineHeight * 1.5);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [ref]);
	return fits;
}
