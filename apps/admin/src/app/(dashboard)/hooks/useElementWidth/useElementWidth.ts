"use client";

import { type RefObject, useLayoutEffect, useState } from "react";

// Width of an element, kept current through ResizeObserver. Zero until the
// first measurement, so callers can hold off rendering width-dependent
// layout instead of drawing at a guessed size.
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
	const [width, setWidth] = useState(0);

	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		const measure = () => setWidth(element.getBoundingClientRect().width);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [ref]);

	return width;
}
