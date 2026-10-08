import { type RefObject, useEffect, useState } from "react";

export type ScrollOverflowState = { above: boolean; below: boolean };

/** Whether a scroll box has content hidden above or below its viewport. */
export function useScrollOverflowState(
	scrollRef: RefObject<HTMLDivElement | null>,
): ScrollOverflowState {
	const [state, setState] = useState<ScrollOverflowState>({
		above: false,
		below: false,
	});
	useEffect(() => {
		const element = scrollRef.current;
		if (!element) return;
		let frame: number | null = null;
		const measure = () => {
			frame = null;
			const above = element.scrollTop > 1;
			const below =
				element.scrollHeight - element.scrollTop - element.clientHeight > 1;
			setState((previous) =>
				previous.above === above && previous.below === below
					? previous
					: { above, below },
			);
		};
		const schedule = () => {
			if (frame !== null) return;
			frame = requestAnimationFrame(measure);
		};
		schedule();
		element.addEventListener("scroll", schedule, { passive: true });
		const observer =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(schedule);
		observer?.observe(element);
		if (element.firstElementChild) observer?.observe(element.firstElementChild);
		return () => {
			element.removeEventListener("scroll", schedule);
			observer?.disconnect();
			if (frame !== null) cancelAnimationFrame(frame);
		};
	}, [scrollRef]);
	return state;
}
