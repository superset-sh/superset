import { type RefObject, useEffect } from "react";
import { wheelScrollDelta } from "../../utils";

export function useTabBarWheelScroll(
	scrollerRef: RefObject<HTMLDivElement | null>,
) {
	useEffect(() => {
		const node = scrollerRef.current;
		if (!node) return;

		// Native non-passive listener: React's onWheel can't preventDefault.
		const onWheel = (event: WheelEvent) => {
			const delta = wheelScrollDelta(event);
			if (delta === 0) return;
			event.preventDefault();
			node.scrollLeft += delta;
		};

		node.addEventListener("wheel", onWheel, { passive: false });
		return () => node.removeEventListener("wheel", onWheel);
	}, [scrollerRef]);
}
