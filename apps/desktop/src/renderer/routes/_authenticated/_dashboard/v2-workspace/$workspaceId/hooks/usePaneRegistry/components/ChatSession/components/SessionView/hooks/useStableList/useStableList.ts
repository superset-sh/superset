import { useRef } from "react";

export function useStableList<T>(
	next: T[],
	same: (previous: T, next: T) => boolean = Object.is,
): T[] {
	const previous = useRef(next);
	const current = previous.current;
	if (
		current !== next &&
		(current.length !== next.length ||
			current.some((entry, index) => !same(entry, next[index] as T)))
	) {
		previous.current = next;
	}
	return previous.current;
}
