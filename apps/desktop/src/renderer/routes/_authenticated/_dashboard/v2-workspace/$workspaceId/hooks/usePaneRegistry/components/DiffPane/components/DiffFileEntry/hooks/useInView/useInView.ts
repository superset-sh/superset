import { type RefObject, useEffect, useState } from "react";

interface UseInViewOptions {
	root?: Element | Document | null;
	rootMargin?: string;
	threshold?: number | number[];
}

export function useInView(
	ref: RefObject<HTMLElement | null>,
	options: UseInViewOptions = {},
): boolean {
	const [inView, setInView] = useState(false);
	const { root, rootMargin, threshold } = options;

	useEffect(() => {
		const element = ref.current;
		if (!element) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry) setInView(entry.isIntersecting);
			},
			{ root: root ?? null, rootMargin, threshold },
		);
		observer.observe(element);
		return () => {
			observer.disconnect();
		};
	}, [ref, root, rootMargin, threshold]);

	return inView;
}
