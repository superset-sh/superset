import { useLayoutEffect, useState } from "react";

/** The space an element reserves for a scrollbar on each side, in px. */
export function useScrollbarGutter<T extends HTMLElement>() {
	const [element, setElement] = useState<T | null>(null);
	const [gutter, setGutter] = useState(0);
	useLayoutEffect(() => {
		if (!element) return;
		const measure = () =>
			setGutter((element.offsetWidth - element.clientWidth) / 2);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [element]);
	return [setElement, gutter] as const;
}
